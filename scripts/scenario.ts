#!/usr/bin/env tsx
/**
 * Named bug scenarios. Each sets a group of faults and prints what the QA agent should notice.
 *
 *   pnpm scenario slow-position
 *   pnpm scenario clean
 *   pnpm scenario            (lists scenarios)
 */
import { DEFAULT_FAULTS, type Faults } from "../lib/types";
import { BASE, printFaults, putFaults } from "./_client";

interface Scenario {
  faults: Partial<Faults>;
  expect: string;
}

export const SCENARIOS: Record<string, Scenario> = {
  "slow-position": {
    faults: { positionDelayMs: 6000 },
    expect:
      "After a market order fills, the 'Order submitted' toast shows right away but the new balance / position row only shows up ~6 s later. Compare the row's data-server-ts to the toast time; /api/_truth already has it.",
  },
  "stale-order": {
    faults: { staleOpenOrderMs: 8000 },
    expect:
      "A filled order keeps showing as 'open' in the Open Orders list for ~8 s after it filled. The fill is in the trade history at the same time, so the two tables disagree.",
  },
  "frozen-book": {
    faults: { freezeBookAfterSec: 20 },
    expect:
      "Order book stops updating 20 s after the page loads; trades and ticker keep moving. The book's timestamp stops advancing while the ticker's keeps going.",
  },
  "ws-drop": {
    faults: { dropWsAfterSec: 30 },
    expect:
      "Live connection closes 30 s after connect. Either the UI shows 'disconnected' and reconnects, or prices silently freeze. Silent freeze = bug.",
  },
  "wrong-fee": {
    faults: { displayedFeeRate: 0.001 },
    expect:
      "Order form shows a 0.10% fee but the fee actually charged on the fill is 0.045% (taker). The fee number in the form and the feeUsd on the fill do not match.",
  },
  "ghost-cancel": {
    faults: { cancelIgnored: true },
    expect:
      "Cancel says 'Order cancelled' but the order is still in Open Orders and still in /api/account. Re-fetch after cancelling.",
  },
  "bad-rounding": {
    faults: { skipSizeRounding: true, skipMinNotional: true },
    expect:
      "An order with too many decimals (e.g. 0.123456789 HYPE) is accepted instead of rounded/rejected, and a $3 order goes through even though the minimum is $10.",
  },
  "wrong-entry": {
    faults: { entryPriceErrorPct: 0.02 },
    expect:
      "Position entry price is shown 2% away from the actual average fill price. Average of the fills in trade history != entry price on the position row.",
  },
  "equity-drift": {
    faults: { equityDriftUsd: 25 },
    expect:
      "Portfolio equity is $25 off from the sum of balance USD values. Add up the balances and compare with the equity headline.",
  },
  "slow-api": {
    faults: { apiLatencyMs: 3000 },
    expect:
      "Every /api call takes 3 s longer. Pages feel sluggish; timestamps on data lag behind the wall clock by ~3 s.",
  },
  clean: {
    faults: DEFAULT_FAULTS,
    expect: "No faults. Everything should pass; any finding here is a false positive.",
  },
};

async function main() {
  const name = process.argv[2];
  if (!name || !SCENARIOS[name]) {
    console.log("Usage: pnpm scenario <name>\n");
    for (const [k, s] of Object.entries(SCENARIOS)) {
      console.log(`  ${k.padEnd(15)} ${Object.keys(s.faults).length === Object.keys(DEFAULT_FAULTS).length ? "(reset)" : JSON.stringify(s.faults)}`);
    }
    process.exit(name ? 1 : 0);
  }
  const s = SCENARIOS[name];
  // Start from clean so scenarios do not stack unless the user wants them to.
  const after = await putFaults({ ...DEFAULT_FAULTS, ...s.faults });
  console.log(`Scenario "${name}" on ${BASE}\n`);
  printFaults(after);
  console.log(`\nWhat the QA agent should notice:\n  ${s.expect}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
