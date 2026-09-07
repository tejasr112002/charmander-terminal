"use client";
import type { Fill } from "@/lib/types";
import { useStore } from "@/lib/store";
import { EmptyState } from "./EmptyState";
import { directionLabel, fmtNum, fmtTime, fmtUsd, priceDecimals, sizeDecimals } from "./format";
import s from "./panels.module.css";

/**
 * Closed PNL per fill: for perps, a fill that reduces a position realizes (fill - entry) * size.
 * We only know the entry price of the current position, so we use it when the fill is on the closing side.
 */
export function TradeHistoryTable({ fills }: { fills: Fill[] }) {
  const markets = useStore((st) => st.markets);
  const account = useStore((st) => st.account);
  const renderTs = Date.now();
  if (fills.length === 0) return <EmptyState text="No trades yet" testId="trade-history-empty" />;
  const sorted = [...fills].sort((a, b) => b.ts - a.ts);

  return (
    <div className={s.scroll}>
      <table className={s.table} data-testid="trade-history-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Market</th>
            <th>Direction</th>
            <th>Price</th>
            <th>Size</th>
            <th>Trade Value</th>
            <th>Fee</th>
            <th>Closed PNL</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => {
            const pd = priceDecimals(markets, f.symbol);
            const sd = sizeDecimals(markets, f.symbol);
            const pos = account?.positions.find((p) => p.symbol === f.symbol);
            const closing = pos && ((pos.side === "long" && f.side === "sell") || (pos.side === "short" && f.side === "buy"));
            const closedPnl = closing && pos ? (pos.side === "long" ? f.price - pos.entryPrice : pos.entryPrice - f.price) * f.size : 0;
            return (
              <tr key={f.id} data-server-ts={f.ts} data-client-ts={renderTs} data-fill-id={f.id} data-order-id={f.orderId} data-symbol={f.symbol} data-testid="trade-row">
                <td data-col="time">{fmtTime(f.ts)}</td>
                <td className={s.text}>{f.symbol}</td>
                <td className={`${s.text} ${f.side === "buy" ? s.green : s.red}`} data-col="direction">
                  {directionLabel(markets, f.symbol, f.side)}
                </td>
                <td data-col="price">{fmtNum(f.price, pd)}</td>
                <td data-col="size">{fmtNum(f.size, sd)}</td>
                <td data-col="tradeValue">{fmtUsd(f.price * f.size)}</td>
                <td data-col="fee">{fmtUsd(f.feeUsd)}</td>
                <td data-col="closedPnl" className={closedPnl > 0 ? s.green : closedPnl < 0 ? s.red : s.muted}>
                  {fmtUsd(closedPnl)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
