import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { test } from 'node:test';
import { checkOwnership, listEngineTools, setValidatorRunner, validateRoe, type ValidatorRunner } from '../roe/validator-client.js';

test('validator client passes lab mode only as an explicit CLI flag and removes temporary input', async () => {
  const calls: Array<{ args: string[]; input: Record<string, unknown>; path: string }> = [];
  const runner: ValidatorRunner = async (_command, args, options) => {
    assert.equal(basename(options.cwd), 'core');
    assert.equal(options.timeout, 15_000);
    const fileIndex = args.indexOf('--file');
    const path = args[fileIndex + 1]!;
    calls.push({ args, input: JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>, path });
    return { stdout: JSON.stringify({ status: 'valid', reasons: [], targets: ['http://127.0.0.1'] }) };
  };
  const restore = setValidatorRunner(runner);
  try {
    await validateRoe({ targets: ['http://127.0.0.1'], lab_mode: true }, false);
    await validateRoe({ targets: ['http://127.0.0.1'] }, true);
    assert.equal(calls[0]?.args.includes('--lab-mode'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(calls[0]?.input, 'lab_mode'), false);
    assert.equal(calls[1]?.args.includes('--lab-mode'), true);
    for (const call of calls) await assert.rejects(access(call.path));
  } finally {
    restore();
  }
});

test('ownership checks pass target and stored token as execFile arguments', async () => {
  let actualArgs: string[] = [];
  const restore = setValidatorRunner(async (_command, args) => {
    actualArgs = args;
    return { stdout: JSON.stringify({ verified: false, method: null, detail: 'Ownership token was not found.' }) };
  });
  try {
    const result = await checkOwnership('https://example.test', 'stored-token');
    assert.equal(result.verified, false);
    assert.deepEqual(actualArgs.slice(-4), ['--target', 'https://example.test', '--token', 'stored-token']);
  } finally {
    restore();
  }
});

test('validator client rejects malformed targets and exposes registered engine tools', async () => {
  let called = false;
  const restore = setValidatorRunner(async () => {
    called = true;
    return { stdout: '{}' };
  });
  try {
    await assert.rejects(() => validateRoe({ targets: ['https://user:pass@example.test'] }, false), /without credentials/);
    await assert.rejects(() => checkOwnership('file:///etc/passwd', 'token'), /valid HTTP or HTTPS/);
    assert.equal(called, false);
    const tools = await listEngineTools();
    assert.ok(tools.includes('header_checks'));
    assert.ok(tools.includes('nikto'));
  } finally {
    restore();
  }
});
