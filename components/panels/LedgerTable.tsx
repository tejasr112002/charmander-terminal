"use client";
import { useEffect, useState } from "react";
import type { LedgerEntry } from "@/lib/types";
import { apiGet, pickArray } from "./api";
import { EmptyState } from "./EmptyState";
import { fmtNum, fmtTime, fmtUsd } from "./format";
import s from "./panels.module.css";

const ACTION_LABEL: Record<LedgerEntry["type"], string> = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  transfer: "Transfer",
  trade: "Trade",
};

/** Polls GET /api/ledger ({ ledger: LedgerEntry[] }). */
export function useLedger(pollMs = 3000): LedgerEntry[] {
  const [rows, setRows] = useState<LedgerEntry[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await apiGet("/api/ledger");
      if (alive && res.ok) setRows(pickArray<LedgerEntry>(res.data, "ledger", "entries", "items"));
    };
    void load();
    const id = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs]);
  return rows;
}

/** "Deposits and Withdrawals" tab (portfolio page). Trade rows are not money movements, so they are hidden. */
export function LedgerTable() {
  const rows = useLedger();
  const renderTs = Date.now();
  const money = rows.filter((r) => r.type !== "trade").sort((a, b) => b.ts - a.ts);
  if (money.length === 0) return <EmptyState text="No deposits or withdrawals yet" testId="ledger-empty" />;
  return (
    <div className={s.scroll}>
      <table className={s.table} data-testid="ledger-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Status</th>
            <th>Network</th>
            <th>Action</th>
            <th>Account</th>
            <th>Asset</th>
            <th>Amount</th>
            <th>Fee</th>
          </tr>
        </thead>
        <tbody>
          {money.map((r) => (
            <tr key={r.id} data-server-ts={r.ts} data-client-ts={renderTs} data-ledger-id={r.id} data-action={r.type} data-testid="ledger-row">
              <td data-col="time">{fmtTime(r.ts)}</td>
              <td className={s.text}>Completed</td>
              <td className={s.text}>{r.type === "transfer" ? "Hyperliquid" : "Arbitrum"}</td>
              <td className={`${s.text} ${r.type === "deposit" ? s.green : r.type === "withdraw" ? s.red : ""}`} title={r.note}>
                {ACTION_LABEL[r.type]}
              </td>
              <td className={s.muted}>{r.address ? `${r.address.slice(0, 6)}…${r.address.slice(-4)}` : "--"}</td>
              <td className={s.text}>{r.asset}</td>
              <td data-col="amount">{r.type === "transfer" && r.amount === 0 ? "--" : fmtNum(Math.abs(r.amount), 2)}</td>
              <td data-col="fee">{fmtUsd(r.feeUsd ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
