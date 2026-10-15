'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  isGoogleConfigured,
  publicAuthConfig,
  publicBaseUrl,
  googleRedirectUri,
  codeChallenge,
  createPkce,
  displayFromGoogle,
  sanitizeHandle,
  statesMatch
} = require('../src/google-auth');

test('Google auth is configured only when id, secret, and session secret are set', () => {
  assert.equal(isGoogleConfigured({}), false);
  assert.equal(isGoogleConfigured({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'sec' }), false);
  const env = { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'sec', SESSION_SECRET: 'sess' };
  assert.equal(isGoogleConfigured(env), true);
  assert.equal(publicAuthConfig(env).provider, 'google');
  assert.equal(publicAuthConfig({}).configured, false);
});

test('redirect URI uses PUBLIC_BASE_URL with no trailing slash', () => {
  assert.equal(publicBaseUrl({}), 'https://game-picks.vercel.app');
  assert.equal(publicBaseUrl({ PUBLIC_BASE_URL: 'https://example.com/' }), 'https://example.com');
  assert.equal(
    googleRedirectUri({ PUBLIC_BASE_URL: 'https://game-picks.onrender.com/' }),
    'https://game-picks.onrender.com/api/auth/google/callback'
  );
});

test('PKCE challenge is the S256 hash of the verifier and state matches itself', () => {
  const pkce = createPkce();
  assert.equal(codeChallenge(pkce.verifier), pkce.challenge);
  assert.equal(statesMatch(pkce.state, pkce.state), true);
  assert.equal(statesMatch(pkce.state, `${pkce.state}x`), false);
});

test('display name prefers the Google profile name', () => {
  assert.equal(sanitizeHandle('Mike@Picks!'), 'MikePicks');
  assert.equal(displayFromGoogle({ name: 'Flyers Fan', email: 'picks@example.com', sub: '12345678' }).display, 'Flyers Fan');
  assert.equal(displayFromGoogle({ email: 'picks@example.com', sub: '12345678' }).display, 'picks');
});
