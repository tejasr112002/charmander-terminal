/**
 * Thin REST client for the fake exchange. Every call goes to the same origin (/api/*).
 * Symbols with "/" are URL-encoded (HYPE%2FUSDC).
 */
import type {
  Account,
  Candle,
  Market,
  PlaceOrderRequest,
  PlaceOrderResponse,
} from "@/lib/types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, msg);
  }
  return init?.method && init.method !== "GET" ? (body as T) : unwrap<T>(body);
}

/** The server wraps payloads: {markets:[...], ts} / {account:{...}, ts} / {candles:[...], symbol, interval}. Unwrap the payload key. */
function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    for (const k of ["markets", "account", "candles", "ticker", "book", "trades", "fills", "orders", "ledger", "faults"]) {
      if (k in o) return o[k] as T;
    }
  }
  return body as T;
}

function post<T>(path: string, data: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(data) });
}

export const encodeSymbol = (symbol: string) => encodeURIComponent(symbol);

export const api = {
  markets: () => request<Market[]>("/api/markets"),
  account: () => request<Account>("/api/account"),
  candles: (symbol: string, interval: string) =>
    request<Candle[]>(`/api/candles/${encodeSymbol(symbol)}?interval=${encodeURIComponent(interval)}`),
  placeOrder: (req: PlaceOrderRequest) => post<PlaceOrderResponse>("/api/order", req),
  cancel: (orderId: string) => post<{ ok: boolean; error?: string; ts: number }>("/api/cancel", { orderId }),
  cancelAll: () => post<{ ok: boolean; error?: string; ts: number }>("/api/cancel-all", {}),
  setLeverage: (symbol: string, leverage: number, marginMode: "cross" | "isolated") =>
    post<{ ok: boolean; error?: string; ts: number }>("/api/leverage", { symbol, leverage, marginMode }),
};
