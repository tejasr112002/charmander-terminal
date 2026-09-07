"use client";
import { useState } from "react";
import { Dialog } from "./Dialog";
import { closeDialog, showToast } from "./dialogStore";
import { apiPost } from "@/components/panels/api";
import s from "./dialogs.module.css";

export const MOCK_DEPOSIT_ADDRESS = "0xMOCKDEPOSIT00000000000000000000000000001";
const DEPOSIT_FEE_USD = 0.2;
const SIMULATED_AMOUNT = 100;

/** Deterministic fake QR: a 21x21 grid of squares derived from the address bytes. */
function FakeQr() {
  const n = 21;
  const cells: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const finder = (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
      const on = finder
        ? !(x % 6 === 1 || x % 6 === 5 || y % 6 === 1 || y % 6 === 5) || (x % 7 >= 2 && x % 7 <= 4 && y % 7 >= 2 && y % 7 <= 4)
        : ((x * 31 + y * 17 + MOCK_DEPOSIT_ADDRESS.charCodeAt((x + y) % MOCK_DEPOSIT_ADDRESS.length)) % 3) === 0;
      if (on) cells.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return (
    <svg className={s.qr} width="168" height="168" viewBox={`0 0 ${n} ${n}`} role="img" aria-label="Deposit address QR code" data-testid="deposit-qr">
      <path d={cells.join("")} fill="#000" />
    </svg>
  );
}

export function DepositDialog() {
  const [view, setView] = useState<"menu" | "crypto" | "fiat">("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simulate() {
    setBusy(true);
    setError(null);
    const res = await apiPost("/api/deposit", { amount: SIMULATED_AMOUNT });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Deposit failed");
      return;
    }
    showToast({ kind: "success", title: `Deposited ${SIMULATED_AMOUNT} USDC`, detail: "Arbitrum → Hyperliquid (mock)", serverTs: res.ts });
    closeDialog();
  }

  if (view === "menu") {
    return (
      <Dialog title="Deposit" onClose={closeDialog} testId="deposit-dialog">
        <button type="button" className={s.option} onClick={() => setView("crypto")} data-testid="deposit-transfer-crypto">
          <span className={s.optionTitle}>Transfer Crypto</span>
          <span className={s.muted}>Deposit USDC from Arbitrum or another exchange</span>
        </button>
        <button type="button" className={s.option} onClick={() => setView("fiat")} data-testid="deposit-buy-fiat">
          <span className={s.optionTitle}>Buy USDC with Fiat</span>
          <span className={s.muted}>Use a card or bank account</span>
        </button>
      </Dialog>
    );
  }

  if (view === "fiat") {
    return (
      <Dialog title="Buy USDC with Fiat" onClose={closeDialog} testId="deposit-dialog">
        <p className={s.muted}>Fiat on-ramps are not available in this mock terminal.</p>
        <button type="button" className={s.secondary} onClick={() => setView("menu")}>
          Back
        </button>
      </Dialog>
    );
  }

  return (
    <Dialog title="Deposit USDC from Arbitrum" onClose={closeDialog} testId="deposit-dialog">
      <p className={s.muted}>Send USDC on Arbitrum to the address below. Only USDC on Arbitrum is supported.</p>
      <div className={s.qrWrap}>
        <FakeQr />
      </div>
      <div className={`${s.address} ${s.mono}`} data-testid="deposit-address">
        <span style={{ flex: 1 }}>{MOCK_DEPOSIT_ADDRESS}</span>
        <button
          type="button"
          className={s.link}
          onClick={() => {
            void navigator.clipboard?.writeText(MOCK_DEPOSIT_ADDRESS);
            showToast({ kind: "info", title: "Address copied" });
          }}
        >
          Copy
        </button>
      </div>
      <div className={s.rows}>
        <div className={s.row}>
          <span className={s.muted}>Fee</span>
          <span className={s.mono} data-testid="deposit-fee">${DEPOSIT_FEE_USD.toFixed(2)}</span>
        </div>
        <div className={s.row}>
          <span className={s.muted}>Processing time</span>
          <span data-testid="deposit-processing-time">~2 min</span>
        </div>
      </div>
      {error && <div className={s.error} role="alert">{error}</div>}
      <button type="button" className={s.primary} disabled={busy} onClick={simulate} data-testid="deposit-simulate">
        {busy ? "Depositing…" : `Simulate deposit of ${SIMULATED_AMOUNT} USDC`}
      </button>
      <button type="button" className={s.secondary} onClick={() => setView("menu")}>
        Back
      </button>
    </Dialog>
  );
}
