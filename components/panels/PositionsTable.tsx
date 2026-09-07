"use client";
import { useState } from "react";
import type { PlaceOrderResponse, Position } from "@/lib/types";
import { useStore } from "@/lib/store";
import { showToast } from "@/components/dialogs/dialogStore";
import { apiPost } from "./api";
import { EmptyState } from "./EmptyState";
import { fmtNum, fmtPct, fmtSignedUsd, fmtUsd, priceDecimals, sizeDecimals } from "./format";
import s from "./panels.module.css";

async function closePosition(p: Position): Promise<PlaceOrderResponse | null> {
  const res = await apiPost<PlaceOrderResponse>("/api/order", {
    symbol: p.symbol,
    side: p.side === "long" ? "sell" : "buy",
    type: "market",
    size: p.size,
    reduceOnly: true,
  });
  if (!res.ok) {
    showToast({ kind: "error", title: `Close ${p.symbol} failed`, detail: res.error, serverTs: res.ts });
    return null;
  }
  showToast({ kind: "success", title: `Closed ${p.symbol}`, detail: `${p.side === "long" ? "Sold" : "Bought"} ${p.size} at market`, serverTs: res.ts });
  return res.data;
}

export function PositionsTable() {
  const account = useStore((st) => st.account);
  const markets = useStore((st) => st.markets);
  const tickers = useStore((st) => st.tickers);
  const [busy, setBusy] = useState<string | null>(null);
  const renderTs = Date.now();
  const positions = account?.positions ?? [];
  if (positions.length === 0) return <EmptyState text="No open positions yet" testId="positions-empty" />;

  async function closeAll() {
    setBusy("*");
    for (const p of positions) await closePosition(p);
    setBusy(null);
  }

  return (
    <div className={s.scroll}>
      <table className={s.table} data-testid="positions-table">
        <thead>
          <tr>
            <th>Market</th>
            <th>Size</th>
            <th>Position Value</th>
            <th>Entry Price</th>
            <th>Mark Price</th>
            <th>PNL (ROE %)</th>
            <th>Liq. Price</th>
            <th>Margin</th>
            <th>Funding</th>
            <th>
              <button type="button" className={`${s.link} ${s.headLink}`} onClick={closeAll} disabled={busy !== null} data-testid="close-all">
                Close All
              </button>
            </th>
            <th>TP/SL</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const pd = priceDecimals(markets, p.symbol);
            const sd = sizeDecimals(markets, p.symbol);
            const mark = tickers[p.symbol]?.mark ?? p.markPrice;
            const value = p.size * mark;
            const roe = p.marginUsd > 0 ? (p.unrealizedPnlUsd / p.marginUsd) * 100 : 0;
            const signedSize = p.side === "long" ? p.size : -p.size;
            return (
              <tr key={p.symbol} data-server-ts={p.updatedAt} data-client-ts={renderTs} data-symbol={p.symbol} data-side={p.side} data-testid="position-row">
                <td className={s.text}>
                  <span className={s.coin}>
                    {p.symbol} <span className={s.badge}>{p.leverage}x {p.marginMode}</span>
                  </span>
                </td>
                <td data-col="size" className={p.side === "long" ? s.green : s.red}>
                  {fmtNum(signedSize, sd)} {p.symbol.split("-")[0]}
                </td>
                <td data-col="positionValue">{fmtUsd(value)}</td>
                <td data-col="entryPrice">{fmtNum(p.entryPrice, pd)}</td>
                <td data-col="markPrice">{fmtNum(mark, pd)}</td>
                <td data-col="pnl" className={p.unrealizedPnlUsd >= 0 ? s.green : s.red}>
                  {fmtSignedUsd(p.unrealizedPnlUsd)} ({fmtPct(roe)})
                </td>
                <td data-col="liqPrice">{p.liquidationPrice > 0 ? fmtNum(p.liquidationPrice, pd) : "--"}</td>
                <td data-col="margin">{fmtUsd(p.marginUsd)}</td>
                <td data-col="funding">{fmtUsd(0)}</td>
                <td className={s.text}>
                  <button
                    type="button"
                    className={s.link}
                    disabled={busy !== null}
                    data-testid="close-position"
                    onClick={async () => {
                      setBusy(p.symbol);
                      await closePosition(p);
                      setBusy(null);
                    }}
                  >
                    {busy === p.symbol ? "Closing…" : "Close"}
                  </button>
                </td>
                <td className={`${s.text} ${s.muted}`}>--</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
