import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IndexedDbStorageAdapter } from "./indexeddb.ts";
import { StorageNotFoundError } from "./adapter.ts";

describe("IndexedDbStorageAdapter", () => {
  it("persists CRUD across adapter restarts", async () => {
    const dbName = `todo-test-${crypto.randomUUID()}`;
    const first = new IndexedDbStorageAdapter(dbName);
    await first.init();
    const created = await first.create({ title: "Survive reload" });

    const second = new IndexedDbStorageAdapter(dbName);
    await second.init();
    const fetched = await second.get(created.id);
    expect(fetched?.title).toBe("Survive reload");

    const updated = await second.update(created.id, { completed: true });
    expect(updated.completed).toBe(true);

    await second.delete(created.id);
    expect(await second.get(created.id)).toBeNull();
  });

  it("throws when updating a missing record", async () => {
    const storage = new IndexedDbStorageAdapter(`todo-test-${crypto.randomUUID()}`);
    await storage.init();
    await expect(
      storage.update("11111111-1111-4111-8111-111111111111", { title: "Nope" }),
    ).rejects.toBeInstanceOf(StorageNotFoundError);
  });

  it("skips corrupt records during query", async () => {
    const dbName = `todo-test-${crypto.randomUUID()}`;
    const storage = new IndexedDbStorageAdapter(dbName);
    await storage.init();
    await storage.create({ title: "Good" });

    await injectCorruptRecord(dbName);
    const result = await storage.query();
    expect(result.items.map((item) => item.title)).toEqual(["Good"]);
  });

  it("clears and bulk-creates records", async () => {
    const storage = new IndexedDbStorageAdapter(`todo-test-${crypto.randomUUID()}`);
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
    ]);
    expect((await storage.query()).total).toBe(1);
    expect((await storage.query()).items[0]?.title).toBe("A");
  });
});

function injectCorruptRecord(dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("todos", "readwrite");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.objectStore("todos").put({
        id: "not-a-uuid",
        title: "Broken",
        completed: false,
      });
    };
  });
}
