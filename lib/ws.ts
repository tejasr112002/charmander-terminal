/**
 * Small reconnecting WebSocket client for /ws on the same origin.
 * - exponential backoff (500ms → 10s) with jitter
 * - remembers subscriptions and re-sends them after every (re)connect
 * - pings every 15s
 * - exposes connection state through a listener
 */
import type { WsMessage } from "@/lib/types";

export type ConnState = "connecting" | "open" | "reconnecting" | "closed";

type MsgListener = (msg: WsMessage) => void;
type StateListener = (state: ConnState, info: { attempt: number; openedAt: number | null }) => void;

const PING_MS = 15_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 10_000;

export class WsClient {
  private ws: WebSocket | null = null;
  private channels = new Set<string>();
  private msgListeners = new Set<MsgListener>();
  private stateListeners = new Set<StateListener>();
  private attempt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private openedAt: number | null = null;
  state: ConnState = "closed";

  constructor(private url?: string) {}

  private resolveUrl(): string {
    if (this.url) return this.url;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }

  connect() {
    if (typeof window === "undefined") return;
    this.stopped = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.setState(this.attempt === 0 ? "connecting" : "reconnecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.resolveUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (ws !== this.ws) return;
      this.attempt = 0;
      this.openedAt = Date.now();
      this.setState("open");
      this.flushSubscribe();
      this.startPing();
    };
    ws.onmessage = (ev) => {
      let msg: WsMessage | null = null;
      try {
        msg = JSON.parse(String(ev.data)) as WsMessage;
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;
      for (const l of this.msgListeners) l(msg);
    };
    ws.onerror = () => {
      /* onclose follows; nothing to do here */
    };
    ws.onclose = () => {
      if (ws !== this.ws) return;
      this.stopPing();
      this.ws = null;
      this.openedAt = null;
      if (this.stopped) {
        this.setState("closed");
        return;
      }
      this.scheduleReconnect();
    };
  }

  close() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopPing();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.setState("closed");
  }

  subscribe(channels: string[]) {
    let changed = false;
    for (const c of channels) {
      if (!this.channels.has(c)) {
        this.channels.add(c);
        changed = true;
      }
    }
    if (changed) this.flushSubscribe(channels);
  }

  unsubscribe(channels: string[]) {
    const removed: string[] = [];
    for (const c of channels) if (this.channels.delete(c)) removed.push(c);
    if (removed.length) this.send({ type: "unsubscribe", channels: removed });
  }

  /** Replace the whole subscription set (used when the selected market changes). */
  setChannels(channels: string[]) {
    const next = new Set(channels);
    const toRemove = [...this.channels].filter((c) => !next.has(c));
    const toAdd = channels.filter((c) => !this.channels.has(c));
    if (toRemove.length) this.unsubscribe(toRemove);
    if (toAdd.length) this.subscribe(toAdd);
  }

  onMessage(l: MsgListener): () => void {
    this.msgListeners.add(l);
    return () => this.msgListeners.delete(l);
  }

  onState(l: StateListener): () => void {
    this.stateListeners.add(l);
    l(this.state, { attempt: this.attempt, openedAt: this.openedAt });
    return () => this.stateListeners.delete(l);
  }

  private send(obj: unknown): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  private flushSubscribe(only?: string[]) {
    const list = only ?? [...this.channels];
    if (list.length) this.send({ type: "subscribe", channels: list });
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => this.send({ type: "ping" }), PING_MS);
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.attempt += 1;
    this.setState("reconnecting");
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * Math.pow(2, this.attempt - 1));
    const delay = base * (0.7 + Math.random() * 0.6);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private setState(s: ConnState) {
    this.state = s;
    for (const l of this.stateListeners) l(s, { attempt: this.attempt, openedAt: this.openedAt });
  }
}

let singleton: WsClient | null = null;
/** One shared client for the whole app. */
export function getWs(): WsClient {
  if (!singleton) singleton = new WsClient();
  return singleton;
}
