# Architecture

The UI never talks to IndexedDB, memory, or any other persistence API. It talks to `TodoApp`. `TodoApp` talks to a `StorageAdapter`.

```
index.html  →  bindUi()  →  TodoApp  →  StorageAdapter
                                      ├─ MemoryStorageAdapter (ephemeral)
                                      ├─ IndexedDbStorageAdapter (persistent)
                                      └─ ScalableStorageAdapter (indexed + paged)
```

Modes do not share data. The selected mode is stored in `localStorage` (`todo-app.storageMode`). If IndexedDB cannot open, the session falls back to ephemeral without overwriting that preference.

## When to use which mode

| | Ephemeral | Persistent | Scalable |
| --- | --- | --- | --- |
| File | `src/storage/memory.ts` | `src/storage/indexeddb.ts` | `src/storage/scalable.ts` |
| Backing store | In-memory `Map`s | IndexedDB `todo-app` v2 | IndexedDB `todo-app-scalable` v4 |
| Survives refresh | No | Yes | Yes |
| List strategy | Load matching rows, then page | Load matching rows into memory, then page | Index cursors + 50-item pages |
| Search | Substring in memory | Substring in memory | Title **prefix** on `titleSearch` |
| Best for | Demos, tests, private mode | Everyday lists | 10k+ records |

Trade-off: persistent mode is simpler and fine for hundreds of todos; it still materializes the filtered set in JS. Scalable mode keeps the DOM and query walk bounded, but search is prefix-only and lives in a separate database.

## Domain

`src/domain/todo.ts` owns the canonical record:

- `schemaVersion` currently `1`
- stable UUID `id`
- normalized `title` (trimmed, max 200)
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

Adapters register in `src/storage/registry.ts`. `src/storage/contract.ts` runs the same CRUD, validation, query, image, error, and lifecycle cases against every adapter; persistent and scalable also reopen a new instance against the same database.

## IndexedDB schema

**Persistent** (`todo-app`, version `2`):

- object store `todos`, keyPath `id` — indexes `completed`, `createdAt`, `updatedAt`, `title`
- object store `images`, keyPath `id` — `{ id, mimeType, sizeBytes, bytes }`

**Scalable** (`todo-app-scalable`, version `4`):

- object store `todos` — extra `titleSearch` (lowercase title) plus compound indexes `createdAt_id`, `updatedAt_id`, `title_id`
- object store `images` — same shape as persistent

Upgrades only add stores and indexes. Corrupt todo rows are skipped during `query()`.

## Scalable query model

List queries walk compound `[sortField, id]` indexes with keyset cursors so sort order is deterministic. Search uses the `titleSearch` prefix index, then sorts that prefix set by the requested field. Completion filters apply during the cursor walk. The search box is debounced (200ms). `TodoApp` ignores stale query results. Each page stays at `LIST_PAGE_SIZE` (50); **Next page** appends the next cursor. A new search, filter, or sort resets pagination.

## Images

1. Validate file (type + 2MB) in `src/domain/image.ts`.
2. `putImage` stores bytes; the todo keeps only `ImageRef`.
3. `query()` never returns bytes.
4. Visible rows call `TodoApp.loadImage()` → `getImage()` (`IntersectionObserver` in `src/ui/bind.ts`).
5. Blob URLs are cached up to `IMAGE_CACHE_LIMIT` (24) and revoked on eviction, list change, or mode switch.
6. Deleting a todo, replacing its image, or `clear()` also deletes bytes.

## Seed data

`src/seed/generate.ts` builds repeatable todos from a string seed and a count (10k / 50k / 100k). The same seed always yields the same ids, titles, completion flags, and timestamps. Dev-only controls in `make dev` write the current adapter via `TodoApp.seed()` / `clearAll()`.

## Performance

Budgets and the 10k harness live in `src/perf/` and `docs/performance-budgets.md`. `make bench` (and `make test`) compare seed, first page, search, filter, sort, combined query, image get, page size, estimated DOM cost, and heap against those thresholds. `TodoApp` records `todo-query` Performance API measures around list queries.

## Failure and recovery

- `TodoValidationError` / `ImageValidationError` — invalid input; the write does not happen.
- `StorageNotFoundError` — update/delete of a missing id.
- `StorageQuotaError` — disk quota; not retried automatically.
- `StorageUnavailableError` — missing IndexedDB, blocked upgrade, or failed request. Reads and `init()` retry once. Writes are not retried so a timeout cannot create duplicates.

If persistent or scalable `init()` fails at startup, the app falls back to ephemeral for the session, keeps the saved mode preference, and shows **Retry storage**. Switching modes only commits after `init()` succeeds.

## Accessibility

`src/ui/a11y.test.ts` runs axe (WCAG 2 A/AA, excluding color-contrast in jsdom), checks accessible names, landmarks, skip link, keyboard CRUD, and CSS breakpoints (`720px` toolbar, `719px` todo rows). `:focus-visible` outlines are required on controls.

## Tests

| Command | What it covers |
| --- | --- |
| `make test` | Domain, adapters, contract suite, app sequencing, perf harness, a11y |
| `make bench` | 10k scalable budgets only |
| `make a11y` | Accessibility and breakpoint checks only |
