# Todo app

Framework-free browser todo list with a storage adapter boundary. Ephemeral memory and persistent IndexedDB are both available from the storage selector.

Board: [Todo-app Kanban](https://app.notion.com/p/c963dc548b9e491f808b34ff41e5139c?v=3dc8f3776f4f81bfac2d000cd8832de9)

## Run

```bash
make install
make test
make dev
```

`make help` lists the other targets (`build`, `preview`). You can still use the npm scripts directly.

Open the printed local URL. Add, complete, edit, delete, search, filter, and sort todos.

- **Ephemeral:** refresh clears the list.
- **Persistent:** refresh keeps the list (IndexedDB).

In `make dev`, a **Dev seed data** panel can load 10k, 50k, or 100k deterministic records into the current storage mode (`seed=todo-app` by default). Production builds hide those controls.

Scalable 10k+ storage is still disabled.

## Layout

- `src/domain` — canonical Todo model and validation
- `src/seed` — deterministic benchmark datasets
- `src/storage` — adapter contract, registry, memory and IndexedDB adapters
- `src/ui` — DOM binding; no persistence imports
- `src/app.ts` — application state
- `docs/architecture.md` — adapter boundaries and trade-offs

## Next

1. Indexed query/search/sort for large datasets
2. Image bytes stored separately from list metadata
