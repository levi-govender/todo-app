import { TodoValidationError, type CreateTodoInput, type Todo } from "./domain/todo.ts";
import {
  type StorageAdapter,
  type StorageMode,
  StorageNotFoundError,
  type TodoQuery,
} from "./storage/adapter.ts";
import { createAdapter } from "./storage/registry.ts";
import { loadStorageMode, saveStorageMode } from "./storage/settings.ts";

export type AppState = {
  items: Todo[];
  total: number;
  query: Required<Pick<TodoQuery, "sortBy" | "sortDir">> & {
    search: string;
    completed: boolean | null;
  };
  loading: boolean;
  error: string | null;
  editingId: string | null;
  mode: StorageMode;
  modeNote: string;
};

export type AppListener = (state: AppState) => void;

export class TodoApp {
  private adapter: StorageAdapter;
  private listeners = new Set<AppListener>();
  private state: AppState = {
    items: [],
    total: 0,
    query: {
      search: "",
      completed: null,
      sortBy: "createdAt",
      sortDir: "desc",
    },
    loading: false,
    error: null,
    editingId: null,
    mode: "ephemeral",
    modeNote: "",
  };

  constructor(adapter: StorageAdapter = createAdapter(loadStorageMode())) {
    this.adapter = adapter;
    this.state.mode = adapter.id;
    this.state.modeNote = modeNote(adapter);
  }

  subscribe(listener: AppListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): AppState {
    return this.state;
  }

  async start(): Promise<void> {
    await this.adapter.init();
    await this.refresh();
  }

  async setMode(mode: StorageMode): Promise<void> {
    if (mode === this.adapter.id) return;
    await this.run(async () => {
      this.adapter = createAdapter(mode);
      await this.adapter.init();
      saveStorageMode(mode);
      this.patch({
        mode: this.adapter.id,
        modeNote: modeNote(this.adapter),
        editingId: null,
      });
      await this.reload();
    });
  }

  async create(title: string): Promise<void> {
    await this.run(async () => {
      const input: CreateTodoInput = { title };
      await this.adapter.create(input);
      await this.reload();
    });
  }

  async toggle(id: string): Promise<void> {
    const current = this.state.items.find((item) => item.id === id);
    if (!current) return;
    await this.run(async () => {
      await this.adapter.update(id, { completed: !current.completed });
      await this.reload();
    });
  }

  async saveTitle(id: string, title: string): Promise<void> {
    await this.run(async () => {
      await this.adapter.update(id, { title });
      this.state = { ...this.state, editingId: null };
      await this.reload();
    });
  }

  async remove(id: string): Promise<void> {
    await this.run(async () => {
      await this.adapter.delete(id);
      await this.reload();
    });
  }

  setSearch(search: string): void {
    this.state = {
      ...this.state,
      query: { ...this.state.query, search },
    };
    void this.refresh();
  }

  setCompletedFilter(completed: boolean | null): void {
    this.state = {
      ...this.state,
      query: { ...this.state.query, completed },
    };
    void this.refresh();
  }

  setSort(sortBy: TodoQuery["sortBy"], sortDir: TodoQuery["sortDir"]): void {
    this.state = {
      ...this.state,
      query: {
        ...this.state.query,
        sortBy: sortBy ?? "createdAt",
        sortDir: sortDir ?? "desc",
      },
    };
    void this.refresh();
  }

  beginEdit(id: string): void {
    this.patch({ editingId: id, error: null });
  }

  cancelEdit(): void {
    this.patch({ editingId: null });
  }

  private async refresh(): Promise<void> {
    await this.run(() => this.reload());
  }

  private async reload(): Promise<void> {
    const result = await this.adapter.query({
      search: this.state.query.search,
      completed: this.state.query.completed,
      sortBy: this.state.query.sortBy,
      sortDir: this.state.query.sortDir,
      limit: 50,
    });
    this.patch({ items: result.items, total: result.total });
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.patch({ loading: true, error: null });
    try {
      await work();
    } catch (error) {
      this.patch({ error: toUserMessage(error) });
    } finally {
      this.patch({ loading: false });
    }
  }

  private patch(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener(this.state);
  }
}

function modeNote(adapter: StorageAdapter): string {
  if (!adapter.capabilities.persistsAcrossReload) {
    return "Ephemeral mode stores todos in memory only. Refreshing the page clears the list.";
  }
  return "Persistent mode stores todos in IndexedDB. They survive refresh and browser restart.";
}

function toUserMessage(error: unknown): string {
  if (
    error instanceof TodoValidationError ||
    error instanceof StorageNotFoundError
  ) {
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
