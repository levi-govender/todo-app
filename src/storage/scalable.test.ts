import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { generateTodoInputs } from "../seed/generate.ts";
import { StorageNotFoundError } from "./adapter.ts";
import { ScalableStorageAdapter } from "./scalable.ts";

describe("ScalableStorageAdapter", () => {
  it("pages through indexed results without returning the full set", async () => {
    const storage = new ScalableStorageAdapter(`todo-scale-${crypto.randomUUID()}`);
    await storage.init();
    await storage.bulkCreate(generateTodoInputs({ seed: "scale", count: 250 }));

    const first = await storage.query({ sortBy: "createdAt", sortDir: "desc", limit: 20 });
    expect(first.items).toHaveLength(20);
    expect(first.total).toBe(250);
    expect(first.nextCursor).toBeTruthy();

    const second = await storage.query({
      sortBy: "createdAt",
      sortDir: "desc",
      limit: 20,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items).toHaveLength(20);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    expect(new Set([...first.items, ...second.items].map((todo) => todo.id)).size).toBe(40);
  });

  it("filters completed without returning active todos", async () => {
    const storage = new ScalableStorageAdapter(`todo-scale-${crypto.randomUUID()}`);
    await storage.init();
    await storage.bulkCreate([
      {
        title: "Done",
        completed: true,
        id: "11111111-1111-4111-8111-111111111111",
        createdAt: "2026-09-15T08:00:00.000Z",
        updatedAt: "2026-09-15T08:00:00.000Z",
      },
      {
        title: "Open",
        completed: false,
        id: "22222222-2222-4222-8222-222222222222",
        createdAt: "2026-09-15T09:00:00.000Z",
        updatedAt: "2026-09-15T09:00:00.000Z",
      },
    ]);
    const completed = await storage.query({ completed: true, limit: 10 });
    expect(completed.items.map((todo) => todo.title)).toEqual(["Done"]);
    expect(completed.total).toBe(1);
  });

  it("uses a title prefix index instead of a contains scan", async () => {
    const storage = new ScalableStorageAdapter(`todo-scale-${crypto.randomUUID()}`);
    await storage.init();
    await storage.bulkCreate([
      {
        title: "Buy milk",
        id: "11111111-1111-4111-8111-111111111111",
        createdAt: "2026-09-15T08:00:00.000Z",
        updatedAt: "2026-09-15T08:00:00.000Z",
      },
      {
        title: "Call about milk",
        id: "22222222-2222-4222-8222-222222222222",
        createdAt: "2026-09-15T09:00:00.000Z",
        updatedAt: "2026-09-15T09:00:00.000Z",
      },
    ]);
    const result = await storage.query({ search: "buy", limit: 8 });
    expect(result.items.map((todo) => todo.title)).toEqual(["Buy milk"]);
    expect(result.total).toBe(1);
  });

  it("pages prefix matches without returning the full prefix set", async () => {
    const storage = new ScalableStorageAdapter(`todo-scale-${crypto.randomUUID()}`);
    await storage.init();
    await storage.bulkCreate(generateTodoInputs({ seed: "ten-k", count: 10_000 }));
    const result = await storage.query({ search: "buy", limit: 20 });
    expect(result.items).toHaveLength(20);
    expect(result.items.every((todo) => todo.title.toLowerCase().startsWith("buy"))).toBe(true);
    expect(result.total).toBeGreaterThan(20);
    expect(result.nextCursor).toBeTruthy();
  });

  it("stores 10k records and still returns a bounded first page", async () => {
    const storage = new ScalableStorageAdapter(`todo-scale-${crypto.randomUUID()}`);
    await storage.init();
    await storage.bulkCreate(generateTodoInputs({ seed: "ten-k", count: 10_000 }));
    const result = await storage.query({ limit: 50 });
    expect(result.total).toBe(10_000);
    expect(result.items).toHaveLength(50);
    expect(result.nextCursor).toBeTruthy();
  });

  it("throws when updating a missing record", async () => {
    const storage = new ScalableStorageAdapter(`todo-scale-${crypto.randomUUID()}`);
    await storage.init();
    await expect(
      storage.update("11111111-1111-4111-8111-111111111111", { title: "Nope" }),
    ).rejects.toBeInstanceOf(StorageNotFoundError);
  });
});
