/**
 * Shared Go API origin for server actions (not exported as a server action).
 */
export function getApiBaseUrl(): string {
  const u = (process.env.API_BASE_URL ?? "http://127.0.0.1:8080").trim();
  return u.replace(/\/$/, "");
}

export async function fetchApiJson<T>(path: string): Promise<T> {
  const p = path.startsWith("/") ? path : `/${path}`;
  const r = await fetch(`${getApiBaseUrl()}${p}`, { cache: "no-store" });
  if (!r.ok) {
    throw new Error(r.statusText || String(r.status));
  }
  return r.json() as Promise<T>;
}
