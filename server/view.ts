/**
 * What the CLIENT sees. Every display-side fault is applied here, on top of the exchange truth.
 * (Matching-side faults — skipSizeRounding, skipMinNotional, postOnlyFills, cancelIgnored —
 * live in exchange.ts. Transport faults — latency, WS freeze/drop, hideMarket — live in index.ts.
 * submitDisabledMs is purely a UI fault; the server only serves it via GET /api/faults.)
 */
import type { Account, Faults, Fill, Order, Ticker } from "../lib/types";
import type { Exchange } from "./exchange";
import { roundTo } from "./util";

export function accountView(ex: Exchange, f: Faults): Account {
  const now = Date.now();
  // positionDelayMs: balances/positions come from a snapshot taken `delay` ms ago.
  const snap = ex.stateAt(f.positionDelayMs);
  const acct = ex.buildAccount(snap.balances, snap.positions, now);

  // openOrderDelayMs: freshly placed orders are not listed yet.
  let openOrders: Order[] = acct.openOrders.filter((o) => o.createdAt <= now - f.openOrderDelayMs);
  // staleOpenOrderMs: recently filled orders are still reported as open.
  if (f.staleOpenOrderMs > 0) {
    const stale = ex.allOrders()
      .filter((o) => o.status === "filled" && o.updatedAt > now - f.staleOpenOrderMs)
      .map((o) => ({ ...o, status: "open" as const, filled: 0 }));
    openOrders = [...openOrders, ...stale].sort((a, b) => a.createdAt - b.createdAt);
  }

  // entryPriceErrorPct / liqPriceErrorPct: shown off by a fraction.
  const positions = acct.positions.map((p) => ({
    ...p,
    entryPrice: roundTo(p.entryPrice * (1 + f.entryPriceErrorPct), 6),
    liquidationPrice: roundTo(p.liquidationPrice * (1 + f.liqPriceErrorPct), 6),
  }));

  // balanceIgnoresFees: USDC shown as if no trading fee had ever been charged.
  const balances = acct.balances.map((b) => {
    if (!f.balanceIgnoresFees || b.asset !== "USDC") return b;
    const fees = snap.feesPaidUsd;
    return { ...b, total: roundTo(b.total + fees, 8), available: roundTo(b.available + fees, 8), usdValue: roundTo(b.usdValue + fees, 2) };
  });

  // equityDriftUsd: portfolio total disagrees with the balances.
  const equityUsd = roundTo(acct.equityUsd + f.equityDriftUsd + (f.balanceIgnoresFees ? snap.feesPaidUsd : 0), 2);
  return { ...acct, balances, positions, openOrders, equityUsd, ts: now };
}

/** displayedFeeRate: fee shown on fills uses the wrong rate; the charged fee stays correct. */
export function fillView(fill: Fill, f: Faults): Fill {
  if (f.displayedFeeRate === null) return fill;
  return { ...fill, feeUsd: roundTo(fill.price * fill.size * f.displayedFeeRate, 8) };
}

/** flipChangeSign: 24h change with the wrong sign. */
export function tickerView(t: Ticker, f: Faults): Ticker {
  return f.flipChangeSign ? { ...t, change24hPct: -t.change24hPct } : t;
}

/**
 * Order-form preview (what the form would show for value/fee). Applies orderValueMultiplier
 * and displayedFeeRate so the UI can render the "wrong" numbers straight from the server.
 */
export function previewView(
  input: { notionalUsd: number; feeRate: number; estPrice: number },
  f: Faults,
): { orderValueUsd: number; feeUsd: number; feeRate: number; estPrice: number } {
  const feeRate = f.displayedFeeRate ?? input.feeRate;
  const orderValueUsd = roundTo(input.notionalUsd * f.orderValueMultiplier, 2);
  return { orderValueUsd, feeUsd: roundTo(orderValueUsd * feeRate, 4), feeRate, estPrice: input.estPrice };
}
