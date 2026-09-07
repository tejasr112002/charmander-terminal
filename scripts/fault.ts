#!/usr/bin/env tsx
/**
 * Fault CLI. Flip planted bugs on a running terminal without touching files.
 *
 *   pnpm fault list                                  show current switches
 *   pnpm fault set positionDelayMs=5000 cancelIgnored=true
 *   pnpm fault set displayedFeeRate=null             (null = correct value)
 *   pnpm fault reset                                 everything back to off
 *   pnpm fault truth                                 fault-free account state
 *
 * TERMINAL_URL sets the target (default http://localhost:3100).
 */
import { DEFAULT_FAULTS, type Faults } from "../lib/types";
import { BASE, getFaults, getJson, parseAssignment, printFaults, putFaults, sendJson } from "./_client";

const KNOWN = new Set(Object.keys(DEFAULT_FAULTS));

async function main() {
  const [cmd = "list", ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "list": {
      console.log(`Faults on ${BASE}\n`);
      printFaults(await getFaults());
      return;
    }
    case "set": {
      if (rest.length === 0) throw new Error("Usage: fault set key=value [key=value ...]");
      const partial: Record<string, unknown> = {};
      for (const arg of rest) {
        const [k, v] = parseAssignment(arg);
        if (!KNOWN.has(k)) throw new Error(`Unknown fault "${k}". Known: ${[...KNOWN].join(", ")}`);
        partial[k] = v;
      }
      const after = await putFaults(partial as Partial<Faults>);
      console.log(`Updated ${Object.keys(partial).join(", ")} on ${BASE}\n`);
      printFaults(after);
      return;
    }
    case "reset-account": {
      await sendJson("POST", "/api/reset");
      console.log("account reset to 10,000 USDC");
      return;
    }
    case "reset": {
      const after = await putFaults(DEFAULT_FAULTS);
      console.log(`All faults off on ${BASE}\n`);
      printFaults(after);
      return;
    }
    case "truth": {
      console.log(JSON.stringify(await getJson("/api/_truth"), null, 2));
      return;
    }
    default:
      console.log("Usage: fault list | set key=value ... | reset | truth");
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
