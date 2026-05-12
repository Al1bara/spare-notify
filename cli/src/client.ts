// Thin HTTP client — all backend communication goes through here.
// No direct database access.

export function getApiUrl(): string {
  // Priority: --api-url flag (injected by commander) → env var → localhost default
  return process.env.NOTIFY_API_URL ?? "http://localhost:4000";
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
    headers: { "Content-Type": "application/json" },
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
