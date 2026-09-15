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

Scalable 10k+ storage is still disabled.

## Layout

- `src/domain` — canonical Todo model and validation
- `src/storage` — adapter contract, registry, memory and IndexedDB adapters
- `src/ui` — DOM binding; no persistence imports
- `src/app.ts` — application state
- `docs/architecture.md` — adapter boundaries and trade-offs

## Next

1. Deterministic 10k seed generator
2. Indexed query/search/sort for large datasets
3. Image bytes stored separately from list metadata
