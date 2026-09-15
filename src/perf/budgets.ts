export const BENCH_SEED = "bench";
export const BENCH_COUNT = 10_000;

export type PerformanceBudgets = {
  seedMs: number;
  firstPageMs: number;
  searchMs: number;
  filterMs: number;
  sortMs: number;
  combinedMs: number;
  imageGetMs: number;
  maxPageItems: number;
  maxRenderedNodes: number;
  maxHeapBytes: number;
};

export const PERFORMANCE_BUDGETS: PerformanceBudgets = {
  seedMs: 20_000,
  firstPageMs: 2_000,
  searchMs: 3_000,
  filterMs: 2_000,
  sortMs: 2_000,
  combinedMs: 4_000,
  imageGetMs: 250,
  maxPageItems: 50,
  maxRenderedNodes: 800,
  maxHeapBytes: 400 * 1024 * 1024,
};
