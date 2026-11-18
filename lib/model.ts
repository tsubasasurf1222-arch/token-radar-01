// The token radar's model: one sealed snapshot in, one ranked board out.
//
// The board ranks protocols that record no token by what a token would be worth if the protocol's
// record stayed as it is. The value model is built from the snapshot's own figures only:
//
//   implied = tvl_usd x category_multiple x growth_factor x maturity_factor x breadth_factor
//
// category_multiple is the heart of it. The snapshot's token-bearing protocols are the comparables:
// for each of the 128 that carry a market cap, ratio = mcap_usd / tvl_usd says what the market
// actually pays per dollar of TVL. Ratios are wild (median 0.22, p95 above 12), so the model works
// on the log scale: a category's multiple is the geometric blend of its own median log-ratio and
// the global median log-ratio, weighted n / (n + 8), so a category with two wild comparables is
// pulled most of the way back to the market-wide figure, and the result is clamped to [0.02, 3].
//
// growth_factor reads change_7d, clamped to [-40, +60] per cent, at weight 0.5: a hot week lifts a
// value by at most 30 per cent, a bad one cuts at most 20. maturity_factor rewards a long record
// with no token: 0.80 for a brand-new listing rising to 1.15 at three years. breadth_factor adds
// 1.5 per cent per extra chain, capped at 1.12. No protocol name is ever special-cased: one
// function scores every row, and the dashboard prints the whole model next to the board.
//
// Who may be ranked: a protocol that records no token (no market cap, no CoinGecko id, no symbol),
// minus the products that are a token in disguise — the same line the house's watchlist draws.
// Wrapped, staked, staking and bridged products of a token that already trades, exchange balance
// sheets, and versioned pools of another protocol are set aside, with the reason printed on the
// page. The watchlist's 40 slugs are always on the board; the radar then ranks every other
// rankable pre-token protocol in the snapshot, not just the largest few: finding the early ones
// below the floor is the radar's job.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, printed on the dashboard so a reader can check every number. */
export interface ModelConstants {
  shrink_k: number;
  multiple_floor: number;
  multiple_cap: number;
  growth_weight: number;
  growth_floor_pct: number;
  growth_cap_pct: number;
  maturity_base: number;
  maturity_span: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_cap: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 8,
  multiple_floor: 0.02,
  multiple_cap: 3,
  growth_weight: 0.5,
  growth_floor_pct: -40,
  growth_cap_pct: 60,
  maturity_base: 0.8,
  maturity_span: 0.35,
  maturity_days: 1095,
  unknown_age_days: 180,
  breadth_per_chain: 0.015,
  breadth_cap: 1.12,
};

/** The model's version label, printed on the dashboard. */
export const MODEL_VERSION = 'comparables-2';

/** How many live-token protocols the comparables view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category's comparables: how many token-bearing protocols, and what the market pays. */
export interface CategoryComp {
  category: string;
  n: number;
  median_ratio: number;
  multiple: number;
}

/** The comparables set the multiples come from. */
export interface Comparables {
  global_multiple: number;
  global_n: number;
  by_category: Map<string, CategoryComp>;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    category_comps: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one board row: the board row itself, farm plan included. */
export type RadarRow = BoardRow;

/** A live-token protocol: it already trades, so the page shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  global_comps: number;
  comparables: CategoryComp[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Names that begin with an exchange's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Categories that are a token in disguise: the product of one that already trades. */
const DERIVATIVE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol is one the board may rank, and if not, the reason the page prints. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'a token already trades';
  if (p.category !== null && DERIVATIVE_CATEGORIES.has(p.category)) return `${p.category.toLowerCase()} product of a token that already trades`;
  if (VERSIONED.test(p.name)) return 'a versioned pool of another protocol';
  if (WRAPPED_WORD.test(p.name)) return 'a wrapped or staked product of a token that already trades';
  if (EXCHANGE_PREFIX.test(p.name)) return 'an exchange balance sheet, not a protocol awaiting a token';
  return null;
}

/** Whether the board may rank a protocol. */
export function isRankable(p: SnapshotProtocol): boolean {
  return exclusionReason(p) === null;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The comparables: every protocol in the snapshot whose token trades with a recorded market cap.
 * Multiples are medians on the log scale, shrunk toward the global median by n / (n + shrink_k).
 */
export function buildComparables(snapshot: Snapshot, model: ModelConstants = MODEL): Comparables {
  const comps = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const globalLog = median(comps.map((p) => Math.log(p.mcap_usd! / p.tvl_usd)));
  const globalMultiple = Math.exp(globalLog);
  const groups = new Map<string, number[]>();
  for (const p of comps) {
    const key = p.category ?? '(uncategorised)';
    const list = groups.get(key) ?? [];
    list.push(Math.log(p.mcap_usd! / p.tvl_usd));
    groups.set(key, list);
  }
  const byCategory = new Map<string, CategoryComp>();
  for (const [category, logs] of groups) {
    const catLog = median(logs);
    const w = logs.length / (logs.length + model.shrink_k);
    const multiple = clamp(Math.exp(w * catLog + (1 - w) * globalLog), model.multiple_floor, model.multiple_cap);
    byCategory.set(category, { category, n: logs.length, median_ratio: round4(Math.exp(catLog)), multiple: round4(multiple) });
  }
  return { global_multiple: round4(globalMultiple), global_n: comps.length, by_category: byCategory };
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** The multiple one protocol is valued at: its category's shrunk multiple, or the global one. */
export function multipleFor(p: SnapshotProtocol, comps: Comparables, model: ModelConstants = MODEL): { multiple: number; comps: number } {
  const entry = comps.by_category.get(p.category ?? '(uncategorised)');
  if (entry === undefined) return { multiple: comps.global_multiple, comps: 0 };
  return { multiple: entry.multiple, comps: entry.n };
}

/** The four factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  comps: Comparables,
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; comps: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const { multiple, comps: n } = multipleFor(p, comps, model);
  const growthPct = clamp(p.change_7d ?? 0, model.growth_floor_pct, model.growth_cap_pct);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const age = ageDays(asOf, p.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_base + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_span;
  const breadthMult = Math.min(model.breadth_cap, 1 + Math.max(0, p.chains.length - 1) * model.breadth_per_chain);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * maturityMult * breadthMult));
  return { implied, multiple, comps: n, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = buildComparables(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter((p) => watch.has(p.slug) || isRankable(p));
  const scored = chosen.map((p) => ({ p, v: impliedValue(p, snapshot.as_of, comps, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    on_watchlist: watch.has(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      category_multiple: s.v.multiple,
      category_comps: s.v.comps,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      breadth_multiplier: round4(s.v.breadthMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age),
  }));
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain, in the plain ranges a farmer budgets with. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $8 of gas on Ethereum mainnet';
  if (chain === 'Solana') return 'under $0.10 of fees on Solana';
  if (chain === 'Bitcoin') return 'about $2 of miner fees on Bitcoin';
  return 'under $1 of gas';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 500;
  if (p.tvl_usd >= 250_000_000) return 250;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 90;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

/** How many weekly actions to plan, from the protocol's age. */
function weeksFor(age: number | null): number {
  if (age === null) return 6;
  if (age < 180) return 8;
  if (age < 365) return 6;
  return 4;
}

/** The category's core action and its follow-up, in words a farmer can follow. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { core: string; follow: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      core: `Supply $${capital} of USDC to ${name} on ${chain} and leave the supply position open`,
      follow: `Borrow no more than 30 per cent of the supplied value on ${name}, hold it a day, then repay in full`,
    };
  }
  if (c.includes('dex') || c.includes('swap')) {
    return {
      core: `Add $${capital} of liquidity to ${name}'s largest stablecoin pool on ${chain}`,
      follow: `Make one small swap through ${name} on a different day, so the wallet both provides and trades`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return {
      core: `Deposit $${capital} of USDC as margin on ${name} and open one small position hedged on a second venue`,
      follow: `Close and reopen a position of the same small size once a week, keeping total volume modest and regular`,
    };
  }
  if (c.includes('bridge')) {
    return {
      core: `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in one app there`,
      follow: `Bridge a smaller amount back a few days later, so the wallet crosses in both directions`,
    };
  }
  if (c.includes('rwa')) {
    return {
      core: `Mint $${capital} of ${name}'s yield asset on ${chain} and hold it in the farming wallet`,
      follow: `Add a second smaller mint of $50 after two weeks, so the holding grows in more than one step`,
    };
  }
  if (c.includes('prediction')) {
    return {
      core: `Fund ${name} with $${capital} and take one position in its most liquid market`,
      follow: `Settle that position, then take one more in a different market the following week`,
    };
  }
  if (c.includes('stable')) {
    return {
      core: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it`,
      follow: `Move half the holding into ${name}'s savings or staking vault if it offers one, and keep both parts`,
    };
  }
  if (c.includes('insurance')) {
    return {
      core: `Buy $${capital} of cover from ${name} on ${chain} for the longest term it offers`,
      follow: `Renew or extend the cover once before it lapses, so the wallet shows two separate policy periods`,
    };
  }
  if (c.includes('chain')) {
    return {
      core: `Bridge $${capital} of USDC onto ${name}'s chain and make three ordinary transfers there`,
      follow: `Use one native application on the chain each week, such as its main exchange or lending market`,
    };
  }
  if (c.includes('index')) {
    return {
      core: `Mint $${capital} of ${name}'s index product on ${chain} and hold the index token`,
      follow: `Redeem a small part after a month and mint it back, so the wallet both issues and redeems`,
    };
  }
  return {
    core: `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and keep the vault shares`,
    follow: `Deposit a second smaller amount of $50 into a different ${name} vault or market on ${chain}`,
  };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(text: string, cost: string, time: string): string {
  let s = `${text}. Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, primary chain, TVL, age), never from a hand-written
 * list of names, and it ends with the safety rules: claim only from the protocol's own page, and
 * never pay anyone to claim.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = weeksFor(age);
  const { core, follow } = actionsFor(p, capital, chain);
  return [
    stepText(
      `Set up a fresh wallet that holds only the funds you plan to farm ${p.name} with, and keep its seed phrase offline`,
      'under $3 to fund the first transaction',
      '5 minutes',
    ),
    stepText(core, `$${capital} of capital plus ${gas}`, '15 minutes to set up'),
    stepText(follow, gas, '10 minutes'),
    stepText(
      `Repeat one qualifying action on ${p.name} every week for ${weeks} weeks, on roughly the same day, so the activity reads as use and not a single burst`,
      `${gas} a week`,
      `10 minutes a week for ${weeks} weeks`,
    ),
    stepText(
      `Hold the position for at least ${hold} days, so it stands in more than one weekly snapshot of the protocol's users`,
      `the $${capital} stays in the position; withdrawing early ends the farm`,
      `${hold} days`,
    ),
    stepText(
      `Open ${p.name}'s own points or rewards page from the link on its official site and record your standing; never follow a claim link from a message or a comment`,
      'nothing to check, and never pay anyone to claim',
      '10 minutes',
    ),
    stepText(
      `Keep a farm log with the wallet, the dates and the transaction hashes, and unwind if ${p.name}'s TVL falls by 30 per cent in a week or the team announces a snapshot date`,
      'nothing but the log itself',
      '5 minutes a week',
    ),
  ];
}

/** The live-token protocols, by market cap, for the comparables view: the market's own values. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = buildComparables(snapshot, model);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: comps.global_multiple,
    global_comps: comps.global_n,
    comparables: [...comps.by_category.values()].sort((a, b) => b.n - a.n || (a.category < b.category ? -1 : 1)),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watch.has(r.slug)).length,
    live_size: live.length,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters once trimmed`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
