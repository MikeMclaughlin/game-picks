'use strict';

process.env.ESPN_LIVE = process.env.ESPN_LIVE || '0';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handler } = require('../src/server');
const { BUILD } = require('../src/build');

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
  assert.equal(body.build, BUILD);
  assert.equal(body.version, BUILD);
  assert.equal(body.db, 'missing');
  assert.equal(body.auth, 'missing');
  server.close();
});

test('/api/login without Google keys returns JSON 503', async () => {
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
  assert.equal(body.provider, 'google');
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'secretKey'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'GOOGLE_CLIENT_SECRET'), false);
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
  assert.equal(body.build, BUILD);
  assert.ok(Array.isArray(body.games));
  assert.ok(body.season >= 2023);
  assert.ok(body.week >= 1);
    assert.equal(body.auth.configured, false);
    assert.equal(Object.prototype.hasOwnProperty.call(body, 'livePoll'), true);
  if (body.games.length) {
    const g = body.games[0];
    assert.ok(g.home_team);
    assert.ok(g.away_team);
    assert.ok(g.aiPick);
    assert.equal(typeof g.aiPick.confidence, 'number');
    assert.ok(g.aiPick.confidence >= 1 && g.aiPick.confidence <= 99);
    assert.ok(g.aiPick.rawConfidence >= 51 && g.aiPick.rawConfidence <= 92);
    assert.equal(Object.prototype.hasOwnProperty.call(g.aiPick, 'expected'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(g, 'implied'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(g, 'xPts'), true);
    assert.ok(g.home && g.home.city);
    assert.ok(g.away && g.away.city);
    assert.equal(Object.prototype.hasOwnProperty.call(g.home, 'lastGame'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(g.home, 'record'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(g.away, 'ytdWinPct'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(g.home, 'lastFive'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(g.home, 'lastFiveAts'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(g.home, 'showRest'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(g.away, 'shortRestWinPct'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(g.away, 'restWinPct'), true);
    assert.match(String(g.kickoffSlot || ''), /^slot-(wed|thu|sat|sun-1|sun-4|sun-n|mon)$/);
    assert.equal(Object.prototype.hasOwnProperty.call(g, 'spreadMove'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(g, 'totalMove'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(g, 'spread_open'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(g, 'total_open'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(g, 'live'), true);
    assert.ok(Array.isArray(g.injuries));
    if (g.spread_line != null) {
      assert.equal(g.spreadMove.moved, false);
      assert.equal(g.spreadMove.deltaLabel, 'flat');
      assert.equal(g.spreadMove.sinceLabel, null);
    }
    if (g.total_line != null) {
      assert.equal(g.totalMove.moved, false);
      assert.equal(g.totalMove.deltaLabel, 'flat');
    }
  }
  const mnf = (body.games || []).find((g) => g.away_team === 'NYG' && (g.home_team === 'LAR' || g.home_team === 'LA'));
  if (mnf) {
    assert.ok(mnf.away.record && mnf.away.record.label);
    assert.equal(Object.prototype.hasOwnProperty.call(mnf.away, 'ytdWinPct'), true);
    assert.ok(mnf.away.travel);
    assert.equal(mnf.away.travel.dir, 'west');
    assert.ok(mnf.away.travel.zones >= 2);
    assert.equal(Object.prototype.hasOwnProperty.call(mnf.away.travel, 'winPct'), true);
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
  assert.ok(Array.isArray(all.gameRows));
  assert.ok(all.gameRows.length > 0);
  const sampleGame = all.gameRows[0];
  assert.equal(Object.prototype.hasOwnProperty.call(sampleGame, 'gameDate'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(sampleGame, 'opponent'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(sampleGame, 'spreadLabel'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(sampleGame, 'restDaysLabel'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(sampleGame, 'weatherLabel'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(sampleGame, 'distanceLabel'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(sampleGame, 'coverLabel'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(sampleGame, 'roofLabel'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(sampleGame, 'divisionalLabel'), true);
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
  assert.match(page, new RegExp(`styles\\.css\\?v=version-${BUILD}`));
  assert.match(page, new RegExp(`app\\.js\\?v=version-${BUILD}`));
  assert.match(page, new RegExp(`Game Picks · Version ${BUILD}`));
  assert.match(page, /id="build-foot"/);
  const appJs = await fetch(`http://127.0.0.1:${port}/app.js`);
  const script = await appJs.text();
  assert.match(script, /function atsPickLabel/);
  assert.match(script, /function outrightPickLabel/);
  assert.match(script, /function ouPickLabel/);
  assert.match(script, /function lineMoveHtml/);
  assert.match(script, /function scoreRow/);
  assert.match(script, /function syncLivePoll/);
  assert.match(script, /\/api\/live-scores/);
  assert.match(script, /function stackedPick/);
  assert.match(script, /function exclusivePartner/);
  assert.match(script, /Last 5 games/);
  assert.match(script, /Last 5 ATS/);
  assert.match(script, /lastGame\.label/);
  assert.match(script, /Number\(rest\) !== 7/);
  assert.match(script, /n === 8/);
  assert.match(script, /function kickoffSlotClass/);
  assert.match(script, /slot-wed/);
  assert.match(script, /slot-sat/);
  assert.match(script, /abbrev-key/);
  assert.match(script, /W-L-T/);
  assert.match(script, /win–loss-tie/);
  assert.match(script, /cover\/fail\/push/);
  assert.match(script, /over\/under\/push/);
  assert.match(script, /data-details/);
  assert.match(script, /Moved lines only/);
  assert.match(script, /Time of Day/);
  assert.match(script, /data-week-select/);
  assert.match(script, /week-bar/);
  assert.match(script, /function weekBar/);
  assert.match(script, /Season points/);
  assert.match(script, /Your ATS/);
  assert.match(script, /injury-strip/);
  assert.match(script, /function injuryHtml/);
  assert.match(script, /Frozen at lock/);
  assert.match(script, /function formatAiLine/);
  assert.match(script, /ou-word/);
  assert.match(script, /activeBacktestFilterKeys/);
  assert.match(script, /Every active filter gets a column/);
  assert.match(script, /userButtonOuterIdentifier/);
  assert.match(script, /showName: false/);
  assert.doesNotMatch(script, /class="week-stats"/);
  assert.doesNotMatch(script, /class="vs-strip"/);
  assert.doesNotMatch(script, /too big a dog/);
  assert.match(script, /nav-toggle/);
  assert.match(page, /id="nav-toggle"/);
  assert.match(script, /card-foot/);
  assert.match(script, /Win % Rest/);
  assert.match(script, /statRow\(\s*'Record'/);
  assert.match(script, /statRow\(\s*'Win %',/);
  assert.match(script, /Win % Home\/Away/);
  assert.match(script, /Win % Travel/);
  assert.match(script, /function travelWinPctCell/);
  assert.match(script, /ytdWinPct/);
  assert.match(script, /data-hist-game-sort/);
  assert.match(script, /function backtestView/);
  assert.match(script, /game-picks:backtest:v1/);
  assert.match(script, /game-picks:history:v1/);
  assert.match(script, /game-picks:week:v1/);
  assert.match(script, /function pageFromHash/);
  assert.match(script, /function selectPage/);
  assert.match(script, /hashchange/);
  assert.equal(script.includes('#home / #week, #standings, #history, #backtest'), true);
  assert.equal(script.includes('data-bt-sort="${c.key}" title="'), true);
  const missingSortTitle = [];
  for (const th of script.matchAll(/<th[^>]*(?:data-sort|data-hist-sort|data-hist-game-sort|data-bt-sort)[^>]*>/g)) {
    if (!/\stitle="[^"]+"/.test(th[0])) missingSortTitle.push(th[0]);
  }
  assert.deepEqual(missingSortTitle, []);
  assert.match(script, /data-bt-csv/);
  assert.match(script, /ai-conf/);
  assert.match(script, /Conf\. /);
  assert.match(script, /ai-conf-line/);
  assert.match(script, /data-toggle-all/);
  assert.match(script, /Expand all/);
  assert.match(script, /Collapse all/);
  assert.match(script, /aria-expanded="\$\{collapsed \? 'false' : 'true'\}"/);
  assert.match(script, /aria-label="\$\{expanded \? 'Hide' : 'Info'\}"/);
  assert.match(script, /▼ INFO/);
  assert.doesNotMatch(script, /▼ DETAILS/);
  assert.match(script, /function collapsedLineHtml/);
  assert.match(script, /OVER\/UNDER/);
  assert.match(script, /phase === 'final' \? settleHtml\(game\) : \(expanded \? '' : collapsedLineHtml\(game\)\)/);
  assert.match(script, /if \(cardOpen\.has\(game\.game_id\)\) return cardOpen\.get\(game\.game_id\);\s*return false;/);
  const weekFn = script.slice(script.indexOf('function weekView'), script.indexOf('function standingsTable'));
  assert.ok(weekFn.indexOf('week-cards') !== -1 && weekFn.indexOf('abbrevKey()') > weekFn.indexOf('week-cards'));
  const historyFn = script.slice(script.indexOf('function historyView'), script.indexOf('function readHistForm'));
  assert.ok(historyFn.indexOf('historyFiltersForm()') < historyFn.lastIndexOf('abbrevKey()'));
  const backtestFn = script.slice(script.indexOf('function backtestView'), script.indexOf('function historyView'));
  assert.ok(backtestFn.indexOf('backtestFiltersForm()') < backtestFn.lastIndexOf('abbrevKey()'));
  assert.match(script, /pass UNDER \/ pass OVER/);
  assert.match(script, /total 50\+/);
  assert.match(script, /TEAM \+N \/ TEAM −N/);
  assert.match(script, /Starter out/);
  assert.match(script, /starter_out/);
  assert.match(script, /Calibrated historical ATS hit rate/);
  assert.doesNotMatch(script, /not a model probability/);
  assert.match(script, /Brier raw/);
  assert.match(script, /Brier calibrated/);
  assert.match(script, /Brier measures how close the confidence probability/);
  assert.match(script, /pendingWeek/);
  assert.match(script, /function settleHtml/);
  assert.match(script, /settle-ats/);
  assert.match(script, /compareWeekCards/);
  assert.match(script, /advance picks/);
  assert.match(script, /Keep bootstrap/);
  assert.match(script, /Days rest/);
  assert.match(script, /key: 'favorite'/);
  assert.match(script, /key: 'dog'/);
  assert.match(script, /function filterField/);
  assert.match(script, /filter-chip on/);
  assert.doesNotMatch(script, /label: 'Joint'/);
  assert.doesNotMatch(script, /expected_joint/);
  assert.match(script, /r\.matchup \|\| `\$\{r\.away_team\} @ \$\{r\.home_team\}`/);
  assert.match(script, /N &lt; /);
  assert.match(script, /pickRow\(game, 'ats', game\.away_team, game\.home_team, atsPickLabel/);
  assert.match(script, /data-sel="\$\{esc\(left\)\}"/);
  assert.match(script, /outrightPickLabel\(game\.away_team\)/);
  assert.match(script, /ouPickLabel\(game, 'over'\)/);
  assert.doesNotMatch(script, /function homeView/);
  assert.doesNotMatch(script, /function rulesView/);
  assert.doesNotMatch(script, /oauth_apple/);
  assert.match(page, /Social Media sign in/);
  assert.match(page, />Home</);
  assert.match(page, />Backtest</);
  assert.match(page, /data-page="backtest"/);
  assert.doesNotMatch(page, /data-page="home"/);
  assert.doesNotMatch(page, />Current Week</);
  assert.doesNotMatch(page, /data-page="rules"/);
  assert.doesNotMatch(page, /oauth_apple/);
  assert.doesNotMatch(page, />Apple</);
  assert.match(page, /user-button/);
  assert.match(page, /btn-sign-in/);
  assert.match(page, /load-overlay/);
  assert.match(page, /Auth not configured/);
  assert.doesNotMatch(page, /oauth_x/);
  const css = await fetch(`http://127.0.0.1:${port}/styles.css`);
  const cssText = await css.text();
  assert.match(cssText, /\.picks \{ display: grid; gap: 4px; margin-top: auto; \}/);
  assert.doesNotMatch(cssText, /font-size: 72px/);
  assert.match(cssText, /\.week-cards \.pick button \{ font-size: 16px; padding: 8px 10px; \}/);
  assert.match(cssText, /repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(cssText, /\.settle-strip \{/);
  assert.match(cssText, /\.settle-strip \.settle-ats\.cover/);
  assert.match(cssText, /\.settle-strip \.settle-ou/);
  assert.match(cssText, /body\.menu-open \.site-nav/);
  assert.match(cssText, /\.site-nav \{/);
  assert.match(page, /id="site-nav"/);
  assert.match(page, /aria-controls="site-nav"/);
  assert.match(cssText, /\.pick-stack \.pick-abbr, \.pick-stack \.pick-line \{ font-size: inherit; \}/);
  assert.match(cssText, /\.score-row \{/);
  assert.match(cssText, /background: #d8d8d8/);
  assert.match(cssText, /\.line-move \{/);
  assert.match(cssText, /font-size: 12px; line-height: 1\.25;/);
  assert.match(cssText, /\.line-delta\.up \{ color: var\(--green\)/);
  assert.match(cssText, /\.line-delta\.down \{ color: var\(--red\)/);
  assert.match(cssText, /\.site-foot/);
  assert.match(cssText, /padding: 2px 0 2px 0px;/);
  assert.match(cssText, /--card: #222222;/);
  assert.match(cssText, /--line: #3a3a3a;/);
  assert.match(cssText, /linear-gradient\(180deg, var\(--card-top\) 0%, var\(--card-bot\) 100%\)/);
  assert.match(cssText, /\.card\.slot-wed \{ --card-top: #606060; --card-bot: #4c4c4c; \}/);
  assert.match(cssText, /\.card\.slot-sat \{ --card-top: #4a4a4a; --card-bot: #363636; \}/);
  assert.match(cssText, /\.card\.slot-mon \{ --card-top: #2d2d2d; --card-bot: #1c1c1c; \}/);
  assert.match(cssText, /\.bt-stats \{/);
  assert.match(cssText, /grid-template-columns: repeat\(8, minmax\(0, 1fr\)\)/);
  assert.match(cssText, /\.week-bar \{/);
  assert.match(cssText, /\.injury-strip \{/);
  assert.match(cssText, /\.ai-conf-line \{/);
  assert.match(cssText, /\.card-foot \{[^}]*margin-top: auto;/);
  assert.match(cssText, /\.ai span\.ai-frozen/);
  assert.match(cssText, /cl-userButtonOuterIdentifier/);
  assert.match(cssText, /background: #FFB81C/);
  assert.match(cssText, /\.bt-stat \.v \{ color: #111;/);
  assert.match(cssText, /\.hist-row label\.on select/);
  assert.match(cssText, /\.filter-chip\.on/);
  assert.match(cssText, /\.bt-step select\.on/);

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

test('/api/backtest aggregates history with lift, expected calls, and CSV', async () => {
  const server = await listen();
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/backtest?team=SEA&from=2023&to=2024`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.ok(body.n >= 0);
  assert.equal(body.smallNThreshold, 30);
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'smallN'), true);
  assert.ok(body.slice);
  assert.ok(body.vsLeague);
  assert.ok(body.expected);
  assert.equal(Object.prototype.hasOwnProperty.call(body.expected, 'brierRaw'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(body.expected, 'brierCalibrated'), true);
  assert.equal(body.expected.calibrationTarget, 'ats');
  assert.ok(Array.isArray(body.games));
  if (body.games.length) {
    const g = body.games[0];
    assert.equal(Object.prototype.hasOwnProperty.call(g, 'expected'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(g, 'confidence'), true);
    if (g.expected) assert.match(String(g.expected), / and /);
    if (g.gameDate) assert.match(String(g.gameDate), /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} EST$/);
    if (g.away_team && g.home_team) {
      assert.equal(g.matchup, `${g.away_team} @ ${g.home_team}`);
      assert.equal(g.opponent, `${g.away_team} @ ${g.home_team}`);
    }
  }
  const chained = await fetch(`http://127.0.0.1:${port}/api/backtest?team=SEA&from=2023&to=2024&chain=site:home,role:underdog`);
  const chainBody = await chained.json();
  assert.equal(chained.status, 200);
  assert.ok(chainBody.n <= body.n);
  assert.ok(Array.isArray(chainBody.path));
  assert.ok(chainBody.path.length >= 2);
  const csvRes = await fetch(`http://127.0.0.1:${port}/api/backtest?team=SEA&from=2023&to=2024&format=csv`);
  assert.equal(csvRes.status, 200);
  assert.match(csvRes.headers.get('content-type'), /text\/csv/);
  const csv = await csvRes.text();
  assert.match(csv, /date,season,week/);
  assert.match(csv, /expected,confidence/);
  assert.doesNotMatch(csv, /expected_joint/);
  server.close();
});

test('/api/ai-picks and /api/cron/scores return JSON without a database', async () => {
  const server = await listen();
  const { port } = server.address();
  const ai = await fetch(`http://127.0.0.1:${port}/api/ai-picks?season=2026&week=1`);
  const aiBody = await ai.json();
  assert.equal(ai.status, 200);
  assert.equal(aiBody.ok, true);
  assert.deepEqual(aiBody.picks, []);
  const cron = await fetch(`http://127.0.0.1:${port}/api/cron/scores`);
  const cronBody = await cron.json();
  assert.equal(cron.status, 503);
  assert.equal(cronBody.ok, false);
  assert.equal(cronBody.db, 'missing');
  const live = await fetch(`http://127.0.0.1:${port}/api/live-scores`);
  const liveBody = await live.json();
  assert.equal(live.status, 200);
  assert.equal(liveBody.ok, true);
  assert.equal(liveBody.queried, false);
  assert.equal(liveBody.reason, 'disabled');
  assert.equal(liveBody.livePoll, false);
  assert.equal(liveBody.build, BUILD);
  server.close();
});
