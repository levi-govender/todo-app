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

  it("sorts by title, createdAt, and updatedAt with stable id tie-break", async () => {
    const storage = new ScalableStorageAdapter(`todo-scale-${crypto.randomUUID()}`);
    await storage.init();
    const stamp = "2026-09-15T10:00:00.000Z";
    await storage.bulkCreate([
      {
        title: "Beta",
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        createdAt: stamp,
        updatedAt: "2026-09-15T12:00:00.000Z",
      },
      {
        title: "Alpha",
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        createdAt: stamp,
        updatedAt: "2026-09-15T11:00:00.000Z",
      },
    ]);
    const byTitle = await storage.query({ sortBy: "title", sortDir: "asc", limit: 10 });
    expect(byTitle.items.map((todo) => todo.title)).toEqual(["Alpha", "Beta"]);
    const byCreated = await storage.query({ sortBy: "createdAt", sortDir: "asc", limit: 10 });
    expect(byCreated.items.map((todo) => todo.id)).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ]);
    const byUpdated = await storage.query({ sortBy: "updatedAt", sortDir: "desc", limit: 10 });
    expect(byUpdated.items.map((todo) => todo.title)).toEqual(["Beta", "Alpha"]);
  });

  it("combines prefix search, completion filter, and createdAt sort at 10k", async () => {
    const storage = new ScalableStorageAdapter(`todo-scale-${crypto.randomUUID()}`);
    await storage.init();
    await storage.bulkCreate(generateTodoInputs({ seed: "ten-k", count: 10_000 }));
    const query = {
      search: "buy",
      completed: true,
      sortBy: "createdAt" as const,
      sortDir: "desc" as const,
      limit: 15,
    };
    const first = await storage.query(query);
    const again = await storage.query(query);
    expect(first.items).toEqual(again.items);
    expect(first.items.every((todo) => todo.completed && todo.title.toLowerCase().startsWith("buy"))).toBe(
      true,
    );
    expect(first.total).toBeGreaterThan(0);
    expect(first.items.length).toBeLessThanOrEqual(15);
    for (let i = 1; i < first.items.length; i += 1) {
      const prev = first.items[i - 1];
      const next = first.items[i];
      if (!prev || !next) continue;
      expect(next.createdAt <= prev.createdAt).toBe(true);
    }
    if (first.nextCursor) {
      const page = await storage.query({ ...query, cursor: first.nextCursor });
      expect(page.items[0]?.id).not.toBe(first.items[0]?.id);
    }
  });

  it("throws when updating a missing record", async () => {
    const storage = new ScalableStorageAdapter(`todo-scale-${crypto.randomUUID()}`);
    await storage.init();
    await expect(
      storage.update("11111111-1111-4111-8111-111111111111", { title: "Nope" }),
    ).rejects.toBeInstanceOf(StorageNotFoundError);
  });

  it("keeps image bytes off todo records", async () => {
    const storage = new ScalableStorageAdapter(`todo-scale-${crypto.randomUUID()}`);
    await storage.init();
    const image = await storage.putImage({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      mimeType: "image/webp",
      sizeBytes: 4,
      bytes: new Uint8Array([1, 2, 3, 4]).buffer,
    });
    const todo = await storage.create({ title: "Shot", image });
    expect(todo.image?.sizeBytes).toBe(4);
    expect((await storage.getImage(image.id))?.bytes.byteLength).toBe(4);
    await storage.clear();
    expect(await storage.getImage(image.id)).toBeNull();
  });
});
