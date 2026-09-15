# Todo app

Framework-free browser todo list with a storage adapter boundary. Ephemeral memory, persistent IndexedDB, and scalable indexed IndexedDB are available from the storage selector.

Board: [Todo-app Kanban](https://app.notion.com/p/c963dc548b9e491f808b34ff41e5139c?v=3dc8f3776f4f81bfac2d000cd8832de9)

## Run

```bash
make install
make test
make dev
```

`make help` lists the other targets (`build`, `preview`, `bench`). You can still use the npm scripts directly.

Open the printed local URL. Add, complete, edit, delete, search, filter, and sort todos.

- **Ephemeral:** refresh clears the list.
- **Persistent:** refresh keeps the list (IndexedDB, loads matching rows into memory then pages).
- **Scalable:** refresh keeps the list in a separate IndexedDB; the list is index-paged (50 at a time). Title search is prefix-indexed and debounced. Filter and sort stay deterministic, including combined queries.

In `make dev`, a **Dev seed data** panel can load 10k, 50k, or 100k deterministic records into the current storage mode (`seed=todo-app` by default). Production builds hide those controls.

Image bytes live in a separate `images` store (or in-memory map). Todo rows keep only an `ImageRef`. JPEG, PNG, WebP, and GIF up to 2MB are accepted. List queries never load bytes; thumbs fetch on visibility through a bounded blob-URL cache.

## Layout

- `src/domain` — canonical Todo model and validation
- `src/seed` — deterministic benchmark datasets
- `src/storage` — adapter contract, registry, memory, IndexedDB, and scalable adapters
- `src/perf` — documented budgets and the 10k benchmark harness
- `src/ui` — DOM binding; no persistence imports
- `src/app.ts` — application state
- `docs/architecture.md` — adapter boundaries and trade-offs
- `docs/performance-budgets.md` — latency, memory, and render budgets

## Next

1. Adapter contract tests, storage failure/recovery, or accessibility (remaining P1s)
