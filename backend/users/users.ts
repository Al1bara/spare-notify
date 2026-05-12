import { api } from "encore.dev/api";
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

interface ListUsersResponse {
  users: User[];
}

// --- Endpoints ---

// POST /users
export const createUser = api(
  { method: "POST", path: "/users", expose: true },
  async (params: CreateUserParams): Promise<CreateUserResponse> => {
    if (!params.name || params.name.trim() === "") {
      throw new Error("name is required");
    }

    const row = await db.queryRow<{
      id: string;
      name: string;
      email: string | null;
      created_at: Date;
    }>`
      INSERT INTO users (name, email)
      VALUES (${params.name.trim()}, ${params.email ?? null})
      RETURNING id, name, email, created_at
    `;

    if (!row) throw new Error("failed to create user");

    return {
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        createdAt: row.created_at.toISOString(),
      },
    };
  }
);

// GET /users
export const listUsers = api(
  { method: "GET", path: "/users", expose: true },
  async (): Promise<ListUsersResponse> => {
    const users: User[] = [];

    for await (const row of db.query<{
      id: string;
      name: string;
      email: string | null;
      created_at: Date;
    }>`SELECT id, name, email, created_at FROM users ORDER BY created_at DESC`) {
      users.push({
        id: row.id,
        name: row.name,
        email: row.email,
        createdAt: row.created_at.toISOString(),
      });
    }

    return { users };
  }
);
