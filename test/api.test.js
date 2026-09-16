'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handler } = require('../src/server');

function listen() {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('/api/health returns JSON', async () => {
  const server = await listen();
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/health`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.db, 'missing');
  server.close();
});

test('/api/login without DATABASE_URL returns JSON 503', async () => {
  const server = await listen();
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'TestUser' })
  });
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.db, 'missing');
  assert.match(body.error, /DATABASE_URL/);
  server.close();
});

test('/api/picks without DATABASE_URL returns JSON 503', async () => {
  const server = await listen();
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/picks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ game_id: 'x', market: 'outright', selection: 'SEA' })
  });
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.db, 'missing');
  server.close();
});

test('/api/bootstrap returns JSON week payload', async () => {
  const server = await listen();
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/bootstrap`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.games));
  assert.ok(body.season >= 2023);
  assert.ok(body.week >= 1);
  if (body.games.length) {
    const g = body.games[0];
    assert.ok(g.home_team);
    assert.ok(g.away_team);
    assert.ok(g.aiPick);
    assert.equal(Object.prototype.hasOwnProperty.call(g, 'implied'), true);
  }
  server.close();
});

test('favicon.ico is shipped', async () => {
  const ico = path.join(__dirname, '..', 'public', 'favicon.ico');
  assert.equal(fs.existsSync(ico), true);
  const server = await listen();
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/favicon.ico`);
  assert.equal(res.status, 200);
  assert.ok((await res.arrayBuffer()).byteLength > 0);
  server.close();
});
