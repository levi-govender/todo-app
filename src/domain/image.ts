import { createId } from "./todo.ts";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export class ImageValidationError extends Error {
  readonly code = "IMAGE_VALIDATION";

  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

export type ImageBytes = {
  id: string;
  mimeType: AllowedImageType;
  sizeBytes: number;
  bytes: ArrayBuffer;
};

export function isAllowedImageType(value: string): value is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value);
}

export function createImageBytes(mimeType: string, bytes: ArrayBuffer): ImageBytes {
  if (!isAllowedImageType(mimeType)) {
    throw new ImageValidationError("Image type must be JPEG, PNG, WebP, or GIF.");
  }
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength <= 0) {
    throw new ImageValidationError("Image bytes are required.");
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new ImageValidationError("Image must be 2MB or smaller.");
  }
  return {
    id: createId(),
    mimeType,
    sizeBytes: bytes.byteLength,
    bytes,
  };
}

export async function readImageFile(file: File): Promise<ImageBytes> {
  const mimeType = file.type || "application/octet-stream";
  const bytes = await file.arrayBuffer();
  return createImageBytes(mimeType, bytes);
}

export function toImageRef(image: ImageBytes) {
  return { id: image.id, mimeType: image.mimeType, sizeBytes: image.sizeBytes };
}
