import { api } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";

// --- Database ---
const db = new SQLDatabase("notifications", { migrations: "./migrations" });

// --- Types ---
type Channel = "in_app" | "email";

export interface Notification {
  id: string;
  userId: string;
  channel: Channel;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface SendNotificationParams {
  userId: string;
  channel: Channel;
  title: string;
  body: string;
}

interface SendNotificationResponse {
  notification: Notification;
}

interface ListNotificationsParams {
  userId: string;
}

interface ListNotificationsResponse {
  notifications: Notification[];
}

interface MarkReadParams {
  id: string;
}

interface MarkReadResponse {
  notification: Notification;
}

// --- Channel handler simulation ---
function dispatchChannel(channel: Channel, notification: Notification): void {
  if (channel === "email") {
    // Simulated email dispatch — in production this would call an email provider
    console.log(
      `[EMAIL DISPATCH] To user ${notification.userId} | Subject: ${notification.title} | Body: ${notification.body}`
    );
  }
  // in_app is handled by storage — no side effect needed
}

// --- DB row helper ---
function rowToNotification(row: {
  id: string;
  user_id: string;
  channel: string;
  title: string;
  body: string;
  read: boolean;
  created_at: Date;
}): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    channel: row.channel as Channel,
    title: row.title,
    body: row.body,
    read: row.read,
    createdAt: row.created_at.toISOString(),
  };
}

// --- Endpoints ---

// POST /notifications — create & send a notification to a user
export const sendNotification = api(
  { method: "POST", path: "/notifications", expose: true },
  async (params: SendNotificationParams): Promise<SendNotificationResponse> => {
    if (!params.userId) throw new Error("userId is required");
    if (!["in_app", "email"].includes(params.channel)) {
      throw new Error("channel must be 'in_app' or 'email'");
    }
    if (!params.title || params.title.trim() === "") throw new Error("title is required");
    if (!params.body || params.body.trim() === "") throw new Error("body is required");

    const row = await db.queryRow<{
      id: string;
      user_id: string;
      channel: string;
      title: string;
      body: string;
      read: boolean;
      created_at: Date;
    }>`
      INSERT INTO notifications (user_id, channel, title, body)
      VALUES (${params.userId}, ${params.channel}, ${params.title.trim()}, ${params.body.trim()})
      RETURNING id, user_id, channel, title, body, read, created_at
    `;

    if (!row) throw new Error("failed to create notification");

    const notification = rowToNotification(row);
    dispatchChannel(params.channel, notification);

    return { notification };
  }
);

// GET /notifications?userId=<id> — list all notifications for a user
export const listNotifications = api(
  { method: "GET", path: "/notifications", expose: true },
  async (params: ListNotificationsParams): Promise<ListNotificationsResponse> => {
    if (!params.userId) throw new Error("userId is required");

    const notifications: Notification[] = [];

    for await (const row of db.query<{
      id: string;
      user_id: string;
      channel: string;
      title: string;
      body: string;
      read: boolean;
      created_at: Date;
    }>`
      SELECT id, user_id, channel, title, body, read, created_at
      FROM notifications
      WHERE user_id = ${params.userId}
      ORDER BY created_at DESC
    `) {
      notifications.push(rowToNotification(row));
    }

    return { notifications };
  }
);

// GET /notifications/unread?userId=<id> — list unread notifications for a user
export const listUnreadNotifications = api(
  { method: "GET", path: "/notifications/unread", expose: true },
  async (params: ListNotificationsParams): Promise<ListNotificationsResponse> => {
    if (!params.userId) throw new Error("userId is required");

    const notifications: Notification[] = [];

    for await (const row of db.query<{
      id: string;
      user_id: string;
      channel: string;
      title: string;
      body: string;
      read: boolean;
      created_at: Date;
    }>`
      SELECT id, user_id, channel, title, body, read, created_at
      FROM notifications
      WHERE user_id = ${params.userId} AND read = FALSE
      ORDER BY created_at DESC
    `) {
      notifications.push(rowToNotification(row));
    }

    return { notifications };
  }
);

// PATCH /notifications/:id/read — mark a notification as read
export const markAsRead = api(
  { method: "PATCH", path: "/notifications/:id/read", expose: true },
  async (params: MarkReadParams): Promise<MarkReadResponse> => {
    const row = await db.queryRow<{
      id: string;
      user_id: string;
      channel: string;
      title: string;
      body: string;
      read: boolean;
      created_at: Date;
    }>`
      UPDATE notifications
      SET read = TRUE
      WHERE id = ${params.id}
      RETURNING id, user_id, channel, title, body, read, created_at
    `;

    if (!row) throw new Error(`notification ${params.id} not found`);

    return { notification: rowToNotification(row) };
  }
);
