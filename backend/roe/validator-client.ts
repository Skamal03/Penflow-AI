import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = resolve(here, '../../core');
const toolsDir = resolve(coreDir, 'tools');
const commandTimeoutMs = 15_000;

export type ValidatorRunner = (
  command: string,
  args: string[],
  options: { cwd: string; timeout: number },
) => Promise<{ stdout: string }>;

type ValidationResult = {
  status: 'valid' | 'invalid';
  reasons: string[];
  targets: string[];
};

type OwnershipResult = {
  verified: boolean;
  method: 'dns' | 'file' | 'meta' | null;
  detail: string;
};

function execFileRunner(command: string, args: string[], options: { cwd: string; timeout: number }): Promise<{ stdout: string }> {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, { ...options, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise({ stdout });
    });
  });
}

let runner = execFileRunner;

export function setValidatorRunner(nextRunner: ValidatorRunner): () => void {
  const previous = runner;
  runner = nextRunner;
  return () => { runner = previous; };
}

function assertTarget(target: unknown): asserts target is string {
  if (typeof target !== 'string' || !target.trim()) throw new TypeError('Target must be a non-empty URL or hostname.');
  let parsed: URL;
  try {
    parsed = new URL(target.includes('://') ? target : `https://${target}`);
  } catch {
    throw new TypeError('Target must be a valid HTTP or HTTPS URL or hostname.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new TypeError('Target must be a valid HTTP or HTTPS URL or hostname without credentials.');
  }
}

async function runJson<T>(args: string[], isResult: (value: unknown) => value is T): Promise<T> {
  const { stdout } = await runner(process.env.PENFLOW_PYTHON || 'python', args, {
    cwd: coreDir,
    timeout: commandTimeoutMs,
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('ROE validator returned invalid JSON.');
  }
  if (!isResult(parsed)) throw new Error('ROE validator returned an unexpected response.');
  return parsed;
}

function isValidationResult(value: unknown): value is ValidationResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return (result.status === 'valid' || result.status === 'invalid')
    && Array.isArray(result.reasons)
    && result.reasons.every((reason) => typeof reason === 'string')
    && Array.isArray(result.targets)
    && result.targets.every((target) => typeof target === 'string');
}

function isOwnershipResult(value: unknown): value is OwnershipResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return typeof result.verified === 'boolean'
    && (result.method === null || result.method === 'dns' || result.method === 'file' || result.method === 'meta')
    && typeof result.detail === 'string';
}

export async function validateRoe(roe: Record<string, unknown>, labMode: boolean): Promise<ValidationResult> {
  if (!roe || typeof roe !== 'object' || Array.isArray(roe)) throw new TypeError('ROE must be an object.');
  const targets = roe.targets;
  if (!Array.isArray(targets) || targets.length === 0) throw new TypeError('ROE must contain at least one target.');
  targets.forEach(assertTarget);

  const validationInput = { ...roe };
  delete validationInput.lab_mode;
  const tempDir = await mkdtemp(join(tmpdir(), 'penflow-roe-'));
  const inputPath = join(tempDir, 'roe.json');
  try {
    await writeFile(inputPath, JSON.stringify(validationInput), { encoding: 'utf8', flag: 'wx' });
    const args = ['-m', 'roe_validator', 'validate', '--file', inputPath];
    if (labMode) args.push('--lab-mode');
    return await runJson(args, isValidationResult);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function checkOwnership(target: string, token: string): Promise<OwnershipResult> {
  assertTarget(target);
  if (typeof token !== 'string' || !token.trim()) throw new TypeError('Ownership token must be a non-empty string.');
  return runJson(['-m', 'roe_validator', 'ownership', '--target', target, '--token', token], isOwnershipResult);
}

export async function listEngineTools(): Promise<string[]> {
  const names = new Set<string>();
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name.endsWith('.py') && entry.name !== 'tool_registry.py') {
        const source = await readFile(path, 'utf8');
        for (const match of source.matchAll(/@register\(\s*["']([^"']+)["']/g)) {
          if (match[1]) names.add(match[1]);
        }
      }
    }
  };
  await visit(toolsDir);
  if (names.size === 0) throw new Error('No registered engine tools were found.');
  return [...names].sort();
}
