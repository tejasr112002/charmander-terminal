"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { selectMarket, selectTicker, useStore } from "@/lib/store";
import { fmtNum, fmtPct, fmtPrice, fmtSize, fmtTimeMs, fmtUsd, roundTo } from "@/lib/format";
import type { PlaceOrderRequest, Side, Tif } from "@/lib/types";
import { calcOrder, type FormTab, type SizeUnit } from "@/components/trade/useOrderCalc";
import { ConfirmModal } from "@/components/trade/ConfirmModal";
import { ConnectModal } from "@/components/trade/ConnectModal";
import { LeverageModal } from "@/components/trade/LeverageModal";

export function OrderForm() {
  const market = useStore(selectMarket);
  const ticker = useStore(selectTicker);
  const book = useStore((s) => s.book);
  const account = useStore((s) => s.account);
  const loggedIn = useStore((s) => s.loggedIn);
  const hideConfirm = useStore((s) => s.hideConfirm);
  const clickedPrice = useStore((s) => s.clickedPrice);
  const toast = useStore((s) => s.toast);
  const symbol = useStore((s) => s.symbol);

  const [tab, setTab] = useState<FormTab>("market");
  const [side, setSide] = useState<Side>("buy");
  const [priceStr, setPriceStr] = useState("");
  const [sizeStr, setSizeStr] = useState("");
  const [unit, setUnit] = useState<SizeUnit>("base");
  const [pctStr, setPctStr] = useState("0");
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tpsl, setTpsl] = useState(false);
  const [tif, setTif] = useState<Tif>("GTC");
  const [marginMode, setMarginMode] = useState<"cross" | "isolated">("cross");
  const [levOverride, setLevOverride] = useState<number | null>(null);
  const [modal, setModal] = useState<"none" | "confirm" | "connect" | "leverage">("none");
  const [busy, setBusy] = useState(false);

  const isPerp = market?.kind === "perp";
  const pd = market?.priceDecimals ?? 2;
  const sd = market?.sizeDecimals ?? 2;
  const position = account?.positions.find((p) => p.symbol === symbol);
  const leverage = isPerp ? (levOverride ?? position?.leverage ?? 10) : 1;

  // Reset per-market state.
  useEffect(() => {
    setPriceStr("");
    setSizeStr("");
    setPctStr("0");
    setLevOverride(null);
    setUnit("base");
  }, [symbol]);
  useEffect(() => {
    if (position?.marginMode) setMarginMode(position.marginMode);
  }, [position?.marginMode]);
  // Order-book click → price input (and switch to Limit so it is used).
  useEffect(() => {
    if (!clickedPrice) return;
    setPriceStr(fmtNum(clickedPrice.value, pd, false));
    setTab((t) => (t === "market" ? "limit" : t));
  }, [clickedPrice, pd]);

  const bestBid = book?.bids[0]?.price;
  const bestAsk = book?.asks[0]?.price;
  const calc = useMemo(
    () => calcOrder({ market, ticker, account, bestBid, bestAsk, tab, side, priceStr, sizeStr, unit, leverage, loggedIn }),
    [market, ticker, account, bestBid, bestAsk, tab, side, priceStr, sizeStr, unit, leverage, loggedIn],
  );

  const applyPct = (pct: number) => {
    const p = Math.max(0, Math.min(100, pct));
    setPctStr(String(Math.round(p)));
    const size = roundTo((calc.maxSize * p) / 100, sd);
    const shown = unit === "base" ? size : roundTo(size * calc.refPrice, 2);
    setSizeStr(p === 0 ? "" : fmtNum(shown, unit === "base" ? sd : 2, false));
  };
  const onSizeChange = (v: string) => {
    setSizeStr(v);
    setPctStr("0");
  };
  const setMid = () => {
    if (calc.mid !== undefined) setPriceStr(fmtNum(calc.mid, pd, false));
    else if (calc.refPrice) setPriceStr(fmtNum(calc.refPrice, pd, false));
  };

  const req: PlaceOrderRequest | null = market
    ? {
        symbol: market.symbol,
        side,
        type: tab === "market" ? "market" : "limit",
        size: calc.size,
        ...(tab !== "market" ? { price: roundTo(Number(priceStr.replace(/,/g, "")), pd), tif, postOnly: tif === "ALO" } : {}),
        ...(isPerp ? { reduceOnly, leverage } : {}),
      }
    : null;

  const submit = async () => {
    if (!req) return;
    setBusy(true);
    try {
      const res = await api.placeOrder(req);
      if (res.ok) {
        toast(`Order submitted · ${fmtTimeMs(res.ts)}`, "ok", res.ts);
        setSizeStr("");
        setPctStr("0");
        setModal("none");
        api.account().then(useStore.getState().setAccount).catch(() => undefined);
      } else {
        toast(res.error ?? "Order rejected", "error", res.ts);
        setModal("none");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Order failed", "error");
      setModal("none");
    } finally {
      setBusy(false);
    }
  };
  const onPlace = () => {
    if (!loggedIn) return setModal("connect");
    if (calc.invalid || !req) return;
    if (hideConfirm) void submit();
    else setModal("confirm");
  };

  const sideWord = side === "buy" ? (isPerp ? "Buy / Long" : "Buy") : isPerp ? "Sell / Short" : "Sell";
  const btnCls = !loggedIn ? "connect" : calc.invalid ? "invalid" : side;
  const btnLabel = !loggedIn ? "Connect" : (calc.invalid ?? "Place Order");

  return (
    <div className="of" data-testid="order-form">
      {isPerp && (
        <div className="of-top">
          <button className={marginMode === "cross" ? "active" : ""} onClick={() => setMarginMode("cross")} data-testid="margin-cross">
            Cross
          </button>
          <button className={marginMode === "isolated" ? "active" : ""} onClick={() => setMarginMode("isolated")} data-testid="margin-isolated">
            Isolated
          </button>
          <button className="active" onClick={() => setModal("leverage")} data-testid="leverage-button">
            {leverage}x
          </button>
        </div>
      )}
      <div className="of-tabs">
        {(["market", "limit", "pro"] as FormTab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)} data-testid={`tab-${t}`}>
            {t === "market" ? "Market" : t === "limit" ? "Limit" : "Pro"}
          </button>
        ))}
      </div>
      <div className="of-side">
        <button className={`buy ${side === "buy" ? "active" : ""}`} onClick={() => setSide("buy")} data-testid="side-buy">
          Buy{isPerp ? " / Long" : ""}
        </button>
        <button className={`sell ${side === "sell" ? "active" : ""}`} onClick={() => setSide("sell")} data-testid="side-sell">
          Sell{isPerp ? " / Short" : ""}
        </button>
      </div>
      <div className="of-row">
        <span>Available to Trade</span>
        <span className="v" data-testid="available">
          {loggedIn ? `${fmtNum(calc.available, calc.availableAsset === "USDC" ? 2 : sd)} ${calc.availableAsset}` : "--"}
        </span>
      </div>
      {isPerp && (
        <div className="of-row">
          <span>Current Position</span>
          <span className="v">{position ? `${position.side === "long" ? "" : "-"}${fmtSize(position.size, sd)} ${market?.base}` : `0.00 ${market?.base ?? ""}`}</span>
        </div>
      )}
      {tab !== "market" && (
        <div className="of-field">
          <label htmlFor="price-input">Price (USDC)</label>
          <input id="price-input" data-testid="price-input" inputMode="decimal" value={priceStr} onChange={(e) => setPriceStr(e.target.value)} placeholder="0.00" />
          <button className="link" onClick={setMid} data-testid="price-mid">
            Mid
          </button>
        </div>
      )}
      <div className="of-field">
        <label htmlFor="sz-input">Size</label>
        <input id="sz-input" data-testid="sz-input" inputMode="decimal" value={sizeStr} onChange={(e) => onSizeChange(e.target.value)} placeholder="0.00" />
        <select value={unit} onChange={(e) => setUnit(e.target.value as SizeUnit)} data-testid="sz-unit" aria-label="Size unit">
          <option value="base">{market?.base ?? "—"}</option>
          <option value="quote">{market?.quote ?? "USDC"}</option>
        </select>
      </div>
      <div className="of-slider">
        <input type="range" min={0} max={100} step={1} value={Math.round(calc.pct)} onChange={(e) => applyPct(Number(e.target.value))} data-testid="pct-slider" aria-label="Size percent" />
        <div className="pct">
          <input value={pctStr} onChange={(e) => setPctStr(e.target.value)} onBlur={() => applyPct(Number(pctStr) || 0)} data-testid="pct-input" inputMode="numeric" aria-label="Percent" />
          <span className="dim">%</span>
        </div>
      </div>
      <div className="of-checks">
        {isPerp && (
          <label>
            <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} data-testid="reduce-only" /> Reduce Only
          </label>
        )}
        {isPerp && (
          <label>
            <input type="checkbox" checked={tpsl} onChange={(e) => setTpsl(e.target.checked)} data-testid="tpsl" /> Take Profit / Stop Loss
          </label>
        )}
        {tab !== "market" && (
          <label style={{ marginLeft: "auto" }}>
            TIF
            <select value={tif} onChange={(e) => setTif(e.target.value as Tif)} data-testid="tif" style={{ background: "var(--bg)", border: "1px solid var(--border-2)", borderRadius: 3, color: "var(--text)", padding: "1px 4px" }}>
              <option value="GTC">GTC</option>
              <option value="IOC">IOC</option>
              <option value="ALO">ALO</option>
            </select>
          </label>
        )}
      </div>
      <button className={`of-submit ${btnCls}`} onClick={onPlace} disabled={busy || (loggedIn && !!calc.invalid)} data-testid="place-order" data-invalid-reason={calc.invalid ?? ""} data-side={side}>
        {busy ? "Submitting…" : btnLabel}
      </button>
      <div className="of-info">
        <div className="of-row">
          <span>Order Value</span>
          <span className="v" data-testid="order-value">{calc.size > 0 ? fmtUsd(calc.notional) : "N/A"}</span>
        </div>
        {isPerp && (
          <>
            <div className="of-row">
              <span>Liquidation Price</span>
              <span className="v" data-testid="liq-price">{calc.size > 0 && calc.liqPrice ? fmtPrice(calc.liqPrice, pd) : "N/A"}</span>
            </div>
            <div className="of-row">
              <span>Margin Required</span>
              <span className="v" data-testid="margin-required">{calc.size > 0 ? fmtUsd(calc.marginRequired) : "N/A"}</span>
            </div>
            <div className="of-row">
              <span>Slippage</span>
              <span className="v">{tab === "market" ? "Est: 0% / Max: 8.00%" : "N/A"}</span>
            </div>
          </>
        )}
        <div className="of-row">
          <span>Fees</span>
          <span className="v" data-testid="fees">
            {fmtPct(calc.feeTaker, 4)} / {fmtPct(calc.feeMaker, 4)}
          </span>
        </div>
      </div>
      {modal === "confirm" && req && market && (
        <ConfirmModal req={req} market={market} notional={calc.notional} busy={busy} onConfirm={submit} onClose={() => setModal("none")} />
      )}
      {modal === "connect" && <ConnectModal onClose={() => setModal("none")} />}
      {modal === "leverage" && market && (
        <LeverageModal market={market} leverage={leverage} marginMode={marginMode} onApplied={setLevOverride} onClose={() => setModal("none")} />
      )}
      <span hidden data-testid="side-word">{sideWord}</span>
    </div>
  );
}
