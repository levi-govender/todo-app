import type { StorageAdapter, StorageMode } from "./adapter.ts";
import { StorageUnavailableError } from "./adapter.ts";
import { IndexedDbStorageAdapter } from "./indexeddb.ts";
import { MemoryStorageAdapter } from "./memory.ts";
import { ScalableStorageAdapter } from "./scalable.ts";

export type AdapterFactory = () => StorageAdapter;

const factories = new Map<StorageMode, AdapterFactory>([
  ["ephemeral", () => new MemoryStorageAdapter()],
  ["persistent", () => new IndexedDbStorageAdapter()],
  ["scalable", () => new ScalableStorageAdapter()],
]);

export function registerAdapter(id: StorageMode, factory: AdapterFactory): void {
  factories.set(id, factory);
}

export function listAdapters(): StorageMode[] {
  return [...factories.keys()];
}

export function createAdapter(id: StorageMode): StorageAdapter {
  const factory = factories.get(id);
  if (!factory) {
    throw new StorageUnavailableError(
      `Storage mode "${id}" is not registered yet.`,
    );
  }
  return factory();
}
