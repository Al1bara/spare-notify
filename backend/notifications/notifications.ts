import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import type { IncomingMessage, ServerResponse } from "node:http";

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
  limit?: number;
  cursor?: string;
}

interface ListNotificationsResponse {
  data: Notification[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface MarkReadParams {
  id: string;
}

interface MarkReadResponse {
  notification: Notification;
}

interface NotificationRow {
  id: string;
  user_id: string;
  channel: string;
  title: string;
  body: string;
  read: boolean;
  created_at: Date;
}

function rowToNotification(row: NotificationRow): Notification {
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

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// --- Channel handler simulation ---
function dispatchChannel(channel: Channel, notification: Notification): void {
  if (channel === "email") {
    // Simulated email dispatch — in production this would call SendGrid/Resend
    // or push onto an internal email queue.
    console.log(
      `[EMAIL DISPATCH] To user ${notification.userId} | Subject: ${notification.title} | Body: ${notification.body}`
    );
  }
  // in_app is satisfied by persistence — no side effect needed beyond storage
  // and the SSE fan-out below.
}

// --- SSE in-memory pub/sub ---
//
// Single-process map of userId -> set of open SSE response streams.
// Encore's dev runtime is a single process, so this works for local use.
// In production with multiple backend replicas this MUST be replaced with a
// Redis pub/sub (or NATS / Kafka) channel so an event published from one node
// reaches subscribers on another.
const subscribers = new Map<string, Set<ServerResponse>>();

function publish(userId: string, notification: Notification): void {
  const subs = subscribers.get(userId);
  if (!subs || subs.size === 0) return;

  const payload =
    `event: notification\n` +
    `data: ${JSON.stringify(notification)}\n\n`;

  for (const res of subs) {
    try {
      res.write(payload);
    } catch {
      // Writer is gone — the close handler will clean it up.
    }
  }
}

// --- Endpoints ---

// POST /notifications — create & send a notification to a user.
export const sendNotification = api(
  { method: "POST", path: "/notifications", expose: true, auth: true },
  async (params: SendNotificationParams): Promise<SendNotificationResponse> => {
    if (!params.userId) throw APIError.invalidArgument("userId is required");
    if (!["in_app", "email"].includes(params.channel)) {
      throw APIError.invalidArgument("channel must be 'in_app' or 'email'");
    }
    if (!params.title || params.title.trim() === "") {
      throw APIError.invalidArgument("title is required");
    }
    if (!params.body || params.body.trim() === "") {
      throw APIError.invalidArgument("body is required");
    }

    const row = await db.queryRow<NotificationRow>`
      INSERT INTO notifications (user_id, channel, title, body)
      VALUES (${params.userId}, ${params.channel}, ${params.title.trim()}, ${params.body.trim()})
      RETURNING id, user_id, channel, title, body, read, created_at
    `;

    if (!row) throw new Error("failed to create notification");

    const notification = rowToNotification(row);
    dispatchChannel(params.channel, notification);
    publish(params.userId, notification);

    return { notification };
  }
);

// GET /notifications?userId=<id>&limit=&cursor= — cursor-paginated list.
export const listNotifications = api(
  { method: "GET", path: "/notifications", expose: true, auth: true },
  async (params: ListNotificationsParams): Promise<ListNotificationsResponse> => {
    if (!params.userId) throw APIError.invalidArgument("userId is required");

    const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const fetchSize = limit + 1;

    const rows: NotificationRow[] = [];

    if (params.cursor) {
      for await (const row of db.query<NotificationRow>`
        SELECT id, user_id, channel, title, body, read, created_at
        FROM notifications
        WHERE user_id = ${params.userId}
          AND created_at < (SELECT created_at FROM notifications WHERE id = ${params.cursor})
        ORDER BY created_at DESC
        LIMIT ${fetchSize}
      `) {
        rows.push(row);
      }
    } else {
      for await (const row of db.query<NotificationRow>`
        SELECT id, user_id, channel, title, body, read, created_at
        FROM notifications
        WHERE user_id = ${params.userId}
        ORDER BY created_at DESC
        LIMIT ${fetchSize}
      `) {
        rows.push(row);
      }
    }

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).map(rowToNotification);
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return { data: page, nextCursor, hasMore };
  }
);

// GET /notifications/unread?userId=<id>&limit=&cursor= — unread-only page.
export const listUnreadNotifications = api(
  { method: "GET", path: "/notifications/unread", expose: true, auth: true },
  async (params: ListNotificationsParams): Promise<ListNotificationsResponse> => {
    if (!params.userId) throw APIError.invalidArgument("userId is required");

    const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const fetchSize = limit + 1;

    const rows: NotificationRow[] = [];

    if (params.cursor) {
      for await (const row of db.query<NotificationRow>`
        SELECT id, user_id, channel, title, body, read, created_at
        FROM notifications
        WHERE user_id = ${params.userId}
          AND read = FALSE
          AND created_at < (SELECT created_at FROM notifications WHERE id = ${params.cursor})
        ORDER BY created_at DESC
        LIMIT ${fetchSize}
      `) {
        rows.push(row);
      }
    } else {
      for await (const row of db.query<NotificationRow>`
        SELECT id, user_id, channel, title, body, read, created_at
        FROM notifications
        WHERE user_id = ${params.userId} AND read = FALSE
        ORDER BY created_at DESC
        LIMIT ${fetchSize}
      `) {
        rows.push(row);
      }
    }

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).map(rowToNotification);
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return { data: page, nextCursor, hasMore };
  }
);

// PATCH /notifications/:id/read
export const markAsRead = api(
  { method: "PATCH", path: "/notifications/:id/read", expose: true, auth: true },
  async (params: MarkReadParams): Promise<MarkReadResponse> => {
    const row = await db.queryRow<NotificationRow>`
      UPDATE notifications
      SET read = TRUE
      WHERE id = ${params.id}
      RETURNING id, user_id, channel, title, body, read, created_at
    `;

    if (!row) throw APIError.notFound(`notification ${params.id} not found`);

    return { notification: rowToNotification(row) };
  }
);

// GET /notifications/stream?userId=<id> — Server-Sent Events feed.
//
// Auth trade-off (intentional): the SSE endpoint is left public so the CLI
// `stream` command can connect without an API key. The real-world fix is to
// pass the key via an `?apiKey=` query param or a short-lived signed token
// (since EventSource can't set custom headers in browsers). For this take-home
// we accept the trade-off and rely on userId being a UUID that's hard to guess.
export const streamNotifications = api.raw(
  { expose: true, path: "/notifications/stream", method: "GET" },
  (req: IncomingMessage, resp: ServerResponse) => {
    const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      resp.statusCode = 400;
      resp.setHeader("Content-Type", "application/json");
      resp.end(JSON.stringify({ error: "userId is required" }));
      return;
    }

    resp.statusCode = 200;
    resp.setHeader("Content-Type", "text/event-stream");
    resp.setHeader("Cache-Control", "no-cache, no-transform");
    resp.setHeader("Connection", "keep-alive");
    resp.setHeader("X-Accel-Buffering", "no");
    resp.flushHeaders?.();

    resp.write(`event: ready\ndata: {"userId":"${userId}"}\n\n`);

    let set = subscribers.get(userId);
    if (!set) {
      set = new Set();
      subscribers.set(userId, set);
    }
    set.add(resp);

    // Heartbeat so intermediaries (proxies, load balancers) don't reap the
    // connection during long idle periods.
    const heartbeat = setInterval(() => {
      try {
        resp.write(`: ping\n\n`);
      } catch {
        // Will be cleaned up below.
      }
    }, 30_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      set?.delete(resp);
      if (set && set.size === 0) subscribers.delete(userId);
    };

    req.on("close", cleanup);
    req.on("error", cleanup);
  }
);
