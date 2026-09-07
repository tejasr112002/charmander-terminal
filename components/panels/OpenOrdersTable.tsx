"use client";
import { useState } from "react";
import type { Order } from "@/lib/types";
import { useStore } from "@/lib/store";
import { showToast } from "@/components/dialogs/dialogStore";
import { apiPost } from "./api";
import { EmptyState } from "./EmptyState";
import { directionLabel, fmtNum, fmtTime, fmtUsd, orderTypeLabel, priceDecimals, sizeDecimals } from "./format";
import s from "./panels.module.css";

export function OpenOrdersTable() {
  const account = useStore((st) => st.account);
  const markets = useStore((st) => st.markets);
  const [busy, setBusy] = useState<string | null>(null);
  const renderTs = Date.now();
  const orders = account?.openOrders ?? [];
  if (orders.length === 0) return <EmptyState text="No open orders yet" testId="open-orders-empty" />;

  async function cancel(o: Order) {
    setBusy(o.id);
    const res = await apiPost("/api/cancel", { orderId: o.id });
    setBusy(null);
    if (!res.ok) showToast({ kind: "error", title: "Cancel failed", detail: res.error, serverTs: res.ts });
    else showToast({ kind: "success", title: `Cancelled ${o.symbol} order`, detail: `Order ${o.id}`, serverTs: res.ts });
  }

  async function cancelAll() {
    setBusy("*");
    const res = await apiPost("/api/cancel-all");
    setBusy(null);
    if (!res.ok) showToast({ kind: "error", title: "Cancel all failed", detail: res.error, serverTs: res.ts });
    else showToast({ kind: "success", title: "Cancelled all orders", serverTs: res.ts });
  }

  return (
    <div className={s.scroll}>
      <table className={s.table} data-testid="open-orders-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Type</th>
            <th>Market</th>
            <th>Direction</th>
            <th>Size</th>
            <th>Original Size</th>
            <th>Order Value</th>
            <th>Price</th>
            <th>Reduce Only</th>
            <th>Trigger Conditions</th>
            <th>TP/SL</th>
            <th>
              <button type="button" className={`${s.link} ${s.headLink}`} onClick={cancelAll} disabled={busy !== null} data-testid="cancel-all">
                Cancel All
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const pd = priceDecimals(markets, o.symbol);
            const sd = sizeDecimals(markets, o.symbol);
            const remaining = o.size - o.filled;
            const price = o.price ?? 0;
            const dir = directionLabel(markets, o.symbol, o.side, o.reduceOnly);
            return (
              <tr key={o.id} data-server-ts={o.updatedAt} data-client-ts={renderTs} data-order-id={o.id} data-symbol={o.symbol} data-testid="open-order-row">
                <td data-col="time">{fmtTime(o.createdAt)}</td>
                <td className={s.text}>{orderTypeLabel(o)}</td>
                <td className={s.text}>{o.symbol}</td>
                <td className={`${s.text} ${o.side === "buy" ? s.green : s.red}`} data-col="direction">
                  {dir}
                </td>
                <td data-col="size">{fmtNum(remaining, sd)}</td>
                <td data-col="originalSize">{fmtNum(o.size, sd)}</td>
                <td data-col="orderValue">{o.price ? fmtUsd(remaining * price) : "--"}</td>
                <td data-col="price">{o.price ? fmtNum(price, pd) : "Market"}</td>
                <td className={s.text}>{o.reduceOnly ? "Yes" : "No"}</td>
                <td className={`${s.text} ${s.muted}`}>N/A</td>
                <td className={`${s.text} ${s.muted}`}>--</td>
                <td className={s.text}>
                  <button type="button" className={s.link} onClick={() => cancel(o)} disabled={busy !== null} data-testid="cancel-order">
                    {busy === o.id ? "Cancelling…" : "Cancel"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
