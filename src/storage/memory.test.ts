import { describe, expect, it } from "vitest";
import { MemoryStorageAdapter } from "./memory.ts";
import { StorageNotFoundError } from "./adapter.ts";

describe("MemoryStorageAdapter", () => {
  it("supports CRUD during the session", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.init();
    const created = await storage.create({ title: "Write tests" });
    const fetched = await storage.get(created.id);
    expect(fetched?.title).toBe("Write tests");

    const updated = await storage.update(created.id, { completed: true });
    expect(updated.completed).toBe(true);

    await storage.delete(created.id);
    expect(await storage.get(created.id)).toBeNull();
  });

  it("does not use browser persistence APIs", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.init();
    await storage.create({ title: "Transient" });
    expect(storage.capabilities.persistsAcrossReload).toBe(false);
    await storage.init();
    const result = await storage.query();
    expect(result.total).toBe(0);
  });

  it("filters, sorts, and paginates", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.init();
    await storage.create({
      title: "Alpha",
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-09-15T08:00:00.000Z",
      updatedAt: "2026-09-15T08:00:00.000Z",
    });
    await storage.create({
      title: "Beta",
      completed: true,
      id: "22222222-2222-4222-8222-222222222222",
      createdAt: "2026-09-15T09:00:00.000Z",
      updatedAt: "2026-09-15T09:00:00.000Z",
    });
    await storage.create({
      title: "Alpine",
      id: "33333333-3333-4333-8333-333333333333",
      createdAt: "2026-09-15T10:00:00.000Z",
      updatedAt: "2026-09-15T10:00:00.000Z",
    });

    const search = await storage.query({ search: "alp", sortBy: "title", sortDir: "asc" });
    expect(search.items.map((item) => item.title)).toEqual(["Alpha", "Alpine"]);

    const page = await storage.query({ sortBy: "createdAt", sortDir: "asc", limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe("2");
    const next = await storage.query({
      sortBy: "createdAt",
      sortDir: "asc",
      limit: 2,
      cursor: page.nextCursor ?? undefined,
    });
    expect(next.items).toHaveLength(1);
    expect(next.items[0]?.title).toBe("Alpine");
  });

  it("throws when updating a missing record", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.init();
    await expect(
      storage.update("11111111-1111-4111-8111-111111111111", { title: "Nope" }),
    ).rejects.toBeInstanceOf(StorageNotFoundError);
  });

  it("clears and bulk-creates records", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.init();
    await storage.create({ title: "Old" });
    await storage.clear();
    await storage.bulkCreate([
      {
        title: "A",
        id: "11111111-1111-4111-8111-111111111111",
        createdAt: "2026-09-15T08:00:00.000Z",
        updatedAt: "2026-09-15T08:00:00.000Z",
      },
      {
        title: "B",
        id: "22222222-2222-4222-8222-222222222222",
        createdAt: "2026-09-15T09:00:00.000Z",
        updatedAt: "2026-09-15T09:00:00.000Z",
      },
    ]);
    expect((await storage.query()).total).toBe(2);
  });

  it("stores image bytes off the todo record", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.init();
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const image = await storage.putImage({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      mimeType: "image/png",
      sizeBytes: 4,
      bytes,
    });
    const todo = await storage.create({ title: "With image", image });
    expect(todo.image?.id).toBe(image.id);
    expect((await storage.getImage(image.id))?.sizeBytes).toBe(4);
    await storage.delete(todo.id);
    expect(await storage.getImage(image.id)).toBeNull();
  });
});
