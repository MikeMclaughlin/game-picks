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
  assert.equal(body.auth, 'missing');
  server.close();
});

test('/api/login without Clerk keys returns JSON 503', async () => {
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
  assert.equal(body.auth, 'missing');
  assert.match(body.error, /Auth not configured/);
  server.close();
});

test('/api/auth/config is public and omits secrets', async () => {
  const server = await listen();
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/config`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.configured, false);
  assert.equal(body.publishableKey, null);
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'secretKey'), false);
  assert.deepEqual(body.providers, ['google', 'apple', 'x']);
  server.close();
});

test('/api/picks without DATABASE_URL returns JSON 503', async () => {
  const server = await listen();
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/picks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer not-a-real-token' },
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
  assert.equal(body.clerk.configured, false);
  if (body.games.length) {
    const g = body.games[0];
    assert.ok(g.home_team);
    assert.ok(g.away_team);
    assert.ok(g.aiPick);
    assert.equal(Object.prototype.hasOwnProperty.call(g, 'implied'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(g, 'xPts'), true);
    assert.ok(g.home && g.home.city);
    assert.ok(g.away && g.away.city);
    assert.equal(Object.prototype.hasOwnProperty.call(g.home, 'lastGame'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(g.away, 'shortRestWinPct'), true);
  }
  server.close();
});

test('/api/history supports filter query params', async () => {
  const server = await listen();
  const { port } = server.address();
  const base = await fetch(`http://127.0.0.1:${port}/api/history`);
  const all = await base.json();
  assert.equal(base.status, 200);
  assert.equal(all.ok, true);
  assert.ok(Array.isArray(all.rows));
  assert.ok(all.rows.length > 0);
  assert.equal(all.supported.site, true);
  const unfilteredG = all.rows.find((r) => r.team === 'SEA')?.games;

  const homeRes = await fetch(`http://127.0.0.1:${port}/api/history?team=SEA&site=home&from=2023&to=2026`);
  const home = await homeRes.json();
  assert.equal(homeRes.status, 200);
  assert.equal(home.filters.site, 'home');
  assert.equal(home.rows.length, 1);
  assert.equal(home.rows[0].team, 'SEA');
  assert.ok(home.rows[0].games < unfilteredG);
  assert.equal(home.rows[0].road.wins + home.rows[0].road.losses + home.rows[0].road.pushes, 0);

  const emptyRes = await fetch(`http://127.0.0.1:${port}/api/history?team=SEA&site=home&travel=east`);
  const empty = await emptyRes.json();
  assert.equal(empty.ok, true);
  const played = (empty.rows || []).filter((r) => r.games > 0);
  assert.equal(played.length, 0);

  const divRes = await fetch(`http://127.0.0.1:${port}/api/history?team=SEA&division=divisional&from=2023&to=2026`);
  const div = await divRes.json();
  assert.ok(div.rows[0].games > 0);
  assert.ok(div.rows[0].games < unfilteredG);

  const yearRes = await fetch(`http://127.0.0.1:${port}/api/history?team=SEA&from=2024&to=2024`);
  const year = await yearRes.json();
  assert.equal(year.filters.from, 2024);
  assert.equal(year.filters.to, 2024);
  assert.ok(year.rows[0].games < unfilteredG);

  const roofRes = await fetch(`http://127.0.0.1:${port}/api/history?team=SEA&roof=dome`);
  const roof = await roofRes.json();
  assert.equal(roof.filters.roof, 'dome');
  assert.ok(roof.matchedGames >= 0);
  if (roof.rows[0]) assert.ok(roof.rows[0].games < unfilteredG);

  const roleRes = await fetch(`http://127.0.0.1:${port}/api/history?team=SEA&role=underdog`);
  const role = await roleRes.json();
  assert.equal(role.filters.role, 'underdog');
  assert.ok(role.rows[0].games < unfilteredG);

  const restRes = await fetch(`http://127.0.0.1:${port}/api/history?team=SEA&daysOff=short`);
  const rest = await restRes.json();
  assert.equal(rest.filters.daysOff, 'short');

  const distRes = await fetch(`http://127.0.0.1:${port}/api/history?team=SEA&distance=cross-country`);
  const dist = await distRes.json();
  assert.equal(dist.filters.distance, 'cross');

  const html = await fetch(`http://127.0.0.1:${port}/`);
  const page = await html.text();
  assert.match(page, /styles\.css\?v=/);
  assert.match(page, /app\.js\?v=/);
  assert.match(page, /clerk-user-button/);
  assert.match(page, /btn-sign-in/);
  assert.match(page, /Auth not configured/);
  assert.match(page, /__CLERK_CONFIG__/);

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
