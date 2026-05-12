import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";

// --- Database ---
const db = new SQLDatabase("users", { migrations: "./migrations" });

// --- Types ---
export interface User {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
}

interface CreateUserParams {
  name: string;
  email?: string;
}

interface CreateUserResponse {
  user: User;
}

interface ListUsersParams {
  limit?: number;
  cursor?: string;
}

interface ListUsersResponse {
  data: User[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  created_at: Date;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at.toISOString(),
  };
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// --- Endpoints ---

// POST /users
export const createUser = api(
  { method: "POST", path: "/users", expose: true, auth: true },
  async (params: CreateUserParams): Promise<CreateUserResponse> => {
    if (!params.name || params.name.trim() === "") {
      throw APIError.invalidArgument("name is required");
    }

    const row = await db.queryRow<UserRow>`
      INSERT INTO users (name, email)
      VALUES (${params.name.trim()}, ${params.email ?? null})
      RETURNING id, name, email, created_at
    `;

    if (!row) throw new Error("failed to create user");

    return { user: rowToUser(row) };
  }
);

// GET /users — cursor pagination (cursor = id of last row from previous page).
export const listUsers = api(
  { method: "GET", path: "/users", expose: true, auth: true },
  async (params: ListUsersParams): Promise<ListUsersResponse> => {
    const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const fetchSize = limit + 1;

    const rows: UserRow[] = [];

    if (params.cursor) {
      for await (const row of db.query<UserRow>`
        SELECT id, name, email, created_at
        FROM users
        WHERE created_at < (SELECT created_at FROM users WHERE id = ${params.cursor})
        ORDER BY created_at DESC
        LIMIT ${fetchSize}
      `) {
        rows.push(row);
      }
    } else {
      for await (const row of db.query<UserRow>`
        SELECT id, name, email, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT ${fetchSize}
      `) {
        rows.push(row);
      }
    }

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).map(rowToUser);
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return { data: page, nextCursor, hasMore };
  }
);
