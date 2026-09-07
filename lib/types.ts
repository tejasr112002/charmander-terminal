/**
 * Shared contracts between the fake exchange (server/) and the UI (app/, components/).
 * Everything the UI shows comes from these shapes, over REST (/api/*) and WebSocket (/ws).
 */

export type Side = "buy" | "sell";
export type OrderType = "market" | "limit";
export type Tif = "GTC" | "IOC" | "ALO";
export type MarketKind = "spot" | "perp";

export interface Market {
  symbol: string; // "HYPE/USDC" (spot) or "BTC-USDC" (perp)
  kind: MarketKind;
  base: string;
  quote: string;
  priceDecimals: number; // tick = 10^-priceDecimals
  sizeDecimals: number; // lot = 10^-sizeDecimals
  minNotionalUsd: number; // 10
  maxLeverage?: number; // perps only
  /** Seeded from the real market at build time. */
  seedPrice: number;
  volume24hUsd: number;
}

export interface Ticker {
  symbol: string;
  last: number;
  mark: number;
  change24hPct: number;
  volume24hUsd: number;
  /** Perps only. */
  fundingRate?: number;
  openInterestUsd?: number;
  ts: number;
}

export interface BookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  symbol: string;
  bids: BookLevel[]; // best first
  asks: BookLevel[]; // best first
  ts: number;
}

export interface Trade {
  id: string;
  symbol: string;
  price: number;
  size: number;
  side: Side; // taker side
  ts: number;
}

export interface Candle {
  t: number; // ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: Side;
  type: OrderType;
  tif: Tif;
  price?: number; // limit
  size: number; // base units
  filled: number;
  status: "open" | "filled" | "cancelled" | "rejected";
  reduceOnly?: boolean;
  postOnly?: boolean;
  createdAt: number;
  updatedAt: number;
  rejectReason?: string;
}

export interface Fill {
  id: string;
  orderId: string;
  symbol: string;
  side: Side;
  price: number;
  size: number;
  feeUsd: number;
  ts: number;
}

export interface Position {
  symbol: string; // perp
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  marginMode: "cross" | "isolated";
  unrealizedPnlUsd: number;
  liquidationPrice: number;
  marginUsd: number;
  updatedAt: number;
}

export interface Balance {
  asset: string;
  total: number;
  available: number; // total minus holds
  usdValue: number;
}

export interface Account {
  address: string;
  balances: Balance[];
  positions: Position[];
  openOrders: Order[];
  equityUsd: number;
  /** Server time when this snapshot was produced. The UI shows it, so a tester can measure lag. */
  ts: number;
}

export interface PlaceOrderRequest {
  symbol: string;
  side: Side;
  type: OrderType;
  size: number;
  price?: number;
  tif?: Tif;
  reduceOnly?: boolean;
  postOnly?: boolean;
  leverage?: number;
}

export interface PlaceOrderResponse {
  ok: boolean;
  order?: Order;
  fills?: Fill[];
  error?: string;
  /** Server time the order was accepted. Shown in the UI toast. */
  ts: number;
}

/** WebSocket messages, server → client. Client subscribes with {type:"subscribe", channels:[...]}. */
export type WsMessage =
  | { type: "ticker"; data: Ticker }
  | { type: "book"; data: OrderBook }
  | { type: "trade"; data: Trade }
  | { type: "candle"; data: { symbol: string; interval: string; candle: Candle } }
  | { type: "account"; data: Account }
  | { type: "order"; data: Order }
  | { type: "fill"; data: Fill }
  | { type: "pong"; ts: number };

/**
 * Fault switches. The server reads faults.json on every request, so a redeploy is not needed
 * to flip one. Each is a bug we want the QA agent to catch. All default to off/0.
 */
export interface Faults {
  /** Delay before a filled order shows in positions/balances pushed over WS (ms). */
  positionDelayMs: number;
  /** Delay before a placed order appears in openOrders (ms). */
  openOrderDelayMs: number;
  /** Stop pushing order book updates after this many seconds since connect (0 = never). */
  freezeBookAfterSec: number;
  /** Stop pushing ticker updates after this many seconds since connect (0 = never). */
  freezeTickerAfterSec: number;
  /** Close the WebSocket after this many seconds (0 = never). Client should reconnect. */
  dropWsAfterSec: number;
  /** Fee rate shown in the UI (null = correct). Actual charged rate stays correct. */
  displayedFeeRate: number | null;
  /** Report filled orders as still "open" in openOrders for this long (ms). */
  staleOpenOrderMs: number;
  /** Wrong rounding: accept sizes with more decimals than sizeDecimals. */
  skipSizeRounding: boolean;
  /** Skip the min notional check (accept $3 orders). */
  skipMinNotional: boolean;
  /** Order value in the form uses this multiplier (1 = correct). */
  orderValueMultiplier: number;
  /** Position entry price shown off by this fraction (0 = correct). */
  entryPriceErrorPct: number;
  /** Liquidation price shown off by this fraction (0 = correct). */
  liqPriceErrorPct: number;
  /** Balance after a trade shown before fees are deducted. */
  balanceIgnoresFees: boolean;
  /** Cancel returns ok but the order stays open. */
  cancelIgnored: boolean;
  /** Post-only orders that would cross get filled instead of rejected. */
  postOnlyFills: boolean;
  /** Market selector search returns nothing for this symbol. */
  hideMarket: string | null;
  /** Portfolio equity differs from balances by this many USD. */
  equityDriftUsd: number;
  /** Extra HTTP latency on /api/* (ms). */
  apiLatencyMs: number;
  /** 24h change shown with the wrong sign. */
  flipChangeSign: boolean;
  /** The order-form Place button stays disabled for this long after the form is valid (ms). */
  submitDisabledMs: number;
}

export const DEFAULT_FAULTS: Faults = {
  positionDelayMs: 0,
  openOrderDelayMs: 0,
  freezeBookAfterSec: 0,
  freezeTickerAfterSec: 0,
  dropWsAfterSec: 0,
  displayedFeeRate: null,
  staleOpenOrderMs: 0,
  skipSizeRounding: false,
  skipMinNotional: false,
  orderValueMultiplier: 1,
  entryPriceErrorPct: 0,
  liqPriceErrorPct: 0,
  balanceIgnoresFees: false,
  cancelIgnored: false,
  postOnlyFills: false,
  hideMarket: null,
  equityDriftUsd: 0,
  apiLatencyMs: 0,
  flipChangeSign: false,
  submitDisabledMs: 0,
};

export const FEE_RATES = { taker: 0.00045, maker: 0.00015 };
export const START_BALANCE_USDC = 10_000;

/** One row of account history: deposits, withdrawals, transfers, trades (server-only addition). */
export interface LedgerEntry {
  id: string;
  type: "deposit" | "withdraw" | "transfer" | "trade";
  asset: string;
  /** Signed change to `asset`. Transfers are 0 (balances are unified). */
  amount: number;
  feeUsd?: number;
  address?: string;
  note?: string;
  ts: number;
}
