"use client";
import { selectMarket, useStore } from "@/lib/store";
import { fmtPrice, fmtSize, fmtTime } from "@/lib/format";

export function Trades() {
  const trades = useStore((s) => s.trades);
  const market = useStore(selectMarket);
  const pd = market?.priceDecimals ?? 2;
  const sd = market?.sizeDecimals ?? 2;
  const now = Date.now();
  return (
    <div className="ob" data-testid="trades">
      <div className="ob-head">
        <span>Price</span>
        <span>Size ({market?.base ?? ""})</span>
        <span>Time</span>
      </div>
      <div className="tr-list">
        {trades.length === 0 && <div className="empty">No trades yet</div>}
        {trades.map((t) => (
          <div
            key={t.id}
            className={`tr-row ${t.side}`}
            data-testid="trade-row"
            data-side={t.side}
            data-server-ts={t.ts}
            data-client-ts={now}
          >
            <span>{fmtPrice(t.price, pd)}</span>
            <span>{fmtSize(t.size, sd)}</span>
            <span className="time">{fmtTime(t.ts)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
