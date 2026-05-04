/**
 * `openapi-fetch` returns `{ data, error, response }` on every call.
 * `unwrapApi` turns that into plain success data, or throws `Error` with
 * status + message so server actions can use a single `return unwrapApi(...)`.
 */
type ApiCall<T> = Promise<{
  data?: T;
  error?: unknown;
  response: Response;
}>;

export async function unwrapApi<T>(call: ApiCall<T>): Promise<T> {
  const { data, error, response } = await call;
  if (response.ok && data !== undefined) {
    return data;
  }

  let detail: string;
  if (typeof error === "string") {
    detail = error;
  } else if (error != null && typeof error === "object" && "message" in error) {
    detail = String((error as { message?: unknown }).message);
  } else {
    detail = await response.text().catch(() => response.statusText);
  }

  throw new Error(`${response.status} ${detail || response.statusText}`.trim());
}
