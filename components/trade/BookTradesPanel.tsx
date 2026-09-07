"use client";
import { useState } from "react";
import { OrderBook } from "@/components/trade/OrderBook";
import { Trades } from "@/components/trade/Trades";

export function BookTradesPanel() {
  const [tab, setTab] = useState<"book" | "trades">("book");
  return (
    <>
      <div className="tabs">
        <button className={tab === "book" ? "active" : ""} onClick={() => setTab("book")} data-testid="order-book-tab">
          Order Book
        </button>
        <button className={tab === "trades" ? "active" : ""} onClick={() => setTab("trades")} data-testid="trades-tab">
          Trades
        </button>
      </div>
      {tab === "book" ? <OrderBook /> : <Trades />}
    </>
  );
}
