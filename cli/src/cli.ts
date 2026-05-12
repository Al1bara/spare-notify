#!/usr/bin/env bun
import { Command } from "commander";
import { registerUserCommands } from "./commands/users.js";
import { registerNotificationCommands } from "./commands/notifications.js";

const program = new Command();

program
  .name("notify")
  .description("Spare Notify CLI — interact with the notification backend")
  .version("1.0.0")
  .option(
    "--api-url <url>",
    "Backend API URL (overrides NOTIFY_API_URL env var)",
    (url) => {
      process.env.NOTIFY_API_URL = url;
    }
  );

registerUserCommands(program);
registerNotificationCommands(program);

program.parseAsync(process.argv).catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
