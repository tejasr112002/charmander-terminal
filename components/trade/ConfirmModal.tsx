"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { fmtPrice, fmtSize, fmtUsd } from "@/lib/format";
import type { Market, PlaceOrderRequest } from "@/lib/types";

export function ConfirmModal({
  req,
  market,
  notional,
  busy,
  onConfirm,
  onClose,
}: {
  req: PlaceOrderRequest;
  market: Market;
  notional: number;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const hideConfirm = useStore((s) => s.hideConfirm);
  const setHideConfirm = useStore((s) => s.setHideConfirm);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const action = `${req.side === "buy" ? "Buy" : "Sell"} ${market.symbol} · ${req.type === "market" ? "Market" : `Limit ${req.tif ?? "GTC"}`}`;
  return (
    <div className="overlay" onClick={onClose} data-testid="confirm-modal">
      <div className="modal modal-wrap" onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3>Confirm Order</h3>
        <div className="rows">
          <div className="row">
            <span>Action</span>
            <span className={`v ${req.side === "buy" ? "up" : "down"}`}>{action}</span>
          </div>
          <div className="row">
            <span>Size</span>
            <span className="v">
              {fmtSize(req.size, market.sizeDecimals)} {market.base}
            </span>
          </div>
          <div className="row">
            <span>Price</span>
            <span className="v">{req.type === "market" ? "Market" : fmtPrice(req.price, market.priceDecimals)}</span>
          </div>
          <div className="row">
            <span>Est. Value</span>
            <span className="v">{fmtUsd(notional)}</span>
          </div>
          {req.reduceOnly && (
            <div className="row">
              <span>Reduce Only</span>
              <span className="v">Yes</span>
            </div>
          )}
        </div>
        <label className="of-checks" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={hideConfirm} onChange={(e) => setHideConfirm(e.target.checked)} data-testid="dont-show-again" />
          <span>Don&apos;t show this again</span>
        </label>
        <div className="actions">
          <button className="btn-ghost btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={req.side === "buy" ? "btn-buy" : "btn-sell"} onClick={onConfirm} disabled={busy} data-testid="confirm-order">
            {busy ? "Submitting…" : req.side === "buy" ? "Buy" : "Sell"}
          </button>
        </div>
      </div>
    </div>
  );
}
