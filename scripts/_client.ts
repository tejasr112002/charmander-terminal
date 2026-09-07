/**
 * Tiny HTTP helper shared by the fault CLI, scenario runner and smoke test.
 * BASE comes from TERMINAL_URL (default http://localhost:3100).
 */
import type { Faults } from "../lib/types";

export const BASE = (process.env.TERMINAL_URL ?? "http://localhost:3100").replace(/\/+$/, "");

export async function getJson<T = unknown>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  return unwrap<T>(await res.json());
}

/** Server wraps payloads under a key ({markets:[...],ts}); return the payload. */
export function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    for (const k of ["markets", "account", "candles", "ticker", "book", "trades", "fills", "orders", "ledger", "faults"]) {
      if (k in o) return o[k] as T;
    }
  }
  return body as T;
}

export async function sendJson<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export const getFaults = () => getJson<Faults>("/api/faults");
export const putFaults = (partial: Partial<Faults>) => sendJson<Faults>("PUT", "/api/faults", partial);

/** "positionDelayMs=5000" -> ["positionDelayMs", 5000]; parses numbers, booleans and null. */
export function parseAssignment(arg: string): [string, number | boolean | string | null] {
  const eq = arg.indexOf("=");
  if (eq < 0) throw new Error(`Expected key=value, got "${arg}"`);
  const key = arg.slice(0, eq).trim();
  const raw = arg.slice(eq + 1).trim();
  let value: number | boolean | string | null;
  if (raw === "null" || raw === "") value = null;
  else if (raw === "true") value = true;
  else if (raw === "false") value = false;
  else if (raw !== "" && !Number.isNaN(Number(raw))) value = Number(raw);
  else value = raw;
  return [key, value];
}

export function printFaults(faults: Faults) {
  const rows = Object.entries(faults) as [string, unknown][];
  const width = Math.max(...rows.map(([k]) => k.length));
  for (const [k, v] of rows) {
    const on = v !== null && v !== false && v !== 0 && !(k === "orderValueMultiplier" && v === 1);
    console.log(`${on ? "*" : " "} ${k.padEnd(width)}  ${JSON.stringify(v)}`);
  }
  console.log("\n* = fault is switched on");
}
