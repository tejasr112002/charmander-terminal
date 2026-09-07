"use client";
import { useState } from "react";
import { Dialog } from "./Dialog";
import { closeDialog, showToast } from "./dialogStore";
import { apiPost } from "@/components/panels/api";
import { useStore } from "@/lib/store";
import { fmtNum } from "@/components/panels/format";
import s from "./dialogs.module.css";

type Wallet = "Perps" | "Spot";

/** Perps ⇄ Spot transfer. The mock exchange keeps one USDC pool, so the POST only writes a ledger row. */
export function TransferDialog() {
  const account = useStore((st) => st.account);
  const available = account?.balances.find((b) => b.asset === "USDC")?.available ?? 0;
  const [from, setFrom] = useState<Wallet>("Perps");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const to: Wallet = from === "Perps" ? "Spot" : "Perps";
  const amt = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(amt) && amt > 0 && amt <= available;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    const res = await apiPost("/api/transfer", { amount: amt, direction: from === "Spot" ? "spotToPerp" : "perpToSpot" });
    setBusy(false);
    showToast({ kind: "success", title: `Transferred ${fmtNum(amt, 2)} USDC`, detail: `${from} → ${to}`, serverTs: res.ts });
    closeDialog();
  }

  return (
    <Dialog title="Transfer USDC" onClose={closeDialog} testId="transfer-dialog">
      <div className={s.field}>
        <div className={s.label}>
          <span>From</span>
        </div>
        <div className={s.static} data-testid="transfer-from">
          <span>{from}</span>
          <span className={s.muted}>USDC</span>
        </div>
      </div>
      <button type="button" className={s.swap} aria-label="Swap direction" onClick={() => setFrom(to)} data-testid="transfer-swap">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M5 2v12M5 14l-3-3M5 14l3-3M11 14V2M11 2L8 5M11 2l3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className={s.field}>
        <div className={s.label}>
          <span>To</span>
        </div>
        <div className={s.static} data-testid="transfer-to">
          <span>{to}</span>
          <span className={s.muted}>USDC</span>
        </div>
      </div>
      <div className={s.field}>
        <div className={s.label}>
          <span>Amount</span>
          <button type="button" className={s.link} onClick={() => setAmount(available.toFixed(2))}>
            MAX: {fmtNum(available, 2)} USDC
          </button>
        </div>
        <div className={s.inputWrap}>
          <input
            className={s.input}
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            aria-label="Amount"
            data-testid="transfer-amount"
            autoFocus
          />
          <span className={s.muted}>USDC</span>
        </div>
      </div>
      <button type="button" className={s.primary} disabled={!valid || busy} onClick={submit} data-testid="transfer-submit">
        {busy ? "Transferring…" : amount.trim() === "" ? "Enter an Amount" : amt > available ? "Insufficient Balance" : "Transfer"}
      </button>
    </Dialog>
  );
}
