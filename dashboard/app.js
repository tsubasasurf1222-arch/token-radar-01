// Token Radar page: renders window.RADAR (written by main.ts beside this page) with no network.
// Views: the ranked board, a detail view per protocol (value build + farm plan), filters and
// sorting, the comparables table the multiples come from, and the live-token set kept off the board.
// State can ride in the location hash (#cat=Lending, #slug=..., #watch=1) so a view is shareable
// and a screenshot can be taken of an exact state.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtUSD(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n}`;
}
function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}
function fmtAge(days) {
  if (days === null || days === undefined) return 'unknown';
  if (days < 90) return `${days}d`;
  if (days < 730) return `${(days / 30.44).toFixed(1)} mo`;
  return `${(days / 365.25).toFixed(1)} yrs`;
}
const mult = (n) => `${Number(n).toFixed(3)}x`;

const state = { q: '', cat: '', chain: '', watch: false, sort: 'rank', slug: null };

function readHash() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (h.get('q')) state.q = h.get('q');
  if (h.get('cat')) state.cat = h.get('cat');
  if (h.get('chain')) state.chain = h.get('chain');
  if (h.get('watch') === '1') state.watch = true;
  if (h.get('sort')) state.sort = h.get('sort');
  if (h.get('slug')) state.slug = h.get('slug');
}
function writeHash() {
  const h = new URLSearchParams();
  if (state.q) h.set('q', state.q);
  if (state.cat) h.set('cat', state.cat);
  if (state.chain) h.set('chain', state.chain);
  if (state.watch) h.set('watch', '1');
  if (state.sort !== 'rank') h.set('sort', state.sort);
  if (state.slug) h.set('slug', state.slug);
  history.replaceState(null, '', `#${h.toString()}`);
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  let rows = R.rows.filter((r) => {
    if (state.watch && !r.on_watchlist) return false;
    if (state.cat && (r.category ?? '') !== state.cat) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (q && !r.name.toLowerCase().includes(q) && !r.slug.toLowerCase().includes(q)) return false;
    return true;
  });
  const by = {
    rank: (a, b) => a.rank - b.rank,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    change: (a, b) => (b.change_7d ?? -Infinity) - (a.change_7d ?? -Infinity),
    age: (a, b) => (b.age_days ?? -1) - (a.age_days ?? -1),
    multiple: (a, b) => b.model.category_multiple - a.model.category_multiple,
    name: (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  };
  return rows.sort(by[state.sort] ?? by.rank);
}

function renderStats() {
  const total = R.rows.reduce((s, r) => s + r.implied_value_usd, 0);
  const median = R.rows[Math.floor(R.rows.length / 2)];
  const stats = [
    [`${R.board_size}`, 'protocols ranked'],
    [`${R.watchlist_size} / ${R.watchlist_size}`, 'watchlist covered'],
    [`${R.early_size}`, 'found below the $50M floor'],
    [fmtUSD(total), 'combined implied value'],
    [median ? fmtUSD(median.implied_value_usd) : '—', 'median implied value'],
    [`${R.global_comps}`, 'token comparables priced'],
  ];
  $('stats').innerHTML = stats.map(([b, s]) => `<div class="stat"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');
}

function renderBoard() {
  const rows = filtered();
  $('count').textContent = `${rows.length} of ${R.board_size} protocols shown`;
  $('empty').hidden = rows.length > 0;
  $('rows').innerHTML = rows
    .map((r) => {
      const chg = r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down';
      return `<tr data-slug="${esc(r.slug)}"${r.slug === state.slug ? ' class="sel"' : ''}>
        <td class="num">${r.rank}</td>
        <td><span class="name">${esc(r.name)}</span>${r.on_watchlist ? '<span class="badge">watchlist</span>' : ''}<br><span class="slug">${esc(r.slug)}</span></td>
        <td>${esc(r.category ?? '—')}</td>
        <td>${r.chains.length === 0 ? '—' : r.chains.length === 1 ? esc(r.chains[0]) : `${esc(r.chains[0])} +${r.chains.length - 1}`}</td>
        <td class="num">${fmtUSD(r.tvl_usd)}</td>
        <td class="num ${chg}">${fmtPct(r.change_7d)}</td>
        <td class="num">${fmtAge(r.age_days)}</td>
        <td class="num">${mult(r.model.category_multiple)}</td>
        <td class="num value">${fmtUSD(r.implied_value_usd)}</td>
      </tr>`;
    })
    .join('');
  for (const tr of $('rows').querySelectorAll('tr')) {
    tr.addEventListener('click', () => {
      state.slug = tr.dataset.slug;
      writeHash();
      renderBoard();
      renderDetail(true);
    });
  }
}

function factorRow(label, value, note) {
  return `<div class="frow"><span>${esc(label)}${note ? ` — ${esc(note)}` : ''}</span><b>${esc(value)}</b></div>`;
}

function renderDetail(scroll) {
  const box = $('detail');
  const r = R.rows.find((x) => x.slug === state.slug);
  if (!r) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  const m = r.model;
  box.hidden = false;
  box.innerHTML = `
    <button class="close" id="dclose" type="button">Close</button>
    <h2>${esc(r.name)} ${r.on_watchlist ? '<span class="badge">watchlist</span>' : ''}</h2>
    <p class="dsub">Rank #${r.rank} of ${R.board_size} · ${esc(r.category ?? 'Uncategorised')} · records no token${r.listed_at ? ` · tracked since ${esc(r.listed_at)}` : ''}</p>
    <div class="dgrid">
      <div class="stat"><b>${fmtUSD(r.implied_value_usd)}</b><span>implied value</span></div>
      <div class="stat"><b>${fmtUSD(r.tvl_usd)}</b><span>TVL</span></div>
      <div class="stat"><b>${fmtPct(r.change_7d)}</b><span>TVL change, 7 days</span></div>
      <div class="stat"><b>${fmtAge(r.age_days)}</b><span>age with no token</span></div>
      <div class="stat"><b>${r.chains.length}</b><span>chains: ${esc(r.chains.slice(0, 4).join(', ') || '—')}${r.chains.length > 4 ? '…' : ''}</span></div>
    </div>
    <div class="build">
      <h3>How this value is built</h3>
      ${factorRow('TVL', fmtUSD(r.tvl_usd), 'the snapshot figure')}
      ${factorRow('Category multiple', mult(m.category_multiple), m.category_comps > 0 ? `median of ${m.category_comps} ${esc(r.category ?? '')} tokens, shrunk to the market` : 'no token comparables in this category: the market-wide multiple')}
      ${factorRow('Growth factor', mult(m.growth_multiplier), `${fmtPct(m.growth_pct)} over 7 days, clamped and halved`)}
      ${factorRow('Maturity factor', mult(m.maturity_multiplier), `${fmtAge(m.age_days)} with no token`)}
      ${factorRow('Breadth factor', mult(m.breadth_multiplier), `${r.chains.length} chain${r.chains.length === 1 ? '' : 's'}`)}
      <div class="frow total"><span>Implied value</span><b>${fmtUSD(r.implied_value_usd)}</b></div>
    </div>
    <h3>Farm plan</h3>
    <ol class="steps">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  $('dclose').addEventListener('click', () => {
    state.slug = null;
    writeHash();
    renderBoard();
    renderDetail(false);
  });
  if (scroll) box.scrollIntoView({ block: 'nearest' });
}

function renderModel() {
  const m = R.model;
  $('model-text').innerHTML = `
    <p><b>Category multiple.</b> The snapshot's own token-bearing protocols are the comparables: ${R.global_comps} carry a market cap, and the market pays a median of ${mult(R.global_multiple)} per $1 of TVL. Each category's multiple is its own median, shrunk toward that market median by n / (n + ${m.shrink_k}) and clamped to ${m.multiple_floor}x–${m.multiple_cap}x, so two wild comparables cannot set a price.</p>
    <p><b>Growth factor.</b> Seven-day TVL change, clamped to ${m.growth_floor_pct}%…+${m.growth_cap_pct}% and weighted ${m.growth_weight}: a hot week adds at most 30 per cent, a bad one cuts at most 20. One week is a signal, not a verdict.</p>
    <p><b>Maturity factor.</b> ${m.maturity_base} for a new listing rising to ${(m.maturity_base + m.maturity_span).toFixed(2)} at three years with no token: the longer a protocol has run tokenless, the more its record is worth. An unrecorded age counts as ${m.unknown_age_days} days.</p>
    <p><b>Breadth factor.</b> +${(m.breadth_per_chain * 100).toFixed(1)} per cent per extra chain beyond the first, capped at ${mult(m.breadth_cap)}: a protocol live on many chains has more users a token could reach.</p>
    <p><b>Who is not ranked.</b> Anything whose token already trades, and the products that are a token in disguise: wrapped, staked and bridged products of a trading token, exchange balance sheets, and versioned pools of another protocol. They are set aside, never valued as if a launch were still to come.</p>
    <p><b>Reading the board.</b> The implied value is this model's claim about what a token would be worth if the protocol's record stayed as it is. It is not a prediction that a token will be issued, or when. Model version ${esc(R.model_version)}.</p>`;
  $('comp-note').textContent = `Median mcap / TVL is read straight off the snapshot's token-bearing protocols. The multiple used blends it with the market-wide median of ${mult(R.global_multiple)} (weight n / (n + ${m.shrink_k})), then clamps to ${m.multiple_floor}x–${m.multiple_cap}x.`;
  $('comp-rows').innerHTML = R.comparables
    .map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${c.n}</td><td class="num">${mult(c.median_ratio)}</td><td class="num">${mult(c.multiple)}</td></tr>`)
    .join('');
  $('live-rows').innerHTML = R.live
    .map((p) => {
      const chg = p.change_7d === null ? '' : p.change_7d >= 0 ? 'up' : 'down';
      return `<tr><td><span class="name">${esc(p.name)}</span></td><td>${esc(p.category ?? '—')}</td><td class="num">${fmtUSD(p.mcap_usd)}</td><td class="num">${fmtUSD(p.tvl_usd)}</td><td class="num">${p.ratio === null ? '—' : mult(p.ratio)}</td><td class="num ${chg}">${fmtPct(p.change_7d)}</td></tr>`;
    })
    .join('');
}

function fillControls() {
  const cats = [...new Set(R.rows.map((r) => r.category).filter((c) => c !== null))].sort();
  $('cat').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option${c === state.cat ? ' selected' : ''}>${esc(c)}</option>`).join('');
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  $('chain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => `<option${c === state.chain ? ' selected' : ''}>${esc(c)}</option>`).join('');
  $('q').value = state.q;
  $('watch').checked = state.watch;
  $('sort').value = state.sort;
}

function bind() {
  const on = () => {
    state.q = $('q').value;
    state.cat = $('cat').value;
    state.chain = $('chain').value;
    state.watch = $('watch').checked;
    state.sort = $('sort').value;
    writeHash();
    renderBoard();
  };
  for (const id of ['q', 'cat', 'chain', 'watch', 'sort']) $(id).addEventListener('input', on);
}

readHash();
$('meta').textContent = `Snapshot of ${R.as_of} · ${R.source}. Sealed data: every figure on this page is read from that one snapshot, and the page works with no network.`;
$('foot').textContent = `Token Radar, model ${R.model_version}. The board ranks protocols that record no token by an implied value derived only from the snapshot's figures; it does not predict whether or when any protocol issues a token. Farm plans are starting points, not financial advice: check the protocol's own page before acting.`;
fillControls();
bind();
renderStats();
renderBoard();
renderDetail(false);
renderModel();
