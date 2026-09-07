/**
 * One process: Next.js (UI) + REST under /api/* + WebSocket at /ws.
 * PORT defaults to 3100. See server/README.md for the endpoint list.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import { FEE_RATES, type Faults, type PlaceOrderRequest, type WsMessage } from "../lib/types";
import { Exchange } from "./exchange";
import { getFaults, setFaults } from "./faults";
import { INTERVALS, MarketSim, loadSeed } from "./markets";
import { ROOT, log, sleep } from "./util";
import { accountView, fillView, previewView, tickerView } from "./view";

const PORT = Number(process.env.PORT ?? 3100);
const dev = process.env.NODE_ENV !== "production";

const { seed, source } = loadSeed();
log(`markets: ${seed.markets.length} loaded from ${source === "file" ? "data/seed.json" : "built-in fallback (data/seed.json missing)"}`);
const sim = new MarketSim(seed);
const exchange = new Exchange(sim);

// ---------- REST ----------

type Body = Record<string, unknown>;
function readBody(req: IncomingMessage): Promise<Body> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw) as Body); } catch { reject(new Error("Body must be valid JSON")); }
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" });
  res.end(JSON.stringify({ ...body, ts: Date.now() }));
}

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const f = getFaults();
  if (f.apiLatencyMs > 0) await sleep(f.apiLatencyMs); // fault: extra HTTP latency
  const method = req.method ?? "GET";
  const p = url.pathname.slice("/api".length);
  const sym = (prefix: string) => decodeURIComponent(p.slice(prefix.length));
  const notFound = (what = "Unknown market") => send(res, 404, { ok: false, error: what });

  if (method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PUT,OPTIONS", "access-control-allow-headers": "content-type" });
    res.end();
    return;
  }
  if (method === "GET") {
    if (p === "/markets") return send(res, 200, { markets: sim.list().filter((m) => m.symbol !== f.hideMarket) }); // fault: hideMarket
    if (p.startsWith("/ticker/")) { const t = sim.ticker(sym("/ticker/")); return t ? send(res, 200, { ticker: tickerView(t, f) }) : notFound(); }
    if (p.startsWith("/book/")) { const b = sim.book(sym("/book/")); return b ? send(res, 200, { book: b }) : notFound(); }
    if (p.startsWith("/trades/")) {
      const s = sym("/trades/");
      return sim.get(s) ? send(res, 200, { trades: sim.trades(s, Number(url.searchParams.get("limit") ?? 50)) }) : notFound();
    }
    if (p.startsWith("/candles/")) {
      const s = sym("/candles/");
      const interval = url.searchParams.get("interval") ?? "1m";
      if (!sim.get(s)) return notFound();
      if (!INTERVALS[interval]) return send(res, 400, { ok: false, error: `interval must be one of ${Object.keys(INTERVALS).join(", ")}` });
      return send(res, 200, { symbol: s, interval, candles: sim.candles(s, interval, Number(url.searchParams.get("limit") ?? 500)) });
    }
    if (p === "/account") return send(res, 200, { account: accountView(exchange, f) });
    if (p === "/orders") return send(res, 200, { orders: exchange.allOrders().sort((a, b) => b.createdAt - a.createdAt) });
    if (p === "/fills") return send(res, 200, { fills: exchange.fills.map((x) => fillView(x, f)).reverse() });
    if (p === "/ledger") return send(res, 200, { ledger: [...exchange.ledger].reverse() });
    if (p === "/faults") return send(res, 200, { faults: f });
    if (p === "/_truth") {
      return send(res, 200, {
        account: exchange.truth(), orders: exchange.allOrders(), fills: exchange.fills, ledger: exchange.ledger,
        positions: exchange.positionStates(), leverage: exchange.leverageSettings(), feesPaidUsd: exchange.totalFeesPaidUsd(), faults: f,
      });
    }
    return notFound("Unknown endpoint");
  }

  let body: Body;
  try { body = await readBody(req); } catch (e) { return send(res, 400, { ok: false, error: (e as Error).message }); }

  if (method === "PUT" && p === "/faults") return send(res, 200, { ok: true, faults: setFaults(body as Partial<Faults>) });
  if (method !== "POST") return notFound("Unknown endpoint");
  switch (p) {
    case "/order": {
      const r = exchange.placeOrder(body as unknown as PlaceOrderRequest, f);
      return send(res, r.ok ? 200 : 400, { ...r, fills: r.fills?.map((x) => fillView(x, f)) });
    }
    case "/preview": {
      const st = sim.get(String(body.symbol));
      if (!st) return notFound();
      const size = num(body.size);
      const limit = body.type === "limit" ? num(body.price) : NaN;
      const estPrice = Number.isFinite(limit) && limit > 0 ? limit : body.side === "sell" ? st.bids[0].price : st.asks[0].price;
      const feeRate = body.type === "limit" ? FEE_RATES.maker : FEE_RATES.taker;
      return send(res, 200, { ok: true, ...previewView({ notionalUsd: (size > 0 ? size : 0) * estPrice, feeRate, estPrice }, f) });
    }
    case "/cancel": {
      const r = exchange.cancel(String(body.orderId ?? ""), f);
      return r.ok ? send(res, 200, { ok: true, order: r.value }) : send(res, 400, { ok: false, error: r.error });
    }
    case "/cancel-all": return send(res, 200, { ok: true, cancelled: exchange.cancelAll(f, body.symbol ? String(body.symbol) : undefined) });
    case "/leverage": {
      const r = exchange.setLeverage(String(body.symbol), num(body.leverage), body.marginMode as "cross" | "isolated");
      return r.ok ? send(res, 200, { ok: true, symbol: body.symbol, ...r.value }) : send(res, 400, { ok: false, error: r.error });
    }
    case "/reset": { exchange.reset(); return send(res, 200, { ok: true }); }
    case "/deposit": { const r = exchange.deposit(num(body.amount)); return r.ok ? send(res, 200, { ok: true, entry: r.value }) : send(res, 400, { ok: false, error: r.error }); }
    case "/withdraw": { const r = exchange.withdraw(num(body.amount), body.address); return r.ok ? send(res, 200, { ok: true, entry: r.value }) : send(res, 400, { ok: false, error: r.error }); }
    case "/transfer": { const r = exchange.transfer(num(body.amount), body.direction); return r.ok ? send(res, 200, { ok: true, entry: r.value }) : send(res, 400, { ok: false, error: r.error }); }
    default: return notFound("Unknown endpoint");
  }
}

// ---------- WebSocket ----------

interface Client { ws: WebSocket; subs: Set<string>; connectedAt: number }
const clients = new Set<Client>();
const wss = new WebSocketServer({ noServer: true });

function push(c: Client, msg: WsMessage): void {
  if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
}
const ageSec = (c: Client) => (Date.now() - c.connectedAt) / 1000;
const frozen = (c: Client, afterSec: number) => afterSec > 0 && ageSec(c) > afterSec;

wss.on("connection", (ws) => {
  const c: Client = { ws, subs: new Set(), connectedAt: Date.now() };
  clients.add(c);
  ws.on("message", (raw) => {
    let msg: { type?: string; channels?: unknown };
    try { msg = JSON.parse(raw.toString()) as typeof msg; } catch { return; }
    if (msg.type === "ping") return push(c, { type: "pong", ts: Date.now() });
    const channels = Array.isArray(msg.channels) ? msg.channels.map(String) : [];
    if (msg.type === "subscribe") {
      for (const ch of channels) c.subs.add(ch);
      if (c.subs.has("account")) push(c, { type: "account", data: accountView(exchange, getFaults()) });
    } else if (msg.type === "unsubscribe") {
      for (const ch of channels) c.subs.delete(ch);
    }
  });
  ws.on("close", () => clients.delete(c));
  ws.on("error", () => clients.delete(c));
});

sim.on("tick", () => {
  const f = getFaults();
  for (const c of clients) {
    if (f.dropWsAfterSec > 0 && ageSec(c) > f.dropWsAfterSec) { c.ws.close(1001, "dropped by fault dropWsAfterSec"); clients.delete(c); continue; }
    for (const ch of c.subs) {
      const [kind, symbol, interval] = ch.split(":");
      if (kind === "ticker" && !frozen(c, f.freezeTickerAfterSec)) { const t = sim.ticker(symbol); if (t) push(c, { type: "ticker", data: tickerView(t, f) }); }
      else if (kind === "book" && !frozen(c, f.freezeBookAfterSec)) { const b = sim.book(symbol); if (b) push(c, { type: "book", data: b }); }
      else if (kind === "candles" && interval) { const cs = sim.candles(symbol, interval, 1); if (cs[0]) push(c, { type: "candle", data: { symbol, interval, candle: cs[0] } }); }
    }
  }
});
sim.on("trade", (trade) => { for (const c of clients) if (c.subs.has(`trades:${trade.symbol}`)) push(c, { type: "trade", data: trade }); });

const pushAccount = () => { const f = getFaults(); const a = accountView(exchange, f); for (const c of clients) if (c.subs.has("account")) push(c, { type: "account", data: a }); };
exchange.on("change", pushAccount);
exchange.on("order", (o) => { for (const c of clients) if (c.subs.has("account")) push(c, { type: "order", data: o }); });
exchange.on("fill", (x) => { const f = getFaults(); for (const c of clients) if (c.subs.has("account")) push(c, { type: "fill", data: fillView(x, f) }); });
setInterval(pushAccount, 2000);

// ---------- boot ----------

async function main(): Promise<void> {
  const app = next({ dev, dir: ROOT });
  let handle: ReturnType<typeof app.getRequestHandler> | null = null;
  let upgrade: ReturnType<typeof app.getUpgradeHandler> | null = null;
  try {
    await app.prepare();
    handle = app.getRequestHandler();
    upgrade = app.getUpgradeHandler();
  } catch (e) {
    log(`next.js not ready (${(e as Error).message}); serving API only`);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (url.pathname.startsWith("/api/")) {
      handleApi(req, res, url).catch((e: Error) => { log(`api error ${url.pathname}: ${e.stack ?? e.message}`); if (!res.headersSent) send(res, 500, { ok: false, error: e.message }); });
      return;
    }
    if (handle) void handle(req, res);
    else { res.writeHead(503, { "content-type": "text/plain" }); res.end("UI not available; API is at /api/*"); }
  });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (url.pathname === "/ws") wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    else if (upgrade) void upgrade(req, socket, head);
    else socket.destroy();
  });
  server.listen(PORT, () => {
    sim.start();
    log(`mock terminal on http://localhost:${PORT}  (REST /api/*, WS /ws, dev=${dev})`);
  });
  const shutdown = () => { sim.stop(); server.close(); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e: Error) => { console.error(e); process.exit(1); });
