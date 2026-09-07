/**
 * Fault switches. faults.json is re-read on every call so a tester can flip a bug
 * without restarting. Missing/invalid file = all defaults (no bugs).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_FAULTS, type Faults } from "../lib/types";
import { ROOT } from "./util";

export const FAULTS_PATH = path.join(ROOT, "faults.json");

function readFile(): Partial<Faults> {
  try {
    const raw = JSON.parse(readFileSync(FAULTS_PATH, "utf8")) as unknown;
    return raw && typeof raw === "object" ? (raw as Partial<Faults>) : {};
  } catch {
    return {};
  }
}

/** Only keep keys that exist in the contract, so typos in faults.json are ignored. */
function pick(partial: Partial<Faults>): Partial<Faults> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_FAULTS) as (keyof Faults)[]) {
    if (key in partial && partial[key] !== undefined) out[key] = partial[key];
  }
  return out as Partial<Faults>;
}

export function getFaults(): Faults {
  return { ...DEFAULT_FAULTS, ...pick(readFile()) };
}

/** Merge `patch` over the current file and write it back. Returns the effective faults. */
export function setFaults(patch: Partial<Faults>): Faults {
  const merged = { ...pick(readFile()), ...pick(patch) };
  writeFileSync(FAULTS_PATH, JSON.stringify(merged, null, 2) + "\n");
  return { ...DEFAULT_FAULTS, ...merged };
}
