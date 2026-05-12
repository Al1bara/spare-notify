// See users.test.ts for the note about the test framework: this file uses
// Vitest directly because encore.dev/test is not an exported subpath.

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  sendNotification,
  listNotifications,
  listUnreadNotifications,
  markAsRead,
} from "./notifications";

// Cross-service FK note: the notifications.user_id column references users(id),
// which lives in a different Encore service / database. Encore creates each
// service's database independently, so the FK is declarative-only here — using
// a freshly generated UUID is fine for these tests.
function userId(): string {
  return randomUUID();
}

describe("notifications service — sendNotification", () => {
  it("creates an in_app notification", async () => {
    const uid = userId();
    const { notification } = await sendNotification({
      userId: uid,
      channel: "in_app",
      title: "Welcome",
      body: "Hello there",
    });
    expect(notification.userId).toBe(uid);
    expect(notification.channel).toBe("in_app");
    expect(notification.read).toBe(false);
  });

  it("creates an email notification", async () => {
    const uid = userId();
    const { notification } = await sendNotification({
      userId: uid,
      channel: "email",
      title: "Invoice",
      body: "Your invoice is ready",
    });
    expect(notification.channel).toBe("email");
  });

  it("rejects an invalid channel", async () => {
    await expect(
      sendNotification({
        userId: userId(),
        channel: "sms" as unknown as "in_app",
        title: "x",
        body: "y",
      })
    ).rejects.toThrow(/channel/i);
  });
});

describe("notifications service — listNotifications", () => {
  it("returns an empty page for a user with no notifications", async () => {
    const res = await listNotifications({ userId: userId() });
    expect(res.data).toEqual([]);
    expect(res.hasMore).toBe(false);
    expect(res.nextCursor).toBeNull();
  });

  it("returns notifications in descending creation order", async () => {
    const uid = userId();
    await sendNotification({ userId: uid, channel: "in_app", title: "first", body: "1" });
    await sendNotification({ userId: uid, channel: "in_app", title: "second", body: "2" });
    await sendNotification({ userId: uid, channel: "in_app", title: "third", body: "3" });

    const res = await listNotifications({ userId: uid });
    expect(res.data.length).toBe(3);
    expect(res.data.map((n) => n.title)).toEqual(["third", "second", "first"]);
  });
});

describe("notifications service — listUnreadNotifications", () => {
  it("only returns notifications where read = false", async () => {
    const uid = userId();
    const { notification: first } = await sendNotification({
      userId: uid,
      channel: "in_app",
      title: "stays unread",
      body: "a",
    });
    const { notification: second } = await sendNotification({
      userId: uid,
      channel: "in_app",
      title: "will be read",
      body: "b",
    });

    await markAsRead({ id: second.id });

    const res = await listUnreadNotifications({ userId: uid });
    const ids = res.data.map((n) => n.id);
    expect(ids).toContain(first.id);
    expect(ids).not.toContain(second.id);
  });
});

describe("notifications service — markAsRead", () => {
  it("flips read to true", async () => {
    const uid = userId();
    const { notification } = await sendNotification({
      userId: uid,
      channel: "in_app",
      title: "mark me",
      body: "please",
    });
    expect(notification.read).toBe(false);

    const { notification: updated } = await markAsRead({ id: notification.id });
    expect(updated.read).toBe(true);
    expect(updated.id).toBe(notification.id);
  });

  it("throws not-found for an unknown id", async () => {
    await expect(markAsRead({ id: randomUUID() })).rejects.toThrow(/not found/i);
  });
});
