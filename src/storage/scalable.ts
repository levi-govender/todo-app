import { toImageRef, type ImageBytes } from "../domain/image.ts";
import {
  applyTodoUpdate,
  createTodo,
  migrateTodo,
  type CreateTodoInput,
  type ImageRef,
  type Todo,
  TodoValidationError,
  type UpdateTodoInput,
} from "../domain/todo.ts";
import {
  type StorageAdapter,
  type StorageCapabilities,
  StorageNotFoundError,
  StorageUnavailableError,
  type TodoQuery,
  type TodoQueryResult,
} from "./adapter.ts";
import { clampLimit, compareTodos } from "./query.ts";

export const SCALABLE_DB_NAME = "todo-app-scalable";
export const SCALABLE_DB_VERSION = 4;
export const SCALABLE_STORE = "todos";
export const SCALABLE_IMAGE_STORE = "images";

type Keyset = { value: string; id: string };

export class ScalableStorageAdapter implements StorageAdapter {
  readonly id = "scalable" as const;
  readonly label = "Scalable (IndexedDB indexes)";
  readonly capabilities: StorageCapabilities = {
    persistsAcrossReload: true,
    images: true,
    indexedQuery: true,
  };

  private db: IDBDatabase | null = null;

  constructor(private readonly dbName = SCALABLE_DB_NAME) {}

  async init(): Promise<void> {
    this.db?.close();
    this.db = await openDatabase(this.dbName);
  }

  async create(input: CreateTodoInput): Promise<Todo> {
    const todo = createTodo(input);
    await this.put(toStored(todo));
    return todo;
  }

  async update(id: string, patch: UpdateTodoInput): Promise<Todo> {
    const current = await this.get(id);
    if (!current) throw new StorageNotFoundError(id);
    const next = applyTodoUpdate(current, patch);
    await this.put(toStored(next));
    return next;
  }

  async delete(id: string): Promise<void> {
    const db = this.requireDb();
    const tx = db.transaction([SCALABLE_STORE, SCALABLE_IMAGE_STORE], "readwrite");
    const existing = await requestToPromise(tx.objectStore(SCALABLE_STORE).get(id));
    if (existing === undefined) throw new StorageNotFoundError(id);
    const todo = readTodo(existing);
    if (todo.image) tx.objectStore(SCALABLE_IMAGE_STORE).delete(todo.image.id);
    tx.objectStore(SCALABLE_STORE).delete(id);
    await transactionDone(tx);
  }

  async get(id: string): Promise<Todo | null> {
    const db = this.requireDb();
    const raw = await requestToPromise(this.store(db, "readonly").get(id));
    if (raw === undefined) return null;
    return readTodo(raw);
  }

  async query(query: TodoQuery = {}): Promise<TodoQueryResult> {
    const db = this.requireDb();
    const search = query.search?.trim().toLowerCase() ?? "";
    const sortBy = query.sortBy ?? "createdAt";
    const sortDir = query.sortDir ?? "desc";
    const limit = clampLimit(query.limit);
    const keyset = decodeKeyset(query.cursor);
    const completed = query.completed;

    if (search) {
      return this.queryPrefixThenSort({
        search,
        sortBy,
        sortDir,
        limit,
        keyset,
        completed,
      });
    }

    const store = this.store(db, "readonly");
    const index = store.index(`${sortBy}_id`);
    const direction: IDBCursorDirection = sortDir === "asc" ? "next" : "prev";

    const items: Todo[] = [];
    let matchCount = 0;
    let hasMore = false;

    await walkCursor(index, null, direction, (raw) => {
      let todo: Todo;
      try {
        todo = readTodo(raw);
      } catch {
        return;
      }
      if (completed === true && !todo.completed) return;
      if (completed === false && todo.completed) return;
      matchCount += 1;
      if (!isAfterKeyset(todo, sortBy, sortDir, keyset)) return;
      if (items.length < limit) {
        items.push(todo);
        return;
      }
      hasMore = true;
      if (completed !== true && completed !== false) return false;
    });

    const total =
      completed === true || completed === false
        ? matchCount
        : await requestToPromise(index.count());
    const last = items[items.length - 1];

    return {
      items,
      nextCursor: hasMore && last ? encodeKeyset({ value: String(last[sortBy]), id: last.id }) : null,
      total,
    };
  }

  private async queryPrefixThenSort(options: {
    search: string;
    sortBy: NonNullable<TodoQuery["sortBy"]>;
    sortDir: NonNullable<TodoQuery["sortDir"]>;
    limit: number;
    keyset: Keyset | null;
    completed: boolean | null | undefined;
  }): Promise<TodoQueryResult> {
    const db = this.requireDb();
    const index = this.store(db, "readonly").index("titleSearch");
    const matched: Todo[] = [];

    await walkCursor(index, titlePrefixRange(options.search), "next", (raw) => {
      let todo: Todo;
      try {
        todo = readTodo(raw);
      } catch {
        return;
      }
      if (!todo.title.toLowerCase().startsWith(options.search)) return false;
      if (options.completed === true && !todo.completed) return;
      if (options.completed === false && todo.completed) return;
      matched.push(todo);
    });

    matched.sort((a, b) => compareTodos(a, b, options.sortBy, options.sortDir));

    const items: Todo[] = [];
    let hasMore = false;
    for (const todo of matched) {
      if (!isAfterKeyset(todo, options.sortBy, options.sortDir, options.keyset)) continue;
      if (items.length < options.limit) {
        items.push(todo);
        continue;
      }
      hasMore = true;
      break;
    }
    const last = items[items.length - 1];
    return {
      items,
      nextCursor:
        hasMore && last ? encodeKeyset({ value: String(last[options.sortBy]), id: last.id }) : null,
      total: matched.length,
    };
  }

  async clear(): Promise<void> {
    const db = this.requireDb();
    const tx = db.transaction([SCALABLE_STORE, SCALABLE_IMAGE_STORE], "readwrite");
    tx.objectStore(SCALABLE_STORE).clear();
    tx.objectStore(SCALABLE_IMAGE_STORE).clear();
    await transactionDone(tx);
  }

  async bulkCreate(inputs: CreateTodoInput[]): Promise<void> {
    const db = this.requireDb();
    const store = this.store(db, "readwrite");
    for (const input of inputs) {
      store.put(toStored(createTodo(input)));
    }
    await transactionDone(store.transaction);
  }

  async putImage(image: ImageBytes): Promise<ImageRef> {
    const db = this.requireDb();
    await requestToPromise(this.imageStore(db, "readwrite").put(image));
    return toImageRef(image);
  }

  async getImage(id: string): Promise<ImageBytes | null> {
    const db = this.requireDb();
    const raw = await requestToPromise(this.imageStore(db, "readonly").get(id));
    return raw ? (raw as ImageBytes) : null;
  }

  async deleteImage(id: string): Promise<void> {
    const db = this.requireDb();
    await requestToPromise(this.imageStore(db, "readwrite").delete(id));
  }

  private put(record: Todo & { titleSearch: string }): Promise<IDBValidKey> {
    const db = this.requireDb();
    return requestToPromise(this.store(db, "readwrite").put(record));
  }

  private store(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
    return db.transaction(SCALABLE_STORE, mode).objectStore(SCALABLE_STORE);
  }

  private imageStore(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
    return db.transaction(SCALABLE_IMAGE_STORE, mode).objectStore(SCALABLE_IMAGE_STORE);
  }

  private requireDb(): IDBDatabase {
    if (!this.db) {
      throw new StorageUnavailableError("IndexedDB has not been initialized.");
    }
    return this.db;
  }
}

function toStored(todo: Todo): Todo & { titleSearch: string } {
  return { ...todo, titleSearch: todo.title.toLowerCase() };
}

export function titlePrefixRange(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, `${prefix}\uffff`);
}

function isAfterKeyset(
  todo: Todo,
  sortBy: NonNullable<TodoQuery["sortBy"]>,
  sortDir: NonNullable<TodoQuery["sortDir"]>,
  keyset: Keyset | null,
): boolean {
  if (!keyset) return true;
  const value = String(todo[sortBy]);
  if (sortDir === "asc") {
    if (value > keyset.value) return true;
    if (value < keyset.value) return false;
    return todo.id > keyset.id;
  }
  if (value < keyset.value) return true;
  if (value > keyset.value) return false;
  return todo.id < keyset.id;
}

function encodeKeyset(keyset: Keyset): string {
  return JSON.stringify(keyset);
}

function decodeKeyset(cursor: string | undefined): Keyset | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(cursor) as Keyset;
    if (typeof parsed.value === "string" && typeof parsed.id === "string") return parsed;
  } catch {
    return null;
  }
  return null;
}

function walkCursor(
  index: IDBIndex,
  range: IDBKeyRange | null,
  direction: IDBCursorDirection,
  visit: (raw: unknown) => boolean | void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = index.openCursor(range ?? undefined, direction);
    request.onerror = () => reject(toUnavailable(request.error));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const cont = visit(cursor.value);
      if (cont === false) {
        resolve();
        return;
      }
      cursor.continue();
    };
  });
}

function readTodo(raw: unknown): Todo {
  try {
    return migrateTodo(raw);
  } catch (error) {
    if (error instanceof TodoValidationError) throw error;
    throw new TodoValidationError("Stored todo could not be read.");
  }
}

function openDatabase(name: string): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new StorageUnavailableError("IndexedDB is not available in this browser."),
    );
  }

  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name, SCALABLE_DB_VERSION);
    } catch (error) {
      reject(toUnavailable(error));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      if (!tx) return;
      const store = db.objectStoreNames.contains(SCALABLE_STORE)
        ? tx.objectStore(SCALABLE_STORE)
        : db.createObjectStore(SCALABLE_STORE, { keyPath: "id" });
      ensureIndex(store, "createdAt", "createdAt");
      ensureIndex(store, "updatedAt", "updatedAt");
      ensureIndex(store, "title", "title");
      ensureIndex(store, "titleSearch", "titleSearch");
      ensureIndex(store, "completed", "completed");
      ensureIndex(store, "createdAt_id", ["createdAt", "id"]);
      ensureIndex(store, "updatedAt_id", ["updatedAt", "id"]);
      ensureIndex(store, "title_id", ["title", "id"]);
      if (!db.objectStoreNames.contains(SCALABLE_IMAGE_STORE)) {
        db.createObjectStore(SCALABLE_IMAGE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(toUnavailable(request.error));
    request.onblocked = () =>
      reject(new StorageUnavailableError("IndexedDB upgrade is blocked by another tab."));
  });
}

function ensureIndex(store: IDBObjectStore, name: string, keyPath: string | string[]): void {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, { unique: false });
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(toUnavailable(request.error));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toUnavailable(tx.error));
    tx.onabort = () => reject(toUnavailable(tx.error));
  });
}

function toUnavailable(error: unknown): StorageUnavailableError {
  const message = error instanceof Error ? error.message : "IndexedDB request failed.";
  return new StorageUnavailableError(message);
}
