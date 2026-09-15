import {
  applyTodoUpdate,
  createTodo,
  migrateTodo,
  type CreateTodoInput,
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
import { clampLimit } from "./query.ts";

export const SCALABLE_DB_NAME = "todo-app-scalable";
export const SCALABLE_DB_VERSION = 1;
export const SCALABLE_STORE = "todos";

type Keyset = { value: string; id: string };

export class ScalableStorageAdapter implements StorageAdapter {
  readonly id = "scalable" as const;
  readonly label = "Scalable (IndexedDB indexes)";
  readonly capabilities: StorageCapabilities = {
    persistsAcrossReload: true,
    images: false,
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
    await this.put(todo);
    return todo;
  }

  async update(id: string, patch: UpdateTodoInput): Promise<Todo> {
    const current = await this.get(id);
    if (!current) throw new StorageNotFoundError(id);
    const next = applyTodoUpdate(current, patch);
    await this.put(next);
    return next;
  }

  async delete(id: string): Promise<void> {
    const db = this.requireDb();
    const store = this.store(db, "readwrite");
    const existing = await requestToPromise(store.get(id));
    if (existing === undefined) throw new StorageNotFoundError(id);
    await requestToPromise(store.delete(id));
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
    const store = this.store(db, "readonly");
    const index = store.index(sortBy);
    const direction: IDBCursorDirection = sortDir === "asc" ? "next" : "prev";
    const completed = query.completed;

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
      if (search && !todo.title.toLowerCase().includes(search)) return;
      matchCount += 1;
      if (!isAfterKeyset(todo, sortBy, sortDir, keyset)) return;
      if (items.length < limit) {
        items.push(todo);
        return;
      }
      hasMore = true;
      if (!search && completed !== true && completed !== false) return false;
    });

    const total =
      search || completed === true || completed === false
        ? matchCount
        : await requestToPromise(index.count());
    const last = items[items.length - 1];

    return {
      items,
      nextCursor: hasMore && last ? encodeKeyset({ value: String(last[sortBy]), id: last.id }) : null,
      total,
    };
  }

  async clear(): Promise<void> {
    const db = this.requireDb();
    await requestToPromise(this.store(db, "readwrite").clear());
  }

  async bulkCreate(inputs: CreateTodoInput[]): Promise<void> {
    const db = this.requireDb();
    const store = this.store(db, "readwrite");
    for (const input of inputs) {
      store.put(createTodo(input));
    }
    await transactionDone(store.transaction);
  }

  private put(todo: Todo): Promise<IDBValidKey> {
    const db = this.requireDb();
    return requestToPromise(this.store(db, "readwrite").put(todo));
  }

  private store(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
    return db.transaction(SCALABLE_STORE, mode).objectStore(SCALABLE_STORE);
  }

  private requireDb(): IDBDatabase {
    if (!this.db) {
      throw new StorageUnavailableError("IndexedDB has not been initialized.");
    }
    return this.db;
  }
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
      ensureIndex(store, "completed", "completed");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(toUnavailable(request.error));
    request.onblocked = () =>
      reject(new StorageUnavailableError("IndexedDB upgrade is blocked by another tab."));
  });
}

function ensureIndex(store: IDBObjectStore, name: string, keyPath: string): void {
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
