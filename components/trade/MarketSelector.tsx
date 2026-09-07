"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { symbolPath, useStore } from "@/lib/store";
import { fmtCompactUsd, fmtPct, fmtPrice } from "@/lib/format";
import type { MarketKind } from "@/lib/types";

type Tab = "all" | MarketKind;

export function MarketSelector({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const markets = useStore((s) => s.markets);
  const tickers = useStore((s) => s.tickers);
  const selected = useStore((s) => s.symbol);
  const setSymbol = useStore((s) => s.setSymbol);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onClick = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-testid=market-selector]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return markets
      .filter((m) => tab === "all" || m.kind === tab)
      .filter((m) => !needle || m.symbol.toLowerCase().includes(needle) || m.base.toLowerCase().includes(needle))
      .sort((a, b) => (tickers[b.symbol]?.volume24hUsd ?? b.volume24hUsd) - (tickers[a.symbol]?.volume24hUsd ?? a.volume24hUsd));
  }, [markets, tickers, q, tab]);

  const pick = (symbol: string) => {
    setSymbol(symbol);
    router.push(symbolPath(symbol));
    onClose();
  };

  return (
    <div className="md" ref={rootRef} role="listbox" data-testid="market-dropdown">
      <input
        ref={inputRef}
        className="md-search"
        placeholder="Search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        data-testid="market-search"
      />
      <div className="md-tabs">
        {(["all", "perp", "spot"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)} data-testid={`market-tab-${t}`}>
            {t === "all" ? "All" : t === "perp" ? "Perps" : "Spot"}
          </button>
        ))}
      </div>
      <div className="md-table">
        <table>
          <thead>
            <tr>
              <th>Market</th>
              <th>Last Price</th>
              <th>24h Change</th>
              <th>Volume</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const t = tickers[m.symbol];
              const chg = t?.change24hPct;
              return (
                <tr
                  key={m.symbol}
                  className={m.symbol === selected ? "selected" : ""}
                  onClick={() => pick(m.symbol)}
                  data-testid="market-row"
                  data-symbol={m.symbol}
                  role="option"
                  aria-selected={m.symbol === selected}
                >
                  <td className="sym">
                    {m.symbol} <span className="mh-kind">{m.kind === "perp" ? "Perp" : "Spot"}</span>
                  </td>
                  <td>{fmtPrice(t?.last ?? m.seedPrice, m.priceDecimals)}</td>
                  <td className={chg === undefined ? "" : chg >= 0 ? "up" : "down"}>{fmtPct(chg, 2, true)}</td>
                  <td>{fmtCompactUsd(t?.volume24hUsd ?? m.volume24hUsd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="md-empty">No markets found</div>}
      </div>
    </div>
  );
}
