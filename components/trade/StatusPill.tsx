"use client";
import { useStore } from "@/lib/store";

export function StatusPill() {
  const state = useStore((s) => s.connState);
  const attempt = useStore((s) => s.reconnectAttempt);
  const connectedAt = useStore((s) => s.connectedAt);
  const label =
    state === "open" ? "Online" : state === "reconnecting" ? `Reconnecting…${attempt > 1 ? ` (${attempt})` : ""}` : state === "connecting" ? "Connecting…" : "Offline";
  return (
    <div className={`status ${state}`} data-testid="status-pill" data-conn-state={state} data-connected-at={connectedAt ?? ""}>
      <i /> {label}
    </div>
  );
}
