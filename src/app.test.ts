import { describe, expect, it } from "vitest";
import { TodoApp } from "./app.ts";
import type { StorageAdapter, TodoQuery, TodoQueryResult } from "./storage/adapter.ts";
import { StorageUnavailableError } from "./storage/adapter.ts";
import { createTodo, type CreateTodoInput, type Todo, type UpdateTodoInput } from "./domain/todo.ts";

class DelayedSearchAdapter implements StorageAdapter {
  readonly id = "ephemeral" as const;
  readonly label = "test";
  readonly capabilities = { persistsAcrossReload: false, images: false, indexedQuery: false };
  private records: Todo[] = [];

  constructor(private readonly delayFor: (search: string) => number) {}

  async init(): Promise<void> {}
  async create(input: CreateTodoInput): Promise<Todo> {
    const todo = createTodo(input);
    this.records.push(todo);
    return todo;
  }
  async update(_id: string, _patch: UpdateTodoInput): Promise<Todo> {
    throw new Error("unused");
  }
  async delete(): Promise<void> {}
  async get(): Promise<Todo | null> {
    return null;
  }
  async query(query?: TodoQuery): Promise<TodoQueryResult> {
    const search = query?.search ?? "";
    await new Promise((resolve) => setTimeout(resolve, this.delayFor(search)));
    const items = this.records.filter((todo) => todo.title.startsWith(search));
    return { items, total: items.length, nextCursor: null };
  }
  async clear(): Promise<void> {
    this.records = [];
  }
  async bulkCreate(): Promise<void> {}
  async putImage(): Promise<never> {
    throw new Error("unused");
  }
  async getImage() {
    return null;
  }
  async deleteImage(): Promise<void> {}
}

describe("TodoApp search sequencing", () => {
  it("does not let a slower older search replace a newer one", async () => {
    const adapter = new DelayedSearchAdapter((search) => (search === "A" ? 40 : 5));
    await adapter.create({ title: "A" });
    await adapter.create({ title: "AB" });
    const app = new TodoApp(adapter);
    await app.start();

    app.setSearch("A");
    app.setSearch("AB");
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(app.getState().query.search).toBe("AB");
    expect(app.getState().items.map((todo) => todo.title)).toEqual(["AB"]);
  });
});

describe("TodoApp image lazy load", () => {
  it("does not fetch image bytes until loadImage is called, and caches afterwards", async () => {
    const { MemoryStorageAdapter } = await import("./storage/memory.ts");
    const adapter = new MemoryStorageAdapter();
    await adapter.init();
    const image = await adapter.putImage({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      mimeType: "image/png",
      sizeBytes: 4,
      bytes: new Uint8Array([1, 2, 3, 4]).buffer,
    });
    const originalGet = adapter.getImage.bind(adapter);
    let fetches = 0;
    adapter.getImage = async (id) => {
      fetches += 1;
      return originalGet(id);
    };
    await adapter.create({ title: "Photo", image });
    adapter.init = async () => {};
    const app = new TodoApp(adapter);
    await app.start();
    expect(fetches).toBe(0);
    expect(app.getState().imageUrls).toEqual({});

    const id = app.getState().items[0]?.id;
    expect(id).toBeTruthy();
    await app.loadImage(id ?? "");
    await app.loadImage(id ?? "");
    expect(fetches).toBe(1);
    expect(app.getState().imageUrls[id ?? ""]).toBeTruthy();
    expect(app.imageLoadCount()).toBe(1);
  });
});

describe("TodoApp storage failure", () => {
  it("does not keep a successful list after a failed write", async () => {
    const adapter = new DelayedSearchAdapter(() => 0);
    adapter.create = async () => {
      throw new StorageUnavailableError("write failed");
    };
    const app = new TodoApp(adapter);
    await app.start();
    await app.create("Should not appear");
    expect(app.getState().items).toHaveLength(0);
    expect(app.getState().error).toBe("write failed");
    expect(app.getState().retryable).toBe(true);
  });

  it("falls back to ephemeral storage when persistent init fails", async () => {
    const adapter: StorageAdapter = {
      id: "persistent",
      label: "broken",
      capabilities: { persistsAcrossReload: true, images: true, indexedQuery: true },
      async init() {
        throw new StorageUnavailableError("IndexedDB is not available in this browser.");
      },
      async create() {
        throw new Error("unused");
      },
      async update() {
        throw new Error("unused");
      },
      async delete() {},
      async get() {
        return null;
      },
      async query() {
        return { items: [], total: 0, nextCursor: null };
      },
      async clear() {},
      async bulkCreate() {},
      async putImage() {
        throw new Error("unused");
      },
      async getImage() {
        return null;
      },
      async deleteImage() {},
    };
    const app = new TodoApp(adapter);
    await app.start();
    expect(app.getState().mode).toBe("ephemeral");
    expect(app.getState().retryable).toBe(true);
    expect(app.getState().error).toMatch(/ephemeral/i);
  });
});
