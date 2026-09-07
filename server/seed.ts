/**
 * Pull real prices from Hyperliquid's public API and write data/seed.json.
 * Falls back to a built-in list (and synthetic candles) when the network is unavailable.
 * Run: pnpm seed
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Candle, Market } from "../lib/types";
import { FALLBACK_MARKETS, SEED_PATH, synthesizeCandles, tickVolatility, type SeedFile } from "./markets";
import { clamp } from "./util";

const API = "https://api.hyperliquid.xyz/info";
/** Our display name -> Hyperliquid spot token names to try (bridged assets carry a U prefix). */
const SPOT: Record<string, string[]> = {
  HYPE: ["HYPE"], BTC: ["UBTC", "BTC"], ETH: ["UETH", "ETH"], SOL: ["USOL", "SOL"], PURR: ["PURR"], USDT: ["USDT0", "USDT"],
};
const PERPS = ["BTC", "ETH", "HYPE", "SOL"];

interface SpotMeta { tokens: { name: string; index: number; szDecimals: number }[]; universe: { name: string; tokens: [number, number]; index: number }[] }
interface SpotCtx { coin?: string; midPx?: string; markPx?: string; dayNtlVlm?: string; prevDayPx?: string }
interface PerpMeta { universe: { name: string; szDecimals: number; maxLeverage: number }[] }
interface PerpCtx { midPx?: string; markPx?: string; dayNtlVlm?: string; openInterest?: string; funding?: string }
interface HlCandle { t: number; o: string; h: string; l: string; c: string; v: string }

async function info<T>(body: unknown): Promise<T> {
  const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${API}`);
  return (await res.json()) as T;
}

/** Hyperliquid prices carry 5 significant figures, capped by the market's max decimals. */
function priceDecimals(price: number, maxDecimals: number): number {
  const intDigits = Math.floor(Math.log10(price)) + 1;
  return clamp(5 - intDigits, 0, maxDecimals);
}

async function candles(coin: string): Promise<Candle[]> {
  const endTime = Date.now();
  const startTime = endTime - 7 * 86_400_000;
  const raw = await info<HlCandle[]>({ type: "candleSnapshot", req: { coin, interval: "1h", startTime, endTime } });
  return raw.map((c) => ({ t: c.t, o: Number(c.o), h: Number(c.h), l: Number(c.l), c: Number(c.c), v: Number(c.v) }));
}

async function fromHyperliquid(): Promise<SeedFile> {
  const [spotMeta, spotCtxs] = await info<[SpotMeta, SpotCtx[]]>({ type: "spotMetaAndAssetCtxs" });
  const [perpMeta, perpCtxs] = await info<[PerpMeta, PerpCtx[]]>({ type: "metaAndAssetCtxs" });
  const markets: Market[] = [];
  const candleMap: Record<string, Candle[]> = {};

  for (const [base, names] of Object.entries(SPOT)) {
    let hit: { pair: SpotMeta["universe"][number]; ctx: SpotCtx; token: SpotMeta["tokens"][number] } | undefined;
    for (const name of names) {
      const token = spotMeta.tokens.find((t) => t.name === name);
      if (!token) continue;
      const pair = spotMeta.universe.find((u) => u.tokens[0] === token.index && spotMeta.tokens[u.tokens[1]]?.name === "USDC");
      // Contexts are keyed by `coin` (the pair name), not by array position.
      const ctx = pair && spotCtxs.find((c) => c.coin === pair.name);
      if (pair && ctx) { hit = { pair, ctx, token }; break; }
    }
    if (!hit) { console.warn(`spot ${base}/USDC not found on Hyperliquid; using fallback entry`); markets.push(FALLBACK_MARKETS.find((m) => m.symbol === `${base}/USDC`)!); continue; }
    const price = Number(hit.ctx.midPx ?? hit.ctx.markPx ?? 0) || FALLBACK_MARKETS.find((m) => m.symbol === `${base}/USDC`)!.seedPrice;
    markets.push({
      symbol: `${base}/USDC`, kind: "spot", base, quote: "USDC",
      priceDecimals: priceDecimals(price, 8 - hit.token.szDecimals), sizeDecimals: hit.token.szDecimals,
      minNotionalUsd: 10, seedPrice: price, volume24hUsd: Math.round(Number(hit.ctx.dayNtlVlm ?? 0)),
    });
    candleMap[`${base}/USDC`] = await candles(hit.pair.name);
    console.log(`spot ${base}/USDC <- ${hit.token.name} (${hit.pair.name}) @ ${price}`);
  }

  for (const base of PERPS) {
    const i = perpMeta.universe.findIndex((u) => u.name === base);
    if (i < 0) { console.warn(`perp ${base} not found; using fallback entry`); markets.push(FALLBACK_MARKETS.find((m) => m.symbol === `${base}-USDC`)!); continue; }
    const u = perpMeta.universe[i];
    const ctx = perpCtxs[i];
    const price = Number(ctx.midPx ?? ctx.markPx ?? 0) || FALLBACK_MARKETS.find((m) => m.symbol === `${base}-USDC`)!.seedPrice;
    markets.push({
      symbol: `${base}-USDC`, kind: "perp", base, quote: "USDC",
      priceDecimals: priceDecimals(price, 6 - u.szDecimals), sizeDecimals: u.szDecimals,
      minNotionalUsd: 10, maxLeverage: u.maxLeverage, seedPrice: price, volume24hUsd: Math.round(Number(ctx.dayNtlVlm ?? 0)),
    });
    candleMap[`${base}-USDC`] = await candles(base);
    console.log(`perp ${base}-USDC @ ${price} (max ${u.maxLeverage}x)`);
  }
  return { markets, candles: candleMap };
}

function fallbackSeed(): SeedFile {
  const candleMap: Record<string, Candle[]> = {};
  for (const m of FALLBACK_MARKETS) candleMap[m.symbol] = synthesizeCandles(m.seedPrice, 3_600_000, 168, tickVolatility(m), m.priceDecimals);
  return { markets: FALLBACK_MARKETS, candles: candleMap };
}

async function main(): Promise<void> {
  let seed: SeedFile;
  let source: string;
  try {
    seed = await fromHyperliquid();
    source = "Hyperliquid API";
  } catch (e) {
    console.warn(`Could not reach Hyperliquid (${(e as Error).message}). Writing a plausible hardcoded seed instead.`);
    seed = fallbackSeed();
    source = "built-in fallback (network unavailable)";
  }
  mkdirSync(path.dirname(SEED_PATH), { recursive: true });
  writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2) + "\n");
  console.log(`Wrote ${SEED_PATH}: ${seed.markets.length} markets from ${source}`);
}

main().catch((e: Error) => { console.error(e); process.exit(1); });
