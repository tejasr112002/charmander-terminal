"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { MarketHeader } from "@/components/trade/MarketHeader";
import { Chart } from "@/components/trade/Chart";
import { BookTradesPanel } from "@/components/trade/BookTradesPanel";
import { OrderForm } from "@/components/trade/OrderForm";
import BottomPanels from "@/components/panels/BottomPanels";

export function TradePage({ symbol }: { symbol: string }) {
  const setSymbol = useStore((s) => s.setSymbol);
  useEffect(() => {
    setSymbol(symbol);
  }, [symbol, setSymbol]);

  return (
    <main className="trade" data-testid="trade-page">
      <div className="trade-grid">
        <div className="panel trade-header">
          <MarketHeader />
        </div>
        <div className="panel trade-chart">
          <Chart />
        </div>
        <div className="panel trade-mid">
          <BookTradesPanel />
        </div>
        <div className="panel trade-form">
          <OrderForm />
        </div>
      </div>
      <div className="trade-bottom">
        <BottomPanels />
      </div>
    </main>
  );
}
