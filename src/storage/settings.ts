import type { StorageMode } from "./adapter.ts";

export const STORAGE_MODE_KEY = "todo-app.storageMode";

export function loadStorageMode(): StorageMode {
  try {
    const value = localStorage.getItem(STORAGE_MODE_KEY);
    if (value === "ephemeral" || value === "persistent" || value === "scalable") return value;
  } catch {
    // Private mode or missing storage should fall back to ephemeral.
  }
  return "ephemeral";
}

export function saveStorageMode(mode: StorageMode): void {
  try {
    localStorage.setItem(STORAGE_MODE_KEY, mode);
  } catch {
    // Mode still works for this session even if the preference cannot persist.
  }
}
