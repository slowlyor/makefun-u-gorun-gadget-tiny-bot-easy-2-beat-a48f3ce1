// Tiny trend-rotation bot for agent-fun/bars-replay/v1 (Solana hourly bars).
//
// Idea: buy-and-hold loses whenever the market drifts down, and it holds the
// weakest names at full weight. This bot only holds symbols in an uptrend and
// concentrates in the strongest ones, sitting in USDC otherwise.
//
// Per symbol, every hour:
//   - trend: SMA(6) of closes above SMA(24) of closes  -> in an uptrend
//   - strength: trailing 12-bar return (exact bigint cross-multiplication)
// Every 6 bars it rebalances to the top 3 uptrend symbols by strength, each
// sized equally up to the 25% per-symbol weight cap. Symbols that fall out of
// the uptrend (or out of the top 4) are sold in full. A held symbol is also
// sold at once if its close drops 6% below its trailing 24-bar high, so a
// sharp sell-off does not wait for the next rebalance.
//
// Fully deterministic: every decision is a pure function of the closes seen
// so far (bigint arithmetic, stable sorts, fixed tie-breaks). No clock, no
// randomness, no network, stdlib only (node:readline via the vendored shim).

import { BPS, runBars, type BarsState, type BuyInput, type OrderInput } from './vendor/makefun-bars.ts';

const FAST_BARS = 6; // fast SMA lookback (hours)
const SLOW_BARS = 24; // slow SMA lookback (hours)
const RANK_BARS = 12; // trailing-return lookback for ranking (hours)
const REBALANCE_EVERY = 6; // rebalance cadence (bars)
const TOP_N = 3; // most symbols held at once (25% weight cap each)
const STOP_BPS = 600; // sell a held symbol 6% below its trailing 24-bar high
const MAX_SLIPPAGE_BPS = 10_000;

/** Each universe symbol's latest close as of every batch so far (null before its first bar). */
const history = new Map<string, (bigint | null)[]>();
let nextRebalance = SLOW_BARS;
let entering: string[] | null = null;

const slots = (state: BarsState) =>
  Math.min(TOP_N, state.hello.caps.max_open_positions, state.hello.caps.max_orders_per_bar);

/** SMA of the last `n` closes as of batch `seq`, or null without enough history. */
function sma(symbol: string, seq: number, n: number): bigint | null {
  const closes = history.get(symbol)!;
  let sum = 0n;
  for (let i = seq - n + 1; i <= seq; i++) {
    const c = closes[i];
    if (c === null || c === undefined) return null;
    sum += c;
  }
  return sum / BigInt(n);
}

/** True when the symbol is in an uptrend as of batch `seq`. */
function inUptrend(symbol: string, seq: number): boolean {
  const fast = sma(symbol, seq, FAST_BARS);
  const slow = sma(symbol, seq, SLOW_BARS);
  return fast !== null && slow !== null && fast > slow;
}

/** The target portfolio as of batch `seq`: uptrend symbols, best trailing return first. */
function target(state: BarsState, seq: number): string[] {
  const ranked: { symbol: string; now: bigint; then: bigint }[] = [];
  for (const { symbol } of state.hello.symbols) {
    if (!inUptrend(symbol, seq)) continue;
    const closes = history.get(symbol)!;
    const now = closes[seq];
    const then = closes[seq - RANK_BARS];
    if (now !== null && now !== undefined && then !== null && then !== undefined) {
      ranked.push({ symbol, now, then });
    }
  }
  // now_a / then_a > now_b / then_b, exactly; sort is stable, ties keep universe order.
  ranked.sort((a, b) => {
    const l = a.now * b.then;
    const r = b.now * a.then;
    return l > r ? -1 : l < r ? 1 : 0;
  });
  return ranked.slice(0, slots(state)).map((x) => x.symbol);
}

/** Highest close of the symbol over the last SLOW_BARS bars ending at `seq`. */
function trailingHigh(symbol: string, seq: number): bigint | null {
  const closes = history.get(symbol)!;
  let high: bigint | null = null;
  for (let i = Math.max(0, seq - SLOW_BARS + 1); i <= seq; i++) {
    const c = closes[i];
    if (c === null || c === undefined) continue;
    if (high === null || c > high) high = c;
  }
  return high;
}

/** Held symbols whose close is STOP_BPS below their trailing 24-bar high. */
function stoppedOut(state: BarsState, seq: number): string[] {
  const out: string[] = [];
  for (const [symbol] of state.positions) {
    const close = state.close(symbol);
    const high = trailingHigh(symbol, seq);
    if (close !== null && high !== null && close * BPS < high * (BPS - BigInt(STOP_BPS))) {
      out.push(symbol);
    }
  }
  return out;
}

function buys(state: BarsState, symbols: readonly string[]): BuyInput[] {
  const { caps, fees } = state.hello;
  const room = slots(state) - state.positions.size;
  const coming = symbols
    .filter((s) => !state.positions.has(s) && state.close(s) !== null)
    .slice(0, room > 0 ? room : 0);
  if (coming.length === 0) return [];
  const even = state.cash / BigInt(coming.length);
  const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
  const slice = even < byWeight ? even : byWeight;
  if (slice === 0n || slice < BigInt(fees.min_notional_quote_units)) return [];
  return coming.map((symbol) => ({
    side: 'buy',
    symbol,
    notional_quote_units: slice,
    max_slippage_bps: MAX_SLIPPAGE_BPS,
  }));
}

function sells(state: BarsState, symbols: readonly string[]): OrderInput[] {
  return symbols
    .filter((s) => state.positions.has(s))
    .map((symbol) => ({
      side: 'sell',
      symbol,
      qty: state.positions.get(symbol)!.qty,
      max_slippage_bps: MAX_SLIPPAGE_BPS,
    }));
}

await runBars({
  onHello(state) {
    nextRebalance = Math.max(SLOW_BARS, state.warmupBars);
  },
  onBatch(state, batch) {
    for (const { symbol } of state.hello.symbols) {
      const closes = history.get(symbol) ?? [];
      closes.push(state.close(symbol));
      history.set(symbol, closes);
    }
    if (state.warmingUp) return [];
    // Buys deferred from last batch's sells: the proceeds are in cash now.
    if (entering !== null) {
      const orders = buys(state, entering);
      entering = null;
      return orders;
    }
    // Fast exit: a sharp drop out of a held symbol sells it at once.
    const stopped = stoppedOut(state, batch.seq);
    if (stopped.length > 0) return sells(state, stopped);
    if (batch.seq < nextRebalance) return [];
    nextRebalance = batch.seq + REBALANCE_EVERY;
    const want = target(state, batch.seq);
    const out = sells(state, [...state.positions].map(([s]) => s).filter((s) => !want.includes(s)));
    if (out.length === 0) return buys(state, want);
    entering = want;
    return out;
  },
});
