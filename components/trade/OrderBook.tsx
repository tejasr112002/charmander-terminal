"use client";
/**
 * Order book, Hyperliquid style: asks stacked above a Spread row (best ask nearest the
 * spread), bids below. Each row: Price / Size / Total with a depth bar. Rows carry
 * data-order-book-row="true" so a tester can find them.
 */
import { useEffect, useMemo, useState } from "react";
import { selectMarket, useStore } from "@/lib/store";
import { fmtNum, fmtPrice, fmtSize } from "@/lib/format";
import type { BookLevel } from "@/lib/types";

const ROWS = 11;

interface Row extends BookLevel {
  total: number;
}

function aggregate(levels: BookLevel[], tick: number, side: "bid" | "ask"): BookLevel[] {
  if (tick <= 0) return levels;
  const out = new Map<number, number>();
  for (const l of levels) {
    const k = side === "bid" ? Math.floor(l.price / tick + 1e-9) * tick : Math.ceil(l.price / tick - 1e-9) * tick;
    const key = Number(k.toFixed(10));
    out.set(key, (out.get(key) ?? 0) + l.size);
  }
  return [...out.entries()].map(([price, size]) => ({ price, size }));
}

function withTotals(levels: BookLevel[]): Row[] {
  let total = 0;
  return levels.slice(0, ROWS).map((l) => {
    total += l.size;
    return { ...l, total };
  });
}

export function OrderBook() {
  const book = useStore((s) => s.book);
  const market = useStore(selectMarket);
  const clickPrice = useStore((s) => s.clickPrice);
  const pd = market?.priceDecimals ?? 2;
  const sd = market?.sizeDecimals ?? 2;
  const [aggMul, setAggMul] = useState(1);
  const [unit, setUnit] = useState<"base" | "quote">("base");
  const [renderedAt, setRenderedAt] = useState(0);
  useEffect(() => setRenderedAt(Date.now()), [book]);

  const tick = Math.pow(10, -pd) * aggMul;
  const { asks, bids, maxTotal, spread, spreadPct } = useMemo(() => {
    const a = withTotals(aggregate(book?.asks ?? [], tick, "ask"));
    const b = withTotals(aggregate(book?.bids ?? [], tick, "bid"));
    const maxTotal = Math.max(a[a.length - 1]?.total ?? 0, b[b.length - 1]?.total ?? 0, 1e-9);
    const bestAsk = a[0]?.price;
    const bestBid = b[0]?.price;
    const spread = bestAsk !== undefined && bestBid !== undefined ? bestAsk - bestBid : undefined;
    const spreadPct = spread !== undefined && bestAsk ? (spread / ((bestAsk + bestBid!) / 2)) * 100 : undefined;
    return { asks: a, bids: b, maxTotal, spread, spreadPct };
  }, [book, tick]);

  const showSize = (l: Row, v: number) => (unit === "base" ? fmtSize(v, sd) : fmtNum(v * l.price, 0));
  const base = market?.base ?? "";
  const quote = market?.quote ?? "USDC";

  const renderRow = (l: Row, side: "ask" | "bid") => (
    <div
      key={`${side}-${l.price}`}
      className={`ob-row ${side}`}
      data-order-book-row="true"
      data-side={side}
      data-price={l.price}
      data-size={l.size}
      data-server-ts={book?.ts ?? ""}
      data-client-ts={renderedAt || ""}
      onClick={() => clickPrice(l.price)}
    >
      <span className="px">{fmtPrice(l.price, pd)}</span>
      <span>{showSize(l, l.size)}</span>
      <span>{showSize(l, l.total)}</span>
      <div className="bar" style={{ width: `${Math.min(100, (l.total / maxTotal) * 100)}%` }} />
    </div>
  );

  return (
    <div className="ob" data-testid="order-book" data-server-ts={book?.ts ?? ""} data-client-ts={renderedAt || ""}>
      <div className="ob-controls">
        <select value={aggMul} onChange={(e) => setAggMul(Number(e.target.value))} aria-label="Aggregation" data-testid="book-agg">
          {[1, 2, 5, 10, 100].map((m) => (
            <option key={m} value={m}>
              {fmtNum(Math.pow(10, -pd) * m, Math.max(0, pd - Math.floor(Math.log10(m))), false)}
            </option>
          ))}
        </select>
        <div className="unit">
          <button className={unit === "base" ? "active" : ""} onClick={() => setUnit("base")}>
            {base}
          </button>
          <button className={unit === "quote" ? "active" : ""} onClick={() => setUnit("quote")}>
            {quote}
          </button>
        </div>
      </div>
      <div className="ob-head">
        <span>Price</span>
        <span>Size ({unit === "base" ? base : quote})</span>
        <span>Total ({unit === "base" ? base : quote})</span>
      </div>
      {!book ? (
        <div className="empty">Waiting for book…</div>
      ) : (
        <>
          <div className="ob-side asks">{[...asks].reverse().map((l) => renderRow(l, "ask"))}</div>
          <div className="ob-spread" data-testid="spread">
            <span>Spread</span>
            <span>{spread !== undefined ? fmtPrice(spread, pd) : "--"}</span>
            <span>{spreadPct !== undefined ? `${fmtNum(spreadPct, 3, false)}%` : "--"}</span>
          </div>
          <div className="ob-side bids">{bids.map((l) => renderRow(l, "bid"))}</div>
        </>
      )}
    </div>
  );
}
