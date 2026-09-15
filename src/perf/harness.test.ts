import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { ScalableStorageAdapter } from "../storage/scalable.ts";
import { formatBenchmarkReport, runBenchmark } from "./harness.ts";

describe("benchmark harness", () => {
  it("measures 10k scalable scenarios against documented budgets", async () => {
    const adapter = new ScalableStorageAdapter(`todo-bench-${crypto.randomUUID()}`);
    await adapter.init();
    const report = await runBenchmark(adapter);
    expect(report.environment.count).toBe(10_000);
    expect(report.environment.adapter).toBe("scalable");
    expect(report.pageItems).toBe(50);
    expect(report.failures).toEqual([]);
    expect(formatBenchmarkReport(report)).toContain("All budgets passed.");
  });
});
