'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isDatabaseUrl, missingDbPayload } = require('../src/db');

test('isDatabaseUrl rejects missing or non-postgres values', () => {
  assert.equal(isDatabaseUrl(''), false);
  assert.equal(isDatabaseUrl('   '), false);
  assert.equal(isDatabaseUrl(undefined), false);
  assert.equal(isDatabaseUrl('not-a-url'), false);
  assert.equal(isDatabaseUrl('postgresql://user:pass@host/db'), true);
  assert.equal(isDatabaseUrl('postgres://user:pass@host/db'), true);
});

test('missing DB payload is JSON-safe and explicit', () => {
  const body = missingDbPayload();
  assert.equal(body.ok, false);
  assert.equal(body.db, 'missing');
  assert.match(body.error, /DATABASE_URL/);
  assert.ok(body.hint);
});
