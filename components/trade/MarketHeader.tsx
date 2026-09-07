"use client";
import { useEffect, useState } from "react";
import { selectMarket, selectTicker, useStore } from "@/lib/store";
import { fmtCompactUsd, fmtFunding, fmtPct, fmtPrice } from "@/lib/format";
import { MarketSelector } from "@/components/trade/MarketSelector";

export function MarketHeader() {
  const market = useStore(selectMarket);
  const ticker = useStore(selectTicker);
  const symbol = useStore((s) => s.symbol);
  const [open, setOpen] = useState(false);
  const [cd, setCd] = useState("");
  useEffect(() => {
    setCd(countdown());
    const id = setInterval(() => setCd(countdown()), 1000);
    return () => clearInterval(id);
  }, []);
  const pd = market?.priceDecimals ?? 2;
  const isPerp = market?.kind === "perp";
  const chg = ticker?.change24hPct;
  const chgCls = chg === undefined ? "" : chg >= 0 ? "up" : "down";
  const last = ticker?.last ?? market?.seedPrice;
  const abs = last !== undefined && chg !== undefined ? (last * chg) / 100 / (1 + chg / 100) : undefined;

  return (
    <div className="mh">
      <div style={{ position: "relative" }}>
        <button
          className="mh-selector"
          data-testid="market-selector"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="icon">{(market?.base ?? symbol).slice(0, 2)}</span>
          <span>{symbol}</span>
          {market && <span className="mh-kind">{isPerp ? "Perp" : "Spot"}</span>}
          <span className="chev">{open ? "▲" : "▼"}</span>
        </button>
        {open && <MarketSelector onClose={() => setOpen(false)} />}
      </div>
      <div className="mh-stats">
        <div className="mh-stat">
          <span className="l">Price</span>
          <span className={`v big ${chgCls}`} data-testid="last-price">
            {fmtPrice(last, pd)}
          </span>
        </div>
        <div className="mh-stat">
          <span className="l">24h Change</span>
          <span className={`v ${chgCls}`} data-testid="change-24h">
            {abs !== undefined ? `${abs >= 0 ? "+" : ""}${fmtPrice(abs, pd)} / ` : ""}
            {fmtPct(chg, 2, true)}
          </span>
        </div>
        <div className="mh-stat">
          <span className="l">24h Volume</span>
          <span className="v" data-testid="volume-24h">
            {fmtCompactUsd(ticker?.volume24hUsd ?? market?.volume24hUsd)}
          </span>
        </div>
        {isPerp && (
          <>
            <div className="mh-stat">
              <span className="l">Mark</span>
              <span className="v">{fmtPrice(ticker?.mark, pd)}</span>
            </div>
            <div className="mh-stat">
              <span className="l">Oracle</span>
              <span className="v">{fmtPrice(ticker?.mark, pd)}</span>
            </div>
            <div className="mh-stat">
              <span className="l">Open Interest</span>
              <span className="v">{fmtCompactUsd(ticker?.openInterestUsd)}</span>
            </div>
            <div className="mh-stat">
              <span className="l">Funding / Countdown</span>
              <span className="v">
                <span className={(ticker?.fundingRate ?? 0) >= 0 ? "up" : "down"}>{fmtFunding(ticker?.fundingRate)}</span>
                <span className="dim"> {cd}</span>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function countdown(): string {
  const now = new Date();
  const m = 59 - now.getMinutes();
  const s = 59 - now.getSeconds();
  return `00:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
