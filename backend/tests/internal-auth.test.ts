import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyServiceToken } from '../auth/service-token.js';

test('engine service tokens are required and compared exactly', () => {
  const previous = process.env.PENFLOW_SERVICE_TOKEN;
  const expected = 'a'.repeat(48);
  try {
    delete process.env.PENFLOW_SERVICE_TOKEN;
    assert.equal(verifyServiceToken(`Bearer ${expected}`), 'unconfigured');
    process.env.PENFLOW_SERVICE_TOKEN = expected;
    assert.equal(verifyServiceToken(`Bearer ${expected}`), 'valid');
    assert.equal(verifyServiceToken(`Bearer ${'b'.repeat(48)}`), 'invalid');
    assert.equal(verifyServiceToken(expected), 'invalid');
  } finally {
    if (previous === undefined) delete process.env.PENFLOW_SERVICE_TOKEN;
    else process.env.PENFLOW_SERVICE_TOKEN = previous;
  }
});
