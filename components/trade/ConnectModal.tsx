"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";

export function ConnectModal({ onClose }: { onClose: () => void }) {
  const login = useStore((s) => s.login);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose} data-testid="connect-modal">
      <div className="modal modal-wrap" onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3>Connect</h3>
        <button
          className="opt"
          data-testid="connect-mock"
          onClick={() => {
            login();
            onClose();
          }}
        >
          <span>Connect (mock)</span>
          <span className="dim">0xMOCK…0000</span>
        </button>
        <p className="dim" style={{ marginTop: 12, marginBottom: 0 }}>
          Test wallet. No real funds. Balance starts at 10,000 USDC.
        </p>
      </div>
    </div>
  );
}
