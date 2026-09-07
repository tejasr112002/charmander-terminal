# server/ — the fake exchange

One Node process (`pnpm dev`, port 3100 by default) serves the Next.js UI, a REST API under
`/api/*`, and a WebSocket at `/ws`. Everything is in memory; restarting resets the account to
10,000 USDC. Shapes are in `lib/types.ts`.

| File | What it does |
| --- | --- |
| `index.ts` | HTTP server, REST routes, WebSocket fan-out, Next.js handler |
| `markets.ts` | Loads `data/seed.json` (or a built-in list), random-walks prices every 250 ms, builds the 15-level book, prints random trades, aggregates 1m/5m/1h candles |
| `exchange.ts` | The account: balances, orders, matching, fills, positions, ledger. This is the truth. |
| `perps.ts` | Margin, unrealized PnL and liquidation-price maths |
| `view.ts` | What the client sees: the truth with display faults applied |
| `faults.ts` | Reads/writes `faults.json` (re-read on every request) |
| `seed.ts` | `pnpm seed`: pulls real prices + 7 days of 1h candles from Hyperliquid into `data/seed.json` |

Fees: taker 0.045 %, maker 0.015 %, always charged in USDC. Min order value $10. Withdraw: min
$0.40, fee $0.20, needs a `0x` address. Default perp leverage 10x cross.

## REST

Every response carries `ts` (server time, ms). Errors are `{ ok:false, error:"...", ts }` with
status 400 (bad request / rejected) or 404 (unknown market or endpoint). Symbols with `/` can be
sent raw (`/api/ticker/HYPE/USDC`) or encoded (`HYPE%2FUSDC`).

| Method | Path | Body / query | Returns |
| --- | --- | --- | --- |
| GET | `/api/markets` | | `{ markets: Market[] }` (omits `faults.hideMarket`) |
| GET | `/api/ticker/:symbol` | | `{ ticker: Ticker }` |
| GET | `/api/book/:symbol` | | `{ book: OrderBook }` |
| GET | `/api/trades/:symbol` | `?limit=50` | `{ trades: Trade[] }` newest first |
| GET | `/api/candles/:symbol` | `?interval=1m\|5m\|1h&limit=500` | `{ symbol, interval, candles: Candle[] }` oldest first |
| GET | `/api/account` | | `{ account: Account }` (faults applied) |
| GET | `/api/orders` | | `{ orders: Order[] }` all orders, newest first |
| GET | `/api/fills` | | `{ fills: Fill[] }` newest first (fee shown via `displayedFeeRate`) |
| GET | `/api/ledger` | | `{ ledger: LedgerEntry[] }` deposits, withdrawals, transfers, trades |
| GET | `/api/faults` | | `{ faults: Faults }` |
| PUT | `/api/faults` | partial `Faults` | `{ ok, faults }` — merged and written to `faults.json` |
| GET | `/api/_truth` | | test harness only: real account, orders, fills, ledger, positions, leverage, fees paid, faults — no faults applied |
| POST | `/api/order` | `PlaceOrderRequest` | `PlaceOrderResponse` (200 if `ok`, 400 if rejected with `error` + `order.rejectReason`) |
| POST | `/api/preview` | `{ symbol, side, type, size, price? }` | `{ ok, orderValueUsd, feeUsd, feeRate, estPrice }` for the order form (applies `orderValueMultiplier`, `displayedFeeRate`) |
| POST | `/api/cancel` | `{ orderId }` | `{ ok, order }` |
| POST | `/api/cancel-all` | `{ symbol? }` | `{ ok, cancelled: Order[] }` |
| POST | `/api/leverage` | `{ symbol, leverage, marginMode:"cross"\|"isolated" }` | `{ ok, symbol, leverage, marginMode }` |
| POST | `/api/deposit` | `{ amount }` | `{ ok, entry: LedgerEntry }` |
| POST | `/api/withdraw` | `{ amount, address }` | `{ ok, entry }` — amount includes the $0.20 fee |
| POST | `/api/transfer` | `{ amount, direction:"spotToPerp"\|"perpToSpot" }` | `{ ok, entry }` — ledger row only, balances are unified |

### Examples

```bash
curl -s localhost:3100/api/ticker/HYPE/USDC
# {"ticker":{"symbol":"HYPE/USDC","last":86.061,"mark":86.061,"change24hPct":4.97,"volume24hUsd":126594281,"ts":...},"ts":...}

curl -s -X POST localhost:3100/api/order -H 'content-type: application/json' \
  -d '{"symbol":"HYPE/USDC","side":"buy","type":"market","size":0.6}'
# {"ok":true,"order":{"id":"o_...","symbol":"HYPE/USDC","side":"buy","type":"market","tif":"GTC","size":0.6,
#   "filled":0.6,"status":"filled",...},"fills":[{"id":"f_...","price":86.07,"size":0.6,"feeUsd":0.02324,...}],"ts":...}

curl -s -X POST localhost:3100/api/order -H 'content-type: application/json' \
  -d '{"symbol":"HYPE/USDC","side":"buy","type":"limit","price":70,"size":1,"tif":"GTC"}'
# {"ok":true,"order":{...,"status":"open","filled":0},"fills":[],"ts":...}   -> rests in account.openOrders

curl -s -X POST localhost:3100/api/order -H 'content-type: application/json' \
  -d '{"symbol":"HYPE/USDC","side":"buy","type":"market","size":0.09}'
# HTTP 400 {"ok":false,"order":{...,"status":"rejected","rejectReason":"Order value $7.75 is below the $10 minimum"},
#   "error":"Order value $7.75 is below the $10 minimum","ts":...}

curl -s -X POST localhost:3100/api/order -H 'content-type: application/json' \
  -d '{"symbol":"BTC-USDC","side":"buy","type":"market","size":0.01,"leverage":5}'
# opens a 5x cross long; account.positions[0] has entryPrice, liquidationPrice, unrealizedPnlUsd, marginUsd

curl -s -X PUT localhost:3100/api/faults -H 'content-type: application/json' -d '{"positionDelayMs":5000}'
curl -s -X PUT localhost:3100/api/faults -H 'content-type: application/json' -d '{}'   # keeps file as-is; set keys to defaults to clear
```

Reject reasons you will see: `Order value $8.75 is below the $10 minimum`, `Size must be a
multiple of 0.01`, `Price must be a multiple of 0.001`, `Insufficient USDC: need $..., available $...`,
`Post-only order would cross the book and take liquidity`, `Reduce-only order would not reduce a
position`, `Insufficient margin: need $..., available $...`, `Leverage must be a whole number between 1 and 40`.

## WebSocket `/ws`

Client → server:

```json
{ "type": "subscribe", "channels": ["ticker:HYPE/USDC", "book:HYPE/USDC", "trades:HYPE/USDC", "candles:HYPE/USDC:1m", "account"] }
{ "type": "unsubscribe", "channels": ["book:HYPE/USDC"] }
{ "type": "ping" }
```

Server → client (`WsMessage` in `lib/types.ts`):

| Channel | Message | Cadence |
| --- | --- | --- |
| `ticker:SYM` | `{ type:"ticker", data: Ticker }` | every 250 ms (stops after `freezeTickerAfterSec`) |
| `book:SYM` | `{ type:"book", data: OrderBook }` | every 250 ms (stops after `freezeBookAfterSec`) |
| `trades:SYM` | `{ type:"trade", data: Trade }` | as trades print (every 0.5–3 s) |
| `candles:SYM:1m` (or 5m/1h) | `{ type:"candle", data:{ symbol, interval, candle } }` | every 250 ms (the current bucket) |
| `account` | `{ type:"account", data: Account }` | on subscribe, on any change, and every 2 s |
| `account` | `{ type:"order", data: Order }` / `{ type:"fill", data: Fill }` | as they happen |
| — | `{ type:"pong", ts }` | reply to ping |

The socket is closed with code 1001 after `dropWsAfterSec` seconds when that fault is set.

## Where each fault lives

| Fault | Applied in |
| --- | --- |
| `positionDelayMs` | `view.ts` — account snapshot (REST + WS) is the state as of N ms ago; `/api/_truth` is live |
| `openOrderDelayMs`, `staleOpenOrderMs` | `view.ts` — openOrders list |
| `entryPriceErrorPct`, `liqPriceErrorPct`, `balanceIgnoresFees`, `equityDriftUsd` | `view.ts` — account snapshot |
| `displayedFeeRate` | `view.ts` — fee on fills (REST, WS, order response) and `/api/preview` |
| `orderValueMultiplier` | `view.ts` — `/api/preview` order value (the UI form should use it too) |
| `flipChangeSign` | `view.ts` — ticker (REST + WS) |
| `skipSizeRounding`, `skipMinNotional`, `postOnlyFills`, `cancelIgnored` | `exchange.ts` — matching |
| `hideMarket` | `index.ts` — `/api/markets` omits the symbol |
| `apiLatencyMs` | `index.ts` — every `/api/*` request |
| `freezeBookAfterSec`, `freezeTickerAfterSec`, `dropWsAfterSec` | `index.ts` — per WS connection |
| `submitDisabledMs` | UI only; served through `GET /api/faults` |
