"use client";
import { useEffect, useState } from "react";
import type { Fill, Order } from "@/lib/types";
import { useStore } from "@/lib/store";
import { apiGet, pickArray } from "./api";
import { EmptyState } from "./EmptyState";
import { directionLabel, fmtNum, fmtTime, orderTypeLabel, priceDecimals, sizeDecimals, statusLabel } from "./format";
import s from "./panels.module.css";

/** Fallback when the server has no /api/orders: rebuild history from open orders + fills. */
function deriveFromFills(open: Order[], fills: Fill[]): Order[] {
  const byOrder = new Map<string, Order>();
  for (const o of open) byOrder.set(o.id, o);
  for (const f of fills) {
    if (byOrder.has(f.orderId)) continue;
    byOrder.set(f.orderId, {
      id: f.orderId,
      symbol: f.symbol,
      side: f.side,
      type: "market",
      tif: "IOC",
      price: f.price,
      size: f.size,
      filled: f.size,
      status: "filled",
      createdAt: f.ts,
      updatedAt: f.ts,
    });
  }
  return [...byOrder.values()];
}

export function OrderHistoryTable({ fills }: { fills: Fill[] }) {
  const account = useStore((st) => st.account);
  const markets = useStore((st) => st.markets);
  const [server, setServer] = useState<Order[] | null>(null);
  const renderTs = Date.now();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await apiGet("/api/orders");
      if (!alive) return;
      setServer(res.ok ? pickArray<Order>(res.data, "orders", "items") : null);
    };
    void load();
    const id = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const orders = (server ?? deriveFromFills(account?.openOrders ?? [], fills)).sort((a, b) => b.createdAt - a.createdAt);
  if (orders.length === 0) return <EmptyState text="No order history yet" testId="order-history-empty" />;

  return (
    <div className={s.scroll}>
      <table className={s.table} data-testid="order-history-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Type</th>
            <th>Market</th>
            <th>Direction</th>
            <th>Size</th>
            <th>Filled</th>
            <th>Price</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} data-server-ts={o.updatedAt} data-client-ts={renderTs} data-order-id={o.id} data-symbol={o.symbol} data-status={o.status} data-testid="order-history-row">
              <td data-col="time">{fmtTime(o.createdAt)}</td>
              <td className={s.text}>{orderTypeLabel(o)}</td>
              <td className={s.text}>{o.symbol}</td>
              <td className={`${s.text} ${o.side === "buy" ? s.green : s.red}`} data-col="direction">
                {directionLabel(markets, o.symbol, o.side, o.reduceOnly)}
              </td>
              <td data-col="size">{fmtNum(o.size, sizeDecimals(markets, o.symbol))}</td>
              <td data-col="filled">{fmtNum(o.filled, sizeDecimals(markets, o.symbol))}</td>
              <td data-col="price">{o.price ? fmtNum(o.price, priceDecimals(markets, o.symbol)) : "Market"}</td>
              <td className={`${s.text} ${o.status === "filled" ? s.green : o.status === "rejected" ? s.red : s.muted}`} data-col="status">
                {statusLabel(o.status)}
                {o.rejectReason ? ` (${o.rejectReason})` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
