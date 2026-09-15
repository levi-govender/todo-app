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

`src/domain/image.ts` validates MIME type (JPEG, PNG, WebP, GIF) and a 2MB size cap before adapters persist bytes.

Invalid records throw `TodoValidationError`. `migrateTodo()` lifts older shapes up to the current version and rejects newer ones.

## Adapter contract

`StorageAdapter` is the only persistence boundary:

- `init()` / `create` / `update` / `delete` / `get` / `query`
- `clear()` / `bulkCreate()` for deterministic seed datasets
- `putImage` / `getImage` / `deleteImage` for binary payloads keyed by image id (never on the todo record)

Adapters register in `src/storage/registry.ts`. Changing the storage selector replaces the adapter instance. Modes do not share data. `src/storage/contract.ts` runs the same CRUD, validation, query, image, error, and lifecycle cases against every adapter; persistent and scalable also reopen a new instance against the same database.

## Seed data

`src/seed/generate.ts` builds repeatable todos from a string seed and a count (10k / 50k / 100k). The same seed always yields the same ids, titles, completion flags, and timestamps. Dev-only controls in `make dev` write the current adapter via `TodoApp.seed()` / `clearAll()`.

## Ephemeral mode

`MemoryStorageAdapter` in `src/storage/memory.ts` keeps a `Map` of todos and a second `Map` of image bytes in JavaScript memory. `init()` clears both, so a full page reload starts empty. It never calls `localStorage`, `sessionStorage`, or IndexedDB.

## Persistent mode

`IndexedDbStorageAdapter` in `src/storage/indexeddb.ts` stores todos in the `todo-app` database, object store `todos`, schema version `2`. Indexes exist on `completed`, `createdAt`, `updatedAt`, and `title`. Image bytes live in object store `images`. Writes run in IndexedDB transactions. Corrupt rows are skipped during `query()` so one bad record cannot hide the rest of the list. Deleting a todo or clearing storage also removes its image bytes.

The selected mode is remembered in `localStorage` (`todo-app.storageMode`) so a refresh in persistent or scalable mode reloads the same dataset.

## Scalable mode

`ScalableStorageAdapter` in `src/storage/scalable.ts` uses a separate IndexedDB database (`todo-app-scalable`, schema version `4`) so it never shares rows with persistent mode. Image bytes use the same `images` object-store pattern as persistent mode. List queries walk compound `[sortField, id]` indexes with keyset cursors so sort order is deterministic. Search still uses the lowercase `titleSearch` prefix index, then sorts that prefix set by the requested field. Completion filters apply during the cursor walk. The search box is debounced (200ms). `TodoApp` ignores stale query results. Each page stays bounded; **Next page** advances the cursor and a new search/filter/sort resets pagination.

## Images

`query()` returns `ImageRef` metadata only. `TodoApp.loadImage()` fetches bytes through the adapter when a row is visible (`IntersectionObserver` in `src/ui/bind.ts`). Blob URLs are cached up to `IMAGE_CACHE_LIMIT` and revoked when the cache evicts, the list changes, or the storage mode switches.

## Performance

Budgets and the repeatable 10k harness live in `src/perf/` and `docs/performance-budgets.md`. `make bench` (and `make test`) compare seed, first page, search, filter, sort, combined query, image get, page size, estimated DOM cost, and heap against those thresholds. `TodoApp` records `todo-query` Performance API measures around list queries.
