"use client";
import { useEffect, useState } from "react";
import { useDialogStore } from "./dialogStore";
import { DepositDialog } from "./DepositDialog";
import { WithdrawDialog } from "./WithdrawDialog";
import { TransferDialog } from "./TransferDialog";

/**
 * Host for the Deposit / Withdraw / Transfer dialogs. Mount once in app/layout.tsx.
 * Safe to mount more than once: only the first mounted host renders.
 */
export function Dialogs() {
  const open = useDialogStore((s) => s.open);
  const [isPrimary, setPrimary] = useState(false);
  useEffect(() => {
    const st = useDialogStore.getState();
    const n = st.registerHost();
    setPrimary(n === 1);
    return () => st.unregisterHost();
  }, []);
  if (!isPrimary) return null;
  return (
    <>
      {open === "deposit" && <DepositDialog />}
      {open === "withdraw" && <WithdrawDialog />}
      {open === "transfer" && <TransferDialog />}
    </>
  );
}

export default Dialogs;
export { openDeposit, openWithdraw, openTransfer, closeDialog, showToast, useDialogs } from "./dialogStore";
