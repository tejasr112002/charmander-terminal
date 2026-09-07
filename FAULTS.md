# Fault switches

Every row is a bug we can plant in the mock terminal to see whether the QA agent catches it.
All are off by default. The server reads `faults.json` on every request, so flipping one takes
effect right away with no restart.

Three ways to flip a fault:

- Admin page: open `/_faults` in the browser, change a value, press Save.
- CLI: `pnpm fault set positionDelayMs=5000` (or `npx tsx scripts/fault.ts ...`). Point it at a
  deployed terminal with `TERMINAL_URL=https://charmander-terminal.fly.dev pnpm fault list`.
- Scenario: `pnpm scenario slow-position` sets a named group and prints what to look for.

`pnpm fault truth` shows `/api/_truth`, the account state with no faults applied. Anything the
normal API or UI shows that disagrees with truth is the planted bug.

## The faults

| Fault | Type | What a user sees | Which check catches it | Example |
|---|---|---|---|---|
| `positionDelayMs` | number (ms) | After a market order fills, the "Order submitted" toast appears right away but the new balance or position row shows up N ms later. | Compare the row's `data-server-ts` with the toast time; poll `/api/account` after the fill and time how long until the balance changes. `/api/_truth` has it immediately. | `pnpm fault set positionDelayMs=5000` |
| `openOrderDelayMs` | number (ms) | A limit order is placed and confirmed but does not appear in the Open Orders list for N ms. | After placing, poll `/api/account.openOrders` and time until the order id appears; compare with the toast time. | `pnpm fault set openOrderDelayMs=4000` |
| `staleOpenOrderMs` | number (ms) | An order that already filled is still listed as "open" for N ms; the fill is visible in trade history at the same time. | Cross-check Open Orders against fills: an order id with a fill for its full size must not still be open. | `pnpm fault set staleOpenOrderMs=8000` |
| `freezeBookAfterSec` | number (s) | The order book stops moving N seconds after the page loads. Ticker and trades keep changing. | Watch the book's `ts` over time; it must keep advancing while the ticker's does. | `pnpm fault set freezeBookAfterSec=20` |
| `freezeTickerAfterSec` | number (s) | The price in the header and market list freezes after N seconds while the book and trades keep moving. | Same idea: ticker `ts` stops advancing. | `pnpm fault set freezeTickerAfterSec=20` |
| `dropWsAfterSec` | number (s) | The live connection closes after N seconds. A good UI shows "disconnected" and reconnects; a bad one silently freezes everything. | Watch for the WebSocket close event; check whether the UI shows a status change and whether data resumes. | `pnpm fault set dropWsAfterSec=30` |
| `displayedFeeRate` | number or blank | The order form shows one fee rate but the fill is charged the real rate (taker 0.045%, maker 0.015%). | Compare the fee number in the form with `feeUsd` on the resulting fill. Blank / `null` = correct. | `pnpm fault set displayedFeeRate=0.001` |
| `skipSizeRounding` | on/off | A size with too many decimals (say 0.123456789) is accepted instead of being rounded or rejected. | Submit a size with more decimals than the market's `sizeDecimals`; the order should be rounded or rejected. | `pnpm fault set skipSizeRounding=true` |
| `skipMinNotional` | on/off | A $3 order goes through even though the minimum is $10. | Submit an order under `minNotionalUsd`; it should be rejected. | `pnpm fault set skipMinNotional=true` |
| `orderValueMultiplier` | number (1 = correct) | The "order value" line in the form is wrong, e.g. 2x what size × price gives. | Recompute size × price and compare with the form's order value. | `pnpm fault set orderValueMultiplier=2` |
| `entryPriceErrorPct` | number (fraction) | A position's entry price is off from the average fill price by this fraction (0.02 = 2%). | Average the fills for that position and compare with the entry price shown. | `pnpm fault set entryPriceErrorPct=0.02` |
| `liqPriceErrorPct` | number (fraction) | The liquidation price on a position is off by this fraction. | Recompute the liquidation price from entry, leverage and margin and compare. | `pnpm fault set liqPriceErrorPct=0.05` |
| `balanceIgnoresFees` | on/off | After a trade the USDC balance is higher than it should be, by exactly the fee. | Expected balance = before − (size × price) − fee. If the shown balance is off by the fee, this is it. | `pnpm fault set balanceIgnoresFees=true` |
| `cancelIgnored` | on/off | Cancel says "Order cancelled" but the order is still in Open Orders. | Re-fetch `/api/account.openOrders` after cancelling; the id must be gone and the order's status must be `cancelled`. | `pnpm fault set cancelIgnored=true` |
| `postOnlyFills` | on/off | A post-only limit order that crosses the book gets filled instead of being rejected. | Place a post-only buy above the best ask; it should come back rejected, not filled. | `pnpm fault set postOnlyFills=true` |
| `hideMarket` | text or blank | Searching for that market in the market selector returns nothing, even though it is in `/api/markets`. | Compare selector search results with `/api/markets`. | `pnpm fault set hideMarket=HYPE/USDC` |
| `equityDriftUsd` | number (USD) | The portfolio equity headline is off from the sum of the balances' USD values by this much. | Sum `balances[].usdValue` and compare with `equityUsd`. | `pnpm fault set equityDriftUsd=25` |
| `apiLatencyMs` | number (ms) | Every `/api` call takes N ms longer. Pages feel slow; timestamps lag the wall clock. | Time each API call; flag anything consistently over the budget. | `pnpm fault set apiLatencyMs=3000` |
| `flipChangeSign` | on/off | A market that is up 3% shows −3%, and vice versa. | Compare the sign of the shown 24h change with `(last − price 24h ago)`. | `pnpm fault set flipChangeSign=true` |
| `submitDisabledMs` | number (ms) | The Place button stays greyed out for N ms after the form is already valid. | Fill the form, then time until the button becomes enabled. | `pnpm fault set submitDisabledMs=3000` |

## Scenarios

`pnpm scenario <name>` resets everything, then turns on the group below and prints what the agent should notice.

| Name | Faults |
|---|---|
| `slow-position` | positionDelayMs=6000 |
| `stale-order` | staleOpenOrderMs=8000 |
| `frozen-book` | freezeBookAfterSec=20 |
| `ws-drop` | dropWsAfterSec=30 |
| `wrong-fee` | displayedFeeRate=0.001 |
| `ghost-cancel` | cancelIgnored=true |
| `bad-rounding` | skipSizeRounding=true, skipMinNotional=true |
| `wrong-entry` | entryPriceErrorPct=0.02 |
| `equity-drift` | equityDriftUsd=25 |
| `slow-api` | apiLatencyMs=3000 |
| `clean` | everything off |

## Smoke test

`pnpm smoke` checks a running terminal end to end: markets load, the fresh account has 10,000 USDC,
a $50 HYPE/USDC market buy shows up in the balance within 1 s when clean, and with
`positionDelayMs=5000` it shows in `/api/_truth` at once but in `/api/account` only after 4.5 s or more.
It resets the faults when done. Set `TERMINAL_URL` to test a deployed copy. The order endpoint
defaults to `POST /api/orders`; override with `ORDER_PATH` if the server uses a different path.
