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
      formButtonPrimary: { backgroundColor: '#FFB81C', color: '#111111' },
      userButtonOuterIdentifier: { display: 'none' },
      userButtonTrigger: { padding: '0px' }
    }
  };

  const state = {
    page: 'week',
    bootstrap: null,
    week: null,
    standings: null,
    history: null,
    historyError: null,
    filters: { homeDog: false, projOver: false, projUnder: false, movedLines: false },
    selectedWeek: null,
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
      daysOff: 'all',
      spread: 'all',
      total: 'all',
      timeOfDay: 'all'
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
      total: 'all',
      timeOfDay: 'all',
      starterOut: 'all'
    },
    backtestChain: [],
    backtestSort: { key: 'gameDate', dir: 'desc' },
    performance: null,
    performanceError: null,
    performanceLoading: false,
    performanceSeason: null,
    performanceCriterion: 'ai-picks',
    performanceSort: { key: 'week', dir: 'asc' },
    shareGame: null,
    shareSeason: null,
    shareMissing: false,
    shareSolo: false
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
    daysOff: 'all',
    spread: 'all',
    total: 'all',
    timeOfDay: 'all'
  };
  const DEFAULT_BT = { ...DEFAULT_HIST, starterOut: 'all' };
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
    { dim: 'distance', label: 'Distance', options: [{ value: 'local', label: 'Local' }, { value: 'cross', label: 'Cross-country' }] },
    { dim: 'timeOfDay', label: 'Time of day', options: [{ value: 'morning', label: 'Morning' }, { value: 'early', label: 'Early' }, { value: 'afternoon', label: 'Afternoon' }, { value: 'primetime', label: 'Primetime' }] },
    { dim: 'starterOut', label: 'Starter out', options: [{ value: 'out', label: 'Out' }, { value: 'active', label: 'Active' }] }
  ];
  const FILTER_FIELDS = [
    { key: 'team', label: 'Team', title: 'Limit results to one team abbreviation. All includes every club.', row: 'primary', options: 'teams' },
    { key: 'from', label: 'From year', title: 'Inclusive first season in the sample', row: 'primary', options: 'years' },
    { key: 'to', label: 'To year', title: 'Inclusive last season in the sample', row: 'primary', options: 'years' },
    { key: 'site', label: 'Site', title: 'Home or road games for the selected team', row: 'primary', options: [{ value: 'all', label: 'All' }, { value: 'home', label: 'Home' }, { value: 'road', label: 'Road' }] },
    { key: 'weather', label: 'Weather', title: 'Cold is 40°F or below outdoors, windy is 15+ mph outdoors, fair is other outdoor games', row: 'primary', options: [{ value: 'all', label: 'All' }, { value: 'cold', label: 'Cold' }, { value: 'windy', label: 'Windy' }, { value: 'fair', label: 'Fair' }] },
    { key: 'travel', label: 'Travel', title: 'Road games crossing two or more time zones east or west', row: 'primary', options: [{ value: 'all', label: 'All' }, { value: 'east', label: 'East' }, { value: 'west', label: 'West' }] },
    { key: 'distance', label: 'Distance', title: 'Local is 0–1 time zones apart. Cross-country is 2 or more. Time zones, not mileage.', row: 'more', options: [{ value: 'all', label: 'All' }, { value: 'local', label: 'Local' }, { value: 'cross', label: 'Cross-country' }] },
    { key: 'roof', label: 'Roof', title: 'Dome, outdoor, or retractable roof (open or closed)', row: 'more', options: [{ value: 'all', label: 'All' }, { value: 'dome', label: 'Dome' }, { value: 'outdoor', label: 'Outdoor' }, { value: 'retractable', label: 'Retractable' }] },
    { key: 'role', label: 'Role', title: 'Favorite or underdog from the closing spread. Pick’em games are excluded.', row: 'more', options: [{ value: 'all', label: 'All' }, { value: 'favorite', label: 'Favorite' }, { value: 'underdog', label: 'Underdog' }] },
    { key: 'division', label: 'Division', title: 'Same-division opponents using the current NFL division map', row: 'more', options: [{ value: 'all', label: 'All' }, { value: 'divisional', label: 'Divisional' }, { value: 'non-div', label: 'Non-div' }] },
    { key: 'daysOff', label: 'Days off', title: 'Short rest is 5 days or fewer, bye+ is 11 or more, otherwise normal', row: 'more', options: [{ value: 'all', label: 'All' }, { value: 'short', label: 'Short rest' }, { value: 'normal', label: 'Normal' }, { value: 'bye', label: 'Bye+' }] },
    { key: 'spread', label: 'Spread size', title: 'Absolute closing spread: pick’em is 0, small is 3 or under, medium is 6.5 or under, large is 7 or more', row: 'more', options: [{ value: 'all', label: 'All' }, { value: 'pick', label: 'Pick’em' }, { value: 'small', label: 'Small ≤3' }, { value: 'medium', label: 'Medium ≤6.5' }, { value: 'large', label: 'Large 7+' }] },
    { key: 'total', label: 'Total', title: 'Closing total: low is under 42, mid is 42 through 47.5, high is 48 or more', row: 'more', options: [{ value: 'all', label: 'All' }, { value: 'low', label: 'Low <42' }, { value: 'mid', label: 'Mid 42–47.5' }, { value: 'high', label: 'High ≥48' }] },
    { key: 'timeOfDay', label: 'Time of Day', title: 'Kickoff in America/New_York. Morning is before 11:00, Early is 11:00 until 16:00, Afternoon is 16:00 until 19:00, Primetime is 19:00 or later.', row: 'more', options: [{ value: 'all', label: 'All' }, { value: 'morning', label: 'Morning' }, { value: 'early', label: 'Early' }, { value: 'afternoon', label: 'Afternoon' }, { value: 'primetime', label: 'Primetime' }] },
    { key: 'starterOut', label: 'Starter out', title: 'Official weekly injury report from nflverse. Out means a quarterback is listed Out for the focus team that week. Active means that season’s report is loaded and no QB is Out.', row: 'more', page: 'backtest', options: [{ value: 'all', label: 'All' }, { value: 'out', label: 'Out' }, { value: 'active', label: 'Active' }] }
  ];
  const CHIP_META = [
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
    { key: 'daysOff', label: 'Days off', names: { short: 'Short rest', normal: 'Normal', bye: 'Bye+' } },
    { key: 'spread', label: 'Spread', names: { pick: 'Pick’em', small: 'Small', medium: 'Medium', large: 'Large' } },
    { key: 'total', label: 'Total', names: { low: 'Low', mid: 'Mid', high: 'High' } },
    { key: 'timeOfDay', label: 'Time of Day', names: { morning: 'Morning', early: 'Early', afternoon: 'Afternoon', primetime: 'Primetime' } }
  ];
  const HIST_CHIP_META = CHIP_META;
  const BT_CHIP_META = CHIP_META.concat([
    { key: 'starterOut', label: 'Starter out', names: { out: 'Out', active: 'Active' } }
  ]);
  const SECONDARY = new Set(['distance', 'roof', 'role', 'division', 'daysOff', 'spread', 'total', 'timeOfDay', 'starterOut']);
  const SECONDARY_HIST = SECONDARY;
  const SECONDARY_BT = SECONDARY;
  let loadGen = 0;
  const LIVE_POLL_MS = 5 * 60 * 1000;
  let liveTimer = null;

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
    writeStore(LS_WEEK, { filters: state.filters, selectedWeek: state.selectedWeek });
    if (state.page === 'week') syncLocation('week');
  }
  function persistHistory() {
    writeStore(LS_HISTORY, { filters: state.historyFilters, more: state.historyMore });
    if (state.page === 'history') syncLocation('history');
  }
  function persistBacktest() {
    writeStore(LS_BACKTEST, {
      filters: state.backtestFilters,
      chain: state.backtestChain,
      more: state.backtestMore
    });
    if (state.page === 'backtest') syncLocation('backtest');
  }
  function restoreCriteria() {
    const week = readStore(LS_WEEK, null);
    if (week && week.filters) {
      state.filters = {
        homeDog: Boolean(week.filters.homeDog),
        projOver: Boolean(week.filters.projOver),
        projUnder: Boolean(week.filters.projUnder),
        movedLines: Boolean(week.filters.movedLines)
      };
      if (state.filters.projOver && state.filters.projUnder) state.filters.projUnder = false;
    }
    if (week && week.selectedWeek != null && week.selectedWeek !== '') {
      const n = Number(week.selectedWeek);
      if (Number.isFinite(n)) state.selectedWeek = n;
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
    applyHashState();
  }

  // Hash routes: #home / #week, #standings, #performance, #history, #backtest.
  // Pick Performance and shared games also use real paths: /performance and /game/:season/:week/:gameId.
  const PAGE_HASH = {
    week: 'home',
    standings: 'standings',
    history: 'history',
    backtest: 'backtest',
    performance: 'performance'
  };
  const HASH_PAGE = {
    home: 'week',
    week: 'week',
    standings: 'standings',
    history: 'history',
    backtest: 'backtest',
    performance: 'performance'
  };
  restoreCriteria();

  function pageFromHash(raw) {
    const h = String(raw == null ? location.hash : raw).replace(/^#/, '').split(/[/?]/)[0].toLowerCase().trim();
    return HASH_PAGE[h] || null;
  }

  function hashQuery(raw) {
    const h = String(raw == null ? location.hash : raw).replace(/^#/, '');
    const q = h.indexOf('?');
    if (q < 0) return new URLSearchParams();
    return new URLSearchParams(h.slice(q + 1));
  }

  function normalizeFilterValue(key, value) {
    if (value == null) return value;
    const v = String(value).trim();
    const maps = {
      site: { away: 'road' },
      distance: { 'cross-country': 'cross', cross_country: 'cross', crosscountry: 'cross' },
      roof: { outdoors: 'outdoor' },
      role: { fav: 'favorite', dog: 'underdog', ud: 'underdog' },
      division: { div: 'divisional', nondiv: 'non-div', non_div: 'non-div', 'non-divisional': 'non-div' },
      daysOff: { 'short-rest': 'short', short_rest: 'short', shortrest: 'short', 'bye+': 'bye', 'bye-plus': 'bye', bye_plus: 'bye' },
      spread: { pickem: 'pick', "pick'em": 'pick', 'pick-em': 'pick' },
      total: { medium: 'mid' },
      timeOfDay: { prime: 'primetime', 'prime-time': 'primetime' },
      weather: { wind: 'windy' },
      travel: {},
      starterOut: { out: 'out', active: 'active', in: 'active', clear: 'active', none: 'active', yes: 'out' }
    };
    const mapped = maps[key] && maps[key][v.toLowerCase()];
    return mapped || v;
  }

  function filtersFromQuery(q, defaults) {
    const next = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (!q.has(key)) continue;
      let v = normalizeFilterValue(key, q.get(key));
      if (key === 'from' || key === 'to') v = Number(v);
      next[key] = v;
    }
    if (Number(next.from) > Number(next.to)) {
      const swap = next.from;
      next.from = next.to;
      next.to = swap;
    }
    return next;
  }

  function queryHasFilter(q, defaults) {
    return Object.keys(defaults).some((key) => q.has(key));
  }

  function hashForPage(page) {
    const p = new URLSearchParams();
    if (page === 'week') {
      if (state.selectedWeek != null && state.bootstrap && Number(state.selectedWeek) !== Number(state.bootstrap.week)) {
        p.set('week', String(state.selectedWeek));
      } else if (state.selectedWeek != null && !state.bootstrap) {
        p.set('week', String(state.selectedWeek));
      }
      if (state.filters.movedLines) p.set('moved', '1');
      if (state.filters.homeDog) p.set('homeDog', '1');
      if (state.filters.projOver) p.set('over', '1');
      if (state.filters.projUnder) p.set('under', '1');
    } else if (page === 'history' || page === 'backtest') {
      const filters = page === 'history' ? state.historyFilters : state.backtestFilters;
      const defaults = page === 'history' ? DEFAULT_HIST : DEFAULT_BT;
      for (const key of Object.keys(defaults)) {
        if (String(filters[key]) !== String(defaults[key])) p.set(key, String(filters[key]));
      }
      if (page === 'backtest') {
        const steps = (state.backtestChain || []).filter((s) => s && s.dim && s.value && s.value !== 'all');
        if (steps.length) p.set('chain', steps.map((s) => `${s.dim}:${s.value}`).join(','));
      }
    }
    const q = p.toString();
    const base = PAGE_HASH[page] || 'home';
    return q ? `#${base}?${q}` : `#${base}`;
  }

  function applyHashState() {
    const page = pageFromHash();
    const q = hashQuery();
    if (page === 'history') {
      if (queryHasFilter(q, DEFAULT_HIST)) {
        state.historyFilters = filtersFromQuery(q, DEFAULT_HIST);
        state.historyTeam = state.historyFilters.team;
      }
      return;
    }
    if (page === 'backtest') {
      if (queryHasFilter(q, DEFAULT_BT) || q.has('chain')) {
        if (queryHasFilter(q, DEFAULT_BT)) state.backtestFilters = filtersFromQuery(q, DEFAULT_BT);
        if (q.has('chain')) {
          state.backtestChain = String(q.get('chain') || '').split(',').filter(Boolean).map((part) => {
            const idx = part.indexOf(':');
            if (idx < 0) return null;
            return { dim: part.slice(0, idx), value: part.slice(idx + 1) || 'all' };
          }).filter(Boolean);
        }
      }
      return;
    }
    if (page === 'week' || page == null) {
      const weekKeys = ['week', 'moved', 'homeDog', 'over', 'under'];
      if (!weekKeys.some((key) => q.has(key))) return;
      state.selectedWeek = q.has('week') && q.get('week') !== '' ? Number(q.get('week')) : null;
      state.filters.movedLines = q.get('moved') === '1';
      state.filters.homeDog = q.get('homeDog') === '1';
      state.filters.projOver = q.get('over') === '1';
      state.filters.projUnder = q.get('under') === '1';
      if (state.filters.projOver && state.filters.projUnder) state.filters.projUnder = false;
    }
  }

  function parseGamePath(pathname) {
    const parts = String(pathname || '').split('/').filter(Boolean);
    if (parts[0] !== 'game') return { invalid: true, season: '', week: '', gameId: '' };
    const season = Number(parts[1]);
    const week = Number(parts[2]);
    let gameId = parts[3] || '';
    try {
      gameId = decodeURIComponent(gameId);
    } catch {
      /* keep the raw segment */
    }
    const seasonOk = Number.isInteger(season) && season >= 1990 && season <= 2100;
    const weekOk = Number.isInteger(week) && week >= 1 && week <= 30;
    const invalid = parts.length !== 4 || !seasonOk || !weekOk || !gameId;
    return {
      invalid,
      season: seasonOk ? season : parts[1],
      week: weekOk ? week : parts[2],
      gameId
    };
  }

  function readLocationRoute() {
    const path = String(location.pathname || '/').replace(/\/+$/, '') || '/';
    if (path === '/performance') return { kind: 'page', page: 'performance' };
    if (path.startsWith('/game/')) {
      const game = parseGamePath(path);
      return { kind: 'game', page: 'week', ...game };
    }
    const hashed = pageFromHash();
    if (hashed) return { kind: 'page', page: hashed };
    return { kind: 'page', page: 'week' };
  }

  function gameSharePath(game) {
    const season = game.season;
    const week = game.week;
    const id = game.gameId || game.game_id;
    return `/game/${encodeURIComponent(season)}/${encodeURIComponent(week)}/${encodeURIComponent(id)}`;
  }

  let lastWritten = '';

  function writeHistory(mode, next) {
    lastWritten = next;
    const fn = mode === 'push' ? 'pushState' : 'replaceState';
    if (typeof history[fn] === 'function') history[fn](null, '', next);
    else location.href = next;
  }

  function syncLocation(page, mode) {
    if (page === 'performance') {
      const want = state.performanceSeason
        ? `/performance?season=${encodeURIComponent(state.performanceSeason)}`
        : '/performance';
      if (`${location.pathname}${location.search}` === want && !location.hash) return;
      writeHistory(mode, want);
      return;
    }
    if (page === 'week' && state.shareGame) {
      const want = gameSharePath(state.shareGame);
      if (location.pathname === want && !location.hash) return;
      writeHistory(mode, want);
      return;
    }
    const wantHash = hashForPage(page);
    if (location.pathname === '/' && location.hash === wantHash && !location.search) return;
    if (page === 'week' && location.pathname === '/' && (location.hash === '#week' || location.hash === '#home') && (wantHash === '#home' || wantHash === '#week')) return;
    writeHistory(mode, `/${wantHash}`);
  }

  function applyIncomingRoute(route) {
    state.shareGame = null;
    state.shareSeason = null;
    state.shareMissing = false;
    state.shareSolo = false;
    if (route.kind === 'game') {
      state.shareGame = {
        season: route.season,
        week: route.week,
        gameId: route.gameId,
        invalid: Boolean(route.invalid),
        solo: false
      };
      state.shareSolo = false;
      if (route.invalid) state.shareMissing = true;
      else {
        state.shareSeason = route.season;
        state.selectedWeek = route.week;
      }
      state.week = null;
      selectPage('week', { fromHistory: true, reload: true, keepShare: true });
      return;
    }
    state.week = null;
    selectPage(route.page, { fromHash: true, fromHistory: true, reload: true, keepShare: true });
  }

  function highlightTabs() {
    if (!tabs) return;
    for (const b of tabs.querySelectorAll('button[data-page]')) {
      b.classList.toggle('on', b.dataset.page === state.page);
    }
  }

  function resetPageData(page) {
    if (page === 'history') {
      state.history = null;
      state.historyError = null;
      state.historyLoading = true;
    } else if (page === 'backtest') {
      state.backtest = null;
      state.backtestError = null;
      state.backtestLoading = true;
    } else if (page === 'week') {
      state.week = null;
    } else if (page === 'standings') {
      state.standings = null;
    } else if (page === 'performance') {
      state.performance = null;
      state.performanceError = null;
      state.performanceLoading = true;
    }
  }

  function selectPage(page, opts) {
    const fromHash = Boolean(opts && opts.fromHash);
    const fromHistory = Boolean(opts && opts.fromHistory) || fromHash;
    const keepShare = Boolean(opts && opts.keepShare);
    const next = page === 'home' ? 'week' : page;
    if (!PAGE_HASH[next]) return;
    let shareCleared = false;
    if (!keepShare && state.shareGame) {
      shareCleared = true;
      state.shareGame = null;
      state.shareSeason = null;
      state.shareMissing = false;
      state.shareSolo = false;
      if (next === 'week') {
        state.selectedWeek = null;
        state.week = null;
      }
    }
    if (fromHash) applyHashState();
    const changed = state.page !== next;
    if (changed) {
      state.page = next;
      resetPageData(next);
    } else if ((opts && opts.reload) || shareCleared) {
      resetPageData(next);
    }
    if (!fromHistory) syncLocation(state.page, 'push');
    highlightTabs();
    if (changed || (opts && opts.reload) || shareCleared) {
      render();
      syncLivePoll();
      load().catch(showPageError);
    }
  }

  function applyBootRoute() {
    const route = readLocationRoute();
    if (route.kind === 'game') {
      state.page = 'week';
      state.shareGame = {
        season: route.season,
        week: route.week,
        gameId: route.gameId,
        invalid: Boolean(route.invalid),
        solo: false
      };
      if (route.invalid) state.shareMissing = true;
      else {
        state.shareSeason = route.season;
        state.selectedWeek = route.week;
        state.shareMissing = false;
      }
    } else {
      state.page = route.page || 'week';
      if (state.page === 'performance') {
        const q = new URLSearchParams(location.search);
        if (q.has('season') && q.get('season') !== '') {
          const n = Number(q.get('season'));
          if (Number.isFinite(n)) state.performanceSeason = n;
        }
      }
    }
    lastWritten = `${location.pathname}${location.search}${location.hash}`;
  }

  applyBootRoute();
  highlightTabs();

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
  function setWho() {
    if (!who) return;
    who.textContent = '';
    who.hidden = true;
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
    const p = new URLSearchParams();
    for (const key of Object.keys(DEFAULT_BT)) {
      if (f[key] == null || f[key] === '') continue;
      p.set(key, String(f[key]));
    }
    const steps = (chain || state.backtestChain || []).filter((s) => s && s.dim && s.value && s.value !== 'all');
    if (steps.length) p.set('chain', steps.map((s) => `${s.dim}:${s.value}`).join(','));
    return p.toString();
  }

  function historyQuery(filters) {
    const f = filters || state.historyFilters;
    const p = new URLSearchParams();
    for (const key of Object.keys(DEFAULT_HIST)) {
      if (f[key] == null || f[key] === '') continue;
      p.set(key, String(f[key]));
    }
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

  const navToggle = document.getElementById('nav-toggle');
  function closeMenu() {
    document.body.classList.remove('menu-open');
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.title = 'Open menu';
    }
  }
  function toggleMenu() {
    const open = document.body.classList.toggle('menu-open');
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      navToggle.title = open ? 'Close menu' : 'Open menu';
    }
  }
  if (navToggle) {
    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });
  }
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('menu-open')) return;
    if (e.target.closest('#site-nav') || e.target.closest('#nav-toggle')) return;
    closeMenu();
  });

  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-page]');
    if (!btn) return;
    closeMenu();
    selectPage(btn.dataset.page);
  });
  window.addEventListener('hashchange', onExternalRoute);
  window.addEventListener('popstate', onExternalRoute);

  function onExternalRoute() {
    closeMenu();
    const here = `${location.pathname}${location.search}${location.hash}`;
    if (here === lastWritten) return;
    lastWritten = here;
    applyIncomingRoute(readLocationRoute());
  }

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
    // Avoid painting bootstrap (often the finished current week) while the selected week reloads.
    const shareInvalid = Boolean(state.shareGame && state.shareGame.invalid);
    const pendingWeek = state.page === 'week' && !state.week && !shareInvalid;
    if (!pendingWeek) render();
    try {
      if (pendingWeek) {
        const season = state.shareSeason || state.bootstrap.season;
        const weekNum = state.selectedWeek || state.bootstrap.week;
        const week = await api(`/api/week?season=${encodeURIComponent(season)}&week=${encodeURIComponent(weekNum)}`);
        if (gen !== loadGen) return;
        state.week = week;
        if (state.shareGame && !state.shareGame.invalid) {
          const found = (week.games || []).some((g) => g.game_id === state.shareGame.gameId);
          state.shareMissing = !found;
          if (found) cardOpen.set(state.shareGame.gameId, true);
        }
      }
      if (state.page === 'performance' && !state.performance) {
        state.performanceLoading = true;
        const seasonQ = state.performanceSeason ? `?season=${encodeURIComponent(state.performanceSeason)}` : '';
        const performance = await api(`/api/performance${seasonQ}`);
        if (gen !== loadGen) return;
        state.performance = performance;
        state.performanceError = null;
        state.performanceLoading = false;
        if (performance && performance.season && state.performanceSeason == null) {
          state.performanceSeason = performance.season;
        }
        if (performance && performance.criteria && performance.criteria.length) {
          const ids = performance.criteria.map((c) => c.id);
          if (!ids.includes(state.performanceCriterion)) state.performanceCriterion = ids[0];
        }
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
      if (state.page === 'performance') {
        state.performanceError = (err && err.message) || 'Failed to load pick performance';
        state.performanceLoading = false;
        render();
        return;
      }
      if (state.page === 'week' && state.shareGame) {
        state.shareMissing = true;
        state.week = state.week || { games: [], week: state.shareGame.week, season: state.shareSeason };
        render();
        return;
      }
      throw err;
    }
    if (gen !== loadGen) return;
    render();
    revealSharedGame();
    syncLivePoll();
  }

  function passFilters(g) {
    if (state.filters.homeDog && !g.homeUnderdog) return false;
    if (state.filters.projOver && !g.projectedOver) return false;
    if (state.filters.projUnder && !g.projectedUnder) return false;
    if (state.filters.movedLines) {
      const spreadMoved = g.spreadMove && g.spreadMove.moved;
      const totalMoved = g.totalMove && g.totalMove.moved;
      if (!spreadMoved && !totalMoved) return false;
    }
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

  function travelWinPctCell(side) {
    const tr = side && side.travel;
    if (!tr || tr.winPct == null) return { html: '', cls: 'muted' };
    const zones = Number(tr.zones);
    if (!Number.isFinite(zones) || zones < 2) return { html: '', cls: 'muted' };
    return statCell(fmtPct(tr.winPct), 'muted');
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
    rows.push(statRow(
      'Record',
      statCell(away.record && away.record.label ? away.record.label : ''),
      statCell(home.record && home.record.label ? home.record.label : '')
    ));
    rows.push(statRow(
      'Win %',
      statCell(away.ytdWinPct != null ? fmtPct(away.ytdWinPct) : ''),
      statCell(home.ytdWinPct != null ? fmtPct(home.ytdWinPct) : '')
    ));
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
      'Win % Home/Away',
      statCell(away.awayWinPct != null ? `away ${fmtPct(away.awayWinPct)}` : '', 'muted'),
      statCell(home.homeWinPct != null ? `home ${fmtPct(home.homeWinPct)}` : '', 'muted')
    ));
    const travelA = travelWinPctCell(away);
    const travelH = travelWinPctCell(home);
    if (travelA.html || travelH.html) {
      rows.push(statRow('Win % Travel', travelA, travelH));
    }
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

  function stackedPick(top, bottom) {
    if (bottom == null || bottom === '' || bottom === '—') return esc(top);
    return `<span class="pick-stack"><span class="pick-abbr">${esc(top)}</span><span class="pick-line">${esc(bottom)}</span></span>`;
  }

  function atsButtonHtml(game, team) {
    const pts = signedSpreadPts(game, team);
    if (pts == null) return esc(team);
    return stackedPick(team, pts);
  }

  function ouButtonHtml(game, side) {
    const total = fmtNum(game.total_line);
    const letter = side === 'over' ? 'O' : 'U';
    if (total === '—') return esc(side === 'over' ? 'Over' : 'Under');
    return stackedPick(letter, total);
  }

  function lineMoveHtml(move) {
    if (!move || move.openLabel == null) return '';
    const open = `<span class="line-open">Open ${esc(move.openLabel)}</span>`;
    if (!move.moved) {
      return `<div class="line-move"><div class="line-open-row">${open}</div><div class="line-flat">flat</div></div>`;
    }
    const delta = `<span class="line-delta ${esc(move.tone || '')}">${esc(move.deltaLabel)}</span>`;
    const since = move.sinceLabel
      ? `<div class="line-since">${esc(move.sinceLabel)}</div>`
      : '';
    return `<div class="line-move">
      <div class="line-open-row">${open}</div>
      <div class="line-delta-row">${delta}</div>
      ${since}
    </div>`;
  }

  function pickRow(game, market, left, right, leftText, rightText, opts) {
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
    const leftInner = opts && opts.leftHtml != null ? opts.leftHtml : esc(leftLabel);
    const rightInner = opts && opts.rightHtml != null ? opts.rightHtml : esc(rightLabel);
    const moveHtml = opts && opts.move ? opts.move : '';
    const lineClass = market === 'ats' || market === 'ou' ? ` line-pick ${market}` : '';
    const reason = locked
      ? 'Locked at kickoff'
      : (blocked && !current
        ? `Clear ${String(partner).toUpperCase()} to pick ${String(market).toUpperCase()}`
        : null);
    return `<div class="pick${blocked && !current ? ' exclusive-off' : ''}${lineClass}">
      <label>${labels[market] || market}</label>
      <div class="pick-col">
        <button type="button" data-gid="${esc(game.game_id)}" data-market="${market}" data-sel="${esc(left)}" class="${on(left) ? 'on' : ''}" ${disabled ? 'disabled' : ''} title="${esc(reason || `Pick ${leftLabel} ${market}`)}">${leftInner}</button>
      </div>
      <div class="pick-col">
        <button type="button" data-gid="${esc(game.game_id)}" data-market="${market}" data-sel="${esc(right)}" class="${on(right) ? 'on' : ''}" ${disabled ? 'disabled' : ''} title="${esc(reason || `Pick ${rightLabel} ${market}`)}">${rightInner}</button>
      </div>
      ${moveHtml}
    </div>`;
  }

  function xPtsValue(game, side) {
    if (game.xPts && game.xPts[side] != null) return game.xPts[side];
    return game.implied && game.implied[side];
  }

  const cardOpen = new Map();

  function numOrNull(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function cardPhase(game) {
    const live = game && game.live;
    const st = live ? String(live.state || '').toLowerCase() : '';
    if (st === 'in') return 'live';
    const dbFinal = numOrNull(game && game.home_score) != null && numOrNull(game && game.away_score) != null;
    const liveFinal = Boolean(live && (st === 'post' || live.completed) && numOrNull(live.home_score) != null && numOrNull(live.away_score) != null);
    if (dbFinal || liveFinal || (game && game.phase === 'final')) return 'final';
    if (game && game.locked) return 'live';
    if (game && game.phase === 'live') return 'live';
    return 'pre';
  }

  function cardExpanded(game) {
    if (state.shareGame && !state.shareMissing && state.shareGame.gameId === game.game_id && !cardOpen.has(game.game_id)) return true;
    if (cardOpen.has(game.game_id)) return cardOpen.get(game.game_id);
    return false;
  }

  function formatLineText(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return '';
    const rounded = Math.round(num * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function signedLineText(line) {
    const shown = formatLineText(line);
    if (!shown) return '';
    return Number(line) > 0 ? `+${shown}` : shown;
  }

  function finalScorePair(game) {
    const live = game && game.live;
    const st = live ? String(live.state || '').toLowerCase() : '';
    if (st === 'in') return null;
    const hs = numOrNull(game && game.home_score);
    const as = numOrNull(game && game.away_score);
    if (hs != null && as != null) return { home: hs, away: as };
    if (live && (st === 'post' || live.completed)) {
      const lh = numOrNull(live.home_score);
      const la = numOrNull(live.away_score);
      if (lh != null && la != null) return { home: lh, away: la };
    }
    return null;
  }

  function settleParts(game) {
    if (cardPhase(game) !== 'final') return null;
    if (game.settle && (game.settle.coverText || game.settle.totalText || game.settle.text)) {
      return {
        coverText: game.settle.coverText || '',
        totalText: game.settle.totalText || '',
        atsTone: game.settle.atsTone || 'neutral',
        text: game.settle.text || ''
      };
    }
    const scores = finalScorePair(game);
    if (!scores) return null;
    const home = scores.home;
    const away = scores.away;
    const spread = numOrNull(game.spread_line);
    const total = numOrNull(game.total_line);
    const close = (a, b) => Math.abs(a - b) < 0.001;
    let coverText = '';
    if (spread != null) {
      const margin = home - away;
      if (close(home, away)) {
        if (close(margin, spread)) coverText = 'SU tie · spread PUSH';
        else {
          const coverTeam = margin > spread ? game.home_team : game.away_team;
          const line = coverTeam === game.home_team ? -spread : spread;
          coverText = `SU tie · ${coverTeam} covered ${signedLineText(line)}`;
        }
      } else {
        const winner = home > away ? game.home_team : game.away_team;
        const winnerLine = winner === game.home_team ? -spread : spread;
        if (close(margin, spread)) coverText = `${winner} push ${signedLineText(winnerLine)}`;
        else if ((margin > spread ? game.home_team : game.away_team) === winner) {
          coverText = `${winner} covered ${signedLineText(winnerLine)}`;
        } else coverText = `${winner} did NOT cover ${formatLineText(Math.abs(spread))}`;
      }
    }
    let totalText = '';
    if (total != null) {
      const sum = home + away;
      const shown = formatLineText(total);
      if (close(sum, total)) totalText = `score was PUSH ${shown}`;
      else if (sum > total) totalText = `score was OVER ${shown}`;
      else totalText = `score was UNDER ${shown}`;
    }
    let atsTone = 'neutral';
    if (coverText && spread != null) {
      const margin = home - away;
      if (close(margin, spread)) atsTone = 'push';
      else if (!close(spread, 0)) {
        const homeFavored = spread > 0;
        const homeCovered = margin > spread;
        atsTone = (homeFavored ? homeCovered : !homeCovered) ? 'cover' : 'fail';
      }
    }
    const text = [coverText, totalText].filter(Boolean).join(' ');
    if (!text) return null;
    return { coverText, totalText, atsTone, text };
  }

  function settleHtml(game) {
    const parts = settleParts(game);
    if (!parts) return '';
    const bits = [];
    if (parts.coverText) {
      bits.push(`<span class="settle-ats ${esc(parts.atsTone || 'neutral')}">${esc(parts.coverText)}</span>`);
    }
    if (parts.totalText) {
      bits.push(`<span class="settle-ou">${esc(parts.totalText)}</span>`);
    }
    if (!bits.length) return '';
    return `<div class="settle-strip" title="Closing spread and total: ATS colored by whether the favorite covered (green/red); O/U stays neutral">${bits.join(' ')}</div>`;
  }

  // Favorite, spread, and OVER/UNDER stay visible on a collapsed card that is not final.
  function collapsedLineHtml(game) {
    const bits = [];
    const line = spreadLabel(game);
    if (line !== '—') {
      if (line === 'PICK') {
        bits.push('<span><b>Favorite</b> Pick’em</span>');
      } else {
        const spread = Number(game.spread_line);
        const fav = spread > 0 ? game.home_team : game.away_team;
        bits.push(`<span><b>Favorite</b> ${esc(fav)}</span>`);
      }
      bits.push(`<span><b>Spread</b> ${esc(line)}</span>`);
    }
    const total = fmtNum(game.total_line);
    if (total !== '—') {
      bits.push(`<span><b class="ou-word">OVER/UNDER</b> ${esc(total)}</span>`);
    }
    if (!bits.length) return '';
    return `<div class="line-peek" title="Favorite, spread, and over/under">${bits.join(' ')}</div>`;
  }

  function scoreRow(game) {
    const live = game && game.live;
    const st = live ? String(live.state || '').toLowerCase() : '';
    let away = null;
    let home = null;
    let mid = '';
    if (st === 'in') {
      away = live.away_score;
      home = live.home_score;
      mid = live.detail || '';
    } else if (live && (st === 'post' || live.completed) && live.away_score != null && live.home_score != null) {
      away = live.away_score;
      home = live.home_score;
      mid = live.detail || 'Final';
    } else if (game.home_score != null && game.away_score != null && game.home_score !== '' && game.away_score !== '') {
      away = game.away_score;
      home = game.home_score;
      mid = 'Final';
    } else {
      return '';
    }
    if (away == null && home == null) return '';
    if (!mid && st !== 'in') return '';
    return `<div class="score-row" title="${esc(mid || 'Score')}">
      <div class="score away">${esc(away == null ? '' : String(away))}</div>
      <div class="score-mid">${esc(mid)}</div>
      <div class="score home">${esc(home == null ? '' : String(home))}</div>
    </div>`;
  }

  function weekBundle() {
    return state.week || state.bootstrap;
  }

  function gamesWantLivePoll(bundle) {
    if (bundle && bundle.livePoll) return true;
    return ((bundle && bundle.games) || []).some((g) => g && g.live && g.live.state === 'in');
  }

  function applyLiveUpdate(payload) {
    const byGame = (payload && (payload.games || payload.byGame)) || {};
    const apply = (bundle) => {
      if (!bundle || !Array.isArray(bundle.games)) return;
      bundle.games = bundle.games.map((g) => ({
        ...g,
        live: Object.prototype.hasOwnProperty.call(byGame, g.game_id) ? byGame[g.game_id] : g.live
      }));
      if (payload && payload.livePoll != null) bundle.livePoll = payload.livePoll;
      if (payload && payload.reason != null) bundle.liveReason = payload.reason;
    };
    apply(state.bootstrap);
    apply(state.week);
  }

  function stopLivePoll() {
    if (liveTimer) {
      clearInterval(liveTimer);
      liveTimer = null;
    }
  }

  function startLivePoll() {
    if (liveTimer) return;
    liveTimer = setInterval(async () => {
      try {
        const data = await api('/api/live-scores');
        applyLiveUpdate(data);
        if (state.page === 'week') render();
        if (!gamesWantLivePoll(weekBundle())) stopLivePoll();
      } catch {
        /* keep the interval while Home is open */
      }
    }, LIVE_POLL_MS);
  }

  function syncLivePoll() {
    if (state.page !== 'week' || !gamesWantLivePoll(weekBundle())) {
      stopLivePoll();
      return;
    }
    startLivePoll();
  }

  function confidenceParts(pick) {
    const atsConf = pick.atsConfidence != null ? pick.atsConfidence : (pick.ats || pick.atsTeam ? pick.confidence : null);
    const ouConf = pick.ou ? pick.ouConfidence : null;
    const parts = [];
    if (atsConf != null && Number.isFinite(Number(atsConf))) {
      parts.push({
        text: `ATS ${Math.round(Number(atsConf))}%`,
        title: 'Calibrated historical ATS hit rate (2016+ scored REG) for the ATS side only. The raw ATS edge/sample rule is mapped with isotonic reliability. This is not an O/U probability and not a joint ATS+O/U probability.'
      });
    }
    if (ouConf != null && Number.isFinite(Number(ouConf))) {
      parts.push({
        text: `O/U ${Math.round(Number(ouConf))}%`,
        title: 'O/U confidence: separate edge/sample score for the total only (51–92 rule). Not the ATS hit-rate map and not a joint ATS+O/U probability.'
      });
    }
    return parts;
  }

  function confidenceLine(pick) {
    const parts = confidenceParts(pick || {});
    if (!parts.length) return '';
    const bits = parts.map((part) => `<span class="ai-conf" title="${esc(part.title)}">${esc(part.text)}</span>`);
    return `<div class="ai-conf-line">Conf. ${bits.join(' · ')}</div>`;
  }

  function formatAiLine(text) {
    return esc(text).replace(/\b(over|under)\b/gi, (word) => `<b class="ou-word">${word.toUpperCase()}</b>`);
  }

  function injuryHtml(game) {
    const rows = Array.isArray(game.injuries) ? game.injuries : [];
    if (!rows.length) return '';
    const blocks = [];
    for (const side of ['away', 'home']) {
      const team = side === 'away' ? game.away_team : game.home_team;
      const mine = rows.filter((inj) => inj && (inj.side === side || (!inj.side && inj.team === team)));
      if (!mine.length) continue;
      const players = mine.map((inj) => {
        const status = inj.status || '';
        const pos = inj.position ? ` ${inj.position}` : '';
        const cls = String(status).toLowerCase();
        return `<span class="injury-player ${esc(cls)}" title="${esc(`${inj.name || 'Player'}${pos} · ${status}`)}">${esc(inj.name || 'Player')}${esc(pos)} <b>${esc(status)}</b></span>`;
      }).join('');
      blocks.push(`<div class="injury-side"><span class="injury-team" title="${esc(team)} injury report">${esc(team)}</span>${players}</div>`);
    }
    if (!blocks.length) return '';
    return `<div class="injury-strip" title="ESPN injuries: Out and Doubtful, plus Questionable quarterbacks or the listed starter">${blocks.join('')}</div>`;
  }

  function card(game) {
    const pick = game.aiPickDisplay || game.aiPick || {};
    const aiRaw = pick.label
      || pick.expected
      || '';
    const confLine = confidenceLine(pick);
    const extraNotes = [];
    if (pick.ats && pick.atsNote) extraNotes.push(pick.atsNote);
    if (pick.ou && pick.ouNote) extraNotes.push(pick.ouNote);
    const noteHtml = extraNotes.length ? `<div class="ai-note">${extraNotes.map((n) => formatAiLine(n)).join(' · ')}</div>` : '';
    const frozen = Boolean(game.aiPickFrozen || game.aiPickFreezeNow);
    const frozenHtml = frozen
      ? `<span class="ai-frozen" title="This AI pick was frozen at kickoff. Later injury updates do not move it.">Frozen at lock</span>`
      : '';
    const awayCity = (game.away && game.away.city) || game.away_team;
    const homeCity = (game.home && game.home.city) || game.home_team;
    const slot = kickoffSlotClass(game);
    const phase = cardPhase(game);
    const expanded = cardExpanded(game);
    const shared = Boolean(state.shareGame && !state.shareMissing && state.shareGame.gameId === game.game_id);
    return `<article class="card matchup${game.locked ? ' locked' : ''}${expanded ? '' : ' is-collapsed'}${slot ? ` ${esc(slot)}` : ''}${shared ? ' is-shared' : ''}" id="game-${esc(game.game_id)}">
      <div class="card-head">
        <span class="kick">${esc(kickoffLabel(game))}</span>
        <span class="head-actions">
          <button type="button" class="share-game" data-share-game="${esc(game.game_id)}" title="Copy a permanent link to this game">Share</button>
          <span class="status${game.locked ? ' lock' : ''}">${game.locked ? 'LOCKED' : 'OPEN'}</span>
        </span>
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
      ${scoreRow(game)}
      ${phase === 'final' ? settleHtml(game) : (expanded ? '' : collapsedLineHtml(game))}
      <button type="button" class="details-toggle" data-details="${esc(game.game_id)}" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="${expanded ? 'Hide' : 'Info'}" title="Show or hide team stats, the AI pick, and pick buttons">${expanded ? '▲ HIDE' : '▼ INFO'}</button>
      <div class="card-details"${expanded ? '' : ' hidden'}>
        ${cardStatRows(game)}
        <div class="card-foot">
          ${injuryHtml(game)}
          ${aiRaw ? `<div class="ai"><span>AI Pick:</span> ${formatAiLine(aiRaw)}${frozenHtml}${confLine}</div>${noteHtml}` : ''}
          <div class="picks">
            ${pickRow(game, 'outright', game.away_team, game.home_team, outrightPickLabel(game.away_team), outrightPickLabel(game.home_team))}
            ${pickRow(game, 'ats', game.away_team, game.home_team, atsPickLabel(game, game.away_team), atsPickLabel(game, game.home_team), {
              leftHtml: atsButtonHtml(game, game.away_team),
              rightHtml: atsButtonHtml(game, game.home_team),
              move: lineMoveHtml(game.spreadMove)
            })}
            ${pickRow(game, 'ou', 'over', 'under', ouPickLabel(game, 'over'), ouPickLabel(game, 'under'), {
              leftHtml: ouButtonHtml(game, 'over'),
              rightHtml: ouButtonHtml(game, 'under'),
              move: lineMoveHtml(game.totalMove)
            })}
          </div>
        </div>
      </div>
    </article>`;
  }

  function recordLabel(rec) {
    if (!rec) return '0-0';
    if (rec.label) return rec.label;
    const ties = Number(rec.ties) || 0;
    const wins = Number(rec.wins) || 0;
    const losses = Number(rec.losses) || 0;
    return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
  }

  function pushTally(list) {
    let wins = 0;
    let losses = 0;
    let ties = 0;
    for (const r of list) {
      if (r === 'win' || r === 'W') wins += 1;
      else if (r === 'loss' || r === 'L') losses += 1;
      else if (r === 'push' || r === 'P' || r === 'T') ties += 1;
    }
    return { wins, losses, ties, graded: wins + losses + ties, label: ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}` };
  }

  function gradeMarket(game, market, selection) {
    const scores = finalScorePair(game);
    if (!scores) return null;
    if (market === 'outright') {
      if (scores.home === scores.away) return 'push';
      const winner = scores.home > scores.away ? game.home_team : game.away_team;
      return String(selection).toUpperCase() === winner ? 'win' : 'loss';
    }
    if (market === 'ats') {
      const spread = numOrNull(game.spread_line);
      if (spread == null) return null;
      const margin = scores.home - scores.away;
      if (Math.abs(margin - spread) < 0.001) return 'push';
      const cover = margin > spread ? game.home_team : game.away_team;
      return String(selection).toUpperCase() === cover ? 'win' : 'loss';
    }
    if (market === 'ou') {
      const line = numOrNull(game.total_line);
      if (line == null) return null;
      const sum = scores.home + scores.away;
      if (Math.abs(sum - line) < 0.001) return 'push';
      const side = sum > line ? 'over' : 'under';
      return String(selection).toLowerCase() === side ? 'win' : 'loss';
    }
    return null;
  }

  function gradeWeekVersus(games, signedIn) {
    const aiAts = [];
    const aiOu = [];
    const userAts = [];
    const userOu = [];
    const userOut = [];
    for (const game of games || []) {
      if (cardPhase(game) !== 'final') continue;
      const ai = game.aiPick || {};
      if (ai.atsTeam) {
        const r = gradeMarket(game, 'ats', ai.atsTeam);
        if (r) aiAts.push(r);
      }
      if (ai.ou) {
        const r = gradeMarket(game, 'ou', ai.ou);
        if (r) aiOu.push(r);
      }
      if (!signedIn) continue;
      for (const w of game.wagers || []) {
        if (!w || !w.selection) continue;
        let result = w.result;
        if (!result || result === 'ungraded') result = gradeMarket(game, w.market, w.selection);
        if (!result || result === 'ungraded') continue;
        if (w.market === 'ats') userAts.push(result);
        else if (w.market === 'ou') userOu.push(result);
        else if (w.market === 'outright') userOut.push(result);
      }
    }
    return {
      signedIn: Boolean(signedIn),
      ai: { ats: pushTally(aiAts), ou: pushTally(aiOu) },
      user: signedIn ? { ats: pushTally(userAts), ou: pushTally(userOu), outright: pushTally(userOut) } : null
    };
  }

  function weekStat(label, value, title, gold) {
    const cls = gold ? ' class="gold"' : '';
    return `<span class="week-stat" title="${esc(title)}">${esc(label)} <strong${cls}>${esc(value)}</strong></span>`;
  }

  function weekBar(games) {
    const strip = myWeekStrip(games);
    const board = gradeWeekVersus(games, Boolean((state.week && state.week.user) || (state.bootstrap && state.bootstrap.user)));
    const bits = [
      weekStat('Season points', fmtInt(strip.season), 'Season points from settled wagers', true),
      weekStat('Week points', fmtInt(strip.week), 'Points scored on this week’s settled wagers', false),
      weekStat('Open picks', fmtInt(strip.locks), 'Games you have a wager on that are still open before kickoff', false)
    ];
    if (!board.signedIn) {
      bits.push('<span class="week-note" title="Sign in to compare your graded ATS, over/under, and outright results with the AI for this week">Sign in to compare your week with the AI.</span>');
    } else {
      const you = board.user;
      const ai = board.ai;
      bits.push(weekStat('Your ATS', recordLabel(you.ats), 'Your graded against-the-spread record this week (W-L, or W-L-T with a push)', false));
      bits.push(weekStat('AI ATS', recordLabel(ai.ats), 'AI graded against-the-spread record this week (W-L, or W-L-T with a push)', false));
      bits.push(weekStat('Your O/U', recordLabel(you.ou), 'Your graded over/under record this week (W-L, or W-L-T with a push)', false));
      bits.push(weekStat('AI O/U', recordLabel(ai.ou), 'AI graded over/under record this week (W-L, or W-L-T with a push)', false));
      if (you.outright && you.outright.graded) {
        bits.push(weekStat('Your outright', recordLabel(you.outright), 'Your graded outright record this week (W-L, or W-L-T with a tie)', false));
      }
    }
    return `<div class="week-bar" title="Season points, this week’s points, open wagers, and graded results versus the AI">${bits.join('')}</div>`;
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
      // Keep bootstrap; only refetch the selected week so open cards never flash collapsed.
      state.week = null;
      state.standings = null;
      await load();
    } catch (err) {
      alert(err.message);
    }
  }

  function abbrevKey() {
    return `<p class="abbrev-key">
      <span><b>W-L-T</b> win–loss-tie</span>
      <span><b>C-F-P</b> cover/fail/push (ATS)</span>
      <span><b>xPts</b> expected points</span>
      <span><b>ATS</b> against the spread</span>
      <span><b>OU</b> over/under/push</span>
    </p>
    <p class="abbrev-key">
      <span><b>TEAM +N / TEAM −N</b> ATS pick. Plus means that team is getting points. Minus means they are giving points (BUF −3.5 is Buffalo laying 3.5).</span>
      <span><b>OVER / UNDER</b> the total. The line reads take the OVER or take the UNDER, then the number.</span>
      <span><b>pass UNDER / pass OVER</b> no total pick. The reason after the dash can be TNF, total 50+, or both. This app writes pass UNDER for those spots.</span>
      <span><b>under discounted</b> still an under, with lower confidence, for TNF or a total 50+.</span>
      <span><b>pass ATS</b> no spread pick. Reasons include a big dog (TEAM +N), a small home dog that just allowed a pile of points, or a road favorite that lost its starter when the backup is not shown as the problem.</span>
      <span><b>moneyline only</b> straight-up pick instead of ATS when the number is too big.</span>
      <span><b>flag</b> the ATS pick stands, with a warning (fading a small home dog after a big points-allowed game).</span>
      <span><b>TEAM ML</b> moneyline side, not a spread number.</span>
    </p>`;
  }

  function weekPicker(w) {
    const weeks = (w && w.weeks) || (state.bootstrap && state.bootstrap.weeks) || [];
    if (!weeks.length) return '';
    const current = w && w.week;
    const season = (w && w.season) || (state.bootstrap && state.bootstrap.season) || '';
    const opts = weeks.map((n) => `<option value="${n}"${Number(n) === Number(current) ? ' selected' : ''}>Week ${n}</option>`).join('');
    return `<label class="week-pick">Week <select data-week-select title="Choose any ${esc(season)} week — including upcoming weeks for advance picks before kickoff">${opts}</select></label>`;
  }

  function compareWeekCards(a, b) {
    const ka = Date.parse(a && a.kickoff) || 0;
    const kb = Date.parse(b && b.kickoff) || 0;
    if (ka !== kb) return ka - kb;
    return String((a && a.home_team) || '').localeCompare(String((b && b.home_team) || ''));
  }

  function allCardsCollapsed(games) {
    return !(games || []).some((g) => cardExpanded(g));
  }

  function toggleAllButton(games) {
    const collapsed = allCardsCollapsed(games);
    const label = collapsed ? 'Expand all' : 'Collapse all';
    const title = collapsed
      ? 'Show stats, the AI pick, and pick buttons on every card.'
      : 'Hide stats, the AI pick, and pick buttons on every card.';
    return `<button type="button" class="chip" data-toggle-all aria-expanded="${collapsed ? 'false' : 'true'}" aria-label="${esc(label)}" title="${esc(title)}">${label}</button>`;
  }

  function gameMissingView() {
    const share = state.shareGame || {};
    const season = share.season == null || share.season === '' ? 'that season' : share.season;
    const week = share.week == null || share.week === '' ? 'that week' : share.week;
    const id = share.gameId || 'that game';
    return `<section class="panel game-missing">
      <h1>Game not found</h1>
      <p class="lede">No game matches ${esc(season)} / week ${esc(week)} / ${esc(id)}. The link may be out of date, or the week and game id may not belong together.</p>
      <button type="button" class="chip" data-share-home title="Back to the current week on Home">Back to Home</button>
    </section>`;
  }

  function shareBanner(game) {
    if (!state.shareGame || state.shareMissing || !game) return '';
    const label = state.shareSolo ? 'Show full week' : 'Only this game';
    const title = state.shareSolo
      ? 'Show every game in this week and keep this one highlighted'
      : 'Show only this shared game';
    return `<div class="share-banner">
      <span>Shared game · ${esc(game.away_team)} @ ${esc(game.home_team)} · Week ${esc(game.week)}, ${esc(game.season)}</span>
      <button type="button" class="chip" data-share-solo title="${esc(title)}">${label}</button>
    </div>`;
  }

  function weekView() {
    if (state.shareMissing) return gameMissingView();
    const w = state.week || state.bootstrap;
    const all = [...(w.games || [])].sort(compareWeekCards);
    const shared = state.shareGame && all.find((g) => g.game_id === state.shareGame.gameId);
    let games = all.filter(passFilters);
    if (shared && !games.some((g) => g.game_id === shared.game_id)) games = [shared, ...games];
    if (state.shareSolo && shared) games = [shared];
    const emptyMsg = all.length
      ? '<p>No games match those filters.</p>'
      : `<p class="notice">No games scheduled for week ${esc(w.week)} yet. Import schedule/lines for that week (npm run import / cron) so advance picks can load here.</p>`;
    return `<section class="week-page">
      <div class="week-hero">
        <div class="week-pill">WEEK ${esc(w.week)}</div>
      </div>
      ${shareBanner(shared)}
      ${weekBar(all)}
      <div class="filters">
        ${weekPicker(w)}
        <button type="button" class="chip${state.filters.homeDog ? ' on' : ''}" data-filter="homeDog" title="Show home underdogs only">Home underdogs</button>
        <button type="button" class="chip${state.filters.projOver ? ' on' : ''}" data-filter="projOver" title="Show games projected over the total">Projected over</button>
        <button type="button" class="chip${state.filters.projUnder ? ' on' : ''}" data-filter="projUnder" title="Show games projected under the total">Projected under</button>
        <button type="button" class="chip${state.filters.movedLines ? ' on' : ''}" data-filter="movedLines" title="Show only games whose spread or total has moved from the opening line">Moved lines only</button>
        ${toggleAllButton(games)}
      </div>
      <div class="cards week-cards" id="week-cards">${games.map(card).join('') || emptyMsg}</div>
      ${abbrevKey()}
    </section>`;
  }

  function standingsTable(rows, sortable) {
    const cols = [
      { key: 'rank', label: 'Rk', title: 'Rank by season points, then weekly points' },
      { key: 'username', label: 'User', title: 'Pool username' },
      { key: 'season_points', label: 'Season', title: 'Season points (1 per correct wager)' },
      { key: 'weekly_points', label: 'Week', title: 'Points scored this week (tie-break)' },
      { key: 'wagers', label: 'Wagers', title: 'Number of wagers this season' },
      { key: 'record', label: 'Record', title: 'Settled wagers as wins–losses–ties. Pushes count as ties.' },
      { key: 'wins', label: 'Wins', title: 'Correct settled wagers. Pushes are not wins.' },
      { key: 'win_pct', label: 'Win%', title: 'Wins divided by wins plus losses. Pushes are excluded.' }
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
        <td>${esc(r.record || recordLabel(r))}</td>
        <td>${r.wins}</td>
        <td>${fmtPct(r.win_pct)}</td>
      </tr>`).join('') || '<tr><td colspan="8">No players yet.</td></tr>'}</tbody>
    </table>`;
  }

  function rec(r) {
    return r && r.label ? r.label : '0-0';
  }

  function filterOn(filters, defaults, key) {
    return String(filters[key]) !== String(defaults[key]);
  }

  function filterField(label, name, title, options, filters, defaults) {
    const on = filterOn(filters, defaults, name) ? 'on' : '';
    return `<label class="${on}">${label} <select name="${name}" class="${on}" title="${esc(title)}">${optList(options, filters[name])}</select></label>`;
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

  function filtersForm(which) {
    const historyPage = which === 'history';
    const filters = historyPage ? state.historyFilters : state.backtestFilters;
    const defaults = historyPage ? DEFAULT_HIST : DEFAULT_BT;
    const chips = historyPage ? activeHistChips() : activeBtChips();
    const moreFlag = historyPage ? state.historyMore : state.backtestMore;
    const moreOpen = moreFlag || chips.some((c) => SECONDARY.has(c.key));
    const teams = ['ALL', ...(state.bootstrap?.teams || [])];
    const years = historyPage ? yearsForHistory() : ((state.backtest && state.backtest.seasons) || yearsForHistory());
    const fieldHtml = (row) => FILTER_FIELDS.filter((field) => field.row === row && (!field.page || field.page === which)).map((field) => {
      const options = field.options === 'teams' ? teams : field.options === 'years' ? years : field.options;
      return filterField(field.label, field.key, field.title, options, filters, defaults);
    }).join('');
    const moreAttr = historyPage ? 'data-hist-more' : 'data-bt-more';
    const resetAttr = historyPage ? 'data-hist-reset' : 'data-bt-reset';
    const chipAttr = historyPage ? 'data-chip-clear' : 'data-bt-chip-clear';
    const moreId = historyPage ? 'hist-more' : 'bt-more';
    const formId = historyPage ? 'hist-filters' : 'bt-filters';
    return `<form id="${formId}" class="hist-bar">
      <div class="hist-row">
        ${fieldHtml('primary')}
        <div class="hist-actions">
          <button type="button" class="btn-more" ${moreAttr} title="Show or hide spread size, total, time of day, and the other filters" aria-expanded="${moreOpen ? 'true' : 'false'}">${moreOpen ? 'Fewer filters' : 'More filters'}</button>
          <button type="button" class="btn-reset" ${resetAttr} title="Reset every filter to All">Reset</button>
        </div>
      </div>
      <div class="hist-row" id="${moreId}" ${moreOpen ? '' : 'hidden'}>
        ${fieldHtml('more')}
      </div>
      ${chips.length ? `<div class="hist-chips">${chips.map((c) => `<button type="button" class="filter-chip on" ${chipAttr}="${c.key}" title="Clear ${esc(c.text)}">${esc(c.text)} ×</button>`).join('')}</div>` : ''}
    </form>${historyPage ? '<p class="hist-hint">Filters narrow the schedule seed; table updates as you change them.</p>' : ''}`;
  }

  function historyFiltersForm() {
    return filtersForm('history');
  }

  function historyTable(rows) {
    const cols = [
      { key: 'team', label: 'Team', title: 'Team abbreviation' },
      { key: 'games', label: 'G', title: 'Games matching the current filters' },
      { key: 'ats', label: 'ATS', title: 'Against the spread record as cover–fail–push' },
      { key: 'ou', label: 'O/U', title: 'Over/under/push record (overs-unders-pushes)' },
      { key: 'home', label: 'Home', title: 'Straight-up home record in the filtered set' },
      { key: 'road', label: 'Road', title: 'Straight-up road record in the filtered set' },
      { key: 'favorite', label: 'Favorite', title: 'Straight-up wins–losses–ties when the team is a favorite' },
      { key: 'dog', label: 'Underdog', title: 'Straight-up wins–losses–ties when the team is an underdog' }
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
        <td>${rec(r?.favorite)}</td>
        <td>${rec(r?.dog)}</td>
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
    return filtersForm('backtest');
  }

  function chainBuilder() {
    const steps = state.backtestChain.length ? state.backtestChain : [{ dim: '', value: 'all' }];
    return `<div class="bt-chain">
      <h2>Sequence / Markov builder</h2>
      <p class="bt-note">Ordered pre-game states. The next-game distribution is the slice that matches every step. Last-5 hot = 4–5 wins/covers; cold = 0–1. Filters above apply first.</p>
      ${steps.map((step, i) => `<div class="bt-step">
        ${i ? '<span class="bt-arrow">→</span>' : ''}
        <select class="${step.dim ? 'on' : ''}" data-chain-dim="${i}" title="Sequence dimension to match before this game">${chainDimOptions(step.dim)}</select>
        <select class="${step.dim && step.value && step.value !== 'all' ? 'on' : ''}" data-chain-val="${i}" title="Value required for the selected sequence dimension">${chainValueOptions(step.dim, step.value)}</select>
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
    const brierRaw = exp.brierRaw != null ? Number(exp.brierRaw).toFixed(4) : '—';
    const brierCal = exp.brierCalibrated != null ? Number(exp.brierCalibrated).toFixed(4) : '—';
    const brierTitle = 'Brier score: mean squared error of predicted ATS win probability vs the actual 0/1 outcome (0 = perfect, 1 = worst). Lower is better.';
    return `<div class="hist-block">
      <h2>Expected call accuracy</h2>
      <p class="bt-note">Same AI Pick sides as Current Week, written as <b>BUF -5.5 and Over</b>. ATS confidence is a calibrated historical ATS hit rate (2016+ scored REG). O/U confidence is a separate total edge/sample score, not a joint ATS+OU probability. ATS and OU are graded separately; joint requires both correct (a push on either side is a push).</p>
      <p class="bt-note">Brier measures how close the confidence probability was to the real ATS result — think average squared miss. Raw uses the pre-calibration ATS confidence; calibrated uses the isotonic map. Closer to 0 is better.</p>
      <div class="bt-stats">
        <div class="bt-stat"><div class="k">Avg ATS confidence</div><div class="v">${exp.confidenceAvg != null ? `${esc(exp.confidenceAvg)}%` : '—'}</div></div>
        <div class="bt-stat"><div class="k">Avg O/U confidence</div><div class="v">${exp.ouConfidenceAvg != null ? `${esc(exp.ouConfidenceAvg)}%` : '—'}</div></div>
        <div class="bt-stat"><div class="k">ATS hit</div><div class="v">${esc(ats.pct)}</div><div class="s">${esc(ats.label)}</div></div>
        <div class="bt-stat"><div class="k">OU hit</div><div class="v">${esc(ou.pct)}</div><div class="s">${esc(ou.label)}</div></div>
        <div class="bt-stat"><div class="k">Joint ATS+OU</div><div class="v">${esc(joint.pct)}</div><div class="s">${esc(joint.label)}</div></div>
        <div class="bt-stat" title="${esc(brierTitle)}"><div class="k" title="${esc(brierTitle)}">Brier raw</div><div class="v">${esc(brierRaw)}</div><div class="s">ATS · lower better</div></div>
        <div class="bt-stat" title="${esc(brierTitle)}"><div class="k" title="${esc(brierTitle)}">Brier calibrated</div><div class="v">${esc(brierCal)}</div><div class="s">ATS · lower better</div></div>
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

  const BT_FILTER_COLS = [
    { filter: 'team', key: 'team', label: 'Team', title: 'Focus team abbreviation for this matching row' },
    { filter: 'site', key: 'site', label: 'Site', title: 'Home or road for the focus team' },
    { filter: 'travel', key: 'travel', label: 'Travel', title: 'Road travel direction. n/a when the focus team is not on a cross-country road trip' },
    { filter: 'distance', key: 'distanceLabel', label: 'Distance', title: 'Timezone distance traveled' },
    { filter: 'roof', key: 'roofLabel', label: 'Roof', title: 'Dome, outdoor, or retractable' },
    { filter: 'role', key: 'role', label: 'Role', title: 'Favorite or underdog from the closing spread' },
    { filter: 'division', key: 'divisionalLabel', label: 'Division', title: 'Same-division opponent (Y/N)' },
    { filter: 'daysOff', key: 'restBucket', label: 'Days off', title: 'Rest bucket: short, normal, or bye' },
    { filter: 'spread', key: 'spreadBucket', label: 'Spread size', title: 'Absolute closing spread bucket: pick, small, medium, or large' },
    { filter: 'total', key: 'totalBucket', label: 'Total bucket', title: 'Closing total bucket: low, mid, or high' },
    { filter: 'timeOfDay', key: 'timeOfDay', label: 'Time of day', title: 'Kickoff window in America/New_York: morning, early, afternoon, or primetime' },
    { filter: 'starterOut', key: 'starterOut', label: 'Starter out', title: 'Official weekly injury report: quarterback Out, or Active when that season’s nflverse report is loaded and no QB is Out' }
  ];
  const BT_FILTER_LABELS = {
    site: { home: 'Home', road: 'Road', neutral: 'Neutral', matchup: 'Matchup' },
    travel: { east: 'East', west: 'West' },
    role: { favorite: 'Favorite', underdog: 'Underdog' },
    restBucket: { short: 'Short', normal: 'Normal', bye: 'Bye+' },
    spreadBucket: { pick: 'Pick’em', small: 'Small', medium: 'Medium', large: 'Large' },
    totalBucket: { low: 'Low', mid: 'Mid', high: 'High' },
    timeOfDay: { morning: 'Morning', early: 'Early', afternoon: 'Afternoon', primetime: 'Primetime' },
    starterOut: { out: 'Out', active: 'Active' }
  };

  function activeBacktestFilterKeys() {
    const keys = new Set();
    for (const col of BT_FILTER_COLS) {
      if (String(state.backtestFilters[col.filter]) !== String(DEFAULT_BT[col.filter])) keys.add(col.filter);
    }
    for (const step of state.backtestChain || []) {
      if (!step || !step.dim || step.value == null || step.value === '' || step.value === 'all') continue;
      const mapped = step.dim === 'rest' ? 'daysOff' : step.dim;
      if (BT_FILTER_COLS.some((col) => col.filter === mapped)) keys.add(mapped);
    }
    return keys;
  }

  function backtestFilterValue(row, key) {
    const raw = row ? row[key] : null;
    if (raw == null || raw === '' || raw === 'none' || raw === 'unknown') return 'n/a';
    const map = BT_FILTER_LABELS[key];
    if (map && map[raw]) return map[raw];
    return String(raw);
  }

  function backtestCell(r, key) {
    if (key === 'gameDate') return esc(r.gameDate || '—');
    if (key === 'opponent') return esc(r.matchup || `${r.away_team} @ ${r.home_team}`);
    if (key === 'spreadLabel') return esc(r.spreadLabel || '—');
    if (key === 'total_line') return esc(r.total_line == null || r.total_line === '' ? '—' : r.total_line);
    if (key === 'restDays') return esc(r.restDays == null ? '—' : r.restDays);
    if (key === 'weatherLabel') return esc(r.weatherLabel || '—');
    if (key === 'coverLabel') return esc(r.coverLabel || '—');
    if (key === 'ou') return esc(r.ou || '—');
    if (key === 'expected') return esc(r.expected || '—');
    if (key === 'confidence') return r.confidence != null ? `${esc(r.confidence)}%` : '—';
    if (key === 'ouConfidence') return r.ouConfidence != null ? `${esc(r.ouConfidence)}%` : '—';
    if (key === 'expectedAtsHit') return hitCell(r.expectedAtsHit);
    if (key === 'expectedOuHit') return hitCell(r.expectedOuHit);
    return esc(backtestFilterValue(r, key));
  }

  function backtestGamesTable(rows) {
    const base = [
      { key: 'gameDate', label: 'Date', title: 'Kickoff in America/New_York as YYYY-MM-DD HH:MM EST (literal EST suffix)' },
      { key: 'opponent', label: 'Matchup', title: 'Away and home team abbreviations (AWAY @ HOME)' },
      { key: 'spreadLabel', label: 'Spread', title: 'Closing spread for the focus team (or home-favored line)' },
      { key: 'total_line', label: 'Total', title: 'Closing total' },
      { key: 'restDays', label: 'Days rest', title: 'Days of rest for the focus team before this game' },
      { key: 'weatherLabel', label: 'Weather', title: 'Weather / roof conditions' }
    ];
    // Every active filter gets a column, even when a row’s value is n/a.
    const active = activeBacktestFilterKeys();
    const filterCols = BT_FILTER_COLS.filter((col) => active.has(col.filter));
    const tail = [
      { key: 'coverLabel', label: 'Cover', title: 'Spread cover (C), fail (F), or push (P)' },
      { key: 'ou', label: 'OU', title: 'Over/under result (O, U, or P)' },
      { key: 'expected', label: 'Expected', title: 'AI expected call (ATS or moneyline side, and Over/Under)' },
      { key: 'confidence', label: 'ATS %', title: 'ATS confidence: calibrated historical ATS hit rate (isotonic map from the ATS-only edge/sample rule)' },
      { key: 'ouConfidence', label: 'O/U %', title: 'O/U confidence: separate edge/sample score for the total, not the ATS hit-rate map' },
      { key: 'expectedAtsHit', label: 'ATS hit', title: 'Whether the expected ATS call hit (W, L, or P)' },
      { key: 'expectedOuHit', label: 'OU hit', title: 'Whether the expected over/under call hit (W, L, or P)' }
    ];
    const cols = base.concat(filterCols, tail);
    const sorted = sortedBacktestGames(rows);
    const { key, dir } = state.backtestSort;
    return `<div class="hist-table-wrap"><table class="hist-table hist-games">
      <thead><tr>${cols.map((c) => {
        const on = key === c.key;
        const caret = on ? `<span class="caret">${dir === 'asc' ? '▲' : '▼'}</span>` : '';
        return `<th data-bt-sort="${c.key}" title="${esc(c.title)}" class="${on ? 'sorted' : ''}">${c.label}${caret}</th>`;
      }).join('')}</tr></thead>
      <tbody>${sorted.map((r) => `<tr>${cols.map((c) => `<td>${backtestCell(r, c.key)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  function downloadBacktestCsv() {
    const rows = (state.backtest && state.backtest.games) || [];
    if (!rows.length) return;
    const headers = ['date','season','week','away','home','focus','spread','total','away_rest','home_rest','weather','roof','site','division','role','last_game','last5_wl','last5_ats','home_score','away_score','outright','cover','ou','expected','confidence','ou_confidence','expected_ats_hit','expected_ou_hit','starter_out'];
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
        ou_confidence: r.ouConfidence, expected_ats_hit: r.expectedAtsHit, expected_ou_hit: r.expectedOuHit,
        starter_out: r.starterOut
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
      ${backtestFiltersForm()}
      ${chainBuilder()}
      ${body}
      ${abbrevKey()}
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
      ${historyFiltersForm()}
      ${body}
      ${abbrevKey()}
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

  function perfColumns(criterion) {
    const cols = [
      { key: 'week', label: 'Week', title: 'NFL week number for this season' }
    ];
    if (criterion.singlePick) {
      cols.push({
        key: 'pick',
        label: 'Pick',
        title: 'Team this criterion picked for the week, shown with the closing spread'
      });
    }
    if ((criterion.markets || []).includes('ats')) {
      cols.push({
        key: 'atsRecord',
        label: 'ATS',
        title: 'Against-the-spread record for the week (W-L, or W-L-P when a spread pushes). Pending means that week has no graded final yet.'
      });
      cols.push({
        key: 'ats',
        label: 'ATS win %',
        title: 'Week ATS win percentage. Wins divided by wins plus losses. Pushes are excluded.'
      });
    }
    if ((criterion.markets || []).includes('ou')) {
      cols.push({
        key: 'ouRecord',
        label: 'O/U',
        title: 'Over/under record for the week (W-L, or W-L-P when the total pushes). Pending means that week has no graded final yet.'
      });
      cols.push({
        key: 'ou',
        label: 'O/U win %',
        title: 'Week over/under win percentage. Wins divided by wins plus losses. Pushes are excluded.'
      });
    }
    return cols;
  }

  function perfSortValue(row, key) {
    if (key === 'week') return row.week;
    if (key === 'pick') return row.pick || null;
    if (key === 'atsRecord' || key === 'ouRecord') {
      const market = row.markets && row.markets[key === 'atsRecord' ? 'ats' : 'ou'];
      if (!market || market.pending || !market.graded) return null;
      return market.wins - market.losses;
    }
    if (key === 'ats' || key === 'ou') {
      const market = row.markets && row.markets[key];
      if (!market || market.pending || market.winPct == null) return null;
      return market.winPct;
    }
    return null;
  }

  function sortPerfWeeks(weeks) {
    const { key, dir } = state.performanceSort;
    const mul = dir === 'asc' ? 1 : -1;
    return [...(weeks || [])].sort((a, b) => {
      const av = perfSortValue(a, key);
      const bv = perfSortValue(b, key);
      if (av == null && bv == null) return a.week - b.week;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') {
        const cmp = av.localeCompare(bv);
        if (cmp) return cmp * mul;
      } else if (av !== bv) return (av - bv) * mul;
      return a.week - b.week;
    });
  }

  function perfMarketText(market, kind) {
    if (!market) return '—';
    if (kind === 'record') return market.label || '—';
    if (market.pending || market.winPct == null) return '—';
    return fmtPct(market.winPct);
  }

  function perfCurrentCards(criterion, report) {
    if (!criterion.showCurrent) return '';
    const heading = report.isCurrentSeason ? 'Current win %' : 'Season win %';
    const bits = (criterion.markets || []).map((market) => {
      const tally = criterion.year && criterion.year.markets && criterion.year.markets[market];
      const name = market === 'ou' ? 'O/U' : 'ATS';
      const pct = tally && tally.winPct != null ? fmtPct(tally.winPct) : '—';
      const record = tally && tally.graded ? tally.label : '0-0';
      const title = market === 'ou'
        ? `${heading} for over/under. Wins divided by wins plus losses. Pushes are excluded.`
        : `${heading} against the spread. Wins divided by wins plus losses. Pushes are excluded.`;
      return `<div class="perf-pct" title="${esc(title)}">
        <div class="k">${esc(heading)} · ${name}</div>
        <div class="v">${esc(pct)}</div>
        <div class="s">${esc(record)}</div>
      </div>`;
    });
    return `<div class="perf-current">${bits.join('')}</div>`;
  }

  function perfYearLine(criterion) {
    const parts = (criterion.markets || []).map((market) => {
      const tally = criterion.year && criterion.year.markets && criterion.year.markets[market];
      const name = market === 'ou' ? 'O/U' : 'ATS';
      const record = tally ? (tally.graded ? tally.label : '0-0') : '0-0';
      const pct = tally && tally.winPct != null ? fmtPct(tally.winPct) : '—';
      return `${name} ${record} · ${pct}`;
    });
    return parts.join(' · ');
  }

  function performanceView() {
    if (state.performanceLoading && !state.performance) {
      return '<section class="panel"><h1>Pick Performance</h1><p class="hist-loading">Loading graded results…</p></section>';
    }
    if (state.performanceError && !state.performance) {
      return `<section class="panel"><h1>Pick Performance</h1><p class="notice">${esc(state.performanceError)}</p></section>`;
    }
    const report = state.performance;
    if (!report) return '<section class="panel"><h1>Pick Performance</h1><p class="hist-loading">Loading graded results…</p></section>';
    const list = report.criteria || [];
    const criterion = list.find((c) => c.id === state.performanceCriterion) || list[0];
    if (!criterion) {
      return '<section class="panel"><h1>Pick Performance</h1><p class="notice">No criteria are registered.</p></section>';
    }
    const seasons = report.seasons && report.seasons.length ? report.seasons : [report.season];
    const season = state.performanceSeason || report.season;
    const cols = perfColumns(criterion);
    const rows = sortPerfWeeks(criterion.weeks);
    const yearTitle = `Season total for ${season}. ${perfYearLine(criterion)}. Win percentage is wins divided by wins plus losses. Pushes are excluded.`;
    const body = rows.map((row) => `<tr>
      <td>${esc(row.week)}</td>
      ${criterion.singlePick ? `<td title="${esc(row.pickDetail || 'No pick for this week')}">${esc(row.pick || '—')}</td>` : ''}
      ${(criterion.markets || []).includes('ats') ? `<td>${esc(perfMarketText(row.markets.ats, 'record'))}</td><td>${esc(perfMarketText(row.markets.ats, 'pct'))}</td>` : ''}
      ${(criterion.markets || []).includes('ou') ? `<td>${esc(perfMarketText(row.markets.ou, 'record'))}</td><td>${esc(perfMarketText(row.markets.ou, 'pct'))}</td>` : ''}
    </tr>`).join('');
    const yearCells = (criterion.markets || []).includes('ats')
      ? `<td>${esc(perfMarketText(criterion.year.markets.ats, 'record'))}</td><td>${esc(perfMarketText(criterion.year.markets.ats, 'pct'))}</td>`
      : '';
    const yearOu = (criterion.markets || []).includes('ou')
      ? `<td>${esc(perfMarketText(criterion.year.markets.ou, 'record'))}</td><td>${esc(perfMarketText(criterion.year.markets.ou, 'pct'))}</td>`
      : '';
    const emptyAi = criterion.id === 'ai-picks' && criterion.year && criterion.year.markets
      && !(criterion.year.markets.ats && criterion.year.markets.ats.graded)
      && !(criterion.year.markets.ou && criterion.year.markets.ou.graded);
    const emptyNote = emptyAi
      ? '<p class="notice">No stored AI picks are graded for this season yet. Picks are saved when a week is opened and frozen at kickoff.</p>'
      : '';
    const dbNote = report.db === false && criterion.id === 'ai-picks'
      ? '<p class="bt-note">AI picks are read from the database. With no database connected, those rows stay empty until picks are stored.</p>'
      : '';
    return `<section class="panel perf-page">
      <h1>Pick Performance</h1>
      <p class="lede">One section per betting criterion. Only final games count. A week with no final games stays Pending.</p>
      <div class="weekbar">
        <label title="Season whose graded weeks are shown">Season
          <select data-perf-season title="Choose the season to score">${seasons.map((y) => `<option value="${esc(y)}"${Number(y) === Number(season) ? ' selected' : ''}>${esc(y)}</option>`).join('')}</select>
        </label>
      </div>
      <div class="perf-tabs" role="tablist">
        ${list.map((item) => `<button type="button" class="chip${item.id === criterion.id ? ' on' : ''}" data-perf-criterion="${esc(item.id)}" role="tab" aria-selected="${item.id === criterion.id ? 'true' : 'false'}" title="${esc(item.summary || item.name)}">${esc(item.name)}</button>`).join('')}
      </div>
      ${perfCurrentCards(criterion, report)}
      <p class="perf-year" title="${esc(yearTitle)}"><b>${esc(season)} season</b> · ${esc(perfYearLine(criterion))}</p>
      <p class="perf-glossary">${esc(criterion.glossary || criterion.description || '')}</p>
      ${criterion.assumption ? '<p class="bt-note">This definition was not in the app before. It lives in src/performance.js so it can be changed.</p>' : ''}
      ${emptyNote}
      ${dbNote}
      <div class="perf-table-wrap">
        <table class="hist-table perf-table">
          <thead><tr>${cols.map((col) => `<th data-perf-sort="${esc(col.key)}" title="${esc(col.title)}" class="${state.performanceSort.key === col.key ? 'sorted' : ''}">${esc(col.label)}${state.performanceSort.key === col.key ? `<span class="caret">${state.performanceSort.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>`).join('')}</tr></thead>
          <tbody>${body || '<tr><td colspan="6">No weeks for this season.</td></tr>'}</tbody>
          <tfoot><tr class="perf-total">
            <td title="${esc(yearTitle)}">Season</td>
            ${criterion.singlePick ? '<td title="One pick per week, totaled below in ATS">—</td>' : ''}
            ${yearCells}${yearOu}
          </tr></tfoot>
        </table>
      </div>
    </section>`;
  }

  function gameShareUrl(game) {
    return `${location.origin}${gameSharePath({ season: game.season, week: game.week, gameId: game.game_id })}`;
  }

  function flashShare(message) {
    let el = document.getElementById('share-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'share-toast';
      el.className = 'share-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.hidden = false;
    clearTimeout(flashShare.timer);
    flashShare.timer = setTimeout(() => { el.hidden = true; }, 1800);
  }

  function mobileShareAvailable() {
    return typeof navigator.share === 'function' && window.matchMedia('(max-width: 720px)').matches;
  }

  async function copyGameLink(game) {
    const url = gameShareUrl(game);
    const title = `${game.away_team} @ ${game.home_team}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        flashShare('Link copied');
        return;
      }
    } catch {
      /* clipboard blocked; try the mobile share sheet */
    }
    if (mobileShareAvailable()) {
      try {
        await navigator.share({ title, text: title, url });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    window.prompt('Copy this game link', url);
  }

  function revealSharedGame() {
    if (state.page !== 'week' || !state.shareGame || state.shareMissing || state.shareSolo) return;
    const el = document.getElementById(`game-${state.shareGame.gameId}`);
    if (!el || typeof el.scrollIntoView !== 'function') return;
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
  }

  function render() {
    if (!state.bootstrap) {
      app.innerHTML = '<p>Loading…</p>';
      return;
    }
    if (state.page === 'week') app.innerHTML = weekView();
    else if (state.page === 'standings') app.innerHTML = `<section class="panel"><h1>Standings</h1>${standingsTable((state.standings && state.standings.standings) || state.bootstrap.standings || [], true)}</section>`;
    else if (state.page === 'performance') app.innerHTML = performanceView();
    else if (state.page === 'history') app.innerHTML = historyView();
    else if (state.page === 'backtest') app.innerHTML = backtestView();
    else app.innerHTML = weekView();

    app.onclick = async (e) => {
      const shareBtn = e.target.closest('[data-share-game]');
      if (shareBtn) {
        const id = shareBtn.dataset.shareGame;
        const games = ((state.week || state.bootstrap) && (state.week || state.bootstrap).games) || [];
        const game = games.find((g) => g.game_id === id);
        if (game) copyGameLink(game);
        return;
      }
      if (e.target.closest('[data-share-home]')) {
        selectPage('week');
        return;
      }
      if (e.target.closest('[data-share-solo]')) {
        state.shareSolo = !state.shareSolo;
        render();
        revealSharedGame();
        return;
      }
      const perfTab = e.target.closest('[data-perf-criterion]');
      if (perfTab && state.page === 'performance') {
        state.performanceCriterion = perfTab.dataset.perfCriterion;
        state.performanceSort = { key: 'week', dir: 'asc' };
        render();
        return;
      }
      const toggleAll = e.target.closest('[data-toggle-all]');
      if (toggleAll) {
        const w = state.week || state.bootstrap;
        const games = [...((w && w.games) || [])].filter(passFilters);
        const hide = games.some((g) => cardExpanded(g));
        for (const g of games) cardOpen.set(g.game_id, !hide);
        render();
        return;
      }
      const detailsBtn = e.target.closest('[data-details]');
      if (detailsBtn) {
        const id = detailsBtn.dataset.details;
        const games = ((state.week || state.bootstrap) && (state.week || state.bootstrap).games) || [];
        const game = games.find((g) => g.game_id === id);
        const open = game ? cardExpanded(game) : true;
        cardOpen.set(id, !open);
        render();
        return;
      }
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
      const perfSort = e.target.closest('th[data-perf-sort]');
      if (perfSort && state.page === 'performance') {
        const key = perfSort.dataset.perfSort;
        if (state.performanceSort.key === key) state.performanceSort.dir = state.performanceSort.dir === 'asc' ? 'desc' : 'asc';
        else state.performanceSort = { key, dir: key === 'week' || key === 'pick' ? 'asc' : 'desc' };
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
      const weekSel = e.target.closest('[data-week-select]');
      if (weekSel) {
        state.shareGame = null;
        state.shareSeason = null;
        state.shareMissing = false;
        state.shareSolo = false;
        state.selectedWeek = Number(weekSel.value);
        state.week = null;
        cardOpen.clear();
        persistWeek();
        load().catch(showPageError);
        return;
      }
      const perfSeason = e.target.closest('[data-perf-season]');
      if (perfSeason) {
        state.performanceSeason = Number(perfSeason.value);
        state.performance = null;
        state.performanceError = null;
        state.performanceLoading = true;
        syncLocation('performance', 'replace');
        render();
        load().catch((err) => {
          state.performanceError = (err && err.message) || 'Failed to load pick performance';
          state.performanceLoading = false;
          render();
        });
        return;
      }
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

  if (state.page === 'performance' || state.page === 'history' || state.page === 'backtest' || (state.page === 'week' && !state.shareGame)) {
    syncLocation(state.page);
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
