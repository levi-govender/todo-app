# Architecture

The UI never talks to IndexedDB, memory, or any other persistence API. It talks to `TodoApp`. `TodoApp` talks to a `StorageAdapter`.

```
index.html  →  bindUi()  →  TodoApp  →  StorageAdapter
                                      ├─ MemoryStorageAdapter (ephemeral)
                                      ├─ IndexedDbStorageAdapter (persistent)
                                      └─ ScalableStorageAdapter (indexed + paged)
```

## Domain

`src/domain/todo.ts` owns the canonical record:

- `schemaVersion` currently `1`
- stable UUID `id`
- normalized `title`
- boolean `completed`
- ISO `createdAt` / `updatedAt`
- optional `image` metadata (`id`, `mimeType`, `sizeBytes`) — bytes are not stored on the todo itself

Invalid records throw `TodoValidationError`. `migrateTodo()` lifts older shapes up to the current version and rejects newer ones.

## Adapter contract

`StorageAdapter` is the only persistence boundary:

- `init()` / `create` / `update` / `delete` / `get` / `query`
- `clear()` / `bulkCreate()` for deterministic seed datasets

Adapters register in `src/storage/registry.ts`. Changing the storage selector replaces the adapter instance. Modes do not share data.

## Seed data

`src/seed/generate.ts` builds repeatable todos from a string seed and a count (10k / 50k / 100k). The same seed always yields the same ids, titles, completion flags, and timestamps. Dev-only controls in `make dev` write the current adapter via `TodoApp.seed()` / `clearAll()`.

## Ephemeral mode

`MemoryStorageAdapter` in `src/storage/memory.ts` keeps a `Map` in JavaScript memory. `init()` clears it, so a full page reload starts empty. It never calls `localStorage`, `sessionStorage`, or IndexedDB.

## Persistent mode

`IndexedDbStorageAdapter` in `src/storage/indexeddb.ts` stores todos in the `todo-app` database, object store `todos`, schema version `1`. Indexes exist on `completed`, `createdAt`, `updatedAt`, and `title`. Writes run in IndexedDB transactions. Corrupt rows are skipped during `query()` so one bad record cannot hide the rest of the list.

The selected mode is remembered in `localStorage` (`todo-app.storageMode`) so a refresh in persistent or scalable mode reloads the same dataset.

## Scalable mode

`ScalableStorageAdapter` in `src/storage/scalable.ts` uses a separate IndexedDB database (`todo-app-scalable`) so it never shares rows with persistent mode. Queries walk `createdAt` / `updatedAt` / `title` indexes with keyset cursors. Each page keeps at most the requested limit in memory; the UI shows one page at a time via **Next page**. Completion filters and substring search skip non-matching rows during the cursor walk instead of `getAll()`.
