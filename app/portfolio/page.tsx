"use client";
import { useEffect, useMemo, useState } from "react";
import type { Fill } from "@/lib/types";
import { FEE_RATES, START_BALANCE_USDC } from "@/lib/types";
import { useStore } from "@/lib/store";
import { BottomPanels } from "@/components/panels/BottomPanels";
import { Dialogs, openDeposit, openTransfer, openWithdraw } from "@/components/dialogs/Dialogs";
import { apiGet, pickArray } from "@/components/panels/api";
import { fmtPct, fmtSignedUsd, fmtUsd } from "@/components/panels/format";
import { useLedger } from "@/components/panels/LedgerTable";
import s from "./portfolio.module.css";

const HISTORY_MAX = 600;
const DAY_MS = 86_400_000;

/** Equity samples kept across renders (module-level so tab switches do not reset the chart). */
const equityHistory: { t: number; v: number }[] = [];

function pushEquity(v: number) {
  const last = equityHistory[equityHistory.length - 1];
  if (last && last.v === v && Date.now() - last.t < 1000) return;
  equityHistory.push({ t: Date.now(), v });
  if (equityHistory.length > HISTORY_MAX) equityHistory.shift();
}

function maxDrawdownPct(points: { v: number }[]): number {
  let peak = -Infinity;
  let dd = 0;
  for (const p of points) {
    peak = Math.max(peak, p.v);
    if (peak > 0) dd = Math.max(dd, ((peak - p.v) / peak) * 100);
  }
  return dd;
}

function Sparkline({ points, mode }: { points: { t: number; v: number }[]; mode: "equity" | "pnl" }) {
  const w = 600;
  const h = 220;
  const pad = 8;
  if (points.length < 2) {
    return (
      <svg className={s.chart} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" data-testid="equity-chart">
        <text x={w / 2} y={h / 2} fill="#949e9c" fontSize="14" textAnchor="middle">
          Collecting data…
        </text>
      </svg>
    );
  }
  const vals = points.map((p) => (mode === "pnl" ? p.v - points[0].v : p.v));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const up = vals[vals.length - 1] >= vals[0];
  const color = up ? "#1fa67d" : "#ef5350";
  return (
    <svg className={s.chart} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" data-testid="equity-chart" data-points={points.length}>
      <path d={`${d} L${x(points.length - 1).toFixed(1)} ${h} L${x(0).toFixed(1)} ${h} Z`} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function PortfolioPage() {
  const account = useStore((st) => st.account);
  const ledger = useLedger();
  const [fills, setFills] = useState<Fill[]>([]);
  const [chartMode, setChartMode] = useState<"equity" | "pnl">("equity");
  /** Set after mount so server and client markup match (no Date.now() during SSR). */
  const [clientTs, setClientTs] = useState<number | null>(null);

  const equity = account?.equityUsd ?? 0;
  useEffect(() => {
    if (account) pushEquity(account.equityUsd);
    setClientTs(Date.now());
  }, [account]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await apiGet("/api/fills");
      if (alive && res.ok) setFills(pickArray<Fill>(res.data, "fills", "items"));
    };
    void load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    const vol = (since: number) => fills.filter((f) => f.ts >= since).reduce((a, f) => a + f.price * f.size, 0);
    // Ledger amounts are signed (withdrawals negative), so the sum is net money moved in.
    const netDeposits = ledger.filter((r) => r.type === "deposit" || r.type === "withdraw").reduce((a, r) => a + r.amount, 0);
    return {
      volume14d: vol(now - 14 * DAY_MS),
      volumeAll: vol(0),
      pnl: account ? equity - START_BALANCE_USDC - netDeposits : 0,
      drawdown: maxDrawdownPct(equityHistory),
    };
  }, [fills, ledger, account, equity]);

  const pnlClass = stats.pnl > 0 ? s.green : stats.pnl < 0 ? s.red : "";

  return (
    <div className={s.page} data-testid="portfolio-page" data-server-ts={account?.ts ?? ""} data-client-ts={clientTs ?? ""}>
      <header className={s.header}>
        <h1 className={s.title}>Portfolio</h1>
        <div className={s.actions}>
          <button type="button" className={s.btn}>Link Staking</button>
          <button type="button" className={s.btn}>Swap Stablecoins</button>
          <button type="button" className={s.btn} onClick={openTransfer} data-testid="evm-core">EVM ⇄ Core</button>
          <button type="button" className={s.btn}>Account Type</button>
          <button type="button" className={s.btn} onClick={openWithdraw} data-testid="send">Send</button>
          <button type="button" className={s.btn} onClick={openWithdraw} data-testid="withdraw">Withdraw</button>
          <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={openDeposit} data-testid="deposit">Deposit</button>
        </div>
      </header>

      <div className={s.grid}>
        <div className={s.col}>
          <div className={s.card}>
            <div className={s.cardTitle}>14 Day Volume</div>
            <div className={`${s.big} ${s.mono}`} data-testid="volume-14d">{fmtUsd(stats.volume14d)}</div>
          </div>
          <div className={s.card}>
            <div className={s.cardTitle}>Fees (Taker / Maker)</div>
            <div className={`${s.big} ${s.mono}`} data-testid="fee-rates">
              {(FEE_RATES.taker * 100).toFixed(4)}% / {(FEE_RATES.maker * 100).toFixed(4)}%
            </div>
          </div>
          <div className={s.card}>
            <div className={s.cardTitle}>Perps + Spot + Vaults</div>
            <div className={`${s.rows} ${s.mono}`}>
              <div className={s.row}><span>PNL</span><span className={pnlClass} data-testid="pnl">{fmtSignedUsd(stats.pnl)}</span></div>
              <div className={s.row}><span>Volume</span><span data-testid="volume">{fmtUsd(stats.volumeAll)}</span></div>
              <div className={s.row}><span>Max Drawdown</span><span data-testid="max-drawdown">{fmtPct(stats.drawdown).replace("+", "")}</span></div>
              <div className={s.row}><span>Total Equity</span><span data-testid="total-equity">{account ? fmtUsd(equity) : "--"}</span></div>
              <div className={s.row}><span>Trading Equity</span><span data-testid="trading-equity">{account ? fmtUsd(equity) : "--"}</span></div>
              <div className={s.row}><span>Vault Equity</span><span data-testid="vault-equity">{fmtUsd(0)}</span></div>
              <div className={s.row}><span>Earn Balance</span><span data-testid="earn-balance">{fmtUsd(0)}</span></div>
              <div className={s.row}><span>Staking Account</span><span data-testid="staking-account">{fmtUsd(0)}</span></div>
            </div>
          </div>
        </div>
        <div className={s.card}>
          <div className={s.chartHead}>
            <div className={s.chartTabs}>
              <button type="button" className={`${s.chartTab} ${chartMode === "equity" ? s.chartTabActive : ""}`} onClick={() => setChartMode("equity")}>Account Value</button>
              <button type="button" className={`${s.chartTab} ${chartMode === "pnl" ? s.chartTabActive : ""}`} onClick={() => setChartMode("pnl")}>PNL</button>
            </div>
            <div className={s.chartTabs}>
              {["24H", "1W", "1M", "All Time"].map((r) => (
                <button key={r} type="button" className={`${s.chartTab} ${r === "All Time" ? s.chartTabActive : ""}`}>{r}</button>
              ))}
            </div>
          </div>
          <div className={`${s.big} ${s.mono}`} data-testid="chart-value">
            {chartMode === "equity" ? (account ? fmtUsd(equity) : "--") : <span className={pnlClass}>{fmtSignedUsd(stats.pnl)}</span>}
          </div>
          <Sparkline points={equityHistory} mode={chartMode} />
        </div>
      </div>

      <div className={s.panels}>
        <BottomPanels showLedger initialTab="balances" />
      </div>
      <Dialogs />
    </div>
  );
}
