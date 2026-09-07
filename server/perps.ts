/** Perp position maths: margin, unrealized PnL, liquidation price. */
import type { Position } from "../lib/types";
import type { MarketSim } from "./markets";
import { roundTo } from "./util";
import type { PositionState } from "./exchange";

const FALLBACK_MAX_LEVERAGE = 50;

export function positionMargin(p: PositionState): number {
  return p.marginMode === "isolated" ? p.isolatedMarginUsd : (p.size * p.entryPrice) / p.leverage;
}

function markOf(sim: MarketSim, p: PositionState): number {
  return sim.get(p.symbol)?.mark ?? p.entryPrice;
}

/** Maintenance margin rate = 1 / (2 * maxLeverage), as on Hyperliquid. */
function maintenanceRate(sim: MarketSim, symbol: string): number {
  return 1 / (2 * (sim.get(symbol)?.market.maxLeverage ?? FALLBACK_MAX_LEVERAGE));
}

export function unrealizedPnl(sim: MarketSim, p: PositionState): number {
  return (markOf(sim, p) - p.entryPrice) * p.size * (p.side === "long" ? 1 : -1);
}

/**
 * liq = mark - side * marginAvailable / size / (1 - mm * side)
 * isolated: marginAvailable = isolatedMargin + uPnL - mm * notional
 * cross:    marginAvailable = (USDC + all uPnL) - sum(mm_i * notional_i)
 */
export function positionView(sim: MarketSim, p: PositionState, all: PositionState[], usdcTotal: number): Position {
  const mark = markOf(sim, p);
  const mm = maintenanceRate(sim, p.symbol);
  const s = p.side === "long" ? 1 : -1;
  const upnl = unrealizedPnl(sim, p);
  const marginAvail = p.marginMode === "isolated"
    ? p.isolatedMarginUsd + upnl - mm * p.size * mark
    : usdcTotal + all.reduce((acc, q) => acc + unrealizedPnl(sim, q), 0)
      - all.reduce((acc, q) => acc + maintenanceRate(sim, q.symbol) * q.size * markOf(sim, q), 0);
  const liq = mark - (s * marginAvail) / p.size / (1 - mm * s);
  const pd = sim.get(p.symbol)?.market.priceDecimals ?? 2;
  return {
    symbol: p.symbol, side: p.side, size: p.size, entryPrice: p.entryPrice, markPrice: mark,
    leverage: p.leverage, marginMode: p.marginMode, unrealizedPnlUsd: roundTo(upnl, 2),
    liquidationPrice: roundTo(Math.max(0, liq), pd), marginUsd: roundTo(positionMargin(p), 2), updatedAt: p.updatedAt,
  };
}
