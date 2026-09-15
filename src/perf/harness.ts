import { LIST_PAGE_SIZE } from "../app.ts";
import { generateTodoInputs } from "../seed/generate.ts";
import type { StorageAdapter } from "../storage/adapter.ts";
import { BENCH_COUNT, BENCH_SEED, PERFORMANCE_BUDGETS, type PerformanceBudgets } from "./budgets.ts";

type NodeLike = {
  version: string;
  platform: string;
  memoryUsage: () => { heapUsed: number };
};

export type BenchmarkScenario = {
  name: string;
  durationMs: number;
};

export type BenchmarkReport = {
  environment: {
    runtime: string;
    platform: string;
    adapter: string;
    seed: string;
    count: number;
    measuredAt: string;
  };
  scenarios: BenchmarkScenario[];
  pageItems: number;
  renderedNodes: number;
  heapBytes: number | null;
  imageGetMs: number;
  failures: string[];
};

export async function measureMs(name: string, work: () => Promise<void>): Promise<number> {
  const startMark = `${name}:start`;
  const endMark = `${name}:end`;
  performance.mark(startMark);
  await work();
  performance.mark(endMark);
  const entry = performance.measure(name, startMark, endMark);
  return entry.duration;
}

export function countRenderedNodes(itemCount: number): number {
  let nodes = 1;
  for (let i = 0; i < itemCount; i += 1) {
    nodes += 8;
  }
  return nodes;
}

export async function runBenchmark(
  adapter: StorageAdapter,
  budgets: PerformanceBudgets = PERFORMANCE_BUDGETS,
): Promise<BenchmarkReport> {
  const scenarios: BenchmarkScenario[] = [];

  const seedMs = await measureMs("bench:seed", async () => {
    await adapter.clear();
    await adapter.bulkCreate(generateTodoInputs({ seed: BENCH_SEED, count: BENCH_COUNT }));
  });
  scenarios.push({ name: "seed", durationMs: seedMs });

  let pageItems = 0;
  const firstPageMs = await measureMs("bench:first-page", async () => {
    const page = await adapter.query({ limit: LIST_PAGE_SIZE, sortBy: "createdAt", sortDir: "desc" });
    pageItems = page.items.length;
  });
  scenarios.push({ name: "firstPage", durationMs: firstPageMs });

  const searchMs = await measureMs("bench:search", async () => {
    await adapter.query({ search: "buy", limit: LIST_PAGE_SIZE });
  });
  scenarios.push({ name: "search", durationMs: searchMs });

  const filterMs = await measureMs("bench:filter", async () => {
    await adapter.query({ completed: true, limit: LIST_PAGE_SIZE });
  });
  scenarios.push({ name: "filter", durationMs: filterMs });

  const sortMs = await measureMs("bench:sort", async () => {
    await adapter.query({ sortBy: "title", sortDir: "asc", limit: LIST_PAGE_SIZE });
  });
  scenarios.push({ name: "sort", durationMs: sortMs });

  const combinedMs = await measureMs("bench:combined", async () => {
    await adapter.query({
      search: "buy",
      completed: true,
      sortBy: "createdAt",
      sortDir: "desc",
      limit: LIST_PAGE_SIZE,
    });
  });
  scenarios.push({ name: "combined", durationMs: combinedMs });

  const image = await adapter.putImage({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    mimeType: "image/png",
    sizeBytes: 4,
    bytes: new Uint8Array([137, 80, 78, 71]).buffer,
  });
  const imageGetMs = await measureMs("bench:image-get", async () => {
    await adapter.getImage(image.id);
  });

  const proc = (globalThis as { process?: NodeLike }).process;
  const renderedNodes = countRenderedNodes(pageItems);
  const heapBytes = proc?.memoryUsage().heapUsed ?? null;

  const failures = collectFailures(
    {
      seedMs,
      firstPageMs,
      searchMs,
      filterMs,
      sortMs,
      combinedMs,
      imageGetMs,
      pageItems,
      renderedNodes,
      heapBytes,
    },
    budgets,
  );

  return {
    environment: {
      runtime: proc ? `node ${proc.version}` : "browser",
      platform: proc?.platform ?? "unknown",
      adapter: adapter.id,
      seed: BENCH_SEED,
      count: BENCH_COUNT,
      measuredAt: new Date().toISOString(),
    },
    scenarios,
    pageItems,
    renderedNodes,
    heapBytes,
    imageGetMs,
    failures,
  };
}

export function formatBenchmarkReport(report: BenchmarkReport): string {
  const lines = [
    "# Benchmark report",
    "",
    `- Runtime: ${report.environment.runtime}`,
    `- Platform: ${report.environment.platform}`,
    `- Adapter: ${report.environment.adapter}`,
    `- Seed: ${report.environment.seed} (${report.environment.count} records)`,
    `- Measured at: ${report.environment.measuredAt}`,
    "",
    "| Scenario | Duration (ms) |",
    "| --- | ---: |",
  ];
  for (const scenario of report.scenarios) {
    lines.push(`| ${scenario.name} | ${scenario.durationMs.toFixed(1)} |`);
  }
  lines.push(
    `| imageGet | ${report.imageGetMs.toFixed(1)} |`,
    "",
    `- Page items: ${report.pageItems}`,
    `- Estimated rendered nodes: ${report.renderedNodes}`,
    `- Heap used: ${report.heapBytes === null ? "n/a" : `${Math.round(report.heapBytes / 1024 / 1024)} MB`}`,
    "",
  );
  if (report.failures.length === 0) {
    lines.push("All budgets passed.");
  } else {
    lines.push("Budget failures:");
    for (const failure of report.failures) lines.push(`- ${failure}`);
  }
  return `${lines.join("\n")}\n`;
}

function collectFailures(
  measured: {
    seedMs: number;
    firstPageMs: number;
    searchMs: number;
    filterMs: number;
    sortMs: number;
    combinedMs: number;
    imageGetMs: number;
    pageItems: number;
    renderedNodes: number;
    heapBytes: number | null;
  },
  budgets: PerformanceBudgets,
): string[] {
  const failures: string[] = [];
  if (measured.seedMs > budgets.seedMs) failures.push(`seed ${measured.seedMs.toFixed(0)}ms > ${budgets.seedMs}ms`);
  if (measured.firstPageMs > budgets.firstPageMs) {
    failures.push(`first page ${measured.firstPageMs.toFixed(0)}ms > ${budgets.firstPageMs}ms`);
  }
  if (measured.searchMs > budgets.searchMs) {
    failures.push(`search ${measured.searchMs.toFixed(0)}ms > ${budgets.searchMs}ms`);
  }
  if (measured.filterMs > budgets.filterMs) {
    failures.push(`filter ${measured.filterMs.toFixed(0)}ms > ${budgets.filterMs}ms`);
  }
  if (measured.sortMs > budgets.sortMs) {
    failures.push(`sort ${measured.sortMs.toFixed(0)}ms > ${budgets.sortMs}ms`);
  }
  if (measured.combinedMs > budgets.combinedMs) {
    failures.push(`combined ${measured.combinedMs.toFixed(0)}ms > ${budgets.combinedMs}ms`);
  }
  if (measured.imageGetMs > budgets.imageGetMs) {
    failures.push(`image get ${measured.imageGetMs.toFixed(0)}ms > ${budgets.imageGetMs}ms`);
  }
  if (measured.pageItems > budgets.maxPageItems) {
    failures.push(`page items ${measured.pageItems} > ${budgets.maxPageItems}`);
  }
  if (measured.renderedNodes > budgets.maxRenderedNodes) {
    failures.push(`rendered nodes ${measured.renderedNodes} > ${budgets.maxRenderedNodes}`);
  }
  if (measured.heapBytes !== null && measured.heapBytes > budgets.maxHeapBytes) {
    failures.push(`heap ${measured.heapBytes} > ${budgets.maxHeapBytes}`);
  }
  return failures;
}
