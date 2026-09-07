/**
 * Pure order-form maths: size/notional from the typed value, max size, fees, validation.
 * Kept outside the component so it stays readable and easy to unit-test.
 */
import { FEE_RATES, type Account, type Market, type Side, type Ticker } from "@/lib/types";
import { availableOf } from "@/lib/store";
import { floorTo, parseNum } from "@/lib/format";

export type FormTab = "market" | "limit" | "pro";
export type SizeUnit = "base" | "quote";

export interface CalcInput {
  market: Market | undefined;
  ticker: Ticker | undefined;
  account: Account | null;
  bestBid?: number;
  bestAsk?: number;
  tab: FormTab;
  side: Side;
  priceStr: string;
  sizeStr: string;
  unit: SizeUnit;
  leverage: number;
  loggedIn: boolean;
}

export interface Calc {
  refPrice: number; // price used for notional (limit price or mark/last)
  mid: number | undefined;
  size: number; // base units, rounded to sizeDecimals
  notional: number; // USD
  available: number; // in `availableAsset`
  availableAsset: string;
  maxSize: number; // base units
  pct: number; // 0..100 of max
  feeTaker: number;
  feeMaker: number;
  marginRequired: number;
  liqPrice: number | undefined;
  /** null when the order can be placed; otherwise the button label. */
  invalid: string | null;
}

export function calcOrder(i: CalcInput): Calc {
  const m = i.market;
  const sd = m?.sizeDecimals ?? 2;
  const isPerp = m?.kind === "perp";
  const last = i.ticker?.last ?? m?.seedPrice ?? 0;
  const mark = i.ticker?.mark ?? last;
  const mid = i.bestBid !== undefined && i.bestAsk !== undefined ? (i.bestBid + i.bestAsk) / 2 : undefined;
  const limitPrice = parseNum(i.priceStr);
  const isLimit = i.tab !== "market";
  const refPrice = isLimit && Number.isFinite(limitPrice) && limitPrice > 0 ? limitPrice : isPerp ? mark : last;

  const typed = parseNum(i.sizeStr);
  let size = 0;
  if (Number.isFinite(typed) && typed > 0) {
    size = i.unit === "base" ? typed : refPrice > 0 ? typed / refPrice : 0;
    size = floorTo(size, sd);
  }
  const notional = size * refPrice;

  // What can be spent.
  let availableAsset = m?.quote ?? "USDC";
  let available = availableOf(i.account, availableAsset);
  let maxSize = 0;
  if (isPerp) {
    maxSize = refPrice > 0 ? floorTo((available * i.leverage) / refPrice, sd) : 0;
  } else if (i.side === "buy") {
    maxSize = refPrice > 0 ? floorTo(available / refPrice, sd) : 0;
  } else {
    availableAsset = m?.base ?? "";
    available = availableOf(i.account, availableAsset);
    maxSize = floorTo(available, sd);
  }
  const pct = maxSize > 0 ? Math.min(100, Math.max(0, (size / maxSize) * 100)) : 0;

  const marginRequired = isPerp ? (i.leverage > 0 ? notional / i.leverage : notional) : notional;
  const mmr = m?.maxLeverage ? 1 / (2 * m.maxLeverage) : 0.02;
  const liqPrice =
    isPerp && refPrice > 0 && i.leverage > 0
      ? i.side === "buy"
        ? refPrice * (1 - 1 / i.leverage + mmr)
        : refPrice * (1 + 1 / i.leverage - mmr)
      : undefined;

  let invalid: string | null = null;
  if (!i.loggedIn) invalid = "Connect";
  else if (!m) invalid = "Loading…";
  else if (isLimit && !(Number.isFinite(limitPrice) && limitPrice > 0)) invalid = "Enter a price";
  else if (!(Number.isFinite(typed) && typed > 0) || size <= 0) invalid = "Enter a size";
  else if (notional < (m.minNotionalUsd ?? 10)) invalid = `Below $${m.minNotionalUsd ?? 10} minimum`;
  else if (isPerp ? marginRequired > available + 1e-9 : i.side === "buy" ? notional > available + 1e-9 : size > available + 1e-9)
    invalid = "Insufficient Balance";

  return {
    refPrice,
    mid,
    size,
    notional,
    available,
    availableAsset,
    maxSize,
    pct,
    feeTaker: FEE_RATES.taker,
    feeMaker: FEE_RATES.maker,
    marginRequired,
    liqPrice,
    invalid,
  };
}
