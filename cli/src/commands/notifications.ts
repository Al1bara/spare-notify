import { Command } from "commander";
import { request } from "../client.js";

interface Notification {
  id: string;
  userId: string;
  channel: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
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

  // notify list --user-id=<id>
  program
    .command("list")
    .description("List all notifications for a user")
    .requiredOption("--user-id <userId>", "User ID")
    .action(async (opts) => {
      try {
        const data = await request<{ notifications: Notification[] }>(
          "GET",
          `/notifications?userId=${encodeURIComponent(opts.userId)}`
        );
        if (data.notifications.length === 0) {
          console.log("No notifications found.");
          return;
        }
        console.log(`Found ${data.notifications.length} notification(s):\n`);
        data.notifications.forEach((n, i) => {
          console.log(`[${i + 1}]`);
          printNotification(n);
          console.log();
        });
      } catch (err) {
        console.error("❌", (err as Error).message);
        process.exit(1);
      }
    });

  // notify unread --user-id=<id>
  program
    .command("unread")
    .description("List unread notifications for a user")
    .requiredOption("--user-id <userId>", "User ID")
    .action(async (opts) => {
      try {
        const data = await request<{ notifications: Notification[] }>(
          "GET",
          `/notifications/unread?userId=${encodeURIComponent(opts.userId)}`
        );
        if (data.notifications.length === 0) {
          console.log("No unread notifications.");
          return;
        }
        console.log(`Found ${data.notifications.length} unread notification(s):\n`);
        data.notifications.forEach((n, i) => {
          console.log(`[${i + 1}]`);
          printNotification(n);
          console.log();
        });
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
}
