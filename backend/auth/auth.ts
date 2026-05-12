import { api, APIError, Gateway, Header } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

// --- Database ---
const db = new SQLDatabase("auth", { migrations: "./migrations" });

// --- Auth handler ---
//
// Reads the X-API-Key header and validates it against bcrypt hashes in the
// api_keys table. The validation scan is O(n); for a take-home with a handful
// of keys that's fine, but in production we'd shard by a key prefix (or use
// HMAC-based lookup) so verification stays O(1).

interface AuthParams {
  apiKey?: Header<"X-API-Key">;
}

interface AuthData {
  keyId: string;
}

export const auth = authHandler<AuthParams, AuthData>(async ({ apiKey }) => {
  // Toggle: setting AUTH_ENABLED=false in the environment lets every request
  // through with a placeholder identity. Useful for local development.
  if (process.env.AUTH_ENABLED === "false") {
    return { keyId: "auth-disabled" };
  }

  if (!apiKey) {
    throw APIError.unauthenticated("missing X-API-Key header");
  }

  for await (const row of db.query<{ id: string; key: string }>`
    SELECT id, key FROM api_keys
  `) {
    if (await bcrypt.compare(apiKey, row.key)) {
      return { keyId: row.id };
    }
  }

  throw APIError.unauthenticated("invalid api key");
});

// The Gateway wires the auth handler to every endpoint flagged with auth: true.
export const gateway = new Gateway({ authHandler: auth });

// --- Endpoints ---

interface CreateKeyParams {
  name: string;
}

interface CreateKeyResponse {
  id: string;
  key: string;
  name: string;
  createdAt: string;
}

// POST /auth/keys — bootstrap endpoint to mint a new key. Intentionally
// unauthenticated so the very first key can be created; in production this
// would either be guarded by an admin-only auth handler or be a CLI/cron job
// that talks directly to the database.
export const createKey = api(
  { method: "POST", path: "/auth/keys", expose: true },
  async (params: CreateKeyParams): Promise<CreateKeyResponse> => {
    if (!params.name || params.name.trim() === "") {
      throw APIError.invalidArgument("name is required");
    }

    const raw = randomBytes(32).toString("hex");
    const hash = await bcrypt.hash(raw, 10);

    const row = await db.queryRow<{
      id: string;
      name: string;
      created_at: Date;
    }>`
      INSERT INTO api_keys (key, name)
      VALUES (${hash}, ${params.name.trim()})
      RETURNING id, name, created_at
    `;

    if (!row) throw new Error("failed to create api key");

    return {
      id: row.id,
      key: raw,
      name: row.name,
      createdAt: row.created_at.toISOString(),
    };
  }
);

interface VerifyResponse {
  ok: true;
  keyId: string;
}

// GET /auth/verify — round-trips a key through the auth handler and echoes
// the resolved key id. Useful for the CLI to confirm credentials work.
export const verify = api(
  { method: "GET", path: "/auth/verify", expose: true, auth: true },
  async (): Promise<VerifyResponse> => {
    // Lazy import so this file doesn't crash at startup if the codegen folder
    // hasn't been produced yet (e.g. during `encore check` before migrations).
    const { getAuthData } = await import("~encore/auth");
    const data = getAuthData() as AuthData;
    return { ok: true, keyId: data.keyId };
  }
);
