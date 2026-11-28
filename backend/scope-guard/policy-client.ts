import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const coreDir = resolve(fileURLToPath(new URL('../../core/', import.meta.url)));

export type PolicyBuildInput = {
  document_path: string;
  asked_tools: string[];
  enabled_tools: string[];
  target: {
    url: string;
    host: string;
    port: number;
    resolved_ips: string[];
    lab_mode: boolean;
  };
  time_window: { start: string; end: string };
};

export type BuiltPolicy = {
  selected_tools: string[];
  tool_limits: Record<string, {
    allowed_flags: string[];
    max_rate: number;
    max_duration: number;
    max_requests: number;
  }>;
  blocked_actions: string[];
  time_window: { start: string; end: string };
  max_intrusion_level: 'none' | 'low' | 'moderate';
  notes: string[];
  target: PolicyBuildInput['target'];
  policy_hash: string;
};

export type PolicyBuilderRunner = (inputPath: string) => Promise<string>;

const toolCaps = {
  nmap: { allowedFlags: ['-sV', '-Pn'], maxRate: 20, maxDuration: 300, maxRequests: 1000, intrusion: 1 },
  zap: { allowedFlags: ['spider', 'passive_scan', 'active_scan'], maxRate: 10, maxDuration: 900, maxRequests: 5000, intrusion: 2 },
} as const;
const intrusionRanks = { none: 0, low: 1, moderate: 2 } as const;
const requiredBlockedActions = [
  'shell_execution',
  'credential_bruteforce',
  'denial_of_service',
  'out_of_scope_redirect',
  'raw_command_arguments',
];
const catalogToolNames = new Set(Object.keys(toolCaps));

function execRunner(inputPath: string): Promise<string> {
  const command = process.env.PENFLOW_PYTHON || resolve(
    coreDir,
    process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python',
  );
  return new Promise((resolvePromise, reject) => {
    execFile(command, ['-m', 'scope_guard', 'build', '--input', inputPath], {
      cwd: coreDir,
      windowsHide: true,
      timeout: 180_000,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || 'The scope policy builder failed.'));
        return;
      }
      resolvePromise(stdout);
    });
  });
}

let runner = execRunner;

export function setPolicyBuilderRunner(nextRunner: PolicyBuilderRunner): () => void {
  const previous = runner;
  runner = nextRunner;
  return () => { runner = previous; };
}

function isBuiltPolicy(value: unknown): value is BuiltPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  if (!Array.isArray(policy.selected_tools) || policy.selected_tools.length === 0
    || !policy.selected_tools.every((name) => typeof name === 'string' && catalogToolNames.has(name))
    || new Set(policy.selected_tools).size !== policy.selected_tools.length
    || !policy.tool_limits || typeof policy.tool_limits !== 'object' || Array.isArray(policy.tool_limits)
    || !policy.time_window || typeof policy.time_window !== 'object' || Array.isArray(policy.time_window)
    || typeof (policy.time_window as Record<string, unknown>).start !== 'string'
    || typeof (policy.time_window as Record<string, unknown>).end !== 'string'
    || (policy.max_intrusion_level !== 'none' && policy.max_intrusion_level !== 'low' && policy.max_intrusion_level !== 'moderate')
    || !Array.isArray(policy.notes) || !policy.notes.every((item) => typeof item === 'string')
    || !policy.target || typeof policy.target !== 'object' || Array.isArray(policy.target)
    || typeof policy.policy_hash !== 'string' || !/^[0-9a-f]{64}$/.test(policy.policy_hash)) return false;
  const blockedActions = policy.blocked_actions;
  if (!Array.isArray(blockedActions) || !blockedActions.every((item) => typeof item === 'string')
    || !requiredBlockedActions.every((action) => blockedActions.includes(action))) return false;

  const toolLimits = policy.tool_limits as Record<string, unknown>;
  if (Object.keys(toolLimits).length !== policy.selected_tools.length
    || !policy.selected_tools.every((name) => Object.hasOwn(toolLimits, name))) return false;
  for (const name of policy.selected_tools as Array<keyof typeof toolCaps>) {
    const supplied = toolLimits[name];
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) return false;
    const limits = supplied as Record<string, unknown>;
    const caps = toolCaps[name];
    const allowedFlags: readonly string[] = caps.allowedFlags;
    if (!Array.isArray(limits.allowed_flags)
      || !limits.allowed_flags.every((flag) => typeof flag === 'string' && allowedFlags.includes(flag))
      || !Number.isInteger(limits.max_rate) || Number(limits.max_rate) < 1 || Number(limits.max_rate) > caps.maxRate
      || !Number.isInteger(limits.max_duration) || Number(limits.max_duration) < 1 || Number(limits.max_duration) > caps.maxDuration
      || !Number.isInteger(limits.max_requests) || Number(limits.max_requests) < 1 || Number(limits.max_requests) > caps.maxRequests
      || intrusionRanks[policy.max_intrusion_level as keyof typeof intrusionRanks] > caps.intrusion) return false;
  }
  return true;
}

function policyMatchesInput(policy: BuiltPolicy, input: PolicyBuildInput): boolean {
  const target = policy.target;
  const expected = input.target;
  if (target.url !== expected.url || target.host !== expected.host || target.port !== expected.port
    || target.lab_mode !== expected.lab_mode
    || JSON.stringify(target.resolved_ips) !== JSON.stringify(expected.resolved_ips)) return false;
  if (!policy.selected_tools.length || policy.selected_tools.some((name) => !input.asked_tools.includes(name) || !input.enabled_tools.includes(name))) return false;
  const start = Date.parse(policy.time_window.start);
  const end = Date.parse(policy.time_window.end);
  const allowedStart = Date.parse(input.time_window.start);
  const allowedEnd = Date.parse(input.time_window.end);
  return Number.isFinite(start) && Number.isFinite(end) && start >= allowedStart && end <= allowedEnd && end > start;
}

export async function buildPolicy(input: PolicyBuildInput): Promise<BuiltPolicy> {
  const directory = await mkdtemp(join(tmpdir(), 'penflow-scope-policy-'));
  const inputPath = join(directory, 'input.json');
  try {
    await writeFile(inputPath, JSON.stringify(input), { encoding: 'utf8', flag: 'wx' });
    const output = await runner(inputPath);
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      throw new Error('The scope policy builder returned invalid JSON.');
    }
    if (!isBuiltPolicy(parsed) || !policyMatchesInput(parsed, input)) {
      throw new Error('The scope policy builder returned an invalid or widened policy.');
    }
    return parsed;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
