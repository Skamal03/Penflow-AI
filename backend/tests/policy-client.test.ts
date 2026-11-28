import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPolicy, setPolicyBuilderRunner, type BuiltPolicy, type PolicyBuildInput } from '../scope-guard/policy-client.js';

const input: PolicyBuildInput = {
  document_path: 'C:\\roe-uploads\\approved.docx',
  asked_tools: ['nmap', 'zap'],
  enabled_tools: ['nmap'],
  target: {
    url: 'http://localhost:3000',
    host: 'localhost',
    port: 3000,
    resolved_ips: ['127.0.0.1'],
    lab_mode: false,
  },
  time_window: {
    start: '2026-11-28T10:00:00.000Z',
    end: '2026-11-28T12:00:00.000Z',
  },
};

function policy(overrides: Partial<BuiltPolicy> = {}): BuiltPolicy {
  return {
    selected_tools: ['nmap'],
    tool_limits: { nmap: { allowed_flags: ['-sV'], max_rate: 10, max_duration: 120, max_requests: 100 } },
    blocked_actions: [
      'shell_execution',
      'credential_bruteforce',
      'denial_of_service',
      'out_of_scope_redirect',
      'raw_command_arguments',
    ],
    time_window: { start: input.time_window.start, end: input.time_window.end },
    max_intrusion_level: 'low',
    notes: [],
    target: input.target,
    policy_hash: 'a'.repeat(64),
    ...overrides,
  };
}

test('policy client accepts only a restricted result bound to the trusted input', async () => {
  const restore = setPolicyBuilderRunner(async () => JSON.stringify(policy()));
  try {
    const result = await buildPolicy(input);
    assert.deepEqual(result.selected_tools, ['nmap']);
    assert.deepEqual(result.target, input.target);
  } finally {
    restore();
  }
});

test('policy client rejects widened target, tool, or authorization window output', async () => {
  const cases: BuiltPolicy[] = [
    policy({ target: { ...input.target, url: 'http://other.example' } }),
    policy({ selected_tools: ['zap'] }),
    policy({ time_window: { start: input.time_window.start, end: '2026-11-28T13:00:00.000Z' } }),
    policy({ tool_limits: { nmap: { allowed_flags: ['--script'], max_rate: 999, max_duration: 9999, max_requests: 99999 } } }),
  ];
  for (const result of cases) {
    const restore = setPolicyBuilderRunner(async () => JSON.stringify(result));
    try {
      await assert.rejects(() => buildPolicy(input), /invalid or widened policy/);
    } finally {
      restore();
    }
  }
});
