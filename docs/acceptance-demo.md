# Acceptance demonstration

Run this from a clean clone so every requirement can be shown the same way.

## Clean environment

```bash
make install
make test
make bench
make demo
make dev
```

Expected: install succeeds; tests and the 10k harness pass; `make demo` prints four passing scenarios (ephemeral wipe, persistent reopen, scalable 10k query, image bytes). `make dev` prints a local URL.

## 1. Ephemeral — gone after reload

1. Storage mode: **Ephemeral (memory)**.
2. Add a todo (optional image).
3. Reload the page.

Expected: the list is empty. Memory maps reset on `init()`.

## 2. Persistent — survives restart

1. Storage mode: **Persistent (IndexedDB)**.
2. Add a todo titled `Survive restart`.
3. Reload the page.

Expected: `Survive restart` is still there (database `todo-app`). Switching to ephemeral and back does **not** show that row in ephemeral; modes do not share data.

## 3. Scalable — 10k+ with search, filter, sort

1. Storage mode: **Scalable (10k+)**.
2. In the dev seed panel, seed `todo-app` × **10,000**.
3. Confirm the status line is `Showing 50 of 10000 todos` and **Next page** appears.
4. Search `buy` (prefix), status **Completed**, sort **Newest**.

Expected: each visible title starts with `Buy` / `buy`, all are completed, at most 50 rows in the DOM. `make bench` is the automated counterpart.

Limitation: scalable search is **prefix**, not contains. `ilk` will not match `Buy milk`.

## 4. Images as bytes

1. In persistent or ephemeral, add a todo with a JPEG/PNG/WebP/GIF under 2MB.
2. Confirm a thumbnail appears after the row is visible (lazy load).
3. Reload in persistent mode: metadata remains; the thumb loads again on view.
4. Remove the image or delete the todo.

Expected: list records never hold bytes; `images` store / memory map holds them; delete/clear removes bytes. Files over 2MB or wrong type show an error and do not write.

## Known limitations

- Ephemeral is wiped on reload and on `init()`.
- Persistent and scalable use separate IndexedDBs.
- Scalable title search is prefix-only.
- Image cache keeps at most 24 blob URLs.
- Seed controls exist only in `make dev`, not production `make build` / `make preview`.
