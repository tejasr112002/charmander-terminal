"use client";
import { useEffect, useId, type ReactNode } from "react";
import s from "./dialogs.module.css";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}

/** Base modal: role="dialog", icon-only close button, Escape closes, click on the backdrop closes. */
export function Dialog({ title, onClose, children, testId }: Props) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={s.overlay}
      data-testid="dialog-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={s.dialog} data-testid={testId}>
        <div className={s.head}>
          <h2 id={titleId} className={s.title}>
            {title}
          </h2>
          <button type="button" className={s.close} aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className={s.body}>{children}</div>
      </div>
    </div>
  );
}
