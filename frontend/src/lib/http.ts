"use client";

// All calls go through the Next.js server-side proxy (/api/proxy/*), which forwards them to
// the ASP.NET API: the browser never talks to the backend directly.
const API_BASE = "/api/proxy";

export type Role = "bank" | "admin";

const TOKEN_KEYS: Record<Role, string> = { bank: "fds_bank_token", admin: "fds_admin_token" };
const LOGIN_PATH: Record<Role, string> = { bank: "/bank/login", admin: "/admin/login" };

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const tokens = {
  get: (role: Role) => safe(() => localStorage.getItem(TOKEN_KEYS[role]), null as string | null),
  set: (role: Role, t: string) => safe(() => localStorage.setItem(TOKEN_KEYS[role], t), undefined),
  clear: (role: Role) => safe(() => localStorage.removeItem(TOKEN_KEYS[role]), undefined),
};

export function getDeviceId(): string {
  return safe(() => {
    let id = localStorage.getItem("fds_device_id");
    if (!id) {
      id = "dev-" + (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) ;
      localStorage.setItem("fds_device_id", id);
    }
    return id;
  }, "dev-unknown");
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function buildQuery(query?: Query) {
  if (!query) return "";
  const p = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function rawFetch(role: Role, path: string, method: string, body?: unknown, query?: Query) {
  const token = tokens.get(role);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${buildQuery(query)}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        "X-Device-Id": getDeviceId(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check that the backend is running.", 0);
  }

  if (res.status === 401 && token && !path.startsWith("/auth/")) {
    tokens.clear(role);
    if (typeof window !== "undefined") window.location.href = LOGIN_PATH[role];
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }
  return res;
}

export async function api<T = unknown>(
  role: Role,
  path: string,
  opts: { method?: string; body?: unknown; query?: Query } = {},
): Promise<T> {
  const res = await rawFetch(role, path, opts.method ?? "GET", opts.body, opts.query);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const d = data as { message?: string; code?: string } | null;
    throw new ApiError(d?.message ?? `Request failed (${res.status})`, res.status, d?.code);
  }
  return data as T;
}

// Fetches a file (CSV export, database backup) with the auth header and saves it.
export async function downloadFile(role: Role, path: string, filename: string, query?: Query) {
  const res = await rawFetch(role, path, "GET", undefined, query);
  if (!res.ok) throw new ApiError(`Download failed (${res.status})`, res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
