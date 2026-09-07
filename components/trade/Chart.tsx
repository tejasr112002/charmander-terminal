"use client";
/**
 * Candlestick + volume chart (lightweight-charts v5). Seeded from the store's candles
 * (GET /api/candles) and updated in place as WS candle pushes land.
 */
import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { INTERVALS, selectMarket, useStore, type Interval } from "@/lib/store";
import { fmtPrice, fmtNum } from "@/lib/format";
import type { Candle } from "@/lib/types";

const GREEN = "#1fa67d";
const RED = "#ef5350";

export function Chart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const appliedRef = useRef<{ key: string; len: number; lastT: number }>({ key: "", len: 0, lastT: 0 });
  const [ready, setReady] = useState(false);

  const candles = useStore((s) => s.candles);
  const candlesKey = useStore((s) => s.candlesKey);
  const interval = useStore((s) => s.interval);
  const setInterval_ = useStore((s) => s.setInterval);
  const market = useStore(selectMarket);
  const pd = market?.priceDecimals ?? 2;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let disposed = false;
    let ro: ResizeObserver | null = null;
    import("lightweight-charts").then((lc) => {
      if (disposed || !containerRef.current) return;
      const chart = lc.createChart(el, {
        layout: { background: { type: lc.ColorType.Solid, color: "#131f26" }, textColor: "#9fb2bb", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11 },
        grid: { vertLines: { color: "#1c2b33" }, horzLines: { color: "#1c2b33" } },
        crosshair: { mode: lc.CrosshairMode.Normal },
        rightPriceScale: { borderColor: "#223540", scaleMargins: { top: 0.08, bottom: 0.25 } },
        timeScale: { borderColor: "#223540", timeVisible: true, secondsVisible: false, rightOffset: 4 },
        autoSize: true,
      });
      const candle = chart.addSeries(lc.CandlestickSeries, {
        upColor: GREEN,
        downColor: RED,
        borderUpColor: GREEN,
        borderDownColor: RED,
        wickUpColor: GREEN,
        wickDownColor: RED,
        priceFormat: { type: "price", precision: pd, minMove: Math.pow(10, -pd) },
      });
      const vol = chart.addSeries(lc.HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
      });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      chartRef.current = chart;
      candleRef.current = candle;
      volRef.current = vol;
      appliedRef.current = { key: "", len: 0, lastT: 0 };
      ro = new ResizeObserver(() => chart.applyOptions({ autoSize: true }));
      ro.observe(el);
      setReady(true);
    });
    return () => {
      disposed = true;
      ro?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      setReady(false);
    };
    // Re-create when precision changes (new market).
  }, [pd]);

  useEffect(() => {
    const candle = candleRef.current;
    const vol = volRef.current;
    if (!ready || !candle || !vol) return;
    const applied = appliedRef.current;
    const last = candles[candles.length - 1];
    if (applied.key !== candlesKey || candles.length < applied.len || candles.length - applied.len > 1) {
      candle.setData(candles.map(toBar));
      vol.setData(candles.map(toVol));
      chartRef.current?.timeScale().fitContent();
    } else if (last && (candles.length !== applied.len || last.t >= applied.lastT)) {
      candle.update(toBar(last));
      vol.update(toVol(last));
    }
    appliedRef.current = { key: candlesKey, len: candles.length, lastT: last?.t ?? 0 };
  }, [candles, candlesKey, ready]);

  const last = candles[candles.length - 1];
  return (
    <>
      <div className="chart-bar">
        {INTERVALS.map((i: Interval) => (
          <button key={i} className={i === interval ? "active" : ""} onClick={() => setInterval_(i)} data-testid={`interval-${i}`}>
            {i}
          </button>
        ))}
        {last && (
          <div className="ohlc">
            <span>
              O <b className={last.c >= last.o ? "up" : "down"}>{fmtPrice(last.o, pd)}</b>
            </span>
            <span>
              H <b className={last.c >= last.o ? "up" : "down"}>{fmtPrice(last.h, pd)}</b>
            </span>
            <span>
              L <b className={last.c >= last.o ? "up" : "down"}>{fmtPrice(last.l, pd)}</b>
            </span>
            <span>
              C <b className={last.c >= last.o ? "up" : "down"}>{fmtPrice(last.c, pd)}</b>
            </span>
            <span>Vol {fmtNum(last.v, market?.sizeDecimals ?? 2)}</span>
          </div>
        )}
      </div>
      <div className="chart-body" data-testid="chart">
        <div ref={containerRef} />
      </div>
    </>
  );
}

function toBar(c: Candle) {
  return { time: (c.t / 1000) as UTCTimestamp, open: c.o, high: c.h, low: c.l, close: c.c };
}
function toVol(c: Candle) {
  return { time: (c.t / 1000) as UTCTimestamp, value: c.v, color: c.c >= c.o ? "rgba(31,166,125,0.45)" : "rgba(239,83,80,0.45)" };
}
