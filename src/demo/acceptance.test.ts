import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { generateTodoInputs } from "../seed/generate.ts";
import { IndexedDbStorageAdapter } from "../storage/indexeddb.ts";
import { MemoryStorageAdapter } from "../storage/memory.ts";
import { ScalableStorageAdapter } from "../storage/scalable.ts";

describe("acceptance demonstration", () => {
  it("ephemeral data is gone after init (reload)", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.init();
    await storage.create({ title: "Do not survive" });
    expect((await storage.query()).total).toBe(1);
    await storage.init();
    expect((await storage.query()).total).toBe(0);
  });

  it("persistent data survives a new adapter instance", async () => {
    const dbName = `todo-demo-${crypto.randomUUID()}`;
    const first = new IndexedDbStorageAdapter(dbName);
    await first.init();
    const created = await first.create({ title: "Survive restart" });
    const second = new IndexedDbStorageAdapter(dbName);
    await second.init();
    expect((await second.get(created.id))?.title).toBe("Survive restart");
  });

  it("scalable mode pages 10k records and composes prefix search, filter, and sort", async () => {
    const storage = new ScalableStorageAdapter(`todo-demo-scale-${crypto.randomUUID()}`);
    await storage.init();
    await storage.bulkCreate(generateTodoInputs({ seed: "todo-app", count: 10_000 }));
    const page = await storage.query({ limit: 50, sortBy: "createdAt", sortDir: "desc" });
    expect(page.total).toBe(10_000);
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).toBeTruthy();

    const mixed = await storage.query({
      search: "buy",
      completed: true,
      sortBy: "createdAt",
      sortDir: "desc",
      limit: 20,
    });
    expect(mixed.items.length).toBeGreaterThan(0);
    expect(mixed.items.length).toBeLessThanOrEqual(20);
    expect(
      mixed.items.every((todo) => todo.completed && todo.title.toLowerCase().startsWith("buy")),
    ).toBe(true);
  });

  it("stores and retrieves image bytes separately from the todo", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.init();
    const image = await storage.putImage({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      mimeType: "image/png",
      sizeBytes: 4,
      bytes: new Uint8Array([1, 2, 3, 4]).buffer,
    });
    const todo = await storage.create({ title: "Photo", image });
    expect(todo.image?.id).toBe(image.id);
    const loaded = await storage.getImage(image.id);
    expect(loaded?.bytes.byteLength).toBe(4);
    expect(loaded?.mimeType).toBe("image/png");
  });
});
