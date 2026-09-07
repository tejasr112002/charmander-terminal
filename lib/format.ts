/**
 * Number formatting helpers. Everything the UI prints as a number goes through here so
 * decimals follow the market's priceDecimals / sizeDecimals and thousands get separators.
 */

const nfCache = new Map<string, Intl.NumberFormat>();

function nf(min: number, max: number, grouping = true): Intl.NumberFormat {
  const key = `${min}:${max}:${grouping}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      useGrouping: grouping,
    });
    nfCache.set(key, f);
  }
  return f;
}

/** Fixed decimals with thousands separators: fmtNum(1234.5, 2) → "1,234.50". */
export function fmtNum(v: number | null | undefined, decimals = 2, grouping = true): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  return nf(decimals, decimals, grouping).format(v);
}

/** Price at the market's tick precision. */
export function fmtPrice(v: number | null | undefined, priceDecimals = 2): string {
  return fmtNum(v, priceDecimals);
}

/** Size at the market's lot precision (no trailing-zero trimming; matches the exchange). */
export function fmtSize(v: number | null | undefined, sizeDecimals = 2): string {
  return fmtNum(v, sizeDecimals);
}

/** USD with two decimals and a $ sign. */
export function fmtUsd(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  const sign = v < 0 ? "-" : "";
  return `${sign}$${fmtNum(Math.abs(v), decimals)}`;
}

/** Compact volume: 12,345,678 → "$12.35M". */
export function fmtCompactUsd(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${fmtNum(v / 1e9, 2)}B`;
  if (abs >= 1e6) return `$${fmtNum(v / 1e6, 2)}M`;
  if (abs >= 1e3) return `$${fmtNum(v / 1e3, 1)}K`;
  return `$${fmtNum(v, 2)}`;
}

/** Signed percent: 0.0123 → "+1.23%". Input is a fraction unless `isPct` is true. */
export function fmtPct(v: number | null | undefined, decimals = 2, isPct = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  const pct = isPct ? v : v * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${fmtNum(pct, decimals, false)}%`;
}

/** Funding rate the way Hyperliquid shows it: 0.0000125 → "0.0013%". */
export function fmtFunding(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  return `${fmtNum(v * 100, 4, false)}%`;
}

/** "12:34:56" local time. */
export function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** "12:34:56.789" local time with milliseconds. Used in toasts so a tester can measure lag. */
export function fmtTimeMs(ms: number): string {
  const d = new Date(ms);
  return `${fmtTime(ms)}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

/** Round a value down to a number of decimals (avoids float drift). */
export function floorTo(v: number, decimals: number): number {
  const m = Math.pow(10, decimals);
  return Math.floor(v * m + 1e-9) / m;
}

export function roundTo(v: number, decimals: number): number {
  const m = Math.pow(10, decimals);
  return Math.round(v * m) / m;
}

/** Count decimals in a user-typed string ("1.2345" → 4). */
export function decimalsOf(s: string): number {
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

/** Shorten an address: 0xMOCK000...0000 → "0xMOCK…0000". */
export function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Parse a user-typed number, returning NaN for empty/invalid. */
export function parseNum(s: string): number {
  const t = s.replace(/,/g, "").trim();
  if (t === "" || t === "." || t === "-") return NaN;
  return Number(t);
}
