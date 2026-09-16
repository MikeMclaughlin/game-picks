(() => {
  const app = document.getElementById('app');
  const tabs = document.getElementById('tabs');
  const who = document.getElementById('who');
  const authNotice = document.getElementById('auth-notice');
  const signedOutEl = document.getElementById('clerk-signed-out');
  const userButtonEl = document.getElementById('clerk-user-button');
  const btnSignIn = document.getElementById('btn-sign-in');
  const btnSignUp = document.getElementById('btn-sign-up');

  const CLERK_APPEARANCE = {
    variables: {
      colorPrimary: '#FFB81C',
      colorBackground: '#111111',
      colorInputBackground: '#0b0b0b',
      colorInputText: '#ffffff',
      colorText: '#ffffff',
      colorTextSecondary: '#b0b0b0',
      colorTextOnPrimaryBackground: '#111111',
      colorNeutral: '#ffffff',
      borderRadius: '4px'
    },
    elements: {
      card: { backgroundColor: '#161616', boxShadow: 'none', border: '1px solid #2a2a2a' },
      headerTitle: { color: '#ffffff' },
      headerSubtitle: { color: '#b0b0b0' },
      socialButtonsBlockButton: {
        backgroundColor: '#1a1a1a',
        borderColor: '#FFB81C',
        color: '#ffffff'
      },
      formButtonPrimary: { backgroundColor: '#FFB81C', color: '#111111' }
    }
  };

  const state = {
    page: 'home',
    bootstrap: null,
    week: null,
    standings: null,
    history: null,
    historyError: null,
    filters: { homeDog: false, projOver: false, projUnder: false },
    sort: { key: 'season_points', dir: 'desc' },
    historyTeam: 'ALL',
    historyFilters: {
      team: 'ALL',
      from: 2023,
      to: 2026,
      site: 'all',
      weather: 'all',
      travel: 'all',
      distance: 'all',
      roof: 'all',
      role: 'all',
      division: 'all',
      daysOff: 'all'
    },
    historyMore: false,
    historySort: { key: 'team', dir: 'asc' },
    historyLoading: false
  };
  let clerk = null;
  let lastClerkUserId = undefined;
  const DEFAULT_HIST = {
    team: 'ALL',
    from: 2023,
    to: 2026,
    site: 'all',
    weather: 'all',
    travel: 'all',
    distance: 'all',
    roof: 'all',
    role: 'all',
    division: 'all',
    daysOff: 'all'
  };
  const HIST_CHIP_META = [
    { key: 'team', label: 'Team' },
    { key: 'from', label: 'From year' },
    { key: 'to', label: 'To year' },
    { key: 'site', label: 'Site', names: { home: 'Home', road: 'Road' } },
    { key: 'weather', label: 'Weather', names: { cold: 'Cold', windy: 'Windy', fair: 'Fair' } },
    { key: 'travel', label: 'Travel', names: { east: 'East', west: 'West' } },
    { key: 'distance', label: 'Distance', names: { local: 'Local', cross: 'Cross-country' } },
    { key: 'roof', label: 'Roof', names: { dome: 'Dome', outdoor: 'Outdoor', retractable: 'Retractable' } },
    { key: 'role', label: 'Role', names: { favorite: 'Favorite', underdog: 'Underdog' } },
    { key: 'division', label: 'Division', names: { divisional: 'Divisional', 'non-div': 'Non-div' } },
    { key: 'daysOff', label: 'Days off', names: { short: 'Short rest', normal: 'Normal', bye: 'Bye+' } }
  ];
  const SECONDARY_HIST = new Set(['distance', 'roof', 'role', 'division', 'daysOff']);
  let loadGen = 0;

  function fmtPct(v) {
    if (v == null) return '—';
    return `${Math.round(v * 100)}%`;
  }
  function fmtNum(v) {
    if (v == null || Number.isNaN(Number(v))) return '—';
    const n = Number(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }
  function spreadLabel(game) {
    if (game.spread_line == null) return '—';
    const abs = fmtNum(Math.abs(game.spread_line));
    return `${game.home_team} ${game.spread_line >= 0 ? '-' : '+'}${abs}`;
  }
  function kickoffLabel(iso) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }
  const dbBanner = document.getElementById('db-banner');

  function showBanner(payload) {
    if (!dbBanner) return;
    const text = (payload && (payload.error || payload.hint)) || '';
    if (!text) {
      dbBanner.hidden = true;
      dbBanner.textContent = '';
      return;
    }
    dbBanner.hidden = false;
    dbBanner.textContent = payload.hint ? `${payload.error} ${payload.hint}` : text;
  }

  async function api(path, opts) {
    const headers = { 'content-type': 'application/json', ...(opts && opts.headers) };
    if (clerk && clerk.session) {
      try {
        const token = await clerk.session.getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      } catch {
        /* signed out or token unavailable */
      }
    }
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers,
      ...opts
    });
    const data = await res.json().catch(() => ({ ok: false, error: res.statusText }));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText);
      err.payload = data;
      err.status = res.status;
      throw err;
    }
    return data;
  }
  function setWho(user) {
    const clerkUser = clerk && clerk.user;
    const name = (user && user.username)
      || (clerkUser && (clerkUser.fullName || clerkUser.username || (clerkUser.primaryEmailAddress && clerkUser.primaryEmailAddress.emailAddress)))
      || '';
    who.textContent = name ? `${name} · signed in` : '';
  }

  function showAuthNotice(message) {
    if (!authNotice) return;
    if (!message) {
      authNotice.hidden = true;
      authNotice.textContent = '';
      return;
    }
    authNotice.hidden = false;
    authNotice.textContent = message;
  }

  function clerkConfigFrom(payload) {
    if (payload && payload.clerk) return payload.clerk;
    if (payload && Object.prototype.hasOwnProperty.call(payload, 'configured')) return payload;
    return window.__CLERK_CONFIG__ || { configured: false };
  }

  function frontendApiFromKey(key) {
    try {
      const packed = String(key || '').split('_').slice(2).join('_');
      if (!packed) return null;
      const decoded = atob(packed.replace(/-/g, '+').replace(/_/g, '/'));
      return decoded.replace(/\$+$/, '') || null;
    } catch {
      return null;
    }
  }

  function loadScript(src, attrs) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.crossOrigin = 'anonymous';
      if (attrs) Object.keys(attrs).forEach((k) => { s.setAttribute(k, attrs[k]); });
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function initClerkSdk(cfg) {
    const key = cfg && cfg.publishableKey;
    if (!key) throw new Error('Missing Clerk publishable key');
    const domain = cfg.frontendApi || frontendApiFromKey(key);
    if (domain) {
      try {
        try {
          await loadScript(`https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js`);
        } catch {
          /* UI bundle optional on older clerk-js */
        }
        await loadScript(`https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, {
          'data-clerk-publishable-key': key
        });
        if (window.Clerk && typeof window.Clerk.load === 'function') {
          const opts = { appearance: CLERK_APPEARANCE };
          if (window.__internal_ClerkUICtor) opts.ui = { ClerkUI: window.__internal_ClerkUICtor };
          await window.Clerk.load(opts);
          return window.Clerk;
        }
      } catch (err) {
        console.warn('Clerk FAPI CDN failed, trying jsDelivr', err);
      }
    }
    await loadScript('https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js');
    const ClerkGlobal = window.Clerk;
    if (!ClerkGlobal) throw new Error('Clerk browser SDK failed to load');
    const instance = typeof ClerkGlobal === 'function' ? new ClerkGlobal(key) : ClerkGlobal;
    await instance.load({ appearance: CLERK_APPEARANCE });
    return instance;
  }

  function renderAuthChrome() {
    const signedIn = Boolean(clerk && clerk.isSignedIn);
    if (signedOutEl) signedOutEl.hidden = signedIn;
    if (userButtonEl) {
      userButtonEl.hidden = !signedIn;
      if (signedIn && clerk && typeof clerk.mountUserButton === 'function' && !userButtonEl.dataset.mounted) {
        clerk.mountUserButton(userButtonEl, { appearance: CLERK_APPEARANCE, showName: false });
        userButtonEl.dataset.mounted = '1';
      }
    }
  }

  async function syncClerkUser() {
    if (!clerk || !clerk.session) return;
    try {
      const data = await api('/api/login', { method: 'POST', body: '{}' });
      if (state.bootstrap) state.bootstrap.user = data.user;
      setWho(data.user);
    } catch (err) {
      showBanner(err.payload || { error: err.message });
    }
  }

  async function startOAuth(strategy) {
    if (!clerk || !clerk.client || !clerk.client.signIn) {
      throw new Error('Clerk is still loading');
    }
    const redirectUrl = `${window.location.origin}/`;
    const strategies = strategy === 'oauth_x' ? ['oauth_x', 'oauth_twitter'] : [strategy];
    let lastErr = null;
    for (const s of strategies) {
      try {
        await clerk.client.signIn.authenticateWithRedirect({
          strategy: s,
          redirectUrl,
          redirectUrlComplete: redirectUrl
        });
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Social sign-in failed');
  }

  async function setupClerk(cfg) {
    if (!cfg || !cfg.configured || !cfg.publishableKey) {
      showAuthNotice('Auth not configured. Set CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY (see AUTH.md).');
      if (signedOutEl) signedOutEl.hidden = true;
      if (userButtonEl) userButtonEl.hidden = true;
      return;
    }
    showAuthNotice('');
    try {
      clerk = await initClerkSdk(cfg);
    } catch (err) {
      showAuthNotice(err.message || 'Auth not configured');
      return;
    }
    renderAuthChrome();
    lastClerkUserId = clerk.isSignedIn ? (clerk.user && clerk.user.id) || null : null;
    clerk.addListener(({ user }) => {
      const id = (user && user.id) || null;
      if (id === lastClerkUserId) return;
      lastClerkUserId = id;
      renderAuthChrome();
      setWho(state.bootstrap && state.bootstrap.user);
      state.bootstrap = null;
      state.week = null;
      if (id) {
        syncClerkUser().then(() => load()).catch(showPageError);
      } else {
        api('/api/logout', { method: 'POST', body: '{}' }).catch(() => {});
        load().catch(showPageError);
      }
    });
    if (clerk.isSignedIn) {
      await syncClerkUser();
    }
  }

  function historyQuery(filters) {
    const f = filters || state.historyFilters;
    const p = new URLSearchParams();
    p.set('team', f.team);
    p.set('from', String(f.from));
    p.set('to', String(f.to));
    p.set('site', f.site);
    p.set('weather', f.weather);
    p.set('travel', f.travel);
    p.set('distance', f.distance);
    p.set('roof', f.roof);
    p.set('role', f.role);
    p.set('division', f.division);
    p.set('daysOff', f.daysOff);
    return p.toString();
  }

  function activeHistChips() {
    return HIST_CHIP_META.filter((meta) => {
      const v = state.historyFilters[meta.key];
      return String(v) !== String(DEFAULT_HIST[meta.key]);
    }).map((meta) => {
      const raw = state.historyFilters[meta.key];
      const shown = meta.names && meta.names[raw] ? meta.names[raw] : raw;
      return { key: meta.key, text: `${meta.label}: ${shown}` };
    });
  }

  function yearsForHistory() {
    const fromApi = (state.history && state.history.seasons) || [];
    if (fromApi.length) return fromApi;
    return [2023, 2024, 2025, 2026];
  }

  function showPageError(err) {
    app.innerHTML = `<p class="notice">${(err && err.message) || 'Request failed'}</p>`;
  }

  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-page]');
    if (!btn) return;
    state.page = btn.dataset.page;
    if (state.page === 'history') {
      state.history = null;
      state.historyError = null;
      state.historyLoading = true;
    } else if (state.page === 'week') {
      state.week = null;
    } else if (state.page === 'standings') {
      state.standings = null;
    }
    for (const b of tabs.querySelectorAll('button')) b.classList.toggle('on', b === btn);
    render();
    load().catch(showPageError);
  });

  if (signedOutEl) {
    signedOutEl.addEventListener('click', async (e) => {
      const oauth = e.target.closest('[data-oauth]');
      if (oauth) {
        try {
          await startOAuth(oauth.dataset.oauth);
        } catch (err) {
          showBanner({ error: err.message || 'Social sign-in failed' });
        }
        return;
      }
      if (e.target.closest('#btn-sign-in') && clerk && typeof clerk.openSignIn === 'function') {
        clerk.openSignIn({ appearance: CLERK_APPEARANCE, withSignUp: true });
        return;
      }
      if (e.target.closest('#btn-sign-up') && clerk && typeof clerk.openSignUp === 'function') {
        clerk.openSignUp({ appearance: CLERK_APPEARANCE });
      }
    });
  }
  if (btnSignIn) btnSignIn.type = 'button';
  if (btnSignUp) btnSignUp.type = 'button';

  async function load() {
    const gen = ++loadGen;
    if (!state.bootstrap) state.bootstrap = await api('/api/bootstrap');
    if (gen !== loadGen) return;
    setWho(state.bootstrap.user);
    const cfg = clerkConfigFrom(state.bootstrap);
    if (!cfg.configured) {
      showAuthNotice('Auth not configured. Set CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY (see AUTH.md).');
    } else {
      showAuthNotice('');
    }
    if (state.bootstrap.db) showBanner(null);
    else {
      showBanner({
        error: 'Database is not connected yet.',
        hint: 'Browse the week now. Sign-in and saved picks wait on DATABASE_URL (Neon on Vercel).'
      });
    }
    render();
    try {
      if (state.page === 'week' && !state.week) {
        const week = await api(`/api/week?season=${state.bootstrap.season}&week=${state.bootstrap.week}`);
        if (gen !== loadGen) return;
        state.week = week;
      }
      if (state.page === 'standings' && !state.standings) {
        const standings = await api('/api/standings');
        if (gen !== loadGen) return;
        state.standings = standings;
      }
      if (state.page === 'history' && !state.history) {
        state.historyLoading = true;
        const history = await api(`/api/history?${historyQuery()}`);
        if (gen !== loadGen) return;
        state.history = history;
        state.historyError = null;
        state.historyLoading = false;
        if (history && history.seasons && history.seasons.length) {
          const maxY = history.seasons[history.seasons.length - 1];
          if (state.historyFilters.to === DEFAULT_HIST.to && maxY !== DEFAULT_HIST.to) {
            state.historyFilters.to = maxY;
          }
        }
      }
    } catch (err) {
      if (gen !== loadGen) return;
      if (state.page === 'history') {
        state.historyError = (err && err.message) || 'Failed to load history';
        state.historyLoading = false;
        render();
        return;
      }
      throw err;
    }
    if (gen !== loadGen) return;
    render();
  }

  function passFilters(g) {
    if (state.filters.homeDog && !g.homeUnderdog) return false;
    if (state.filters.projOver && !g.projectedOver) return false;
    if (state.filters.projUnder && !g.projectedUnder) return false;
    return true;
  }

  function wagerFor(game, market) {
    return (game.wagers || []).find((w) => w.market === market);
  }

  function sideBits(side, isHome) {
    const bits = [];
    if (side.last) bits.push(`last ${side.last}`);
    if (side.rest != null) {
      bits.push(`rest ${side.rest}d${side.short ? ' SHORT' : ''}`);
    }
    if (side.short && side.shortRestWinPct != null) bits.push(`short ${fmtPct(side.shortRestWinPct)}`);
    if (isHome && side.homeWinPct != null) bits.push(`home ${fmtPct(side.homeWinPct)}`);
    if (!isHome && side.awayWinPct != null) bits.push(`away ${fmtPct(side.awayWinPct)}`);
    if (side.travel) {
      bits.push(`${side.travel.label}${side.travel.winPct != null ? ` ${fmtPct(side.travel.winPct)}` : ''}`);
    }
    return bits.map((b) => `<div class="stat${/SHORT|short /.test(b) ? ' short' : ''}">${b}</div>`).join('');
  }

  function pickRow(game, market, left, right) {
    const current = wagerFor(game, market);
    const locked = game.locked;
    const on = (val) => current && String(current.selection).toUpperCase() === String(val).toUpperCase();
    return `<div class="pick">
      <label>${market}</label>
      <button type="button" data-gid="${game.game_id}" data-market="${market}" data-sel="${left}" class="${on(left) ? 'on' : ''}" ${locked ? 'disabled' : ''} title="${locked ? 'Locked at kickoff' : `Pick ${left} ${market}`}">${left}</button>
      <button type="button" data-gid="${game.game_id}" data-market="${market}" data-sel="${right}" class="${on(right) ? 'on' : ''}" ${locked ? 'disabled' : ''} title="${locked ? 'Locked at kickoff' : `Pick ${right} ${market}`}">${right}</button>
    </div>`;
  }

  function card(game) {
    const ai = game.aiPick && game.aiPick.label ? game.aiPick.label.replace('AI Pick:', '').trim() : '—';
    return `<article class="card${game.locked ? ' locked' : ''}">
      <div class="meta">
        <span>${kickoffLabel(game.kickoff)}</span>
        <span class="${game.locked ? 'lock' : ''}">${game.locked ? 'locked' : 'open'}</span>
      </div>
      <div class="sides">
        <div class="team">
          <div class="abbr">${game.away_team}</div>
          <div class="role">AWAY</div>
          ${sideBits(game.away, false)}
        </div>
        <div class="vs">@</div>
        <div class="team home">
          <div class="abbr">${game.home_team}</div>
          <div class="role">HOME</div>
          ${sideBits(game.home, true)}
        </div>
      </div>
      <div class="lines">
        <div>spread <b>${spreadLabel(game)}</b></div>
        <div class="total${game.fadeTotal ? ' fade' : ''}">total <b>${fmtNum(game.total_line)}</b></div>
      </div>
      <div class="lines">
        <div>imp ${game.away_team} <b>${fmtNum(game.implied && game.implied.away)}</b></div>
        <div>imp ${game.home_team} <b>${fmtNum(game.implied && game.implied.home)}</b></div>
      </div>
      <div class="ai"><span>AI Pick:</span> ${ai}</div>
      <div class="picks">
        ${pickRow(game, 'outright', game.away_team, game.home_team)}
        ${pickRow(game, 'ats', game.away_team, game.home_team)}
        ${pickRow(game, 'ou', 'over', 'under')}
      </div>
    </article>`;
  }

  async function onPick(e) {
    const btn = e.target.closest('button[data-market]');
    if (!btn || btn.disabled) return;
    const { gid, market, sel } = btn.dataset;
    const game = (state.week || state.bootstrap).games.find((g) => g.game_id === gid);
    const current = game && wagerFor(game, market);
    const nextSel = current && String(current.selection).toUpperCase() === String(sel).toUpperCase() ? '' : sel;
    try {
      await api('/api/picks', {
        method: 'POST',
        body: JSON.stringify({ game_id: gid, market, selection: nextSel })
      });
      state.week = null;
      state.bootstrap = null;
      state.standings = null;
      await load();
    } catch (err) {
      alert(err.message);
    }
  }

  function homeView() {
    const b = state.bootstrap;
    const games = (b.games || []).slice().sort((a, c) => new Date(a.kickoff) - new Date(c.kickoff));
    const board = b.standings || [];
    return `<div class="grid">
      <section class="panel">
        <h1>Week ${b.week} snapshot</h1>
        <p class="lede">${b.season} season · ${games.length} games · ${b.db ? 'live data' : 'bundled schedule (set DATABASE_URL to persist picks)'}</p>
        <div class="cards">${games.map(card).join('') || '<p>No games.</p>'}</div>
      </section>
      <section class="panel">
        <h2>Leaderboard</h2>
        ${standingsTable(board, false)}
      </section>
    </div>`;
  }

  function weekView() {
    const w = state.week || state.bootstrap;
    const games = (w.games || []).filter(passFilters);
    return `<section>
      <div class="weekbar">
        <h1>Current Week ${w.week}</h1>
        <span class="lede">${w.season}</span>
      </div>
      <div class="filters">
        <button type="button" class="chip${state.filters.homeDog ? ' on' : ''}" data-filter="homeDog" title="Show home underdogs only">Home underdogs</button>
        <button type="button" class="chip${state.filters.projOver ? ' on' : ''}" data-filter="projOver" title="Show games projected over the total">Projected over</button>
        <button type="button" class="chip${state.filters.projUnder ? ' on' : ''}" data-filter="projUnder" title="Show games projected under the total">Projected under</button>
      </div>
      <div class="cards" id="week-cards">${games.map(card).join('') || '<p>No games match those filters.</p>'}</div>
    </section>`;
  }

  function standingsTable(rows, sortable) {
    const cols = [
      { key: 'rank', label: 'Rk', title: 'Rank by season points, then weekly points' },
      { key: 'username', label: 'User', title: 'Pool username' },
      { key: 'season_points', label: 'Season', title: 'Season points (1 per correct wager)' },
      { key: 'weekly_points', label: 'Week', title: 'Points scored this week (tie-break)' },
      { key: 'wagers', label: 'Wagers', title: 'Number of wagers this season' },
      { key: 'wins', label: 'Wins', title: 'Correct settled wagers' },
      { key: 'win_pct', label: 'Win%', title: 'Wins divided by settled wagers (pushes excluded from wins)' }
    ];
    const me = state.bootstrap && state.bootstrap.user && state.bootstrap.user.username;
    const sorted = [...rows];
    if (sortable) {
      const { key, dir } = state.sort;
      sorted.sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        return dir === 'asc' ? av - bv : bv - av;
      });
    }
    return `<table>
      <thead><tr>${cols.map((c) => `<th data-sort="${c.key}" title="${c.title}" class="${sortable && state.sort.key === c.key ? 'sorted' : ''}">${c.label}</th>`).join('')}</tr></thead>
      <tbody>${sorted.map((r, i) => `<tr class="${r.username === me ? 'me' : ''}">
        <td>${sortable ? i + 1 : r.rank}</td>
        <td>${r.username}</td>
        <td>${r.season_points}</td>
        <td>${r.weekly_points}</td>
        <td>${r.wagers}</td>
        <td>${r.wins}</td>
        <td>${fmtPct(r.win_pct)}</td>
      </tr>`).join('') || '<tr><td colspan="7">No players yet.</td></tr>'}</tbody>
    </table>`;
  }

  function rec(r) {
    return r && r.label ? r.label : '0-0';
  }

  function optList(options, selected) {
    return options.map((o) => {
      const value = typeof o === 'object' ? o.value : o;
      const label = typeof o === 'object' ? o.label : o;
      const sel = String(value) === String(selected) ? ' selected' : '';
      return `<option value="${value}"${sel}>${label}</option>`;
    }).join('');
  }

  function historySortValue(row, key) {
    if (key === 'team') return row.team || '';
    if (key === 'games') return Number(row.games) || 0;
    const recs = { ats: row.ats, ou: row.ou, home: row.home, road: row.road, favorite: row.favorite, dog: row.dog };
    const rec = recs[key];
    if (!rec || rec.pct == null) return -1;
    return rec.pct;
  }

  function sortedHistoryRows(rows) {
    const { key, dir } = state.historySort;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = historySortValue(a, key);
      const bv = historySortValue(b, key);
      let cmp = 0;
      if (typeof av === 'string' || typeof bv === 'string') cmp = String(av).localeCompare(String(bv));
      else cmp = av - bv;
      if (cmp === 0) cmp = String(a.team).localeCompare(String(b.team));
      return dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }

  function historyFiltersForm() {
    const f = state.historyFilters;
    const teams = ['ALL', ...(state.bootstrap?.teams || [])];
    const years = yearsForHistory();
    const moreOpen = state.historyMore || activeHistChips().some((c) => SECONDARY_HIST.has(c.key));
    const chips = activeHistChips();
    return `<form id="hist-filters" class="hist-bar">
      <div class="hist-row">
        <label>Team <select name="team" title="Filter splits to one team">${optList(teams, f.team)}</select></label>
        <label>From year <select name="from" title="Inclusive start season">${optList(years, f.from)}</select></label>
        <label>To year <select name="to" title="Inclusive end season">${optList(years, f.to)}</select></label>
        <label>Site <select name="site" title="Home or road games for the team">${optList([{ value: 'all', label: 'All' }, { value: 'home', label: 'Home' }, { value: 'road', label: 'Road' }], f.site)}</select></label>
        <label>Weather <select name="weather" title="Cold ≤40°F, windy 15+ mph, fair outdoor otherwise">${optList([{ value: 'all', label: 'All' }, { value: 'cold', label: 'Cold' }, { value: 'windy', label: 'Windy' }, { value: 'fair', label: 'Fair' }], f.weather)}</select></label>
        <label>Travel <select name="travel" title="Road games crossing 2+ time zones">${optList([{ value: 'all', label: 'All' }, { value: 'east', label: 'East' }, { value: 'west', label: 'West' }], f.travel)}</select></label>
        <div class="hist-actions">
          <button type="button" class="btn-more" data-hist-more aria-expanded="${moreOpen ? 'true' : 'false'}">${moreOpen ? 'Fewer filters' : 'More filters'}</button>
          <button type="button" class="btn-reset" data-hist-reset>Reset</button>
        </div>
      </div>
      <div class="hist-row" id="hist-more" ${moreOpen ? '' : 'hidden'}>
        <label>Distance <select name="distance" title="Local = 0–1 time zones; cross-country = 2+">${optList([{ value: 'all', label: 'All' }, { value: 'local', label: 'Local' }, { value: 'cross', label: 'Cross-country' }], f.distance)}</select></label>
        <label>Roof <select name="roof" title="Dome, outdoor, or retractable (open/closed)">${optList([{ value: 'all', label: 'All' }, { value: 'dome', label: 'Dome' }, { value: 'outdoor', label: 'Outdoor' }, { value: 'retractable', label: 'Retractable' }], f.roof)}</select></label>
        <label>Role <select name="role" title="Favorite or underdog from the spread">${optList([{ value: 'all', label: 'All' }, { value: 'favorite', label: 'Favorite' }, { value: 'underdog', label: 'Underdog' }], f.role)}</select></label>
        <label>Division <select name="division" title="Same-division opponents">${optList([{ value: 'all', label: 'All' }, { value: 'divisional', label: 'Divisional' }, { value: 'non-div', label: 'Non-div' }], f.division)}</select></label>
        <label>Days off <select name="daysOff" title="Short rest ≤5 days, bye+ ≥11, else normal">${optList([{ value: 'all', label: 'All' }, { value: 'short', label: 'Short rest' }, { value: 'normal', label: 'Normal' }, { value: 'bye', label: 'Bye+' }], f.daysOff)}</select></label>
      </div>
      ${chips.length ? `<div class="hist-chips">${chips.map((c) => `<button type="button" class="filter-chip" data-chip-clear="${c.key}" title="Clear ${c.text}">${c.text} ×</button>`).join('')}</div>` : ''}
    </form>
    <p class="hist-hint">Filters narrow the schedule seed; table updates as you change them.</p>`;
  }

  function historyTable(rows) {
    const cols = [
      { key: 'team', label: 'Team', title: 'Team abbreviation' },
      { key: 'games', label: 'G', title: 'Games matching the current filters' },
      { key: 'ats', label: 'ATS', title: 'Against the spread record' },
      { key: 'ou', label: 'O/U', title: 'Over/under record (overs-unders-pushes)' },
      { key: 'home', label: 'Home', title: 'Straight-up home record in the filtered set' },
      { key: 'road', label: 'Road', title: 'Straight-up road record in the filtered set' }
    ];
    const sorted = sortedHistoryRows(rows);
    const { key, dir } = state.historySort;
    return `<div class="hist-table-wrap"><table class="hist-table">
      <thead><tr>${cols.map((c) => {
        const on = key === c.key;
        const caret = on ? `<span class="caret">${dir === 'asc' ? '▲' : '▼'}</span>` : '';
        return `<th data-hist-sort="${c.key}" title="${c.title}" class="${on ? 'sorted' : ''}">${c.label}${caret}</th>`;
      }).join('')}</tr></thead>
      <tbody>${sorted.map((r) => `<tr>
        <td>${r?.team ?? ''}</td>
        <td>${r?.games ?? 0}</td>
        <td>${rec(r?.ats)}</td>
        <td>${rec(r?.ou)}</td>
        <td>${rec(r?.home)}</td>
        <td>${rec(r?.road)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  function historyView() {
    let body;
    if (state.historyError) body = `<p class="notice">${state.historyError}</p>`;
    else if (state.historyLoading || !state.history) body = '<p class="hist-loading">Loading history…</p>';
    else {
      const rows = (state.history.rows || []).filter((r) => r && r.games > 0);
      body = rows.length ? historyTable(rows) : '<p class="hist-empty">No games match these filters</p>';
    }
    return `<section>
      <h1>History</h1>
      <p class="lede">Team performance splits · schedule seed (not your wager ledger)</p>
      ${historyFiltersForm()}
      ${body}
    </section>`;
  }

  function readHistForm(form) {
    const fd = new FormData(form);
    const next = { ...state.historyFilters };
    for (const key of Object.keys(DEFAULT_HIST)) {
      if (!fd.has(key)) continue;
      let v = fd.get(key);
      if (key === 'from' || key === 'to') v = Number(v);
      next[key] = v;
    }
    if (next.from > next.to) {
      const swap = next.from;
      next.from = next.to;
      next.to = swap;
    }
    return next;
  }

  function reloadHistory() {
    state.historyTeam = state.historyFilters.team;
    state.history = null;
    state.historyError = null;
    state.historyLoading = true;
    render();
    load().catch((err) => {
      state.historyError = (err && err.message) || 'Failed to load history';
      state.historyLoading = false;
      render();
    });
  }

  function rulesView() {
    return `<section class="rules panel">
      <h1>Rules</h1>
      <p class="lede">This is a season-long pick-em. It is not a survivor / suicide pool.</p>
      <ul>
        <li>Sign in with Google, Apple, or X (Twitter). You stay in the pool all season.</li>
        <li>Each game can take up to three independent wagers: outright winner, ATS, and over/under.</li>
        <li>Take any subset of those markets, on as many games as you want, or skip a game.</li>
        <li>There is no one-pick-per-week rule and no cannot-reuse-team rule.</li>
        <li>Each correct settled wager is 1 point. Wrong, push, tie, or a missed game is 0 — never elimination.</li>
        <li>Picks lock at that game’s kickoff. Locked picks cannot change; unlocked picks can be updated until kickoff.</li>
        <li>Standings: season points, then this week’s points as the tie-break.</li>
        <li>ATS uses the posted spread (positive spread means home favored). Home covers if (home − away) &gt; spread. Equal is a push.</li>
        <li>Over/under: over if home + away &gt; total; equal is a push.</li>
      </ul>
    </section>`;
  }

  function render() {
    if (!state.bootstrap) {
      app.innerHTML = '<p>Loading…</p>';
      return;
    }
    if (state.page === 'home') app.innerHTML = homeView();
    else if (state.page === 'week') app.innerHTML = weekView();
    else if (state.page === 'standings') app.innerHTML = `<section class="panel"><h1>Standings</h1>${standingsTable((state.standings && state.standings.standings) || state.bootstrap.standings || [], true)}</section>`;
    else if (state.page === 'history') app.innerHTML = historyView();
    else app.innerHTML = rulesView();

    app.onclick = async (e) => {
      const chip = e.target.closest('[data-filter]');
      if (chip) {
        const key = chip.dataset.filter;
        state.filters[key] = !state.filters[key];
        if (key === 'projOver' && state.filters.projOver) state.filters.projUnder = false;
        if (key === 'projUnder' && state.filters.projUnder) state.filters.projOver = false;
        render();
        return;
      }
      const sort = e.target.closest('th[data-sort]');
      if (sort && state.page === 'standings') {
        const key = sort.dataset.sort;
        if (state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
        else state.sort = { key, dir: key === 'username' ? 'asc' : 'desc' };
        render();
        return;
      }
      const histSort = e.target.closest('th[data-hist-sort]');
      if (histSort && state.page === 'history') {
        const key = histSort.dataset.histSort;
        if (state.historySort.key === key) state.historySort.dir = state.historySort.dir === 'asc' ? 'desc' : 'asc';
        else state.historySort = { key, dir: key === 'team' ? 'asc' : 'desc' };
        render();
        return;
      }
      if (e.target.closest('[data-hist-more]')) {
        state.historyMore = !state.historyMore;
        render();
        return;
      }
      if (e.target.closest('[data-hist-reset]')) {
        state.historyFilters = { ...DEFAULT_HIST };
        state.historyMore = false;
        reloadHistory();
        return;
      }
      const clearChip = e.target.closest('[data-chip-clear]');
      if (clearChip) {
        const key = clearChip.dataset.chipClear;
        state.historyFilters[key] = DEFAULT_HIST[key];
        reloadHistory();
        return;
      }
      await onPick(e);
    };
    const histForm = document.getElementById('hist-filters');
    if (histForm) {
      histForm.onsubmit = (e) => e.preventDefault();
      histForm.onchange = () => {
        state.historyFilters = readHistForm(histForm);
        state.historyTeam = state.historyFilters.team;
        reloadHistory();
      };
    }
  }

  (async () => {
    let cfg = window.__CLERK_CONFIG__;
    if (!cfg) {
      try {
        cfg = await api('/api/auth/config');
      } catch {
        cfg = { configured: false };
      }
    }
    try {
      await setupClerk(cfg);
    } catch (err) {
      showAuthNotice(err.message || 'Auth not configured');
    }
    await load();
  })().catch(showPageError);
})();
