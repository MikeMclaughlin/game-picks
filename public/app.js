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
      socialButtonsBlockButton__apple: { display: 'none' },
      socialButtonsIconButton__apple: { display: 'none' },
      formButtonPrimary: { backgroundColor: '#FFB81C', color: '#111111' }
    }
  };

  const state = {
    page: 'week',
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
      from: 2016,
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
    historyGameSort: { key: 'gameDate', dir: 'desc' },
    historyLoading: false,
    backtest: null,
    backtestError: null,
    backtestLoading: false,
    backtestMore: false,
    backtestFilters: {
      team: 'ALL',
      from: 2016,
      to: 2026,
      site: 'all',
      weather: 'all',
      travel: 'all',
      distance: 'all',
      roof: 'all',
      role: 'all',
      division: 'all',
      daysOff: 'all',
      spread: 'all',
      total: 'all'
    },
    backtestChain: [],
    backtestSort: { key: 'gameDate', dir: 'desc' }
  };
  let clerk = null;
  let lastClerkUserId = undefined;
  const DEFAULT_HIST = {
    team: 'ALL',
    from: 2016,
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
  const DEFAULT_BT = {
    ...DEFAULT_HIST,
    spread: 'all',
    total: 'all'
  };
  const LS_WEEK = 'game-picks:week:v1';
  const LS_HISTORY = 'game-picks:history:v1';
  const LS_BACKTEST = 'game-picks:backtest:v1';
  const CHAIN_DIMS = [
    { dim: 'lastGame', label: 'Last game W/L', options: [{ value: 'W', label: 'Win' }, { value: 'L', label: 'Loss' }, { value: 'T', label: 'Tie' }] },
    { dim: 'last5wl', label: 'Last-5 W/L', options: [{ value: 'hot', label: 'Hot (4–5 W)' }, { value: 'mixed', label: 'Mixed (2–3 W)' }, { value: 'cold', label: 'Cold (0–1 W)' }] },
    { dim: 'last5ats', label: 'Last-5 ATS', options: [{ value: 'hot', label: 'Hot (4–5 C)' }, { value: 'mixed', label: 'Mixed (2–3 C)' }, { value: 'cold', label: 'Cold (0–1 C)' }] },
    { dim: 'rest', label: 'Rest', options: [{ value: 'short', label: 'Short ≤5' }, { value: 'normal', label: 'Normal' }, { value: 'bye', label: 'Bye+ ≥11' }] },
    { dim: 'site', label: 'Home/away', options: [{ value: 'home', label: 'Home' }, { value: 'road', label: 'Road' }] },
    { dim: 'division', label: 'Divisional', options: [{ value: 'divisional', label: 'Divisional' }, { value: 'non-div', label: 'Non-div' }] },
    { dim: 'role', label: 'Dog/fav', options: [{ value: 'favorite', label: 'Favorite' }, { value: 'underdog', label: 'Underdog' }] },
    { dim: 'spread', label: 'Spread size', options: [{ value: 'pick', label: 'Pick’em' }, { value: 'small', label: 'Small ≤3' }, { value: 'medium', label: 'Medium ≤6.5' }, { value: 'large', label: 'Large 7+' }] },
    { dim: 'total', label: 'Total', options: [{ value: 'low', label: 'Low <42' }, { value: 'mid', label: 'Mid 42–47.5' }, { value: 'high', label: 'High ≥48' }] },
    { dim: 'weather', label: 'Weather', options: [{ value: 'cold', label: 'Cold' }, { value: 'windy', label: 'Windy' }, { value: 'fair', label: 'Fair' }, { value: 'dome', label: 'Dome' }] },
    { dim: 'roof', label: 'Roof', options: [{ value: 'dome', label: 'Dome' }, { value: 'outdoor', label: 'Outdoor' }, { value: 'retractable', label: 'Retractable' }] },
    { dim: 'travel', label: 'Travel', options: [{ value: 'east', label: 'East' }, { value: 'west', label: 'West' }] },
    { dim: 'distance', label: 'Distance', options: [{ value: 'local', label: 'Local' }, { value: 'cross', label: 'Cross-country' }] }
  ];
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
  const BT_CHIP_META = [
    ...HIST_CHIP_META,
    { key: 'spread', label: 'Spread', names: { pick: 'Pick’em', small: 'Small', medium: 'Medium', large: 'Large' } },
    { key: 'total', label: 'Total', names: { low: 'Low', mid: 'Mid', high: 'High' } }
  ];
  const SECONDARY_BT = new Set(['distance', 'roof', 'role', 'division', 'daysOff', 'spread', 'total']);
  let loadGen = 0;

  function readStore(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fallback;
      return parsed;
    } catch {
      return fallback;
    }
  }
  function writeStore(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch { /* quota / private mode */ }
  }
  function persistWeek() {
    writeStore(LS_WEEK, { filters: state.filters });
  }
  function persistHistory() {
    writeStore(LS_HISTORY, { filters: state.historyFilters, more: state.historyMore });
  }
  function persistBacktest() {
    writeStore(LS_BACKTEST, {
      filters: state.backtestFilters,
      chain: state.backtestChain,
      more: state.backtestMore
    });
  }
  function restoreCriteria() {
    const week = readStore(LS_WEEK, null);
    if (week && week.filters) {
      state.filters = {
        homeDog: Boolean(week.filters.homeDog),
        projOver: Boolean(week.filters.projOver),
        projUnder: Boolean(week.filters.projUnder)
      };
      if (state.filters.projOver && state.filters.projUnder) state.filters.projUnder = false;
    }
    const hist = readStore(LS_HISTORY, null);
    if (hist && hist.filters) {
      state.historyFilters = { ...DEFAULT_HIST, ...hist.filters };
      state.historyTeam = state.historyFilters.team;
      if (hist.more != null) state.historyMore = Boolean(hist.more);
    }
    const bt = readStore(LS_BACKTEST, null);
    if (bt && bt.filters) state.backtestFilters = { ...DEFAULT_BT, ...bt.filters };
    if (bt && Array.isArray(bt.chain)) {
      state.backtestChain = bt.chain
        .filter((s) => s && s.dim)
        .map((s) => ({ dim: String(s.dim), value: s.value == null || s.value === '' ? 'all' : String(s.value) }));
    }
    if (bt && bt.more != null) state.backtestMore = Boolean(bt.more);
  }
  restoreCriteria();

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function fmtPct(v) {
    if (v == null) return '—';
    return `${Math.round(v * 100)}%`;
  }
  function fmtNum(v) {
    if (v == null || Number.isNaN(Number(v))) return '—';
    const n = Number(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }
  function fmtInt(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-US');
  }
  function spreadLabel(game) {
    if (game.spread_line == null) return '—';
    if (Number(game.spread_line) === 0) return 'PICK';
    const abs = fmtNum(Math.abs(game.spread_line));
    const fav = game.spread_line >= 0 ? game.home_team : game.away_team;
    return `${fav} -${abs}`;
  }
  // Positive spread_line means home favored (same convention as the payload / grader).
  function formatAtsLine(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return null;
    const rounded = Math.round(num * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }
  function atsPickLabel(game, team) {
    if (game.spread_line == null) return team;
    const spread = Number(game.spread_line);
    if (!Number.isFinite(spread)) return team;
    const line = team === game.home_team ? -spread : spread;
    const shown = formatAtsLine(line);
    if (shown == null) return team;
    const signed = line > 0 ? `+${shown}` : shown;
    return `${team} ${signed}`;
  }
  function outrightPickLabel(team) {
    return `${team} win`;
  }
  function ouPickLabel(game, side) {
    const word = side === 'over' ? 'Over' : 'Under';
    const total = fmtNum(game.total_line);
    return total === '—' ? word : `${word} ${total}`;
  }
  function kickoffSlotClass(game) {
    if (game && game.kickoffSlot) return game.kickoffSlot;
    const iso = typeof game === 'string' ? game : game && game.kickoff;
    const d = new Date(iso);
    let wd = typeof game === 'object' && game && game.weekday
      ? String(game.weekday).slice(0, 3).toUpperCase()
      : '';
    let minutes = null;
    if (Number.isFinite(d.getTime())) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }).formatToParts(d);
      const get = (type) => {
        const row = parts.find((p) => p.type === type);
        return row ? row.value : '';
      };
      if (!wd) wd = String(get('weekday')).slice(0, 3).toUpperCase();
      const hour = Number(get('hour'));
      const minute = Number(get('minute'));
      if (Number.isFinite(hour)) minutes = hour * 60 + (Number.isFinite(minute) ? minute : 0);
    }
    if (wd === 'WED') return 'slot-wed';
    if (wd === 'THU') return 'slot-thu';
    if (wd === 'SAT' || wd === 'FRI') return 'slot-sat';
    if (wd === 'MON' || wd === 'TUE') return 'slot-mon';
    if (minutes != null && minutes >= 19 * 60) return 'slot-sun-n';
    if (minutes != null && minutes >= 15 * 60) return 'slot-sun-4';
    return 'slot-sun-1';
  }
  function kickoffLabel(game) {
    const iso = typeof game === 'string' ? game : game && game.kickoff;
    const weekday = typeof game === 'object' && game && game.weekday;
    const d = new Date(iso);
    const wd = weekday
      ? String(weekday).slice(0, 3).toUpperCase()
      : (Number.isFinite(d.getTime())
        ? d.toLocaleString('en-US', { weekday: 'short', timeZone: 'America/New_York' }).slice(0, 3).toUpperCase()
        : '');
    const time = Number.isFinite(d.getTime())
      ? d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
      : '';
    return [wd, time].filter(Boolean).join(' ');
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

  function backtestQuery(filters, chain) {
    const f = filters || state.backtestFilters;
    const p = new URLSearchParams(historyQuery(f));
    if (f.spread && f.spread !== 'all') p.set('spread', f.spread);
    if (f.total && f.total !== 'all') p.set('total', f.total);
    const steps = (chain || state.backtestChain || []).filter((s) => s && s.dim && s.value && s.value !== 'all');
    if (steps.length) p.set('chain', steps.map((s) => `${s.dim}:${s.value}`).join(','));
    return p.toString();
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
    const years = [];
    for (let y = 2016; y <= 2026; y += 1) years.push(y);
    return years;
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
    } else if (state.page === 'backtest') {
      state.backtest = null;
      state.backtestError = null;
      state.backtestLoading = true;
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
      if (state.page === 'backtest' && !state.backtest) {
        state.backtestLoading = true;
        const backtest = await api(`/api/backtest?${backtestQuery()}`);
        if (gen !== loadGen) return;
        state.backtest = backtest;
        state.backtestError = null;
        state.backtestLoading = false;
        if (backtest && backtest.seasons && backtest.seasons.length) {
          const maxY = backtest.seasons[backtest.seasons.length - 1];
          if (state.backtestFilters.to === DEFAULT_BT.to && maxY !== DEFAULT_BT.to) {
            state.backtestFilters.to = maxY;
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
      if (state.page === 'backtest') {
        state.backtestError = (err && err.message) || 'Failed to load backtest';
        state.backtestLoading = false;
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

  function lastGameLabel(side) {
    if (side.lastGame && side.lastGame.label) return side.lastGame.label;
    if (side.lastGame && side.lastGame.result) {
      if (side.lastGame.result !== 'Tie' && side.lastGame.margin != null) {
        const signed = side.lastGame.result === 'Win' ? `+${side.lastGame.margin}` : `-${side.lastGame.margin}`;
        return side.lastGame.result === 'Win' ? `WIN ${signed}` : `Loss ${signed}`;
      }
      return side.lastGame.result;
    }
    if (side.last === 'W') return 'WIN';
    if (side.last === 'L') return 'Loss';
    if (side.last === 'T') return 'Tie';
    return null;
  }

  function exclusivePartner(market) {
    if (market === 'outright') return 'ats';
    if (market === 'ats') return 'outright';
    return null;
  }

  function signedSpreadPts(game, team) {
    if (game.spread_line == null) return null;
    const spread = Number(game.spread_line);
    if (!Number.isFinite(spread)) return null;
    const line = team === game.home_team ? -spread : spread;
    const shown = formatAtsLine(line);
    if (shown == null) return null;
    return line > 0 ? `+${shown}` : shown;
  }

  function restCell(side) {
    if (!side) return { html: '', cls: 'muted' };
    const rest = side.rest;
    const showRest = side.showRest === true || (side.showRest !== false && rest != null && Number(rest) !== 7);
    if (rest == null || !showRest) return { html: '', cls: 'muted' };
    const shortBit = side.short ? ' Short' : '';
    return { html: esc(`${rest}${shortBit}`), cls: side.short ? 'alert' : 'muted' };
  }

  function statCell(text, cls) {
    if (text == null || text === '') return { html: '', cls: cls || 'muted' };
    return { html: esc(text), cls: cls || '' };
  }

  function statRow(label, away, home) {
    if ((!away || !away.html) && (!home || !home.html)) return '';
    const aCls = `side-stat ${away && away.cls ? away.cls : 'muted'}`;
    const hCls = `side-stat home ${home && home.cls ? home.cls : 'muted'}`;
    return `<div class="stat-row">
      <div class="${aCls}">${away && away.html ? away.html : ''}</div>
      <div class="stat-lab">${esc(label)}</div>
      <div class="${hCls}">${home && home.html ? home.html : ''}</div>
    </div>`;
  }

  function showRestAmountWinPct(side) {
    if (!side || side.rest == null) return false;
    if (side.showRestWinPct === false) return false;
    const n = Number(side.rest);
    if (n === 7 || n === 8) return false;
    return side.restWinPct != null;
  }

  function cardStatRows(game) {
    const away = game.away || {};
    const home = game.home || {};
    const lastA = lastGameLabel(away);
    const lastH = lastGameLabel(home);
    const restA = restCell(away);
    const restH = restCell(home);
    const rows = [];
    rows.push(statRow('Last Game', statCell(lastA), statCell(lastH)));
    rows.push(statRow('Rest Days', restA, restH));
    if ((away.short && away.shortRestWinPct != null) || (home.short && home.shortRestWinPct != null)) {
      rows.push(statRow(
        'Win % Short Rest',
        statCell(away.short && away.shortRestWinPct != null ? fmtPct(away.shortRestWinPct) : '', away.short ? 'alert' : 'muted'),
        statCell(home.short && home.shortRestWinPct != null ? fmtPct(home.shortRestWinPct) : '', home.short ? 'alert' : 'muted')
      ));
    }
    if (showRestAmountWinPct(away) || showRestAmountWinPct(home)) {
      rows.push(statRow(
        'Win % Rest',
        statCell(showRestAmountWinPct(away) ? fmtPct(away.restWinPct) : '', 'muted'),
        statCell(showRestAmountWinPct(home) ? fmtPct(home.restWinPct) : '', 'muted')
      ));
    }
    rows.push(statRow(
      'Win %',
      statCell(away.awayWinPct != null ? `away ${fmtPct(away.awayWinPct)}` : '', 'muted'),
      statCell(home.homeWinPct != null ? `home ${fmtPct(home.homeWinPct)}` : '', 'muted')
    ));
    rows.push(statRow(
      'Spread Pts',
      statCell(signedSpreadPts(game, game.away_team)),
      statCell(signedSpreadPts(game, game.home_team))
    ));
    const total = fmtNum(game.total_line);
    rows.push(statRow(
      'Over/Under',
      statCell(total === '—' ? '' : total, 'muted'),
      statCell(total === '—' ? '' : total, 'muted')
    ));
    const xAway = fmtNum(xPtsValue(game, 'away'));
    const xHome = fmtNum(xPtsValue(game, 'home'));
    rows.push(statRow(
      'Expected Points',
      statCell(xAway === '—' ? '' : xAway),
      statCell(xHome === '—' ? '' : xHome)
    ));
    rows.push(statRow(
      'Last 5 games',
      statCell(away.lastFive, 'muted'),
      statCell(home.lastFive, 'muted')
    ));
    rows.push(statRow(
      'Last 5 ATS',
      statCell(away.lastFiveAts, 'muted'),
      statCell(home.lastFiveAts, 'muted')
    ));
    return `<div class="stat-rows">${rows.join('')}</div>`;
  }

  function pickRow(game, market, left, right, leftText, rightText) {
    const labels = { outright: 'OUTRIGHT', ats: 'ATS', ou: 'OU' };
    const current = wagerFor(game, market);
    const locked = game.locked;
    const partner = exclusivePartner(market);
    const partnerWager = partner ? wagerFor(game, partner) : null;
    const blocked = Boolean(partnerWager && partnerWager.selection);
    const disabled = locked || (blocked && !current);
    const on = (val) => current && String(current.selection).toUpperCase() === String(val).toUpperCase();
    const leftLabel = leftText == null ? left : leftText;
    const rightLabel = rightText == null ? right : rightText;
    const reason = locked
      ? 'Locked at kickoff'
      : (blocked && !current
        ? `Clear ${String(partner).toUpperCase()} to pick ${String(market).toUpperCase()}`
        : null);
    return `<div class="pick${blocked && !current ? ' exclusive-off' : ''}">
      <label>${labels[market] || market}</label>
      <button type="button" data-gid="${esc(game.game_id)}" data-market="${market}" data-sel="${esc(left)}" class="${on(left) ? 'on' : ''}" ${disabled ? 'disabled' : ''} title="${esc(reason || `Pick ${leftLabel} ${market}`)}">${esc(leftLabel)}</button>
      <button type="button" data-gid="${esc(game.game_id)}" data-market="${market}" data-sel="${esc(right)}" class="${on(right) ? 'on' : ''}" ${disabled ? 'disabled' : ''} title="${esc(reason || `Pick ${rightLabel} ${market}`)}">${esc(rightLabel)}</button>
    </div>`;
  }

  function xPtsValue(game, side) {
    if (game.xPts && game.xPts[side] != null) return game.xPts[side];
    return game.implied && game.implied[side];
  }

  function card(game) {
    const pick = game.aiPick || {};
    const aiRaw = pick.expected
      || (pick.label ? pick.label.replace(/^AI Pick:\s*/i, '').trim() : '');
    const conf = pick.confidence != null && Number.isFinite(Number(pick.confidence))
      ? `<span class="ai-conf" title="Rule-based confidence 51–92 from ATS/OU projection edges and prior sample size — not a model probability.">${esc(String(Math.round(Number(pick.confidence))))}%</span>`
      : '';
    const awayCity = (game.away && game.away.city) || game.away_team;
    const homeCity = (game.home && game.home.city) || game.home_team;
    const slot = kickoffSlotClass(game);
    return `<article class="card matchup${game.locked ? ' locked' : ''}${slot ? ` ${esc(slot)}` : ''}">
      <div class="card-head">
        <span class="kick">${esc(kickoffLabel(game))}</span>
        <span class="status${game.locked ? ' lock' : ''}">${game.locked ? 'LOCKED' : 'OPEN'}</span>
      </div>
      <div class="sides">
        <div class="team">
          <div class="city">${esc(awayCity)}</div>
          <div class="role">AWAY</div>
        </div>
        <div class="vs">@</div>
        <div class="team home">
          <div class="city">${esc(homeCity)}</div>
          <div class="role">HOME</div>
        </div>
      </div>
      ${cardStatRows(game)}
      <div class="card-foot">
        ${aiRaw ? `<div class="ai"><span>AI Pick:</span> ${esc(aiRaw)}${conf}</div>` : ''}
        <div class="picks">
          ${pickRow(game, 'outright', game.away_team, game.home_team, outrightPickLabel(game.away_team), outrightPickLabel(game.home_team))}
          ${pickRow(game, 'ats', game.away_team, game.home_team, atsPickLabel(game, game.away_team), atsPickLabel(game, game.home_team))}
          ${pickRow(game, 'ou', 'over', 'under', ouPickLabel(game, 'over'), ouPickLabel(game, 'under'))}
        </div>
      </div>
    </article>`;
  }

  function myWeekStrip(games) {
    const me = state.bootstrap && state.bootstrap.user && state.bootstrap.user.username;
    const rows = (state.standings && state.standings.standings) || (state.bootstrap && state.bootstrap.standings) || [];
    const row = me ? rows.find((r) => r.username === me) : null;
    const locks = (games || []).filter((g) => !g.locked && (g.wagers || []).length).length;
    return {
      season: row ? row.season_points : 0,
      week: row ? row.weekly_points : 0,
      locks
    };
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

  function abbrevKey() {
    return `<p class="abbrev-key">
      <span><b>W-L</b> win–loss</span>
      <span><b>C-F</b> cover–fail (ATS)</span>
      <span><b>xPts</b> expected points</span>
      <span><b>ATS</b> against the spread</span>
      <span><b>OU</b> over/under</span>
    </p>`;
  }

  function weekView() {
    const w = state.week || state.bootstrap;
    const games = (w.games || []).filter(passFilters);
    const strip = myWeekStrip(w.games || []);
    return `<section class="week-page">
      <div class="week-hero">
        <div class="week-pill">WEEK ${esc(w.week)}</div>
      </div>
      <div class="week-stats">
        <div>Season pts <strong class="gold">${fmtInt(strip.season)}</strong></div>
        <div>This week <strong>${fmtInt(strip.week)}</strong></div>
        <div>Locks at kickoff <strong>${fmtInt(strip.locks)}</strong></div>
      </div>
      ${abbrevKey()}
      <div class="filters">
        <button type="button" class="chip${state.filters.homeDog ? ' on' : ''}" data-filter="homeDog" title="Show home underdogs only">Home underdogs</button>
        <button type="button" class="chip${state.filters.projOver ? ' on' : ''}" data-filter="projOver" title="Show games projected over the total">Projected over</button>
        <button type="button" class="chip${state.filters.projUnder ? ' on' : ''}" data-filter="projUnder" title="Show games projected under the total">Projected under</button>
      </div>
      <div class="cards week-cards" id="week-cards">${games.map(card).join('') || '<p>No games match those filters.</p>'}</div>
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

  function historyGameSortValue(row, key) {
    if (key === 'gameDate') return row.gameDate || row.kickoff || '';
    if (key === 'opponent') return row.opponent || '';
    if (key === 'spread') return row.spread == null ? Number.NEGATIVE_INFINITY : Number(row.spread);
    if (key === 'restDays') return row.restDays == null ? Number.NEGATIVE_INFINITY : Number(row.restDays);
    if (key === 'weather') return row.weatherLabel || row.weather || '';
    if (key === 'distance') return row.distanceZones == null ? Number.NEGATIVE_INFINITY : Number(row.distanceZones);
    if (key === 'cover') return row.cover || '';
    if (key === 'roof') return row.roofLabel || row.roof || '';
    if (key === 'divisional') return row.divisional ? 1 : 0;
    return row[key] == null ? '' : row[key];
  }

  function sortedHistoryGameRows(rows) {
    const { key, dir } = state.historyGameSort;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = historyGameSortValue(a, key);
      const bv = historyGameSortValue(b, key);
      let cmp = 0;
      if (typeof av === 'string' || typeof bv === 'string') cmp = String(av).localeCompare(String(bv));
      else cmp = av - bv;
      if (cmp === 0) cmp = String(a.game_id || '').localeCompare(String(b.game_id || ''));
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

  function historyGamesTable(rows) {
    const cols = [
      { key: 'gameDate', label: 'Game Date', title: 'Kickoff calendar date' },
      { key: 'opponent', label: 'Opponent', title: 'Opponent or AWAY @ HOME matchup' },
      { key: 'spread', label: 'Spread', title: 'Spread line (team-relative when a team is selected)' },
      { key: 'restDays', label: 'Rest Days', title: 'Days of rest' },
      { key: 'weather', label: 'Weather', title: 'Weather / roof conditions' },
      { key: 'distance', label: 'Distance traveled', title: 'Timezone distance traveled' },
      { key: 'cover', label: 'Cover/Fail', title: 'Spread cover (C), fail (F), or push (P)' },
      { key: 'roof', label: 'Roof', title: 'Dome, outdoor, or retractable' },
      { key: 'divisional', label: 'Divisional', title: 'Same-division opponent (Y/N)' }
    ];
    const sorted = sortedHistoryGameRows(rows);
    const { key, dir } = state.historyGameSort;
    return `<div class="hist-table-wrap"><table class="hist-table hist-games">
      <thead><tr>${cols.map((c) => {
        const on = key === c.key;
        const caret = on ? `<span class="caret">${dir === 'asc' ? '▲' : '▼'}</span>` : '';
        return `<th data-hist-game-sort="${c.key}" title="${c.title}" class="${on ? 'sorted' : ''}">${c.label}${caret}</th>`;
      }).join('')}</tr></thead>
      <tbody>${sorted.map((r) => `<tr>
        <td>${esc(r.gameDate || '')}</td>
        <td>${esc(r.opponent || '')}</td>
        <td>${esc(r.spreadLabel || '—')}</td>
        <td>${esc(r.restDaysLabel || '—')}</td>
        <td>${esc(r.weatherLabel || '—')}</td>
        <td>${esc(r.distanceLabel || '—')}</td>
        <td>${esc(r.coverLabel || '—')}</td>
        <td>${esc(r.roofLabel || '—')}</td>
        <td>${esc(r.divisionalLabel || (r.divisional ? 'Y' : 'N'))}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  function activeBtChips() {
    return BT_CHIP_META.filter((meta) => {
      const v = state.backtestFilters[meta.key];
      return String(v) !== String(DEFAULT_BT[meta.key]);
    }).map((meta) => {
      const raw = state.backtestFilters[meta.key];
      const shown = meta.names && meta.names[raw] ? meta.names[raw] : raw;
      return { key: meta.key, text: `${meta.label}: ${shown}` };
    });
  }

  function chainDimOptions(selected) {
    return optList([{ value: '', label: 'Dimension' }, ...CHAIN_DIMS.map((d) => ({ value: d.dim, label: d.label }))], selected);
  }

  function chainValueOptions(dim, selected) {
    const meta = CHAIN_DIMS.find((d) => d.dim === dim);
    const opts = [{ value: 'all', label: 'Any' }, ...((meta && meta.options) || [])];
    return optList(opts, selected || 'all');
  }

  function backtestFiltersForm() {
    const f = state.backtestFilters;
    const teams = ['ALL', ...(state.bootstrap?.teams || [])];
    const years = (state.backtest && state.backtest.seasons) || yearsForHistory();
    const moreOpen = state.backtestMore || activeBtChips().some((c) => SECONDARY_BT.has(c.key));
    const chips = activeBtChips();
    return `<form id="bt-filters" class="hist-bar">
      <div class="hist-row">
        <label>Team <select name="team" title="Team-relative slice">${optList(teams, f.team)}</select></label>
        <label>From year <select name="from">${optList(years, f.from)}</select></label>
        <label>To year <select name="to">${optList(years, f.to)}</select></label>
        <label>Site <select name="site">${optList([{ value: 'all', label: 'All' }, { value: 'home', label: 'Home' }, { value: 'road', label: 'Road' }], f.site)}</select></label>
        <label>Weather <select name="weather">${optList([{ value: 'all', label: 'All' }, { value: 'cold', label: 'Cold' }, { value: 'windy', label: 'Windy' }, { value: 'fair', label: 'Fair' }], f.weather)}</select></label>
        <label>Travel <select name="travel">${optList([{ value: 'all', label: 'All' }, { value: 'east', label: 'East' }, { value: 'west', label: 'West' }], f.travel)}</select></label>
        <div class="hist-actions">
          <button type="button" class="btn-more" data-bt-more aria-expanded="${moreOpen ? 'true' : 'false'}">${moreOpen ? 'Fewer filters' : 'More filters'}</button>
          <button type="button" class="btn-reset" data-bt-reset>Reset</button>
        </div>
      </div>
      <div class="hist-row" id="bt-more" ${moreOpen ? '' : 'hidden'}>
        <label>Distance <select name="distance">${optList([{ value: 'all', label: 'All' }, { value: 'local', label: 'Local' }, { value: 'cross', label: 'Cross-country' }], f.distance)}</select></label>
        <label>Roof <select name="roof">${optList([{ value: 'all', label: 'All' }, { value: 'dome', label: 'Dome' }, { value: 'outdoor', label: 'Outdoor' }, { value: 'retractable', label: 'Retractable' }], f.roof)}</select></label>
        <label>Role <select name="role">${optList([{ value: 'all', label: 'All' }, { value: 'favorite', label: 'Favorite' }, { value: 'underdog', label: 'Underdog' }], f.role)}</select></label>
        <label>Division <select name="division">${optList([{ value: 'all', label: 'All' }, { value: 'divisional', label: 'Divisional' }, { value: 'non-div', label: 'Non-div' }], f.division)}</select></label>
        <label>Days off <select name="daysOff">${optList([{ value: 'all', label: 'All' }, { value: 'short', label: 'Short rest' }, { value: 'normal', label: 'Normal' }, { value: 'bye', label: 'Bye+' }], f.daysOff)}</select></label>
        <label>Spread size <select name="spread" title="|spread_line| buckets">${optList([{ value: 'all', label: 'All' }, { value: 'pick', label: 'Pick’em' }, { value: 'small', label: 'Small ≤3' }, { value: 'medium', label: 'Medium ≤6.5' }, { value: 'large', label: 'Large 7+' }], f.spread)}</select></label>
        <label>Total <select name="total" title="Closing total buckets">${optList([{ value: 'all', label: 'All' }, { value: 'low', label: 'Low <42' }, { value: 'mid', label: 'Mid 42–47.5' }, { value: 'high', label: 'High ≥48' }], f.total)}</select></label>
      </div>
      ${chips.length ? `<div class="hist-chips">${chips.map((c) => `<button type="button" class="filter-chip" data-bt-chip-clear="${c.key}">${c.text} ×</button>`).join('')}</div>` : ''}
    </form>`;
  }

  function chainBuilder() {
    const steps = state.backtestChain.length ? state.backtestChain : [{ dim: '', value: 'all' }];
    return `<div class="bt-chain">
      <h2>Sequence / Markov builder</h2>
      <p class="bt-note">Ordered pre-game states. The next-game distribution is the slice that matches every step. Last-5 hot = 4–5 wins/covers; cold = 0–1. Filters above apply first.</p>
      ${steps.map((step, i) => `<div class="bt-step">
        ${i ? '<span class="bt-arrow">→</span>' : ''}
        <select data-chain-dim="${i}">${chainDimOptions(step.dim)}</select>
        <select data-chain-val="${i}">${chainValueOptions(step.dim, step.value)}</select>
        <button type="button" class="btn-del" data-chain-del="${i}" title="Remove step">×</button>
      </div>`).join('')}
      <div class="hist-actions">
        <button type="button" class="btn-add" data-chain-add>+ Add state</button>
      </div>
    </div>`;
  }

  function fmtLift(v, rel) {
    if (v == null) return '—';
    const pts = v * 100;
    const sign = pts > 0 ? '+' : '';
    const relBit = rel == null ? '' : ` (${rel >= 0 ? '+' : ''}${(rel * 100).toFixed(1)}% rel)`;
    return `${sign}${pts.toFixed(1)} pts${relBit}`;
  }

  function liftClass(v) {
    if (v == null) return '';
    return v >= 0 ? 'lift-pos' : 'lift-neg';
  }

  function recPct(r) {
    if (!r) return { label: '0-0', pct: '—' };
    return { label: r.label || '0-0', pct: fmtPct(r.pct) };
  }

  function backtestSummary(data) {
    const slice = data.slice || {};
    const small = data.smallN;
    const n = data.n || 0;
    const su = recPct(slice.outright);
    const ats = recPct(slice.ats);
    const ou = recPct(slice.ou);
    const warn = small
      ? `<p class="bt-warn">N &lt; ${esc(data.smallNThreshold || 30)} — greyed rates are too small to trust. Treat them as noisy.</p>`
      : '';
    return `${warn}<div class="bt-stats${small ? ' small-n' : ''}">
      <div class="bt-stat"><div class="k">Sample N</div><div class="v">${fmtInt(n)}</div><div class="s">${fmtInt(data.uniqueGames)} unique games</div></div>
      <div class="bt-stat"><div class="k">Outright W-L-T</div><div class="v">${esc(su.pct)}</div><div class="s">${esc(su.label)}</div></div>
      <div class="bt-stat"><div class="k">ATS cover</div><div class="v">${esc(ats.pct)}</div><div class="s">${esc(ats.label)} (C-F-P)</div></div>
      <div class="bt-stat"><div class="k">Over hit</div><div class="v">${esc(ou.pct)}</div><div class="s">${esc(ou.label)} (O-U-P)</div></div>
    </div>`;
  }

  function compareRow(label, block) {
    const slice = recPct(block && block.slice);
    const base = recPct(block && block.baseline);
    const lift = fmtLift(block && block.liftPts, block && block.liftRel);
    return `<tr>
      <td>${esc(label)}</td>
      <td>${esc(slice.pct)} <span class="muted">${esc(slice.label)}</span></td>
      <td>${esc(base.pct)} <span class="muted">${esc(base.label)}</span></td>
      <td class="${liftClass(block && block.liftPts)}">${esc(lift)}</td>
    </tr>`;
  }

  function backtestCompare(data) {
    const league = data.vsLeague || {};
    const peer = data.vsPeer || {};
    const team = data.filters && data.filters.team && data.filters.team !== 'ALL';
    return `<div class="hist-block">
      <h2>Baseline vs slice</h2>
      <p class="bt-note">League baseline = all scored games in the year range (home perspective when no team is selected). Lift is slice minus baseline in percentage points.</p>
      <div class="hist-table-wrap"><table class="hist-table">
        <thead><tr><th>Market</th><th>Slice</th><th>League</th><th>Lift vs league</th></tr></thead>
        <tbody>
          ${compareRow('Outright', league.outright)}
          ${compareRow('ATS cover', league.ats)}
          ${compareRow('Over', league.ou)}
        </tbody>
      </table></div>
      ${team ? `<div class="hist-table-wrap" style="margin-top:10px"><table class="hist-table">
        <thead><tr><th>Market</th><th>Slice</th><th>Team unfiltered</th><th>Lift vs team</th></tr></thead>
        <tbody>
          ${compareRow('Outright', peer.outright)}
          ${compareRow('ATS cover', peer.ats)}
          ${compareRow('Over', peer.ou)}
        </tbody>
      </table></div>` : ''}
    </div>`;
  }

  function backtestExpected(data) {
    const exp = data.expected || {};
    const ats = recPct(exp.ats);
    const ou = recPct(exp.ou);
    const joint = recPct(exp.joint);
    return `<div class="hist-block">
      <h2>Expected call accuracy</h2>
      <p class="bt-note">Same AI Pick logic as Current Week, written as <b>BUF -5.5 and Over</b>. Confidence is the transparent edge/sample rule (51–92). ATS and OU are graded separately; joint requires both correct (a push on either side is a push).</p>
      <div class="bt-stats">
        <div class="bt-stat"><div class="k">Avg confidence</div><div class="v">${exp.confidenceAvg != null ? `${esc(exp.confidenceAvg)}%` : '—'}</div></div>
        <div class="bt-stat"><div class="k">ATS hit</div><div class="v">${esc(ats.pct)}</div><div class="s">${esc(ats.label)}</div></div>
        <div class="bt-stat"><div class="k">OU hit</div><div class="v">${esc(ou.pct)}</div><div class="s">${esc(ou.label)}</div></div>
        <div class="bt-stat"><div class="k">Joint ATS+OU</div><div class="v">${esc(joint.pct)}</div><div class="s">${esc(joint.label)}</div></div>
      </div>
    </div>`;
  }

  function backtestPath(data) {
    const path = data.path || [];
    if (!path.length) return '';
    return `<div class="hist-block">
      <h2>Chain sample path</h2>
      <div class="bt-path">${path.map((node) => `<div class="bt-node">
        <div>${esc(node.label || '')}</div>
        <div class="n">N ${fmtInt(node.n)}</div>
        <div>${fmtPct(node.stats && node.stats.ats && node.stats.ats.pct)} ATS</div>
      </div>`).join('')}</div>
    </div>`;
  }

  function sortedBacktestGames(rows) {
    const { key, dir } = state.backtestSort;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[key] == null ? '' : a[key];
      const bv = b[key] == null ? '' : b[key];
      let cmp = 0;
      if (typeof av === 'number' || typeof bv === 'number') cmp = Number(av) - Number(bv);
      else cmp = String(av).localeCompare(String(bv));
      if (cmp === 0) cmp = String(a.game_id || '').localeCompare(String(b.game_id || ''));
      return dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }

  function hitCell(v) {
    if (!v) return '—';
    return `<span class="expected-hit ${esc(v)}">${esc(v)}</span>`;
  }

  function backtestGamesTable(rows) {
    const cols = [
      { key: 'gameDate', label: 'Date' },
      { key: 'opponent', label: 'Matchup' },
      { key: 'spreadLabel', label: 'Spread' },
      { key: 'total_line', label: 'Total' },
      { key: 'restDays', label: 'Rest' },
      { key: 'weatherLabel', label: 'Weather' },
      { key: 'coverLabel', label: 'Cover' },
      { key: 'ou', label: 'OU' },
      { key: 'expected', label: 'Expected' },
      { key: 'confidence', label: 'Conf %' },
      { key: 'expectedAtsHit', label: 'ATS hit' },
      { key: 'expectedOuHit', label: 'OU hit' },
      { key: 'expectedJoint', label: 'Joint' }
    ];
    const sorted = sortedBacktestGames(rows);
    const { key, dir } = state.backtestSort;
    return `<div class="hist-table-wrap"><table class="hist-table hist-games">
      <thead><tr>${cols.map((c) => {
        const on = key === c.key;
        const caret = on ? `<span class="caret">${dir === 'asc' ? '▲' : '▼'}</span>` : '';
        return `<th data-bt-sort="${c.key}" class="${on ? 'sorted' : ''}">${c.label}${caret}</th>`;
      }).join('')}</tr></thead>
      <tbody>${sorted.map((r) => `<tr>
        <td>${esc(r.gameDate || '')}</td>
        <td>${esc(r.opponent || `${r.away_team} @ ${r.home_team}`)}</td>
        <td>${esc(r.spreadLabel || '—')}</td>
        <td>${esc(r.total_line == null ? '—' : r.total_line)}</td>
        <td>${esc(r.restDays == null ? '—' : r.restDays)}</td>
        <td>${esc(r.weatherLabel || '—')}</td>
        <td>${esc(r.coverLabel || '—')}</td>
        <td>${esc(r.ou || '—')}</td>
        <td>${esc(r.expected || '—')}</td>
        <td>${r.confidence != null ? `${esc(r.confidence)}%` : '—'}</td>
        <td>${hitCell(r.expectedAtsHit)}</td>
        <td>${hitCell(r.expectedOuHit)}</td>
        <td>${hitCell(r.expectedJoint)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  function downloadBacktestCsv() {
    const rows = (state.backtest && state.backtest.games) || [];
    if (!rows.length) return;
    const headers = ['date','season','week','away','home','focus','spread','total','away_rest','home_rest','weather','roof','site','division','role','last_game','last5_wl','last5_ats','home_score','away_score','outright','cover','ou','expected','confidence','expected_ats_hit','expected_ou_hit','expected_joint'];
    const escCsv = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    for (const r of rows) {
      const rec = {
        date: r.gameDate, season: r.season, week: r.week, away: r.away_team, home: r.home_team,
        focus: r.team, spread: r.spreadLabel, total: r.total_line, away_rest: r.away_rest, home_rest: r.home_rest,
        weather: r.weatherLabel, roof: r.roofLabel, site: r.site, division: r.divisionalLabel, role: r.role,
        last_game: r.lastGame, last5_wl: r.last5wl, last5_ats: r.last5ats, home_score: r.home_score, away_score: r.away_score,
        outright: r.outright, cover: r.coverLabel, ou: r.ou, expected: r.expected, confidence: r.confidence,
        expected_ats_hit: r.expectedAtsHit, expected_ou_hit: r.expectedOuHit, expected_joint: r.expectedJoint
      };
      lines.push(headers.map((h) => escCsv(rec[h])).join(','));
    }
    const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'backtest.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function backtestView() {
    let body;
    if (state.backtestError) body = `<p class="notice">${esc(state.backtestError)}</p>`;
    else if (state.backtestLoading || !state.backtest) body = '<p class="hist-loading">Loading backtest…</p>';
    else {
      const data = state.backtest;
      const games = data.games || [];
      body = `${backtestSummary(data)}
        ${backtestPath(data)}
        ${backtestCompare(data)}
        ${backtestExpected(data)}
        <div class="hist-block">
          <h2>Matching games</h2>
          <p class="bt-note">Expected output uses Current Week AI Pick logic. Download includes date, teams, lines, rest, weather, results, and state fields.</p>
          <button type="button" class="btn-csv" data-bt-csv ${games.length ? '' : 'disabled'}>Download CSV</button>
          ${games.length ? backtestGamesTable(games) : '<p class="hist-empty">No games match these filters</p>'}
        </div>`;
    }
    return `<section>
      <h1>Backtest</h1>
      <p class="lede">Markov-style slices over stored games (2016+) · server-side aggregation</p>
      ${abbrevKey()}
      ${backtestFiltersForm()}
      ${chainBuilder()}
      ${body}
    </section>`;
  }

  function historyView() {
    let body;
    if (state.historyError) body = `<p class="notice">${state.historyError}</p>`;
    else if (state.historyLoading || !state.history) body = '<p class="hist-loading">Loading history…</p>';
    else {
      const rows = (state.history.rows || []).filter((r) => r && r.games > 0);
      const games = state.history.gameRows || [];
      const splits = rows.length
        ? `<div class="hist-block"><h2>Team splits</h2>${historyTable(rows)}</div>`
        : '';
      const gameLog = games.length
        ? `<div class="hist-block"><h2>Games</h2>${historyGamesTable(games)}</div>`
        : '';
      body = (splits || gameLog) ? `${splits}${gameLog}` : '<p class="hist-empty">No games match these filters</p>';
    }
    return `<section>
      <h1>History</h1>
      <p class="lede">Team performance splits · schedule seed (not your wager ledger)</p>
      ${abbrevKey()}
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
    persistHistory();
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

  function readBtForm(form) {
    const fd = new FormData(form);
    const next = { ...state.backtestFilters };
    for (const key of Object.keys(DEFAULT_BT)) {
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

  function reloadBacktest() {
    persistBacktest();
    state.backtest = null;
    state.backtestError = null;
    state.backtestLoading = true;
    render();
    load().catch((err) => {
      state.backtestError = (err && err.message) || 'Failed to load backtest';
      state.backtestLoading = false;
      render();
    });
  }

  function render() {
    if (!state.bootstrap) {
      app.innerHTML = '<p>Loading…</p>';
      return;
    }
    if (state.page === 'week') app.innerHTML = weekView();
    else if (state.page === 'standings') app.innerHTML = `<section class="panel"><h1>Standings</h1>${standingsTable((state.standings && state.standings.standings) || state.bootstrap.standings || [], true)}</section>`;
    else if (state.page === 'history') app.innerHTML = historyView();
    else if (state.page === 'backtest') app.innerHTML = backtestView();
    else app.innerHTML = weekView();

    app.onclick = async (e) => {
      const chip = e.target.closest('[data-filter]');
      if (chip) {
        const key = chip.dataset.filter;
        state.filters[key] = !state.filters[key];
        if (key === 'projOver' && state.filters.projOver) state.filters.projUnder = false;
        if (key === 'projUnder' && state.filters.projUnder) state.filters.projOver = false;
        persistWeek();
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
      const histGameSort = e.target.closest('th[data-hist-game-sort]');
      if (histGameSort && state.page === 'history') {
        const key = histGameSort.dataset.histGameSort;
        if (state.historyGameSort.key === key) state.historyGameSort.dir = state.historyGameSort.dir === 'asc' ? 'desc' : 'asc';
        else state.historyGameSort = { key, dir: key === 'gameDate' ? 'desc' : 'asc' };
        render();
        return;
      }
      if (e.target.closest('[data-hist-more]')) {
        state.historyMore = !state.historyMore;
        persistHistory();
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
      const btSort = e.target.closest('th[data-bt-sort]');
      if (btSort && state.page === 'backtest') {
        const key = btSort.dataset.btSort;
        if (state.backtestSort.key === key) state.backtestSort.dir = state.backtestSort.dir === 'asc' ? 'desc' : 'asc';
        else state.backtestSort = { key, dir: key === 'gameDate' ? 'desc' : 'asc' };
        render();
        return;
      }
      if (e.target.closest('[data-bt-more]')) {
        state.backtestMore = !state.backtestMore;
        persistBacktest();
        render();
        return;
      }
      if (e.target.closest('[data-bt-reset]')) {
        state.backtestFilters = { ...DEFAULT_BT };
        state.backtestChain = [];
        state.backtestMore = false;
        reloadBacktest();
        return;
      }
      const btClear = e.target.closest('[data-bt-chip-clear]');
      if (btClear) {
        const key = btClear.dataset.btChipClear;
        state.backtestFilters[key] = DEFAULT_BT[key];
        reloadBacktest();
        return;
      }
      if (e.target.closest('[data-chain-add]')) {
        const chain = state.backtestChain.length ? [...state.backtestChain] : [{ dim: '', value: 'all' }];
        chain.push({ dim: '', value: 'all' });
        state.backtestChain = chain;
        persistBacktest();
        render();
        return;
      }
      const chainDel = e.target.closest('[data-chain-del]');
      if (chainDel) {
        const i = Number(chainDel.dataset.chainDel);
        const chain = state.backtestChain.length ? [...state.backtestChain] : [{ dim: '', value: 'all' }];
        chain.splice(i, 1);
        state.backtestChain = chain;
        reloadBacktest();
        return;
      }
      if (e.target.closest('[data-bt-csv]')) {
        downloadBacktestCsv();
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
    const btForm = document.getElementById('bt-filters');
    if (btForm) {
      btForm.onsubmit = (e) => e.preventDefault();
      btForm.onchange = () => {
        state.backtestFilters = readBtForm(btForm);
        reloadBacktest();
      };
    }
    app.onchange = (e) => {
      const dimSel = e.target.closest('[data-chain-dim]');
      if (dimSel) {
        const i = Number(dimSel.dataset.chainDim);
        const chain = state.backtestChain.length ? [...state.backtestChain] : [{ dim: '', value: 'all' }];
        chain[i] = { dim: dimSel.value, value: 'all' };
        state.backtestChain = chain;
        persistBacktest();
        render();
        return;
      }
      const valSel = e.target.closest('[data-chain-val]');
      if (valSel) {
        const i = Number(valSel.dataset.chainVal);
        const chain = state.backtestChain.length ? [...state.backtestChain] : [{ dim: '', value: 'all' }];
        const dim = chain[i] && chain[i].dim ? chain[i].dim : '';
        chain[i] = { dim, value: valSel.value };
        state.backtestChain = chain;
        reloadBacktest();
      }
    };
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
