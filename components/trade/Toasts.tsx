"use client";
import { useStore } from "@/lib/store";

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  if (!toasts.length) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.kind}`}
          data-testid="toast"
          data-kind={t.kind}
          data-server-ts={t.serverTs || ""}
          data-client-ts={t.clientTs}
          role="status"
        >
          <span className="t">{t.text}</span>
          <button className="x" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
