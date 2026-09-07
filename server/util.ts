/** Small helpers shared by the server modules. */

/** Project root. `pnpm dev` / `pnpm seed` always run from the terminal/ folder. */
export const ROOT = process.cwd();

let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36).padStart(4, "0")}`;
}

export function roundTo(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

/** True when x is a whole multiple of 10^-decimals (with float tolerance). */
export function isMultipleOf(x: number, decimals: number): boolean {
  const q = x * 10 ** decimals;
  return Math.abs(q - Math.round(q)) < 1e-6;
}

/** "0.01" for 2 decimals, "1" for 0. Used in reject messages. */
export function stepString(decimals: number): string {
  return (10 ** -decimals).toFixed(Math.max(0, decimals));
}

/** Standard normal sample (Box-Muller). */
export function gauss(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function fmtUsd(x: number): string {
  return `$${x.toFixed(2)}`;
}

export function log(line: string): void {
  console.log(`[${new Date().toISOString()}] ${line}`);
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
