import { describe, expect, it } from "vitest";
import { MemoryStorageAdapter } from "./memory.ts";

describe("MemoryStorageAdapter", () => {
  it("does not use browser persistence APIs", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.init();
    await storage.create({ title: "Transient" });
    expect(storage.capabilities.persistsAcrossReload).toBe(false);
    expect(storage.capabilities.indexedQuery).toBe(false);
    await storage.init();
    const result = await storage.query();
    expect(result.total).toBe(0);
  });
});
