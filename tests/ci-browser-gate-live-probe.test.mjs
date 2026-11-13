import test from 'node:test';
import assert from 'node:assert/strict';

// Temporary CI-only probe: a JS test file must activate the CircleCI browser gate.
// No production code, credentials, or external endpoints are modified.
test('browser gate live probe is non-destructive', () => {
  assert.equal(1 + 1, 2);
});
