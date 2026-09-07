"use client";

/**
 * Fault switches admin page. Lists every fault from lib/types.ts with a matching input,
 * reads GET /api/faults on load, PUT /api/faults on Save, PUT DEFAULT_FAULTS on Reset.
 * Deliberately plain: it is a tool for planting bugs, not part of the product.
 */
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_FAULTS, type Faults } from "@/lib/types";

type FaultKey = keyof Faults;

interface Row {
  key: FaultKey;
  kind: "number" | "boolean" | "text";
  label: string;
}

const ROWS: Row[] = [
  { key: "positionDelayMs", kind: "number", label: "Delay before a fill shows in balances/positions (ms)" },
  { key: "openOrderDelayMs", kind: "number", label: "Delay before a new order shows in Open Orders (ms)" },
  { key: "staleOpenOrderMs", kind: "number", label: "Keep filled orders listed as open for (ms)" },
  { key: "freezeBookAfterSec", kind: "number", label: "Freeze order book after (seconds, 0 = never)" },
  { key: "freezeTickerAfterSec", kind: "number", label: "Freeze ticker after (seconds, 0 = never)" },
  { key: "dropWsAfterSec", kind: "number", label: "Close live connection after (seconds, 0 = never)" },
  { key: "apiLatencyMs", kind: "number", label: "Extra delay on every /api call (ms)" },
  { key: "submitDisabledMs", kind: "number", label: "Place button stays disabled after form is valid (ms)" },
  { key: "displayedFeeRate", kind: "number", label: "Fee rate shown in the form (blank = correct)" },
  { key: "orderValueMultiplier", kind: "number", label: "Order value in the form is multiplied by (1 = correct)" },
  { key: "entryPriceErrorPct", kind: "number", label: "Entry price shown off by this fraction (0.02 = 2%)" },
  { key: "liqPriceErrorPct", kind: "number", label: "Liquidation price shown off by this fraction" },
  { key: "equityDriftUsd", kind: "number", label: "Equity differs from sum of balances by (USD)" },
  { key: "skipSizeRounding", kind: "boolean", label: "Accept sizes with too many decimals" },
  { key: "skipMinNotional", kind: "boolean", label: "Accept orders under the $10 minimum" },
  { key: "balanceIgnoresFees", kind: "boolean", label: "Balance after a trade ignores fees" },
  { key: "cancelIgnored", kind: "boolean", label: "Cancel says ok but order stays open" },
  { key: "postOnlyFills", kind: "boolean", label: "Post-only orders fill instead of being rejected" },
  { key: "flipChangeSign", kind: "boolean", label: "24h change shown with the wrong sign" },
  { key: "hideMarket", kind: "text", label: "Hide this market from search (e.g. HYPE/USDC, blank = none)" },
];

function isOn(key: FaultKey, v: Faults[FaultKey]): boolean {
  if (key === "orderValueMultiplier") return v !== 1;
  return v !== null && v !== false && v !== 0 && v !== "";
}

export default function FaultsPage() {
  const [faults, setFaults] = useState<Faults | null>(null);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/faults", { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      const f = (await res.json()) as Faults;
      setFaults(f);
      const d: Record<string, string | boolean> = {};
      for (const r of ROWS) {
        const v = f[r.key];
        d[r.key] = r.kind === "boolean" ? Boolean(v) : v === null || v === undefined ? "" : String(v);
      }
      setDraft(d);
      setStatus("");
    } catch (e) {
      setStatus(`Could not load /api/faults (${e instanceof Error ? e.message : String(e)})`);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function put(body: Partial<Faults>, label: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/faults", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      await load();
      setStatus(`${label} at ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      setStatus(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function toPartial(): Partial<Faults> {
    const out: Record<string, unknown> = {};
    for (const r of ROWS) {
      const v = draft[r.key];
      if (r.kind === "boolean") out[r.key] = Boolean(v);
      else if (r.kind === "number") {
        const s = String(v ?? "").trim();
        out[r.key] = s === "" ? (r.key === "displayedFeeRate" ? null : DEFAULT_FAULTS[r.key]) : Number(s);
      } else out[r.key] = String(v ?? "").trim() === "" ? null : String(v).trim();
    }
    return out as Partial<Faults>;
  }

  const onCount = faults ? ROWS.filter((r) => isOn(r.key, faults[r.key])).length : 0;

  return (
    <main style={S.page}>
      <h1 style={S.h1}>Fault switches</h1>
      <p style={S.sub}>
        Each row is a bug we can plant. Values are read by the server on every request, so Save takes effect immediately.
        {faults ? ` ${onCount} of ${ROWS.length} on.` : ""}
      </p>

      {!faults && !status && <p style={S.muted}>Loading...</p>}

      {faults && (
        <table style={S.table}>
          <tbody>
            {ROWS.map((r) => {
              const on = isOn(r.key, faults[r.key]);
              return (
                <tr key={r.key} style={{ background: on ? "#1f1a0e" : "transparent" }}>
                  <td style={S.tdKey}>
                    <code style={{ color: on ? "#f5c451" : "#9aa0a6" }}>{r.key}</code>
                    <div style={S.label}>{r.label}</div>
                  </td>
                  <td style={S.tdInput}>
                    {r.kind === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={Boolean(draft[r.key])}
                        onChange={(e) => setDraft({ ...draft, [r.key]: e.target.checked })}
                        style={S.checkbox}
                      />
                    ) : (
                      <input
                        type={r.kind === "number" ? "number" : "text"}
                        step="any"
                        value={String(draft[r.key] ?? "")}
                        placeholder={r.kind === "number" ? String(DEFAULT_FAULTS[r.key] ?? "") : ""}
                        onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })}
                        style={S.input}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div style={S.actions}>
        <button style={S.btnPrimary} disabled={busy || !faults} onClick={() => put(toPartial(), "Saved")}>
          Save
        </button>
        <button style={S.btn} disabled={busy} onClick={() => put(DEFAULT_FAULTS, "Reset")}>
          Reset all
        </button>
        <button style={S.btn} disabled={busy} onClick={() => load()}>
          Reload
        </button>
        <span style={S.status}>{status}</span>
      </div>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0b0d10",
    color: "#e6e8eb",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13,
    padding: "32px 24px",
    maxWidth: 820,
    margin: "0 auto",
  },
  h1: { fontSize: 20, fontWeight: 600, margin: "0 0 6px" },
  sub: { color: "#9aa0a6", margin: "0 0 20px" },
  muted: { color: "#6b7075" },
  table: { width: "100%", borderCollapse: "collapse" },
  tdKey: { padding: "8px 10px", borderBottom: "1px solid #1c2026", verticalAlign: "top" },
  tdInput: { padding: "8px 10px", borderBottom: "1px solid #1c2026", width: 180, verticalAlign: "top" },
  label: { color: "#6b7075", fontSize: 11, marginTop: 2 },
  input: {
    width: "100%",
    background: "#12151a",
    color: "#e6e8eb",
    border: "1px solid #2a2f36",
    borderRadius: 4,
    padding: "5px 8px",
    font: "inherit",
  },
  checkbox: { width: 16, height: 16, accentColor: "#f5c451" },
  actions: { display: "flex", gap: 10, alignItems: "center", marginTop: 20 },
  btn: {
    background: "#12151a",
    color: "#e6e8eb",
    border: "1px solid #2a2f36",
    borderRadius: 4,
    padding: "7px 14px",
    font: "inherit",
    cursor: "pointer",
  },
  btnPrimary: {
    background: "#f5c451",
    color: "#0b0d10",
    border: "1px solid #f5c451",
    borderRadius: 4,
    padding: "7px 14px",
    font: "inherit",
    fontWeight: 600,
    cursor: "pointer",
  },
  status: { color: "#9aa0a6", marginLeft: 6 },
};
