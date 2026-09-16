(() => {
  const app = document.getElementById('app');
  const tabs = document.getElementById('tabs');
  const login = document.getElementById('login');
  const who = document.getElementById('who');
  const usernameInput = document.getElementById('username');

  const state = {
    page: 'home',
    bootstrap: null,
    week: null,
    standings: null,
    history: null,
    filters: { homeDog: false, projOver: false, projUnder: false },
    sort: { key: 'season_points', dir: 'desc' },
    historyTeam: 'ALL'
  };

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
  async function api(path, opts) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...(opts && opts.headers) },
      ...opts
    });
    const data = await res.json().catch(() => ({ ok: false, error: res.statusText }));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }
  function setWho(user) {
    who.textContent = user ? user.username : '';
    if (user) usernameInput.placeholder = user.username;
  }

  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-page]');
    if (!btn) return;
    state.page = btn.dataset.page;
    for (const b of tabs.querySelectorAll('button')) b.classList.toggle('on', b === btn);
    load().catch((err) => {
      app.innerHTML = `<p class="notice">${err.message}</p>`;
    });
  });

  login.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username: usernameInput.value })
      });
      setWho(data.user);
      usernameInput.value = '';
      state.bootstrap = null;
      state.week = null;
      await load();
    } catch (err) {
      alert(err.message);
    }
  });

  async function load() {
    if (!state.bootstrap) state.bootstrap = await api('/api/bootstrap');
    setWho(state.bootstrap.user);
    if (state.page === 'week' && !state.week) {
      state.week = await api(`/api/week?season=${state.bootstrap.season}&week=${state.bootstrap.week}`);
    }
    if (state.page === 'standings' && !state.standings) {
      state.standings = await api('/api/standings');
    }
    if (state.page === 'history' && !state.history) {
      state.history = await api(`/api/history?team=${state.historyTeam}`);
    }
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

  function historyView() {
    const h = state.history;
    if (!h) return '<p>Loading history…</p>';
    const cols = [
      { key: 'team', label: 'Team', title: 'Team abbreviation' },
      { key: 'games', label: 'G', title: 'Games in the selected range' },
      { key: 'ats', label: 'ATS', title: 'Against the spread record' },
      { key: 'ou', label: 'O/U', title: 'Over/under record (overs-unders-pushes)' },
      { key: 'home', label: 'Home', title: 'Straight-up home record' },
      { key: 'road', label: 'Road', title: 'Straight-up road record' },
      { key: 'dome', label: 'Dome', title: 'Straight-up record in a dome or closed roof' },
      { key: 'outdoors', label: 'Out', title: 'Straight-up record outdoors' },
      { key: 'cold', label: 'Cold', title: 'Straight-up record in 40°F or colder' },
      { key: 'windy', label: 'Wind', title: 'Straight-up record in 15+ mph wind' },
      { key: 'east', label: 'East', title: 'Straight-up record traveling east 2+ time zones' },
      { key: 'west', label: 'West', title: 'Straight-up record traveling west 2+ time zones' },
      { key: 'short', label: 'Short', title: 'Straight-up record on short rest (5 days or fewer)' },
      { key: 'afterW', label: 'After W', title: 'Straight-up record after a win' },
      { key: 'afterL', label: 'After L', title: 'Straight-up record after a loss' },
      { key: 'afterBye', label: 'After bye', title: 'Straight-up record after a bye' }
    ];
    return `<section>
      <div class="weekbar">
        <h1>History</h1>
        <label>Team
          <select id="hist-team" title="Filter splits to one team">
            <option value="ALL">ALL</option>
            ${(state.bootstrap.teams || []).map((t) => `<option value="${t}" ${t === state.historyTeam ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </label>
      </div>
      <table>
        <thead><tr>${cols.map((c) => `<th title="${c.title}">${c.label}</th>`).join('')}</tr></thead>
        <tbody>${(h.rows || []).map((r) => `<tr>
          <td>${r.team}</td>
          <td>${r.games}</td>
          <td>${rec(r.ats)}</td>
          <td>${rec(r.ou)}</td>
          <td>${rec(r.home)}</td>
          <td>${rec(r.road)}</td>
          <td>${rec(r.weather.dome)}</td>
          <td>${rec(r.weather.outdoors)}</td>
          <td>${rec(r.weather.cold)}</td>
          <td>${rec(r.weather.windy)}</td>
          <td>${rec(r.travel.east)}</td>
          <td>${rec(r.travel.west)}</td>
          <td>${rec(r.rest.short)}</td>
          <td>${rec(r.after.win)}</td>
          <td>${rec(r.after.loss)}</td>
          <td>${rec(r.after.bye)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </section>`;
  }

  function rulesView() {
    return `<section class="rules panel">
      <h1>Rules</h1>
      <p class="lede">This is a season-long pick-em. It is not a survivor / suicide pool.</p>
      <ul>
        <li>Sign in with a unique username (case-insensitive). You stay in the pool all season.</li>
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
      await onPick(e);
    };
    const hist = document.getElementById('hist-team');
    if (hist) {
      hist.onchange = async () => {
        state.historyTeam = hist.value;
        state.history = await api(`/api/history?team=${state.historyTeam}`);
        render();
      };
    }
  }

  load().catch((err) => {
    app.innerHTML = `<p class="notice">${err.message}</p>`;
  });
})();
