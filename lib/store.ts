/**
 * Single zustand store for the terminal UI. Server data (markets, ticker, book, trades,
 * candles, account) lands here from REST seeds and WebSocket pushes; components read it.
 */
import { create } from "zustand";
import type { Account, Candle, Market, Order, OrderBook, Ticker, Trade } from "@/lib/types";
import type { ConnState } from "@/lib/ws";

export type Interval = "1m" | "5m" | "1h";
export type Connection = "online" | "reconnecting" | "offline";
export const INTERVALS: Interval[] = ["1m", "5m", "1h"];
export const DEFAULT_SYMBOL = "HYPE/USDC";
export const MOCK_ADDRESS = "0xMOCK0000000000000000000000000000000000000";
const LOGIN_KEY = "mock_login";
const HIDE_CONFIRM_KEY = "mock_hide_confirm";
const MAX_TRADES = 100;
const MAX_TOASTS = 5;

export interface Toast {
  id: number;
  text: string;
  kind: "ok" | "error" | "info";
  /** Server ms that produced this toast (0 when unknown). */
  serverTs: number;
  /** Date.now() when the toast was created on the client. */
  clientTs: number;
}

export interface TerminalState {
  markets: Market[];
  symbol: string;
  interval: Interval;
  tickers: Record<string, Ticker>;
  book: OrderBook | null;
  trades: Trade[];
  candles: Candle[];
  /** Symbol + interval the current `candles` belong to. */
  candlesKey: string;
  account: Account | null;
  connState: ConnState;
  /** Simplified view of connState for the panels / portfolio: online, reconnecting, offline. */
  connection: Connection;
  /** Date.now() when the socket last opened; null while down. */
  connectedAt: number | null;
  reconnectAttempt: number;
  loggedIn: boolean;
  hideConfirm: boolean;
  toasts: Toast[];
  /** Last order/fill pushes (bottom panels and toasts can watch these). */
  lastOrderEvent: Order | null;
  /** Price clicked in the order book; the order form copies it into its Price input. */
  clickedPrice: { value: number; seq: number } | null;

  setMarkets: (m: Market[]) => void;
  setSymbol: (s: string) => void;
  setInterval: (i: Interval) => void;
  setTicker: (t: Ticker) => void;
  setBook: (b: OrderBook) => void;
  setTrades: (t: Trade[]) => void;
  pushTrade: (t: Trade) => void;
  setCandles: (key: string, c: Candle[]) => void;
  pushCandle: (key: string, c: Candle) => void;
  setAccount: (a: Account | null) => void;
  setOrderEvent: (o: Order) => void;
  clickPrice: (value: number) => void;
  setConn: (state: ConnState, info: { attempt: number; openedAt: number | null }) => void;
  login: () => void;
  logout: () => void;
  hydrateAuth: () => void;
  setHideConfirm: (v: boolean) => void;
  toast: (text: string, kind?: Toast["kind"], serverTs?: number) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 1;

function readFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(key) === "1") return true;
  } catch {
    /* ignore */
  }
  return document.cookie.split(";").some((c) => c.trim() === `${key}=1`);
}

function writeFlag(key: string, on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  document.cookie = on ? `${key}=1; path=/; max-age=31536000; samesite=lax` : `${key}=; path=/; max-age=0`;
}

export const useStore = create<TerminalState>((set, get) => ({
  markets: [],
  symbol: DEFAULT_SYMBOL,
  interval: "1m",
  tickers: {},
  book: null,
  trades: [],
  candles: [],
  candlesKey: "",
  account: null,
  connState: "closed",
  connection: "offline",
  connectedAt: null,
  reconnectAttempt: 0,
  loggedIn: false,
  hideConfirm: false,
  toasts: [],
  lastOrderEvent: null,
  clickedPrice: null,

  setMarkets: (markets) => set({ markets }),
  setSymbol: (symbol) => {
    if (symbol === get().symbol) return;
    set({ symbol, book: null, trades: [], candles: [], candlesKey: "" });
  },
  setInterval: (interval) => {
    if (interval === get().interval) return;
    set({ interval, candles: [], candlesKey: "" });
  },
  setTicker: (t) => set((s) => ({ tickers: { ...s.tickers, [t.symbol]: t } })),
  setBook: (b) => {
    if (b.symbol !== get().symbol) return;
    set({ book: b });
  },
  setTrades: (trades) => set({ trades: trades.slice(0, MAX_TRADES) }),
  pushTrade: (t) => {
    if (t.symbol !== get().symbol) return;
    set((s) => ({ trades: [t, ...s.trades].slice(0, MAX_TRADES) }));
  },
  setCandles: (key, candles) => set({ candlesKey: key, candles }),
  pushCandle: (key, c) => {
    const s = get();
    if (s.candlesKey !== key) return;
    const last = s.candles[s.candles.length - 1];
    if (last && last.t === c.t) {
      const next = s.candles.slice(0, -1);
      next.push(c);
      set({ candles: next });
    } else if (!last || c.t > last.t) {
      set({ candles: [...s.candles, c] });
    }
  },
  setAccount: (account) => set({ account }),
  setOrderEvent: (o) => set({ lastOrderEvent: o }),
  clickPrice: (value) => set((s) => ({ clickedPrice: { value, seq: (s.clickedPrice?.seq ?? 0) + 1 } })),
  setConn: (connState, info) =>
    set({
      connState,
      connection: connState === "open" ? "online" : connState === "reconnecting" || connState === "connecting" ? "reconnecting" : "offline",
      connectedAt: info.openedAt,
      reconnectAttempt: info.attempt,
    }),
  login: () => {
    writeFlag(LOGIN_KEY, true);
    set({ loggedIn: true });
  },
  logout: () => {
    writeFlag(LOGIN_KEY, false);
    set({ loggedIn: false });
  },
  hydrateAuth: () => set({ loggedIn: readFlag(LOGIN_KEY), hideConfirm: readFlag(HIDE_CONFIRM_KEY) }),
  setHideConfirm: (v) => {
    writeFlag(HIDE_CONFIRM_KEY, v);
    set({ hideConfirm: v });
  },
  toast: (text, kind = "info", serverTs = 0) => {
    const id = toastSeq++;
    set((s) => ({
      toasts: [...s.toasts, { id, text, kind, serverTs, clientTs: Date.now() }].slice(-MAX_TOASTS),
    }));
    setTimeout(() => get().dismissToast(id), 6000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Selected market object (or undefined until /api/markets loads). */
export const selectMarket = (s: TerminalState): Market | undefined =>
  s.markets.find((m) => m.symbol === s.symbol);

export const selectTicker = (s: TerminalState): Ticker | undefined => s.tickers[s.symbol];

/** Channels to subscribe for a symbol + interval. */
export function channelsFor(symbol: string, interval: Interval): string[] {
  return [`ticker:${symbol}`, `book:${symbol}`, `trades:${symbol}`, `candles:${symbol}:${interval}`, "account"];
}

/** Available balance of an asset from the account snapshot. */
export function availableOf(account: Account | null, asset: string): number {
  return account?.balances.find((b) => b.asset === asset)?.available ?? 0;
}

/** Build the URL path for a symbol: HYPE/USDC → /trade/HYPE/USDC. */
export function symbolPath(symbol: string): string {
  return `/trade/${symbol.split("/").map(encodeURIComponent).join("/")}`;
}
