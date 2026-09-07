/**
 * In-memory fake exchange: one account, spot balances, perp positions, order matching.
 * Everything here is the TRUTH; faults are layered on top in view.ts.
 * Emits: "order" (Order), "fill" (Fill), "change" (any account change).
 */
import { EventEmitter } from "node:events";
import {
  FEE_RATES, START_BALANCE_USDC,
  type Account, type Balance, type Faults, type Fill, type LedgerEntry, type Order,
  type PlaceOrderRequest, type PlaceOrderResponse, type Side,
} from "../lib/types";
import type { MarketSim, MarketState } from "./markets";
import { positionMargin, positionView } from "./perps";
import { fmtUsd, isMultipleOf, log, newId, roundTo, stepString } from "./util";

export const ACCOUNT_ADDRESS = "0xMOCK000000000000000000000000000000000000";
export const MIN_WITHDRAW_USD = 0.4;
export const WITHDRAW_FEE_USD = 0.2;
export const DEFAULT_LEVERAGE = 10;
const EPS = 1e-9;
const r8 = (x: number) => roundTo(x, 8);

export interface PositionState {
  symbol: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  leverage: number;
  marginMode: "cross" | "isolated";
  isolatedMarginUsd: number;
  updatedAt: number;
}
export interface LeverageSetting { leverage: number; marginMode: "cross" | "isolated" }
/** Copy of balances/positions at a moment, so faults can show a delayed account. */
export interface Snapshot { ts: number; balances: Record<string, number>; positions: PositionState[]; feesPaidUsd: number }
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

export class Exchange extends EventEmitter {
  private balances = new Map<string, number>([["USDC", START_BALANCE_USDC]]);
  private orders = new Map<string, Order>();
  private positions = new Map<string, PositionState>();
  private leverage = new Map<string, LeverageSetting>();
  private history: Snapshot[] = [];
  private feesPaidUsd = 0;
  readonly fills: Fill[] = [];
  readonly ledger: LedgerEntry[] = [];

  constructor(private readonly sim: MarketSim) {
    super();
    this.snapshot(Date.now());
    sim.on("tick", () => this.matchResting());
  }

  /** Fresh account: 10,000 USDC, no orders, positions, fills or ledger. Used by the QA harness between tests. */
  reset(): void {
    this.balances = new Map([["USDC", START_BALANCE_USDC]]);
    this.orders.clear();
    this.positions.clear();
    this.leverage.clear();
    this.history = [];
    this.feesPaidUsd = 0;
    this.fills.length = 0;
    this.ledger.length = 0;
    this.snapshot(Date.now());
    this.emit("account");
  }

  // ---------- reads ----------

  allOrders(): Order[] { return [...this.orders.values()]; }
  positionStates(): PositionState[] { return [...this.positions.values()].map((p) => ({ ...p })); }
  leverageSettings(): Record<string, LeverageSetting> { return Object.fromEntries(this.leverage); }
  totalFeesPaidUsd(): number { return this.feesPaidUsd; }

  lev(symbol: string): LeverageSetting {
    const m = this.sim.get(symbol)?.market;
    return this.leverage.get(symbol) ?? { leverage: Math.min(DEFAULT_LEVERAGE, m?.maxLeverage ?? DEFAULT_LEVERAGE), marginMode: "cross" };
  }

  /** Live state, or the state as it was `delayMs` ago (for the positionDelayMs fault). */
  stateAt(delayMs: number): Snapshot {
    const now = Date.now();
    if (delayMs <= 0) return this.snapshotOf(now);
    const cutoff = now - delayMs;
    let found = this.history[0];
    for (const s of this.history) if (s.ts <= cutoff) found = s; else break;
    return found;
  }

  /** The real account, no faults. */
  truth(): Account {
    return this.buildAccount(this.balances, [...this.positions.values()], Date.now());
  }

  buildAccount(balances: Map<string, number> | Record<string, number>, positions: PositionState[], ts: number): Account {
    const bal = balances instanceof Map ? balances : new Map(Object.entries(balances));
    const holds = this.holds();
    const marginTotal = positions.reduce((s, p) => s + positionMargin(p), 0);
    const posOut = positions.map((p) => positionView(this.sim, p, positions, bal.get("USDC") ?? 0));
    const out: Balance[] = [];
    let equity = 0;
    const assets = [...bal.keys()].sort((a, b) => (a === "USDC" ? -1 : b === "USDC" ? 1 : a.localeCompare(b)));
    for (const asset of assets) {
      const total = bal.get(asset) ?? 0;
      if (asset !== "USDC" && Math.abs(total) < EPS) continue;
      const px = asset === "USDC" ? 1 : this.sim.get(`${asset}/USDC`)?.mark ?? 0;
      const available = total - (holds.get(asset) ?? 0) - (asset === "USDC" ? marginTotal : 0);
      out.push({ asset, total: r8(total), available: r8(Math.max(0, available)), usdValue: roundTo(total * px, 2) });
      equity += total * px;
    }
    equity += posOut.reduce((s, p) => s + p.unrealizedPnlUsd, 0);
    const openOrders = [...this.orders.values()].filter((o) => o.status === "open").sort((a, b) => a.createdAt - b.createdAt);
    return { address: ACCOUNT_ADDRESS, balances: out, positions: posOut, openOrders, equityUsd: roundTo(equity, 2), ts };
  }

  /** Funds locked by resting orders, per asset. */
  private holds(): Map<string, number> {
    const h = new Map<string, number>();
    const add = (a: string, x: number) => h.set(a, (h.get(a) ?? 0) + x);
    for (const o of this.orders.values()) {
      if (o.status !== "open" || o.price === undefined) continue;
      const m = this.sim.get(o.symbol)?.market;
      if (!m) continue;
      const rem = o.size - o.filled;
      if (m.kind === "spot") add(o.side === "buy" ? m.quote : m.base, o.side === "buy" ? rem * o.price : rem);
      else if (!o.reduceOnly) add("USDC", (rem * o.price) / this.lev(o.symbol).leverage);
    }
    return h;
  }

  private available(asset: string): number {
    const acct = this.truth();
    return acct.balances.find((b) => b.asset === asset)?.available ?? 0;
  }

  // ---------- orders ----------

  placeOrder(req: PlaceOrderRequest, faults: Faults): PlaceOrderResponse {
    const ts = Date.now();
    const st = this.sim.get(req.symbol);
    const tif = req.tif ?? (req.postOnly ? "ALO" : "GTC");
    const order: Order = {
      id: newId("o"), symbol: req.symbol, side: req.side, type: req.type, tif,
      price: req.type === "limit" ? req.price : undefined, size: Number(req.size), filled: 0, status: "open",
      reduceOnly: !!req.reduceOnly, postOnly: tif === "ALO", createdAt: ts, updatedAt: ts,
    };
    const reject = (reason: string): PlaceOrderResponse => {
      order.status = "rejected";
      order.rejectReason = reason;
      this.orders.set(order.id, order);
      log(`ORDER ${order.id} ${order.side} ${order.type} ${order.size} ${order.symbol} @ ${order.price ?? "mkt"} -> REJECTED: ${reason}`);
      this.emit("order", order);
      return { ok: false, order, error: reason, ts };
    };

    if (!st) return reject(`Unknown market ${req.symbol}`);
    const m = st.market;
    if (req.side !== "buy" && req.side !== "sell") return reject("Side must be buy or sell");
    if (req.type !== "market" && req.type !== "limit") return reject("Type must be market or limit");
    if (!(order.size > 0)) return reject("Size must be greater than 0");
    if (!faults.skipSizeRounding && !isMultipleOf(order.size, m.sizeDecimals)) {
      return reject(`Size must be a multiple of ${stepString(m.sizeDecimals)}`);
    }
    if (req.type === "limit") {
      if (!(Number(req.price) > 0)) return reject("Limit orders need a price");
      order.price = Number(req.price);
      if (!isMultipleOf(order.price, m.priceDecimals)) return reject(`Price must be a multiple of ${stepString(m.priceDecimals)}`);
    }
    const bestAsk = st.asks[0].price;
    const bestBid = st.bids[0].price;
    const refPrice = order.price ?? (order.side === "buy" ? bestAsk : bestBid);
    const notional = order.size * refPrice;
    if (!faults.skipMinNotional && notional < m.minNotionalUsd - EPS) {
      return reject(`Order value ${fmtUsd(notional)} is below the $${m.minNotionalUsd} minimum`);
    }
    if (m.kind === "perp" && req.leverage !== undefined) {
      const r = this.setLeverage(m.symbol, Number(req.leverage), this.lev(m.symbol).marginMode);
      if (!r.ok) return reject(r.error);
    }
    if (order.reduceOnly && m.kind === "perp") {
      const pos = this.positions.get(m.symbol);
      const dir = order.side === "buy" ? "long" : "short";
      if (!pos || pos.side === dir) return reject("Reduce-only order would not reduce a position");
      order.size = Math.min(order.size, pos.size);
    }
    // Balance / margin check (taker fee assumed for the worst case).
    const worstCost = notional * (1 + FEE_RATES.taker);
    if (m.kind === "spot") {
      if (order.side === "buy") {
        const avail = this.available(m.quote);
        if (avail + EPS < worstCost) return reject(`Insufficient ${m.quote}: need ${fmtUsd(worstCost)}, available ${fmtUsd(avail)}`);
      } else {
        const avail = this.available(m.base);
        if (avail + EPS < order.size) return reject(`Insufficient ${m.base}: need ${order.size}, available ${avail}`);
      }
    } else if (!order.reduceOnly) {
      const pos = this.positions.get(m.symbol);
      const opposite = pos && pos.side !== (order.side === "buy" ? "long" : "short") ? pos.size : 0;
      const need = (Math.max(0, order.size - opposite) * refPrice) / this.lev(m.symbol).leverage + notional * FEE_RATES.taker;
      const avail = this.available("USDC");
      if (avail + EPS < need) return reject(`Insufficient margin: need ${fmtUsd(need)}, available ${fmtUsd(avail)}`);
    }

    const crosses = order.type === "market" || (order.side === "buy" ? order.price! >= bestAsk : order.price! <= bestBid);
    if (crosses && order.postOnly && !faults.postOnlyFills) return reject("Post-only order would cross the book and take liquidity");

    this.orders.set(order.id, order);
    const fills: Fill[] = [];
    if (crosses) {
      const walked = this.walkBook(st, order.side, order.size, order.price);
      if (walked.size > 0) fills.push(this.executeFill(order, walked.price, walked.size, FEE_RATES.taker));
      if (order.status === "open" && (order.type === "market" || tif === "IOC")) {
        order.status = "cancelled";
        order.rejectReason = order.type === "market" ? "Not enough liquidity" : "IOC: unfilled part cancelled";
        order.updatedAt = Date.now();
      }
    } else if (tif === "IOC") {
      order.status = "cancelled";
      order.rejectReason = "IOC order did not fill";
    }
    log(`ORDER ${order.id} ${order.side} ${order.type} ${order.size} ${order.symbol} @ ${order.price ?? "mkt"} -> ${order.status.toUpperCase()} (filled ${order.filled})`);
    this.emit("order", order);
    this.emit("change");
    return { ok: true, order, fills, ts };
  }

  /** Fill `size` against the book. Market orders fill the remainder at the last level. */
  private walkBook(st: MarketState, side: Side, size: number, limit?: number): { size: number; price: number } {
    const levels = side === "buy" ? st.asks : st.bids;
    let rem = size;
    let cost = 0;
    let last = levels[0].price;
    for (const lv of levels) {
      if (limit !== undefined && (side === "buy" ? lv.price > limit : lv.price < limit)) break;
      const take = Math.min(rem, lv.size);
      cost += take * lv.price;
      rem -= take;
      last = lv.price;
      if (rem <= EPS) break;
    }
    if (rem > EPS && limit === undefined) { cost += rem * last; rem = 0; }
    const filled = size - rem;
    const m = st.market;
    return { size: roundTo(filled, m.sizeDecimals), price: filled > 0 ? roundTo(cost / filled, m.priceDecimals + 2) : 0 };
  }

  private executeFill(order: Order, price: number, size: number, feeRate: number): Fill {
    const m = this.sim.get(order.symbol)!.market;
    const ts = Date.now();
    const notional = price * size;
    const fee = r8(notional * feeRate);
    const fill: Fill = { id: newId("f"), orderId: order.id, symbol: order.symbol, side: order.side, price, size, feeUsd: fee, ts };
    order.filled = roundTo(order.filled + size, m.sizeDecimals);
    order.updatedAt = ts;
    if (order.filled >= order.size - EPS) order.status = "filled";
    let realized = 0;
    if (m.kind === "spot") {
      if (order.side === "buy") { this.adjust(m.quote, -(notional + fee)); this.adjust(m.base, size); }
      else { this.adjust(m.base, -size); this.adjust(m.quote, notional - fee); }
    } else {
      realized = this.applyPerpFill(m.symbol, order.side, size, price, ts);
      this.adjust("USDC", realized - fee);
    }
    this.feesPaidUsd += fee;
    this.fills.push(fill);
    this.ledger.push({
      id: newId("l"), type: "trade", asset: m.quote, ts, feeUsd: fee,
      amount: r8(m.kind === "spot" ? (order.side === "buy" ? -(notional + fee) : notional - fee) : realized - fee),
      note: `${order.side} ${size} ${m.symbol} @ ${price}${m.kind === "perp" ? ` (realized ${fmtUsd(realized)})` : ""}`,
    });
    this.snapshot(ts);
    log(`FILL ${fill.id} ${order.id} ${order.side} ${size} ${order.symbol} @ ${price} fee ${fmtUsd(fee)}`);
    this.emit("fill", fill);
    return fill;
  }

  /** Update the perp position; returns realized PnL in USDC. */
  private applyPerpFill(symbol: string, side: Side, size: number, price: number, ts: number): number {
    const dir = side === "buy" ? "long" : "short";
    const lev = this.lev(symbol);
    const pos = this.positions.get(symbol);
    const open = (sz: number): PositionState => ({
      symbol, side: dir, size: sz, entryPrice: price, leverage: lev.leverage, marginMode: lev.marginMode,
      isolatedMarginUsd: (sz * price) / lev.leverage, updatedAt: ts,
    });
    if (!pos) { this.positions.set(symbol, open(size)); return 0; }
    if (pos.side === dir) {
      const newSize = pos.size + size;
      pos.entryPrice = roundTo((pos.entryPrice * pos.size + price * size) / newSize, 6);
      pos.isolatedMarginUsd += (size * price) / pos.leverage;
      pos.size = newSize;
      pos.updatedAt = ts;
      return 0;
    }
    const closed = Math.min(size, pos.size);
    const realized = (price - pos.entryPrice) * closed * (pos.side === "long" ? 1 : -1);
    pos.isolatedMarginUsd *= (pos.size - closed) / pos.size;
    pos.size = roundTo(pos.size - closed, 8);
    pos.updatedAt = ts;
    if (pos.size <= EPS) this.positions.delete(symbol);
    const remaining = roundTo(size - closed, 8);
    if (remaining > EPS) this.positions.set(symbol, open(remaining));
    return r8(realized);
  }

  private adjust(asset: string, delta: number): void {
    this.balances.set(asset, r8((this.balances.get(asset) ?? 0) + delta));
  }

  /** Called every tick: fill resting limit orders whose price the market has crossed. */
  private matchResting(): void {
    for (const o of this.orders.values()) {
      if (o.status !== "open" || o.price === undefined) continue;
      const st = this.sim.get(o.symbol);
      if (!st) continue;
      const hit = o.side === "buy" ? st.asks[0].price <= o.price : st.bids[0].price >= o.price;
      if (!hit) continue;
      let rem = roundTo(o.size - o.filled, st.market.sizeDecimals);
      if (o.reduceOnly && st.market.kind === "perp") {
        const pos = this.positions.get(o.symbol);
        if (!pos || pos.side === (o.side === "buy" ? "long" : "short")) {
          o.status = "cancelled"; o.rejectReason = "Reduce-only: no position left to reduce"; o.updatedAt = Date.now();
          this.emit("order", o); this.emit("change");
          continue;
        }
        rem = Math.min(rem, pos.size);
      }
      this.executeFill(o, o.price, rem, FEE_RATES.maker);
      if (o.status === "open") { o.status = "filled"; o.updatedAt = Date.now(); }
      this.emit("order", o);
      this.emit("change");
    }
  }

  cancel(orderId: string, faults: Faults): Result<Order> {
    const o = this.orders.get(orderId);
    if (!o || o.status !== "open") return fail("Order not found or not open");
    if (faults.cancelIgnored) {
      log(`CANCEL ${o.id} -> (fault cancelIgnored) reported ok, order still open`);
      return { ok: true, value: { ...o, status: "cancelled", updatedAt: Date.now() } };
    }
    // Mark the stored order cancelled, then hand back a copy.
    o.status = "cancelled";
    o.updatedAt = Date.now();
    const cancelled: Order = { ...o };
    log(`CANCEL ${o.id} ${o.side} ${o.size} ${o.symbol} @ ${o.price ?? "mkt"} -> CANCELLED`);
    this.emit("order", cancelled);
    this.emit("change");
    return { ok: true, value: cancelled };
  }

  cancelAll(faults: Faults, symbol?: string): Order[] {
    const out: Order[] = [];
    for (const o of this.orders.values()) {
      if (o.status !== "open" || (symbol && o.symbol !== symbol)) continue;
      const r = this.cancel(o.id, faults);
      if (r.ok) out.push(r.value);
    }
    return out;
  }

  // ---------- account actions ----------

  setLeverage(symbol: string, leverage: number, marginMode: "cross" | "isolated"): Result<LeverageSetting> {
    const m = this.sim.get(symbol)?.market;
    if (!m || m.kind !== "perp") return fail(`${symbol} is not a perp market`);
    if (marginMode !== "cross" && marginMode !== "isolated") return fail("marginMode must be cross or isolated");
    if (!Number.isInteger(leverage) || leverage < 1 || leverage > (m.maxLeverage ?? 1)) {
      return fail(`Leverage must be a whole number between 1 and ${m.maxLeverage}`);
    }
    const setting: LeverageSetting = { leverage, marginMode };
    this.leverage.set(symbol, setting);
    const pos = this.positions.get(symbol);
    if (pos) {
      pos.leverage = leverage;
      pos.marginMode = marginMode;
      pos.isolatedMarginUsd = (pos.size * pos.entryPrice) / leverage;
      pos.updatedAt = Date.now();
      this.snapshot(pos.updatedAt);
    }
    log(`LEVERAGE ${symbol} -> ${leverage}x ${marginMode}`);
    this.emit("change");
    return { ok: true, value: setting };
  }

  deposit(amount: number): Result<LedgerEntry> {
    if (!(amount > 0)) return fail("Deposit amount must be greater than 0");
    this.adjust("USDC", amount);
    return this.record({ type: "deposit", asset: "USDC", amount, note: `Deposit ${fmtUsd(amount)}` });
  }

  withdraw(amount: number, address: unknown): Result<LedgerEntry> {
    if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) return fail("A valid 0x address is required");
    if (!(amount >= MIN_WITHDRAW_USD)) return fail(`Minimum withdrawal is ${fmtUsd(MIN_WITHDRAW_USD)}`);
    const avail = this.available("USDC");
    if (amount > avail + EPS) return fail(`Insufficient available USDC: have ${fmtUsd(avail)}`);
    this.adjust("USDC", -amount);
    return this.record({
      type: "withdraw", asset: "USDC", amount: -amount, feeUsd: WITHDRAW_FEE_USD, address,
      note: `Withdraw ${fmtUsd(amount)} to ${address} (fee ${fmtUsd(WITHDRAW_FEE_USD)}, receives ${fmtUsd(amount - WITHDRAW_FEE_USD)})`,
    });
  }

  /** Balances are unified, so this only records a ledger row. */
  transfer(amount: number, direction: unknown): Result<LedgerEntry> {
    if (direction !== "spotToPerp" && direction !== "perpToSpot") return fail("direction must be spotToPerp or perpToSpot");
    if (!(amount > 0)) return fail("Transfer amount must be greater than 0");
    const avail = this.available("USDC");
    if (amount > avail + EPS) return fail(`Insufficient available USDC: have ${fmtUsd(avail)}`);
    return this.record({ type: "transfer", asset: "USDC", amount: 0, note: `Transfer ${fmtUsd(amount)} ${direction}` });
  }

  private record(e: Omit<LedgerEntry, "id" | "ts">): Result<LedgerEntry> {
    const entry: LedgerEntry = { id: newId("l"), ts: Date.now(), ...e };
    this.ledger.push(entry);
    this.snapshot(entry.ts);
    log(`LEDGER ${entry.type} ${entry.asset} ${entry.amount} ${entry.note ?? ""}`);
    this.emit("change");
    return { ok: true, value: entry };
  }

  private snapshotOf(ts: number): Snapshot {
    return { ts, balances: Object.fromEntries(this.balances), positions: this.positionStates(), feesPaidUsd: this.feesPaidUsd };
  }

  private snapshot(ts: number): void {
    this.history.push(this.snapshotOf(ts));
    const keepFrom = Date.now() - 10 * 60_000;
    while (this.history.length > 1 && this.history[1].ts < keepFrom) this.history.shift();
  }
}
