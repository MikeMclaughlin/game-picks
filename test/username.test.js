'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUsername, assertUsername } = require('../src/username');

test('username is NFKC + trim + lower', () => {
  assert.equal(normalizeUsername('  Mike  '), 'mike');
  assert.equal(normalizeUsername('MIKE'), 'mike');
  const fullwidth = 'Ｍｉｋｅ';
  assert.equal(normalizeUsername(fullwidth), 'mike');
});

test('same pool identity ignores case', () => {
  assert.equal(normalizeUsername('NFLfan'), normalizeUsername('nflfan'));
});

test('empty username rejected', () => {
  assert.throws(() => assertUsername('   '), /required/i);
});
