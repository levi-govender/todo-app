# Architecture

The UI never talks to IndexedDB, memory, or any other persistence API. It talks to `TodoApp`. `TodoApp` talks to a `StorageAdapter`.

```
index.html  →  bindUi()  →  TodoApp  →  StorageAdapter
                                      ├─ MemoryStorageAdapter (ephemeral)
                                      ├─ IndexedDB adapter (next)
                                      └─ Scalable adapter (later)
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

- `init()`
- `create` / `update` / `delete` / `get`
- `query({ search, completed, sortBy, sortDir, cursor, limit })`

Adapters register in `src/storage/registry.ts`. Switching modes later should replace the adapter instance, not rewrite UI code.

## Current mode

Ephemeral storage keeps a `Map` in JavaScript memory. `init()` clears it, so a full page reload starts empty. Querying currently filters and paginates in process. Indexed adapters must keep the same `query` shape so the UI does not change.
