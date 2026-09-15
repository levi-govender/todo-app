import type { ImageBytes } from "../domain/image.ts";
import type { CreateTodoInput, ImageRef, Todo, UpdateTodoInput } from "../domain/todo.ts";

export type StorageMode = "ephemeral" | "persistent" | "scalable";

export type StorageCapabilities = {
  persistsAcrossReload: boolean;
  images: boolean;
  indexedQuery: boolean;
};

export type TodoQuery = {
  search?: string;
  completed?: boolean | null;
  sortBy?: "title" | "createdAt" | "updatedAt";
  sortDir?: "asc" | "desc";
  cursor?: string;
  limit?: number;
};

export type TodoQueryResult = {
  items: Todo[];
  nextCursor: string | null;
  total: number;
};

export interface StorageAdapter {
  readonly id: StorageMode;
  readonly label: string;
  readonly capabilities: StorageCapabilities;
  init(): Promise<void>;
  create(input: CreateTodoInput): Promise<Todo>;
  update(id: string, patch: UpdateTodoInput): Promise<Todo>;
  delete(id: string): Promise<void>;
  get(id: string): Promise<Todo | null>;
  query(query?: TodoQuery): Promise<TodoQueryResult>;
  clear(): Promise<void>;
  bulkCreate(inputs: CreateTodoInput[]): Promise<void>;
  putImage(image: ImageBytes): Promise<ImageRef>;
  getImage(id: string): Promise<ImageBytes | null>;
  deleteImage(id: string): Promise<void>;
}

export class StorageNotFoundError extends Error {
  readonly code = "STORAGE_NOT_FOUND";

  constructor(id: string) {
    super(`Todo ${id} was not found.`);
    this.name = "StorageNotFoundError";
  }
}

export class StorageUnavailableError extends Error {
  readonly code: string = "STORAGE_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

export class StorageQuotaError extends StorageUnavailableError {
  override readonly code: string = "STORAGE_QUOTA";

  constructor(message = "Storage is full. Delete todos or images and try again.") {
    super(message);
    this.name = "StorageQuotaError";
  }
}

export function isQuotaError(error: unknown): boolean {
  if (error instanceof StorageQuotaError) return true;
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String(error.message) : "";
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    message.toLowerCase().includes("quota")
  );
}

export function isTransientUnavailable(error: unknown): boolean {
  return error instanceof StorageUnavailableError && !(error instanceof StorageQuotaError);
}

export function mapStorageError(error: unknown): StorageUnavailableError {
  if (error instanceof StorageUnavailableError) return error;
  if (isQuotaError(error)) return new StorageQuotaError();
  const message = error instanceof Error ? error.message : "Storage is unavailable.";
  return new StorageUnavailableError(message);
}
