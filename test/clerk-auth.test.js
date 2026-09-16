'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  clerkPublishableKey,
  isClerkConfigured,
  frontendApiFromKey,
  publicClerkConfig,
  authNotConfiguredPayload,
  extractSessionToken,
  displayFromClerk,
  sanitizeHandle
} = require('../src/clerk-auth');

test('publishable key accepts Marketplace NEXT_PUBLIC_ name', () => {
  const env = {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_marketplace',
    CLERK_SECRET_KEY: 'sk_test_marketplace'
  };
  assert.equal(clerkPublishableKey(env), 'pk_test_marketplace');
  assert.equal(isClerkConfigured(env), true);
  assert.equal(publicClerkConfig(env).configured, true);
  assert.equal(publicClerkConfig(env).publishableKey, 'pk_test_marketplace');
});

test('missing Clerk keys are not configured', () => {
  const env = {};
  assert.equal(isClerkConfigured(env), false);
  const cfg = publicClerkConfig(env);
  assert.equal(cfg.configured, false);
  assert.equal(cfg.publishableKey, null);
  assert.deepEqual(cfg.providers, ['google', 'x']);
  const body = authNotConfiguredPayload();
  assert.equal(body.ok, false);
  assert.equal(body.auth, 'missing');
  assert.match(body.error, /Auth not configured/);
});

test('frontend API domain is decoded from the publishable key', () => {
  const domain = 'foo.clerk.accounts.dev';
  const packed = Buffer.from(`${domain}$`).toString('base64').replace(/=+$/, '');
  assert.equal(frontendApiFromKey(`pk_test_${packed}`), domain);
});

test('Bearer and __session cookies yield a token', () => {
  assert.equal(
    extractSessionToken({ headers: { authorization: 'Bearer tok_abc' } }),
    'tok_abc'
  );
  assert.equal(
    extractSessionToken({ headers: { cookie: '__session=sess%2D1; other=x' } }),
    'sess-1'
  );
  assert.equal(extractSessionToken({ headers: {} }), null);
});

test('display name prefers Clerk username then full name', () => {
  assert.equal(sanitizeHandle('Mike@Picks!'), 'MikePicks');
  assert.equal(displayFromClerk({ username: 'FlyersFan', firstName: 'Mike' }).display, 'FlyersFan');
  assert.equal(displayFromClerk({ firstName: 'Mike', lastName: 'M' }).display, 'Mike M');
  assert.equal(
    displayFromClerk({
      emailAddresses: [{ emailAddress: 'picks@example.com' }]
    }).display,
    'picks'
  );
});
