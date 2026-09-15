# Todo app

Framework-free browser todo list with a storage adapter boundary. The UI talks only to `TodoApp`; persistence goes through `StorageAdapter`.

Board: [Todo-app Kanban](https://app.notion.com/p/c963dc548b9e491f808b34ff41e5139c?v=3dc8f3776f4f81bfac2d000cd8832de9)

Architecture, schemas, image lifecycle, and trade-offs: [docs/architecture.md](docs/architecture.md). Performance budgets: [docs/performance-budgets.md](docs/performance-budgets.md).

## Setup

```bash
make install
make test
make dev
```

`make help` lists `build`, `preview`, `bench`, and `a11y`. npm scripts match those names.

Open the printed local URL. Add, complete, edit, delete, search, filter, and sort todos. Keyboard-only CRUD works; skip link jumps to the list.

## Storage modes

Pick a mode in the **Storage mode** control. Modes do not share data.

| Mode | Survives refresh | How lists work | Search |
| --- | --- | --- | --- |
| **Ephemeral** (memory) | No | In-memory maps | Substring |
| **Persistent** (IndexedDB `todo-app` v2) | Yes | Load matches, then page | Substring |
| **Scalable** (IndexedDB `todo-app-scalable` v4) | Yes | Index cursors, 50 per page | Title prefix only |

Persistent is the everyday store. Use scalable for 10k+ seeds so the DOM never holds the full set. Ephemeral is for throwaway sessions and tests.

In `make dev`, **Dev seed data** can load 10k, 50k, or 100k deterministic records (`seed=todo-app` by default). Production builds hide those controls.

## Schema

A todo is `schemaVersion` 1, UUID `id`, title, completed, ISO `createdAt` / `updatedAt`, and optional `image` `{ id, mimeType, sizeBytes }`. Bytes are never on the todo record. JPEG, PNG, WebP, and GIF up to 2MB are accepted.

Persistent/scalable IndexedDB: object store `todos` plus `images`. Scalable todos also store `titleSearch` and compound `[field, id]` indexes. Details in [docs/architecture.md](docs/architecture.md).

## Images

Upload on create or per row. `putImage` stores bytes; the list query returns metadata only. Thumbs lazy-load when the row is visible. A bounded blob-URL cache is revoked on eviction and mode change. Delete/replace/clear removes bytes.

## Scaling and benchmarks

Scalable mode pages 50 rows, debounces search (200ms), and drops stale queries. `make bench` (also part of `make test`) seeds 10k records and fails if budgets in `docs/performance-budgets.md` are missed.

## Tests

```bash
make test    # unit, contract, harness, a11y
make bench   # 10k budgets only
make a11y    # accessibility + breakpoints
```

The toolbar stacks below 720px; todo actions wrap below 719px. Focus rings use `:focus-visible`.

## Layout

- `src/domain` — Todo and image validation
- `src/seed` — deterministic benchmark datasets
- `src/storage` — adapter contract, contract tests, registry, three adapters
- `src/perf` — budgets and 10k harness
- `src/ui` — DOM binding; no persistence imports
- `src/app.ts` — application state
- `docs/architecture.md` — adapter boundaries, schemas, trade-offs
- `docs/performance-budgets.md` — latency, memory, and render budgets

## Next

1. Final acceptance demonstration
