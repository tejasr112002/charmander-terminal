"use client";
/**
 * Wires the WebSocket + REST seeds into the store. Mounted once in the root layout.
 * Subscribes to the selected market's channels, re-subscribes on reconnect (the ws client
 * does that), and re-seeds candles when symbol/interval change.
 */
import { useEffect, type ReactNode } from "react";
import { api } from "@/lib/api";
import { channelsFor, useStore } from "@/lib/store";
import { getWs } from "@/lib/ws";
import type { WsMessage } from "@/lib/types";

export function FeedProvider({ children }: { children: ReactNode }) {
  const symbol = useStore((s) => s.symbol);
  const interval = useStore((s) => s.interval);
  const connState = useStore((s) => s.connState);

  // One-time: auth flag, markets, account, socket.
  useEffect(() => {
    const st = useStore.getState();
    st.hydrateAuth();
    api.markets().then(st.setMarkets).catch(() => st.toast("Failed to load markets", "error"));
    api.account().then(st.setAccount).catch(() => undefined);

    const ws = getWs();
    const offState = ws.onState((state, info) => useStore.getState().setConn(state, info));
    const offMsg = ws.onMessage((msg: WsMessage) => {
      const s = useStore.getState();
      switch (msg.type) {
        case "ticker":
          s.setTicker(msg.data);
          break;
        case "book":
          s.setBook(msg.data);
          break;
        case "trade":
          s.pushTrade(msg.data);
          break;
        case "candle":
          s.pushCandle(`${msg.data.symbol}:${msg.data.interval}`, msg.data.candle);
          break;
        case "account":
          s.setAccount(msg.data);
          break;
        case "order":
          s.setOrderEvent(msg.data);
          break;
        case "fill":
        case "pong":
          break;
      }
    });
    ws.connect();
    return () => {
      offState();
      offMsg();
    };
  }, []);

  // Subscriptions follow the selected market/interval.
  useEffect(() => {
    getWs().setChannels(channelsFor(symbol, interval));
  }, [symbol, interval]);

  // Seed candles from REST whenever symbol/interval change or the socket comes back.
  useEffect(() => {
    if (connState !== "open") return;
    let cancelled = false;
    const key = `${symbol}:${interval}`;
    api
      .candles(symbol, interval)
      .then((c) => {
        if (!cancelled && useStore.getState().symbol === symbol) useStore.getState().setCandles(key, c);
      })
      .catch(() => undefined);
    // Refresh the account snapshot after a reconnect too (WS may have missed pushes).
    api.account().then((a) => !cancelled && useStore.getState().setAccount(a)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [symbol, interval, connState]);

  return <>{children}</>;
}
