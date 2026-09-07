/**
 * Price simulation: every market random-walks every 250 ms, with a 15-level book,
 * random trade prints, and 1m/5m/1h candles aggregated from ticks.
 * Emits: "tick" (all markets updated), "trade" (Trade), "candle" ({symbol, interval, candle}).
 */
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { BookLevel, Candle, Market, OrderBook, Ticker, Trade } from "../lib/types";
import { ROOT, clamp, gauss, newId, roundTo } from "./util";

export const TICK_MS = 250;
export const BOOK_LEVELS = 15;
export const INTERVALS: Record<string, number> = { "1m": 60_000, "5m": 300_000, "1h": 3_600_000 };
export const SEED_PATH = path.join(ROOT, "data", "seed.json");

export interface SeedFile {
  markets: Market[];
  candles: Record<string, Candle[]>;
}

const spot = (base: string, price: number, pd: number, sd: number, vol: number): Market => ({
  symbol: `${base}/USDC`, kind: "spot", base, quote: "USDC", priceDecimals: pd, sizeDecimals: sd,
  minNotionalUsd: 10, seedPrice: price, volume24hUsd: vol,
});
const perp = (base: string, price: number, pd: number, sd: number, lev: number, vol: number): Market => ({
  symbol: `${base}-USDC`, kind: "perp", base, quote: "USDC", priceDecimals: pd, sizeDecimals: sd,
  minNotionalUsd: 10, maxLeverage: lev, seedPrice: price, volume24hUsd: vol,
});

/** Used when data/seed.json is missing (and by seed.ts when the network is down). */
export const FALLBACK_MARKETS: Market[] = [
  spot("HYPE", 44.2, 3, 2, 180e6),
  spot("BTC", 111_500, 0, 5, 95e6),
  spot("ETH", 4_300, 1, 4, 40e6),
  spot("SOL", 205, 2, 2, 25e6),
  spot("PURR", 0.21, 5, 0, 3e6),
  spot("USDT", 1.0002, 4, 2, 60e6),
  perp("BTC", 111_500, 0, 5, 40, 3.2e9),
  perp("ETH", 4_300, 1, 4, 25, 1.8e9),
  perp("HYPE", 44.2, 3, 2, 10, 600e6),
  perp("SOL", 205, 2, 2, 20, 500e6),
];

/** Per-tick volatility, roughly 0.02% for majors, near-zero for stables. */
export function tickVolatility(m: Market): number {
  if (m.base === "USDT" || m.base === "USDC") return 0.00002;
  if (m.base === "PURR") return 0.0004;
  if (m.base === "HYPE" || m.base === "SOL") return 0.00025;
  return 0.00015;
}

/** Random-walk `count` candles ending at `endPrice`, last bucket = current bucket. */
export function synthesizeCandles(endPrice: number, intervalMs: number, count: number, tickVol: number, decimals: number): Candle[] {
  const vol = tickVol * Math.sqrt(intervalMs / TICK_MS);
  const closes: number[] = new Array<number>(count);
  closes[count - 1] = endPrice;
  for (let i = count - 1; i > 0; i--) closes[i - 1] = closes[i] / (1 + gauss() * vol);
  const lastBucket = Math.floor(Date.now() / intervalMs) * intervalMs;
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const o = i === 0 ? closes[0] / (1 + gauss() * vol) : closes[i - 1];
    const c = closes[i];
    const wick = Math.abs(gauss()) * vol * 0.6;
    out.push({
      t: lastBucket - (count - 1 - i) * intervalMs,
      o: roundTo(o, decimals), h: roundTo(Math.max(o, c) * (1 + wick), decimals),
      l: roundTo(Math.min(o, c) * (1 - wick), decimals), c: roundTo(c, decimals),
      v: roundTo(Math.abs(gauss()) * 1000 + 100, 2),
    });
  }
  return out;
}

export function loadSeed(): { seed: SeedFile; source: "file" | "fallback" } {
  if (existsSync(SEED_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(SEED_PATH, "utf8")) as Partial<SeedFile>;
      if (Array.isArray(raw.markets) && raw.markets.length > 0) {
        return { seed: { markets: raw.markets, candles: raw.candles ?? {} }, source: "file" };
      }
    } catch { /* fall through */ }
  }
  return { seed: { markets: FALLBACK_MARKETS, candles: {} }, source: "fallback" };
}

export interface MarketState {
  market: Market;
  price: number;
  mark: number;
  open24h: number;
  volume24hUsd: number;
  bids: BookLevel[];
  asks: BookLevel[];
  trades: Trade[];
  candles: Record<string, Candle[]>;
  vol: number;
  fundingRate?: number;
  openInterestUsd?: number;
}

export class MarketSim extends EventEmitter {
  readonly states = new Map<string, MarketState>();
  private timer: NodeJS.Timeout | null = null;
  private tradeTimers: NodeJS.Timeout[] = [];

  constructor(seed: SeedFile) {
    super();
    for (const m of seed.markets) {
      const vol = tickVolatility(m);
      const candles: Record<string, Candle[]> = {};
      for (const [iv, ms] of Object.entries(INTERVALS)) {
        const fromSeed = seed.candles[m.symbol];
        candles[iv] = iv === "1h" && fromSeed && fromSeed.length > 0
          ? fromSeed.map((c) => ({ ...c }))
          : synthesizeCandles(m.seedPrice, ms, iv === "1h" ? 168 : 300, vol, m.priceDecimals);
      }
      const dayAgo = Date.now() - 86_400_000;
      const c24 = [...candles["1h"]].reverse().find((c) => c.t <= dayAgo);
      const st: MarketState = {
        market: m, price: m.seedPrice, mark: m.seedPrice,
        open24h: c24 ? c24.c : m.seedPrice * (1 + gauss() * 0.03),
        volume24hUsd: m.volume24hUsd, bids: [], asks: [], trades: [], candles, vol,
      };
      if (m.kind === "perp") {
        st.fundingRate = roundTo(0.0000125 + gauss() * 0.00001, 8);
        st.openInterestUsd = roundTo(m.volume24hUsd * (0.4 + Math.random() * 0.4), 0);
      }
      this.buildBook(st);
      this.states.set(m.symbol, st);
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    for (const st of this.states.values()) this.scheduleTrade(st);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const t of this.tradeTimers) clearTimeout(t);
    this.tradeTimers = [];
  }

  get(symbol: string): MarketState | undefined {
    return this.states.get(symbol);
  }

  list(): Market[] {
    return [...this.states.values()].map((s) => s.market);
  }

  ticker(symbol: string): Ticker | undefined {
    const st = this.states.get(symbol);
    if (!st) return undefined;
    const t: Ticker = {
      symbol, last: st.price, mark: st.mark,
      change24hPct: roundTo(((st.price - st.open24h) / st.open24h) * 100, 3),
      volume24hUsd: roundTo(st.volume24hUsd, 0), ts: Date.now(),
    };
    if (st.market.kind === "perp") {
      t.fundingRate = st.fundingRate;
      t.openInterestUsd = st.openInterestUsd;
    }
    return t;
  }

  book(symbol: string): OrderBook | undefined {
    const st = this.states.get(symbol);
    if (!st) return undefined;
    return { symbol, bids: st.bids.map((l) => ({ ...l })), asks: st.asks.map((l) => ({ ...l })), ts: Date.now() };
  }

  trades(symbol: string, limit = 50): Trade[] {
    const st = this.states.get(symbol);
    return st ? st.trades.slice(-limit).reverse() : [];
  }

  candles(symbol: string, interval: string, limit = 500): Candle[] {
    const st = this.states.get(symbol);
    const c = st?.candles[interval];
    return c ? c.slice(-limit) : [];
  }

  private tick(): void {
    const now = Date.now();
    for (const st of this.states.values()) {
      const m = st.market;
      const next = st.price * (1 + gauss() * st.vol);
      // Weak pull back toward the seed price so a 12-hour run does not drift to silly levels.
      const pulled = next + (m.seedPrice - next) * 0.00005;
      st.price = roundTo(Math.max(pulled, 10 ** -m.priceDecimals), m.priceDecimals);
      st.mark = st.price;
      this.buildBook(st);
      this.updateCandles(st, st.price, 0, now);
    }
    this.emit("tick", now);
  }

  private buildBook(st: MarketState): void {
    const m = st.market;
    const tick = 10 ** -m.priceDecimals;
    const lot = 10 ** -m.sizeDecimals;
    const halfSpread = Math.max(tick / 2, st.price * 0.0001);
    const step = Math.max(tick, st.price * 0.00012);
    const levelUsd = clamp(m.volume24hUsd / 5000, 200, 60_000);
    const bestAsk = Math.max(Math.ceil((st.price + halfSpread) / tick) * tick, st.price + tick / 2);
    const bestBid = Math.min(Math.floor((st.price - halfSpread) / tick) * tick, st.price - tick / 2);
    const mk = (base: number, dir: 1 | -1): BookLevel[] => {
      const out: BookLevel[] = [];
      for (let i = 0; i < BOOK_LEVELS; i++) {
        const price = roundTo(base + dir * Math.round((i * step) / tick) * tick, m.priceDecimals);
        if (price <= 0) break;
        const usd = levelUsd * (0.3 + Math.random() * 1.5) * (1 + i * 0.12);
        const size = Math.max(lot, roundTo(usd / price, m.sizeDecimals));
        out.push({ price, size });
      }
      return out;
    };
    st.asks = mk(roundTo(bestAsk, m.priceDecimals), 1);
    st.bids = mk(roundTo(bestBid, m.priceDecimals), -1);
  }

  private updateCandles(st: MarketState, price: number, volume: number, now: number): void {
    for (const [iv, ms] of Object.entries(INTERVALS)) {
      const bucket = Math.floor(now / ms) * ms;
      const arr = st.candles[iv];
      let c = arr[arr.length - 1];
      if (!c || c.t !== bucket) {
        c = { t: bucket, o: price, h: price, l: price, c: price, v: 0 };
        arr.push(c);
        if (arr.length > 2000) arr.splice(0, arr.length - 2000);
      } else {
        c.h = Math.max(c.h, price);
        c.l = Math.min(c.l, price);
        c.c = price;
      }
      c.v = roundTo(c.v + volume, 6);
      this.emit("candle", { symbol: st.market.symbol, interval: iv, candle: { ...c } });
    }
  }

  private scheduleTrade(st: MarketState): void {
    const t = setTimeout(() => {
      this.printTrade(st);
      this.tradeTimers = this.tradeTimers.filter((x) => x !== t);
      if (this.timer) this.scheduleTrade(st);
    }, 500 + Math.random() * 2500);
    this.tradeTimers.push(t);
  }

  private printTrade(st: MarketState): void {
    const m = st.market;
    const side = Math.random() < 0.5 ? "buy" : "sell";
    const level = side === "buy" ? st.asks[0] : st.bids[0];
    if (!level) return;
    const size = Math.max(10 ** -m.sizeDecimals, roundTo(level.size * (0.05 + Math.random() * 0.6), m.sizeDecimals));
    const trade: Trade = { id: newId("t"), symbol: m.symbol, price: level.price, size, side, ts: Date.now() };
    st.trades.push(trade);
    if (st.trades.length > 200) st.trades.splice(0, st.trades.length - 200);
    st.volume24hUsd += size * level.price;
    this.updateCandles(st, level.price, size, trade.ts);
    this.emit("trade", trade);
  }
}
