/** Tiny REST helpers. Every server response carries `ts` (server ms); we always surface it. */

export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  ts: number;
  error?: string;
  data: T;
}

async function parse<T>(res: Response): Promise<ApiResult<T>> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const okField = typeof body.ok === "boolean" ? body.ok : res.ok;
  return {
    ok: res.ok && okField,
    status: res.status,
    ts: typeof body.ts === "number" ? body.ts : Date.now(),
    error: typeof body.error === "string" ? body.error : res.ok ? undefined : `HTTP ${res.status}`,
    data: body as T,
  };
}

export async function apiPost<T = Record<string, unknown>>(path: string, payload?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    });
    return await parse<T>(res);
  } catch (e) {
    return { ok: false, status: 0, ts: Date.now(), error: (e as Error).message, data: {} as T };
  }
}

export async function apiGet<T = Record<string, unknown>>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    return await parse<T>(res);
  } catch (e) {
    return { ok: false, status: 0, ts: Date.now(), error: (e as Error).message, data: {} as T };
  }
}

/** Servers may return a bare array or `{ items | fills | ledger | orders: [...] }`. */
export function pickArray<T>(data: unknown, ...keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const k of keys) if (Array.isArray(obj[k])) return obj[k] as T[];
  }
  return [];
}
