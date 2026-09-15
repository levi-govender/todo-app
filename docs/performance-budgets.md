# Performance budgets

Measured against the scalable adapter with seed `bench` and **10,000** records. Thresholds are CI-oriented (fake-indexeddb in Node). Browser runs should stay well under these.

| Scenario | Budget | What it covers |
| --- | ---: | --- |
| Seed | 20,000 ms | `clear` + `bulkCreate` of 10k deterministic todos |
| First page | 2,000 ms | Initial list query, 50 items, newest first |
| Search | 3,000 ms | Title prefix `buy` |
| Filter | 2,000 ms | Completed only |
| Sort | 2,000 ms | Title A–Z |
| Combined | 4,000 ms | Prefix + completed + createdAt desc |
| Image get | 250 ms | Fetch one stored image after `putImage` |
| Page size | 50 items | List query must not dump the full set |
| Rendered nodes | 800 | Estimated nodes for one page (not 10k rows) |
| Heap | 400 MB | Node `process.memoryUsage().heapUsed` after scenarios |

## Harness

```bash
make bench
```

`src/perf/harness.ts` uses the Performance API (`mark` / `measure`) and records runtime, platform, adapter, seed, and count. The Vitest run fails if any budget is exceeded so regressions are visible in CI.

List queries never load image bytes. Image retrieval is a separate scenario so 10k list pages stay metadata-only.

Budgets live in `src/perf/budgets.ts` so the test and this document stay aligned.
