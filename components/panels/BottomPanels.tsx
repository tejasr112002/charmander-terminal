"use client";
import { useEffect, useState } from "react";
import type { Fill } from "@/lib/types";
import { useStore } from "@/lib/store";
import { apiGet, pickArray } from "./api";
import { BalancesTable } from "./BalancesTable";
import { PositionsTable } from "./PositionsTable";
import { OpenOrdersTable } from "./OpenOrdersTable";
import { TradeHistoryTable } from "./TradeHistoryTable";
import { OrderHistoryTable } from "./OrderHistoryTable";
import { LedgerTable } from "./LedgerTable";
import { EmptyState } from "./EmptyState";
import s from "./panels.module.css";

export type PanelTab =
  | "balances"
  | "positions"
  | "openOrders"
  | "twap"
  | "chase"
  | "tradeHistory"
  | "fundingHistory"
  | "orderHistory"
  | "ledger";

const TABS: { id: PanelTab; label: string }[] = [
  { id: "balances", label: "Balances" },
  { id: "positions", label: "Positions" },
  { id: "openOrders", label: "Open Orders" },
  { id: "twap", label: "TWAP" },
  { id: "chase", label: "Chase" },
  { id: "tradeHistory", label: "Trade History" },
  { id: "fundingHistory", label: "Funding History" },
  { id: "orderHistory", label: "Order History" },
];

interface Props {
  /** Portfolio page adds "Deposits and Withdrawals". */
  showLedger?: boolean;
  initialTab?: PanelTab;
}

/** Polls GET /api/fills; fills feed Trade History, Order History and the Balances PNL column. */
function useFills(pollMs = 3000): Fill[] {
  const [fills, setFills] = useState<Fill[]>([]);
  const accountTs = useStore((st) => st.account?.ts);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await apiGet("/api/fills");
      if (alive && res.ok) setFills(pickArray<Fill>(res.data, "fills", "items"));
    };
    void load();
    const id = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs, accountTs]);
  return fills;
}

export function BottomPanels({ showLedger = false, initialTab = "balances" }: Props) {
  const [tab, setTab] = useState<PanelTab>(initialTab);
  const [hideSmall, setHideSmall] = useState(false);
  const account = useStore((st) => st.account);
  const connState = useStore((st) => st.connState);
  const connection = connState === "open" ? "online" : connState === "closed" ? "offline" : "reconnecting";
  const fills = useFills();

  const balanceCount = account ? account.balances.filter((b) => b.asset === "USDC" || b.total > 0).length : 0;
  const positionCount = account?.positions.length ?? 0;
  const openOrderCount = account?.openOrders.length ?? 0;
  const tabs = showLedger ? [...TABS, { id: "ledger" as PanelTab, label: "Deposits and Withdrawals" }] : TABS;

  const label = (t: PanelTab, base: string) => {
    if (t === "balances") return `${base} (${balanceCount})`;
    if (t === "positions" && positionCount) return `${base} (${positionCount})`;
    if (t === "openOrders" && openOrderCount) return `${base} (${openOrderCount})`;
    return base;
  };

  return (
    <section className={s.panel} data-testid="bottom-panels" data-active-tab={tab}>
      <div className={s.tabs} role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`${s.tab} ${tab === t.id ? s.tabActive : ""}`}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
          >
            {label(t.id, t.label)}
          </button>
        ))}
        <div className={s.tabsRight}>
          {connection !== "online" && (
            <span className={`${s.conn} ${connection === "reconnecting" ? s.connReconnecting : ""}`} data-testid="connection-badge">
              {connection === "reconnecting" ? "Reconnecting…" : "Offline"}
            </span>
          )}
          {tab === "balances" && (
            <label className={s.checkbox}>
              <input type="checkbox" checked={hideSmall} onChange={(e) => setHideSmall(e.target.checked)} data-testid="hide-small-balances" />
              Hide Small Balances
            </label>
          )}
        </div>
      </div>
      <div role="tabpanel" data-testid={`panel-${tab}`} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {tab === "balances" && <BalancesTable fills={fills} hideSmall={hideSmall} />}
        {tab === "positions" && <PositionsTable />}
        {tab === "openOrders" && <OpenOrdersTable />}
        {tab === "twap" && <EmptyState text="No TWAP orders yet" testId="twap-empty" />}
        {tab === "chase" && <EmptyState text="No chase orders yet" testId="chase-empty" />}
        {tab === "tradeHistory" && <TradeHistoryTable fills={fills} />}
        {tab === "fundingHistory" && <EmptyState text="No funding history yet" testId="funding-history-empty" />}
        {tab === "orderHistory" && <OrderHistoryTable fills={fills} />}
        {tab === "ledger" && <LedgerTable />}
      </div>
    </section>
  );
}

export default BottomPanels;
