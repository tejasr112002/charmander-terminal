"use client";
import { useState } from "react";
import { Dialog } from "./Dialog";
import { closeDialog, showToast } from "./dialogStore";
import { apiPost } from "@/components/panels/api";
import { useStore } from "@/lib/store";
import { fmtNum } from "@/components/panels/format";
import s from "./dialogs.module.css";

const FEE_USD = 0.2;
const FEE_HYPE = 0.00005;
const MIN_USD = 0.4;

export function WithdrawDialog() {
  const account = useStore((st) => st.account);
  const available = account?.balances.find((b) => b.asset === "USDC")?.available ?? 0;
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amt = Number(amount);
  const hasAmount = amount.trim() !== "" && Number.isFinite(amt) && amt > 0;
  const addressOk = /^0x[0-9a-fA-F]{40}$/.test(address.trim());
  const tooSmall = hasAmount && amt < MIN_USD;
  const tooLarge = hasAmount && amt > available;
  const receive = hasAmount ? Math.max(0, amt - FEE_USD) : 0;

  let label = "Enter a Recipient";
  if (addressOk) label = !hasAmount ? "Enter an Amount" : tooSmall ? `Minimum $${MIN_USD.toFixed(2)}` : tooLarge ? "Insufficient Balance" : `Withdraw ${fmtNum(amt, 2)} USDC`;
  const canSubmit = addressOk && hasAmount && !tooSmall && !tooLarge && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const res = await apiPost("/api/withdraw", { amount: amt, address: address.trim() });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Withdrawal failed");
      return;
    }
    showToast({ kind: "success", title: `Withdrew ${fmtNum(amt, 2)} USDC`, detail: `To ${address.trim().slice(0, 10)}… on Arbitrum`, serverTs: res.ts });
    closeDialog();
  }

  return (
    <Dialog title="Withdraw USDC on Arbitrum" onClose={closeDialog} testId="withdraw-dialog">
      <div className={s.field}>
        <div className={s.label}>
          <span>You withdraw</span>
        </div>
        <div className={s.static}>
          <span>USDC</span>
          <span className={s.muted}>on Arbitrum</span>
        </div>
      </div>
      <div className={s.field}>
        <div className={s.label}>
          <span>Amount</span>
          <button type="button" className={s.link} onClick={() => setAmount(available.toFixed(2))} data-testid="withdraw-max">
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
            data-testid="withdraw-amount"
          />
          <span className={s.muted}>USDC</span>
        </div>
        <div className={`${s.label}`}>
          <span>Min ${MIN_USD.toFixed(2)}</span>
        </div>
      </div>
      <div className={s.field}>
        <div className={s.label}>
          <span>To</span>
        </div>
        <div className={s.inputWrap}>
          <input
            className={s.input}
            placeholder="0x..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            aria-label="Recipient address"
            data-testid="withdraw-address"
            autoFocus
          />
        </div>
      </div>
      <div className={s.rows}>
        <div className={s.row}>
          <span className={s.muted}>You will receive</span>
          <span className={s.mono} data-testid="withdraw-receive">{fmtNum(receive, 2)} USDC</span>
        </div>
        <div className={s.row}>
          <span className={s.muted}>Fee</span>
          <span className={s.mono} data-testid="withdraw-fee">${FEE_USD.toFixed(2)} + ~{FEE_HYPE} HYPE</span>
        </div>
        <div className={s.row}>
          <span className={s.muted}>Processing time</span>
          <span data-testid="withdraw-processing-time">~20 sec</span>
        </div>
      </div>
      {error && <div className={s.error} role="alert">{error}</div>}
      <button type="button" className={s.primary} disabled={!canSubmit} onClick={submit} data-testid="withdraw-submit">
        {busy ? "Withdrawing…" : label}
      </button>
    </Dialog>
  );
}
