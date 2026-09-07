import type { Market, Order, Side } from "@/lib/types";

const pad = (n: number) => String(n).padStart(2, "0");

/** "9/3/2026 - 19:36:46" (local time, like the Hyperliquid tables). */
export function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** "$10,234.56" / "-$12.30" */
export function fmtUsd(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "--";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${n < 0 ? "-" : ""}$${abs}`;
}

/** Signed with a sign prefix: "+$12.30" / "-$12.30" */
export function fmtSignedUsd(n: number): string {
  return `${n > 0 ? "+" : ""}${fmtUsd(n)}`;
}

export function fmtNum(n: number, decimals: number): string {
  if (!Number.isFinite(n)) return "--";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPct(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "--";
  return `${n > 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

export function findMarket(markets: Market[], symbol: string): Market | undefined {
  return markets.find((m) => m.symbol === symbol);
}

/** Market for a spot asset, e.g. "HYPE" -> "HYPE/USDC". */
export function marketForAsset(markets: Market[], asset: string): Market | undefined {
  return markets.find((m) => m.kind === "spot" && m.base === asset);
}

export function priceDecimals(markets: Market[], symbol: string): number {
  return findMarket(markets, symbol)?.priceDecimals ?? 2;
}

export function sizeDecimals(markets: Market[], symbol: string): number {
  return findMarket(markets, symbol)?.sizeDecimals ?? 4;
}

export function isPerpSymbol(markets: Market[], symbol: string): boolean {
  const m = findMarket(markets, symbol);
  return m ? m.kind === "perp" : symbol.includes("-");
}

/** Hyperliquid wording: spot shows Buy/Sell, perps show Long/Short (Close Long/Close Short when reduce-only). */
export function directionLabel(markets: Market[], symbol: string, side: Side, reduceOnly?: boolean): string {
  if (!isPerpSymbol(markets, symbol)) return side === "buy" ? "Buy" : "Sell";
  if (reduceOnly) return side === "buy" ? "Close Short" : "Close Long";
  return side === "buy" ? "Long" : "Short";
}

export function orderTypeLabel(o: Pick<Order, "type" | "tif" | "postOnly">): string {
  if (o.type === "market") return "Market";
  if (o.postOnly || o.tif === "ALO") return "Limit (Post Only)";
  if (o.tif === "IOC") return "Limit (IOC)";
  return "Limit";
}

export function statusLabel(s: Order["status"]): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function coinOf(symbol: string): string {
  return symbol.split(/[/-]/)[0] ?? symbol;
}
