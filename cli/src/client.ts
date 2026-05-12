// Thin HTTP client — all backend communication goes through here.
// No direct database access.

export function getApiUrl(): string {
  // Priority: --api-url flag (injected by commander) → env var → localhost default
  return process.env.NOTIFY_API_URL ?? "http://localhost:4000";
}

export function getApiKey(): string | undefined {
  // Priority: --api-key flag (injected by commander) → env var.
  return process.env.NOTIFY_API_KEY;
}

function buildHeaders(hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  const key = getApiKey();
  if (key) headers["X-API-Key"] = key;
  return headers;
}

export async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const base = getApiUrl().replace(/\/$/, "");
  const url = `${base}${path}`;

  const res = await fetch(url, {
    method,
    headers: buildHeaders(body !== undefined),
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();

  if (!res.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = parsed.message ?? parsed.error ?? text;
    } catch {
      // use raw text
    }
    throw new Error(`HTTP ${res.status}: ${message}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

// Streaming GET — returns the raw Response so callers can iterate the body
// (used by the SSE `stream` command). No retry, no JSON parsing.
export async function streamRequest(path: string): Promise<Response> {
  const base = getApiUrl().replace(/\/$/, "");
  const url = `${base}${path}`;

  const headers = buildHeaders(false);
  headers["Accept"] = "text/event-stream";

  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  if (!res.body) {
    throw new Error("server returned an empty body for streaming endpoint");
  }
  return res;
}
