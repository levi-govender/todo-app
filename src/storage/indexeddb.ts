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
import { applyTodoQuery } from "./query.ts";

export const TODO_DB_NAME = "todo-app";
export const TODO_DB_VERSION = 1;
export const TODO_STORE = "todos";

export class IndexedDbStorageAdapter implements StorageAdapter {
  readonly id = "persistent" as const;
  readonly label = "Persistent (IndexedDB)";
  readonly capabilities: StorageCapabilities = {
    persistsAcrossReload: true,
    images: false,
    indexedQuery: true,
  };

  private db: IDBDatabase | null = null;

  constructor(private readonly dbName = TODO_DB_NAME) {}

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

  async query(query?: TodoQuery): Promise<TodoQueryResult> {
    const db = this.requireDb();
    const rawItems = await requestToPromise(this.store(db, "readonly").getAll());
    const todos: Todo[] = [];
    for (const raw of rawItems) {
      try {
        todos.push(readTodo(raw));
      } catch {
        // Isolate corrupt records so one bad row cannot take down the list.
      }
    }
    return applyTodoQuery(todos, query);
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
    return db.transaction(TODO_STORE, mode).objectStore(TODO_STORE);
  }

  private requireDb(): IDBDatabase {
    if (!this.db) {
      throw new StorageUnavailableError("IndexedDB has not been initialized.");
    }
    return this.db;
  }
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
      request = indexedDB.open(name, TODO_DB_VERSION);
    } catch (error) {
      reject(toUnavailable(error));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      if (!tx) return;
      const store = db.objectStoreNames.contains(TODO_STORE)
        ? tx.objectStore(TODO_STORE)
        : db.createObjectStore(TODO_STORE, { keyPath: "id" });
      ensureIndex(store, "completed", "completed");
      ensureIndex(store, "createdAt", "createdAt");
      ensureIndex(store, "updatedAt", "updatedAt");
      ensureIndex(store, "title", "title");
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
