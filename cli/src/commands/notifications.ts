import { Command } from "commander";
import { request, streamRequest } from "../client.js";

interface Notification {
  id: string;
  userId: string;
  channel: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface NotificationsPage {
  data: Notification[];
  nextCursor: string | null;
  hasMore: boolean;
}

function printNotification(n: Notification) {
  const status = n.read ? "✓ read" : "● unread";
  console.log(`  ID:      ${n.id}`);
  console.log(`  Channel: ${n.channel}`);
  console.log(`  Title:   ${n.title}`);
  console.log(`  Body:    ${n.body}`);
  console.log(`  Status:  ${status}`);
  console.log(`  Sent:    ${new Date(n.createdAt).toLocaleString()}`);
}

function parseLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--limit must be a positive integer, got "${raw}"`);
  }
  return Math.floor(n);
}

function buildPageQuery(userId: string, limit?: number, cursor?: string): string {
  const qs = new URLSearchParams();
  qs.set("userId", userId);
  if (limit !== undefined) qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", cursor);
  return `?${qs.toString()}`;
}

async function renderPage(path: string, opts: { limit?: string; cursor?: string; userId: string }) {
  const limit = parseLimit(opts.limit);
  const data = await request<NotificationsPage>(
    "GET",
    `${path}${buildPageQuery(opts.userId, limit, opts.cursor)}`
  );
  if (data.data.length === 0) {
    console.log("No notifications found.");
    return;
  }
  console.log(`Found ${data.data.length} notification(s):\n`);
  data.data.forEach((n, i) => {
    console.log(`[${i + 1}]`);
    printNotification(n);
    console.log();
  });
  if (data.hasMore && data.nextCursor) {
    console.log(`More results available. Next cursor: ${data.nextCursor}`);
  }
}

export function registerNotificationCommands(program: Command) {
  // notify send --user-id=<id> --channel=in_app --title="Hello" --body="Welcome!"
  program
    .command("send")
    .description("Send a notification to a user")
    .requiredOption("--user-id <userId>", "Target user ID")
    .requiredOption("--channel <channel>", "Channel: in_app or email")
    .requiredOption("--title <title>", "Notification title")
    .requiredOption("--body <body>", "Notification body")
    .action(async (opts) => {
      try {
        const data = await request<{ notification: Notification }>(
          "POST",
          "/notifications",
          {
            userId: opts.userId,
            channel: opts.channel,
            title: opts.title,
            body: opts.body,
          }
        );
        console.log("✅ Notification sent:");
        printNotification(data.notification);
      } catch (err) {
        console.error("❌", (err as Error).message);
        process.exit(1);
      }
    });

  // notify list --user-id=<id> [--limit=20] [--cursor=<id>]
  program
    .command("list")
    .description("List notifications for a user (paginated)")
    .requiredOption("--user-id <userId>", "User ID")
    .option("--limit <n>", "Page size (default 20, max 100)")
    .option("--cursor <id>", "Pagination cursor from a previous response")
    .action(async (opts) => {
      try {
        await renderPage("/notifications", opts);
      } catch (err) {
        console.error("❌", (err as Error).message);
        process.exit(1);
      }
    });

  // notify unread --user-id=<id> [--limit=20] [--cursor=<id>]
  program
    .command("unread")
    .description("List unread notifications for a user (paginated)")
    .requiredOption("--user-id <userId>", "User ID")
    .option("--limit <n>", "Page size (default 20, max 100)")
    .option("--cursor <id>", "Pagination cursor from a previous response")
    .action(async (opts) => {
      try {
        await renderPage("/notifications/unread", opts);
      } catch (err) {
        console.error("❌", (err as Error).message);
        process.exit(1);
      }
    });

  // notify read --id=<notification-id>
  program
    .command("read")
    .description("Mark a notification as read")
    .requiredOption("--id <id>", "Notification ID")
    .action(async (opts) => {
      try {
        const data = await request<{ notification: Notification }>(
          "PATCH",
          `/notifications/${opts.id}/read`
        );
        console.log("✅ Marked as read:");
        printNotification(data.notification);
      } catch (err) {
        console.error("❌", (err as Error).message);
        process.exit(1);
      }
    });

  // notify stream --user-id=<id>
  // Subscribes to the SSE endpoint and prints incoming notifications until SIGINT.
  program
    .command("stream")
    .description("Subscribe to real-time notifications for a user via SSE")
    .requiredOption("--user-id <userId>", "User ID")
    .action(async (opts) => {
      const url = `/notifications/stream?userId=${encodeURIComponent(opts.userId)}`;

      let aborted = false;
      const onSigint = () => {
        if (aborted) return;
        aborted = true;
        console.log("\n👋 Disconnected.");
        process.exit(0);
      };
      process.on("SIGINT", onSigint);

      let res: Response;
      try {
        res = await streamRequest(url);
      } catch (err) {
        console.error("❌", (err as Error).message);
        process.exit(1);
      }

      console.log(`📡 Connected to ${url}. Press Ctrl+C to disconnect.\n`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by a blank line.
        let sep = buffer.indexOf("\n\n");
        while (sep !== -1) {
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          handleEvent(block);
          sep = buffer.indexOf("\n\n");
        }
      }
    });
}

function handleEvent(block: string) {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue; // SSE comment / heartbeat
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
  }
  if (dataLines.length === 0) return;
  const raw = dataLines.join("\n");

  if (event === "ready") {
    console.log("✅ Stream ready.\n");
    return;
  }
  if (event === "notification") {
    try {
      const n = JSON.parse(raw) as Notification;
      console.log("🔔 New notification:");
      printNotification(n);
      console.log();
    } catch {
      console.log("Received malformed notification payload:", raw);
    }
    return;
  }
  console.log(`Event ${event}:`, raw);
}
