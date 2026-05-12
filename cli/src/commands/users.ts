import { Command } from "commander";
import { request } from "../client.js";

interface User {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
}

function printUser(user: User) {
  console.log(`  ID:      ${user.id}`);
  console.log(`  Name:    ${user.name}`);
  if (user.email) console.log(`  Email:   ${user.email}`);
  console.log(`  Created: ${new Date(user.createdAt).toLocaleString()}`);
}

export function registerUserCommands(program: Command) {
  const users = program
    .command("users")
    .description("Manage users");

  // notify users:create --name="Alice" [--email="alice@example.com"]
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

  // notify users:list
  users
    .command("list")
    .description("List all users")
    .action(async () => {
      try {
        const data = await request<{ users: User[] }>("GET", "/users");
        if (data.users.length === 0) {
          console.log("No users found.");
          return;
        }
        console.log(`Found ${data.users.length} user(s):\n`);
        data.users.forEach((u, i) => {
          console.log(`[${i + 1}]`);
          printUser(u);
          console.log();
        });
      } catch (err) {
        console.error("❌", (err as Error).message);
        process.exit(1);
      }
    });
}
