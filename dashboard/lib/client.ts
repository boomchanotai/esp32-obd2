import createClient, { type Middleware } from "openapi-fetch";

import type { paths } from "@/api/schema";

function apiBaseUrl(): string {
  const raw =
    process.env.API_URL ??
    process.env.BACKEND_URL ??
    "http://127.0.0.1:8080/api";
  return raw.replace(/\/$/, "");
}

const middleware: Middleware = {
  async onRequest({ request }) {
    const key = process.env.API_KEY ?? process.env.BACKEND_API_KEY;
    if (key) {
      request.headers.set("X-API-Key", key);
    }
    return request;
  },
};

const client = createClient<paths>({
  baseUrl: apiBaseUrl(),
});

client.use(middleware);

export { client };
