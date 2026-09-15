import { describe, expect, it } from "vitest";
import { TodoValidationError } from "../domain/todo.ts";
import {
  StorageNotFoundError,
  type StorageAdapter,
} from "./adapter.ts";

export type AdapterContractHarness = {
  name: string;
  create: () => StorageAdapter;
  reopen?: () => StorageAdapter | Promise<StorageAdapter>;
};

const ALPHA = {
  title: "Alpha",
  id: "11111111-1111-4111-8111-111111111111",
  createdAt: "2026-09-15T08:00:00.000Z",
  updatedAt: "2026-09-15T08:00:00.000Z",
};
const BETA = {
  title: "Beta",
  completed: true,
  id: "22222222-2222-4222-8222-222222222222",
  createdAt: "2026-09-15T09:00:00.000Z",
  updatedAt: "2026-09-15T09:00:00.000Z",
};
const ALPINE = {
  title: "Alpine",
  id: "33333333-3333-4333-8333-333333333333",
  createdAt: "2026-09-15T10:00:00.000Z",
  updatedAt: "2026-09-15T10:00:00.000Z",
};

export function describeAdapterContract(harness: AdapterContractHarness): void {
  describe(`${harness.name} adapter contract`, () => {
    async function ready(): Promise<StorageAdapter> {
      const storage = harness.create();
      await storage.init();
      return storage;
    }

    it("supports create, get, update, and delete", async () => {
      const storage = await ready();
      const created = await storage.create({ title: "Write tests" });
      expect(created.schemaVersion).toBe(1);
      expect((await storage.get(created.id))?.title).toBe("Write tests");
      const updated = await storage.update(created.id, { completed: true });
      expect(updated.completed).toBe(true);
      await storage.delete(created.id);
      expect(await storage.get(created.id)).toBeNull();
    });

    it("rejects invalid titles and missing records", async () => {
      const storage = await ready();
      await expect(storage.create({ title: "   " })).rejects.toBeInstanceOf(TodoValidationError);
      const missing = "11111111-1111-4111-8111-111111111111";
      expect(await storage.get(missing)).toBeNull();
      await expect(storage.update(missing, { title: "Nope" })).rejects.toBeInstanceOf(
        StorageNotFoundError,
      );
      await expect(storage.delete(missing)).rejects.toBeInstanceOf(StorageNotFoundError);
    });

    it("queries with prefix search, completion filter, sort, and pagination", async () => {
      const storage = await ready();
      await storage.bulkCreate([ALPHA, BETA, ALPINE]);

      const search = await storage.query({ search: "alp", sortBy: "title", sortDir: "asc" });
      expect(search.items.map((item) => item.title)).toEqual(["Alpha", "Alpine"]);

      const completed = await storage.query({ completed: true });
      expect(completed.items.map((item) => item.title)).toEqual(["Beta"]);
      expect(completed.total).toBe(1);

      const page = await storage.query({ sortBy: "createdAt", sortDir: "asc", limit: 2 });
      expect(page.items).toHaveLength(2);
      expect(page.total).toBe(3);
      expect(page.nextCursor).toBeTruthy();
      const next = await storage.query({
        sortBy: "createdAt",
        sortDir: "asc",
        limit: 2,
        cursor: page.nextCursor ?? undefined,
      });
      expect(next.items).toHaveLength(1);
      expect(next.items[0]?.title).toBe("Alpine");
      expect(page.items.some((item) => item.id === next.items[0]?.id)).toBe(false);
    });

    it("clears then bulk-creates a fresh set", async () => {
      const storage = await ready();
      await storage.create({ title: "Old" });
      await storage.clear();
      await storage.bulkCreate([ALPHA, BETA]);
      expect((await storage.query()).total).toBe(2);
    });

    it("stores image bytes off the todo record", async () => {
      const storage = await ready();
      expect(storage.capabilities.images).toBe(true);
      const image = await storage.putImage({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        mimeType: "image/png",
        sizeBytes: 4,
        bytes: new Uint8Array([1, 2, 3, 4]).buffer,
      });
      const todo = await storage.create({ title: "With image", image });
      expect(todo.image?.id).toBe(image.id);
      expect((await storage.getImage(image.id))?.sizeBytes).toBe(4);
      await storage.delete(todo.id);
      expect(await storage.getImage(image.id)).toBeNull();
    });

    it("exposes a storage mode and label", async () => {
      const storage = await ready();
      expect(storage.id).toBeTruthy();
      expect(storage.label.length).toBeGreaterThan(0);
    });

    if (harness.reopen) {
      it("reopens the same store after a new adapter instance", async () => {
        const first = await ready();
        if (!first.capabilities.persistsAcrossReload) return;
        const created = await first.create({ title: "Survive reopen" });
        const second = await harness.reopen?.();
        if (!second) return;
        await second.init();
        expect((await second.get(created.id))?.title).toBe("Survive reopen");
        expect((await second.get(created.id))?.schemaVersion).toBe(1);
      });
    }
  });
}
