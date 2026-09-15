# Todo app

Framework-free browser todo list with a storage adapter boundary. The first slice is ephemeral in-memory persistence plus semantic HTML CRUD.

Board: [Todo-app Kanban](https://app.notion.com/p/c963dc548b9e491f808b34ff41e5139c?v=3dc8f3776f4f81bfac2d000cd8832de9)

## Run

```bash
make install
make test
make dev
```

`make help` lists the other targets (`build`, `preview`). You can still use the npm scripts directly.

Open the printed local URL. Add, complete, edit, delete, search, filter, and sort todos. Refresh the page: the list is empty again. That is the ephemeral mode contract.

Persistent IndexedDB and scalable 10k+ adapters are registered in the UI as disabled options until those tickets land.

## Layout

- `src/domain` — canonical Todo model and validation
- `src/storage` — adapter contract, registry, in-memory adapter
- `src/ui` — DOM binding; no persistence imports
- `src/app.ts` — application state
- `docs/architecture.md` — adapter boundaries and trade-offs

## Next

1. Persistent IndexedDB adapter behind the same contract
2. Deterministic 10k seed generator
3. Indexed query/search/sort for large datasets
4. Image bytes stored separately from list metadata
