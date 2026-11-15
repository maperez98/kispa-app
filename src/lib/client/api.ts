// Cliente HTTP con cabecera de empresa (x-company-id), manejo de errores y
// cola local de operaciones cuando no hay conexión (se sincroniza vía
// /api/outbox con clientOpId idempotente).
export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(message: string, status: number, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data ?? {};
  }
}

export function getCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("kispa_company");
}

export function setCompanyId(id: string) {
  localStorage.setItem("kispa_company", id);
}

function enqueue(path: string, method: string, body: unknown) {
  try {
    const q = JSON.parse(localStorage.getItem("kispa_outbox") ?? "[]") as unknown[];
    q.push({ clientOpId: crypto.randomUUID(), path, method, body });
    localStorage.setItem("kispa_outbox", JSON.stringify(q));
  } catch {
    /* almacenamiento lleno: se reintenta en la siguiente operación */
  }
}

export function pendingOpsCount(): number {
  try {
    return (JSON.parse(localStorage.getItem("kispa_outbox") ?? "[]") as unknown[]).length;
  } catch {
    return 0;
  }
}

function mapOp(op: { clientOpId: string; path: string; method: string; body: unknown }) {
  const url = new URL(op.path, "http://x");
  const module = url.searchParams.get("module");
  const id = url.searchParams.get("id");
  const body = (op.body ?? {}) as Record<string, unknown>;
  if (op.path.startsWith("/api/resource") && module) {
    return {
      clientOpId: op.clientOpId,
      entity: module,
      operation: op.method === "POST" ? "create" : op.method === "DELETE" ? "delete" : "update",
      payload: { ...body, ...(id ? { id } : {}) },
    };
  }
  if (op.path.startsWith("/api/products")) {
    if (url.searchParams.get("movement") === "1" && id) {
      return { clientOpId: op.clientOpId, entity: "products", operation: "update", payload: { id, movement: body } };
    }
    return {
      clientOpId: op.clientOpId,
      entity: "products",
      operation: op.method === "POST" ? "create" : op.method === "DELETE" ? "delete" : "update",
      payload: { ...body, ...(id ? { id } : {}) },
    };
  }
  if (op.path.startsWith("/api/sales")) {
    return {
      clientOpId: op.clientOpId,
      entity: "sales",
      operation: op.method === "POST" ? "create" : "update",
      payload: { ...body, ...(id ? { id } : {}) },
    };
  }
  return null;
}

export async function flushOutbox(): Promise<number> {
  const q = (JSON.parse(localStorage.getItem("kispa_outbox") ?? "[]") as Array<{
    clientOpId: string;
    path: string;
    method: string;
    body: unknown;
  }>) || [];
  if (!q.length) return 0;
  const ops = q.map(mapOp).filter(Boolean) as Array<Record<string, unknown>>;
  if (!ops.length) {
    localStorage.removeItem("kispa_outbox");
    return 0;
  }
  const res = await fetch("/api/outbox", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-company-id": getCompanyId() ?? "" },
    body: JSON.stringify({ ops }),
  });
  if (res.ok) {
    localStorage.removeItem("kispa_outbox");
    return ops.length;
  }
  return 0;
}

export function onOnlineFlush(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    void flushOutbox().then((n) => {
      if (n > 0) cb();
    });
  };
  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}

export async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const cid = getCompanyId();
  if (cid) headers["x-company-id"] = cid;
  if (opts?.headers) Object.assign(headers, opts.headers);
  let res: Response;
  try {
    res = await fetch(path, { ...opts, headers, credentials: "same-origin" });
  } catch {
    if (opts?.method && opts.method !== "GET" && opts.body) {
      enqueue(path, opts.method, JSON.parse(String(opts.body)));
    }
    throw new ApiError("Sin conexión: la operación quedó en la cola local y se sincronizará automáticamente.", 0);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(data.error ?? `Error ${res.status}`), res.status, data);
  return data as T;
}
