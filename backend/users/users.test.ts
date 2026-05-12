// NOTE: the brief asked for imports from "encore.dev/test", but that subpath
// is not exported by encore.dev (v1.57). Encore's test runner shells out to
// Vitest, so this file uses Vitest's API directly — the tests are still
// invoked via `encore test ./...`, which gives them a fresh Postgres schema
// per run.

import { describe, it, expect } from "vitest";
import { createUser, listUsers } from "./users";

describe("users service", () => {
  it("createUser — success", async () => {
    const { user } = await createUser({ name: "Alice", email: "alice@example.com" });
    expect(user.name).toBe("Alice");
    expect(user.email).toBe("alice@example.com");
    expect(user.id).toMatch(/[0-9a-f-]{36}/);
    expect(typeof user.createdAt).toBe("string");
  });

  it("createUser — missing name throws", async () => {
    await expect(createUser({ name: "" })).rejects.toThrow(/name is required/i);
    await expect(createUser({ name: "   " })).rejects.toThrow(/name is required/i);
  });

  it("listUsers — empty result wraps in paginated shape", async () => {
    const res = await listUsers({});
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.hasMore).toBe(false);
    expect(res.nextCursor).toBeNull();
  });

  it("listUsers — returns created users in descending order", async () => {
    await createUser({ name: "Bob" });
    await createUser({ name: "Carol" });

    const res = await listUsers({});
    const names = res.data.map((u) => u.name);
    expect(names).toContain("Bob");
    expect(names).toContain("Carol");
    // Newest first by created_at DESC.
    const carolIdx = names.indexOf("Carol");
    const bobIdx = names.indexOf("Bob");
    expect(carolIdx).toBeLessThan(bobIdx);
  });
});
