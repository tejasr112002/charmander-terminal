/**
 * Global dialog state. Any component (e.g. the trade page nav) can call
 * openDeposit() / openWithdraw() / openTransfer() without props; <Dialogs /> renders them.
 * Toasts go through the main store's `toast()` so the layout's <Toasts /> shows them.
 */
import { create } from "zustand";
import { useStore } from "@/lib/store";

export type DialogKind = "deposit" | "withdraw" | "transfer";

export interface ToastInput {
  kind: "success" | "error" | "info";
  title: string;
  detail?: string;
  /** Server time (ms) that produced this result, when known. */
  serverTs?: number;
}

interface DialogState {
  open: DialogKind | null;
  /** Number of mounted <Dialogs /> hosts; only the first one renders. */
  hosts: number;
  setOpen: (kind: DialogKind | null) => void;
  registerHost: () => number;
  unregisterHost: () => void;
}

export const useDialogStore = create<DialogState>()((set, get) => ({
  open: null,
  hosts: 0,
  setOpen: (kind) => set({ open: kind }),
  registerHost: () => {
    const n = get().hosts + 1;
    set({ hosts: n });
    return n;
  },
  unregisterHost: () => set({ hosts: Math.max(0, get().hosts - 1) }),
}));

export const openDeposit = () => useDialogStore.getState().setOpen("deposit");
export const openWithdraw = () => useDialogStore.getState().setOpen("withdraw");
export const openTransfer = () => useDialogStore.getState().setOpen("transfer");
export const closeDialog = () => useDialogStore.getState().setOpen(null);

export function showToast(t: ToastInput): void {
  const text = t.detail ? `${t.title} — ${t.detail}` : t.title;
  const kind = t.kind === "success" ? "ok" : t.kind;
  useStore.getState().toast(text, kind, t.serverTs ?? 0);
}

/** Convenience hook for components that prefer hooks over the bare functions. */
export function useDialogs() {
  const open = useDialogStore((s) => s.open);
  return { open, openDeposit, openWithdraw, openTransfer, closeDialog, showToast };
}
