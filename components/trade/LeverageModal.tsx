"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { fmtTimeMs } from "@/lib/format";
import type { Market } from "@/lib/types";

export function LeverageModal({
  market,
  leverage,
  marginMode,
  onApplied,
  onClose,
}: {
  market: Market;
  leverage: number;
  marginMode: "cross" | "isolated";
  onApplied: (lev: number) => void;
  onClose: () => void;
}) {
  const [lev, setLev] = useState(leverage);
  const [busy, setBusy] = useState(false);
  const toast = useStore((s) => s.toast);
  const max = market.maxLeverage ?? 50;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const apply = async () => {
    setBusy(true);
    try {
      const r = await api.setLeverage(market.symbol, lev, marginMode);
      if (r.ok) {
        toast(`Leverage set to ${lev}x · ${fmtTimeMs(r.ts)}`, "ok", r.ts);
        onApplied(lev);
        onClose();
      } else toast(r.error ?? "Failed to set leverage", "error", r.ts);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to set leverage", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose} data-testid="leverage-modal">
      <div className="modal modal-wrap" onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3>Adjust Leverage</h3>
        <p className="muted" style={{ margin: 0 }}>
          Control the leverage used for {market.symbol}. Max {max}x.
        </p>
        <div className="lev-grid">
          <input type="range" min={1} max={max} step={1} value={lev} onChange={(e) => setLev(Number(e.target.value))} data-testid="leverage-slider" />
          <span className="val">{lev}x</span>
        </div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={apply} disabled={busy} data-testid="leverage-confirm">
            {busy ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
