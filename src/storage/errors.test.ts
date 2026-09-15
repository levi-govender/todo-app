import { describe, expect, it } from "vitest";
import {
  isQuotaError,
  isTransientUnavailable,
  mapStorageError,
  StorageQuotaError,
  StorageUnavailableError,
} from "./adapter.ts";
import { retryOnce } from "./retry.ts";

describe("storage error mapping", () => {
  it("maps quota failures and does not treat them as retryable", () => {
    const quota = mapStorageError({ name: "QuotaExceededError", message: "full" });
    expect(quota).toBeInstanceOf(StorageQuotaError);
    expect(isQuotaError(quota)).toBe(true);
    expect(isTransientUnavailable(quota)).toBe(false);
  });

  it("retries a transient unavailable read exactly once", async () => {
    let attempts = 0;
    const result = await retryOnce(async () => {
      attempts += 1;
      if (attempts === 1) throw new StorageUnavailableError("blocked");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("does not retry quota errors", async () => {
    let attempts = 0;
    await expect(
      retryOnce(async () => {
        attempts += 1;
        throw new StorageQuotaError();
      }),
    ).rejects.toBeInstanceOf(StorageQuotaError);
    expect(attempts).toBe(1);
  });
});
