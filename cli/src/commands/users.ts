import { Command } from "commander";
import { request } from "../client.js";

interface User {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
}

interface UsersPage {
  data: User[];
  nextCursor: string | null;
  hasMore: boolean;
}

function printUser(user: User) {
  console.log(`  ID:      ${user.id}`);
  console.log(`  Name:    ${user.name}`);
  if (user.email) console.log(`  Email:   ${user.email}`);
  console.log(`  Created: ${new Date(user.createdAt).toLocaleString()}`);
}

function parseLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--limit must be a positive integer, got "${raw}"`);
  }
  return Math.floor(n);
}

export function registerUserCommands(program: Command) {
  const users = program
    .command("users")
    .description("Manage users");

  // notify users create --name="Alice" [--email="alice@example.com"]
  users
    .command("create")
    .description("Create a new user")
    .requiredOption("--name <name>", "User display name")
    .option("--email <email>", "User email address")
    .action(async (opts) => {
      try {
        const data = await request<{ user: User }>("POST", "/users", {
          name: opts.name,
          email: opts.email,
        });
        console.log("✅ User created:");
        printUser(data.user);
      } catch (err) {
        console.error("❌", (err as Error).message);
        process.exit(1);
      }
    });

  // notify users list [--limit=20] [--cursor=<id>]
  users
    .command("list")
    .description("List all users (paginated)")
    .option("--limit <n>", "Page size (default 20, max 100)")
    .option("--cursor <id>", "Pagination cursor from a previous response")
    .action(async (opts) => {
      try {
        const limit = parseLimit(opts.limit);
        const qs = new URLSearchParams();
        if (limit !== undefined) qs.set("limit", String(limit));
        if (opts.cursor) qs.set("cursor", opts.cursor);
        const suffix = qs.toString() ? `?${qs.toString()}` : "";

        const data = await request<UsersPage>("GET", `/users${suffix}`);
        if (data.data.length === 0) {
          console.log("No users found.");
          return;
        }
        console.log(`Found ${data.data.length} user(s):\n`);
        data.data.forEach((u, i) => {
          console.log(`[${i + 1}]`);
          printUser(u);
          console.log();
        });
        if (data.hasMore && data.nextCursor) {
          console.log(`More results available. Next cursor: ${data.nextCursor}`);
        }
      } catch (err) {
        console.error("❌", (err as Error).message);
        process.exit(1);
      }
    });
}
