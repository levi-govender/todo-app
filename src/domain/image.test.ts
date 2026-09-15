import { describe, expect, it } from "vitest";
import {
  createImageBytes,
  ImageValidationError,
  MAX_IMAGE_BYTES,
} from "./image.ts";

describe("createImageBytes", () => {
  it("accepts a small PNG payload", () => {
    const bytes = new Uint8Array([137, 80, 78, 71]).buffer;
    const image = createImageBytes("image/png", bytes);
    expect(image.mimeType).toBe("image/png");
    expect(image.sizeBytes).toBe(4);
    expect(image.id).toMatch(/-/);
  });

  it("rejects unsupported types and oversized files", () => {
    const tiny = new Uint8Array([1, 2, 3]).buffer;
    expect(() => createImageBytes("application/pdf", tiny)).toThrow(ImageValidationError);
    const huge = new ArrayBuffer(MAX_IMAGE_BYTES + 1);
    expect(() => createImageBytes("image/jpeg", huge)).toThrow(ImageValidationError);
  });
});
