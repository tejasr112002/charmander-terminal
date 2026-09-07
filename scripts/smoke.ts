#!/usr/bin/env tsx
/**
 * Smoke test against a running terminal (TERMINAL_URL, default http://localhost:3100).
 * Prints PASS/FAIL per check. Exit code 1 if anything failed.
 *
 * Checks:
 *   1. /api/markets has at least 6 markets
 *   2. /api/account has 10000 USDC on a fresh start
 *   3. clean faults: a $50 market buy of HYPE/USDC fills, HYPE balance appears within 1 s
 *   4. positionDelayMs=5000: HYPE appears in /api/_truth at once but in /api/account only after >= 4.5 s
 *   5. faults reset
 *
 * ORDER_PATH overrides the order endpoint (default /api/order).
 */
import { DEFAULT_FAULTS, START_BALANCE_USDC, type Account, type Market, type PlaceOrderRequest, type PlaceOrderResponse } from "../lib/types";
import { BASE, getJson, putFaults, sendJson } from "./_client";

const ORDER_PATH = process.env.ORDER_PATH ?? "/api/order";
const SYMBOL = "HYPE/USDC";
const NOTIONAL_USD = 50;

let failed = 0;
function report(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hypeTotal = (a: Account) => a.balances.find((b) => b.asset === "HYPE")?.total ?? 0;

async function placeHypeBuy(markets: Market[]): Promise<PlaceOrderResponse> {
  const m = markets.find((x) => x.symbol === SYMBOL);
  if (!m) throw new Error(`${SYMBOL} not in /api/markets`);
  const ticker = await getJson<{ last: number }>(`/api/ticker/${encodeURIComponent(SYMBOL)}`).catch(() => null);
  const px = ticker?.last ?? m.seedPrice;
  const raw = NOTIONAL_USD / px;
  const factor = 10 ** m.sizeDecimals;
  const size = Math.ceil(raw * factor) / factor; // round up so we stay >= $50
  const body: PlaceOrderRequest = { symbol: SYMBOL, side: "buy", type: "market", size, tif: "IOC" };
  return sendJson<PlaceOrderResponse>("POST", ORDER_PATH, body);
}

/** Poll until pred(account) is true or timeout. Returns elapsed ms, or -1 on timeout. */
async function waitFor(path: string, pred: (a: Account) => boolean, timeoutMs: number, stepMs = 100): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const a = await getJson<Account>(path);
    if (pred(a)) return Date.now() - start;
    await sleep(stepMs);
  }
  return -1;
}

async function main() {
  console.log(`Smoke test against ${BASE}\n`);

  // Always start clean.
  await putFaults(DEFAULT_FAULTS);

  // 1. markets
  const markets = await getJson<Market[]>("/api/markets");
  report("/api/markets has >= 6 markets", markets.length >= 6, `${markets.length} markets`);

  // 2. fresh balance
  const acct0 = await getJson<Account>("/api/account");
  const usdc = acct0.balances.find((b) => b.asset === "USDC")?.total ?? 0;
  report(`/api/account has ${START_BALANCE_USDC} USDC on fresh start`, usdc === START_BALANCE_USDC, `USDC ${usdc}${usdc !== START_BALANCE_USDC ? " - restart the server for a fresh account" : ""}`);
  const hypeBefore = hypeTotal(acct0);

  // 3. clean fill shows within 1 s
  const r1 = await placeHypeBuy(markets);
  report("$50 market buy HYPE/USDC fills (clean)", r1.ok && (r1.fills?.length ?? 0) > 0, r1.ok ? `${r1.fills?.length ?? 0} fill(s)` : r1.error ?? "not ok");
  const t1 = await waitFor("/api/account", (a) => hypeTotal(a) > hypeBefore, 3000);
  report("HYPE balance appears in /api/account within 1 s (clean)", t1 >= 0 && t1 <= 1000, t1 < 0 ? "never appeared in 3 s" : `${t1} ms`);
  const hypeMid = t1 >= 0 ? hypeTotal(await getJson<Account>("/api/account")) : hypeBefore;

  // 4. delayed position
  await putFaults({ positionDelayMs: 5000 });
  const sent = Date.now();
  const r2 = await placeHypeBuy(markets);
  report("$50 market buy HYPE/USDC fills (positionDelayMs=5000)", r2.ok && (r2.fills?.length ?? 0) > 0, r2.ok ? `${r2.fills?.length ?? 0} fill(s)` : r2.error ?? "not ok");
  const truth = await getJson<Account>("/api/_truth");
  report("/api/_truth shows the new HYPE immediately", hypeTotal(truth) > hypeMid, `truth HYPE ${hypeTotal(truth)} vs before ${hypeMid}`);
  const early = await getJson<Account>("/api/account");
  report("/api/account does NOT show it yet", hypeTotal(early) <= hypeMid, `account HYPE ${hypeTotal(early)}`);
  const tWait = await waitFor("/api/account", (a) => hypeTotal(a) > hypeMid, 9000, 100);
  const elapsed = tWait < 0 ? -1 : Date.now() - sent;
  report("/api/account shows it only after >= 4.5 s", elapsed >= 4500, elapsed < 0 ? "never appeared in 9 s" : `${elapsed} ms after order`);

  // 5. reset
  const after = await putFaults(DEFAULT_FAULTS);
  report("faults reset", after.positionDelayMs === 0);

  console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("ERROR", e instanceof Error ? e.message : e);
  try { await putFaults(DEFAULT_FAULTS); } catch { /* server may be down */ }
  process.exit(1);
});
