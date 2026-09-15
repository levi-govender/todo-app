import { TodoValidationError, type CreateTodoInput, type Todo } from "./domain/todo.ts";
import { DEFAULT_SEED, DEFAULT_SEED_COUNT, generateTodoInputs } from "./seed/generate.ts";
import {
  type StorageAdapter,
  type StorageMode,
  StorageNotFoundError,
  type TodoQuery,
} from "./storage/adapter.ts";
import { createAdapter } from "./storage/registry.ts";
import { loadStorageMode, saveStorageMode } from "./storage/settings.ts";

export const LIST_PAGE_SIZE = 50;

export type AppState = {
  items: Todo[];
  total: number;
  nextCursor: string | null;
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
  private querySeq = 0;
  private state: AppState = {
    items: [],
    total: 0,
    nextCursor: null,
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
        nextCursor: null,
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

  async seed(seed = DEFAULT_SEED, count: number = DEFAULT_SEED_COUNT): Promise<void> {
    await this.run(async () => {
      const inputs = generateTodoInputs({ seed, count });
      await this.adapter.clear();
      await this.adapter.bulkCreate(inputs);
      await this.reload();
    });
  }

  async clearAll(): Promise<void> {
    await this.run(async () => {
      await this.adapter.clear();
      await this.reload();
    });
  }

  setSearch(search: string): void {
    this.state = {
      ...this.state,
      query: { ...this.state.query, search },
      nextCursor: null,
    };
    void this.refresh();
  }

  setCompletedFilter(completed: boolean | null): void {
    this.state = {
      ...this.state,
      query: { ...this.state.query, completed },
      nextCursor: null,
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
      nextCursor: null,
    };
    void this.refresh();
  }

  beginEdit(id: string): void {
    this.patch({ editingId: id, error: null });
  }

  cancelEdit(): void {
    this.patch({ editingId: null });
  }

  async loadMore(): Promise<void> {
    const cursor = this.state.nextCursor;
    if (!cursor) return;
    await this.run(async () => {
      const seq = this.querySeq;
      const { search, completed, sortBy, sortDir } = this.state.query;
      const result = await this.adapter.query({
        search,
        completed,
        sortBy,
        sortDir,
        cursor,
        limit: LIST_PAGE_SIZE,
      });
      if (seq !== this.querySeq) return;
      this.patch({
        items: result.items,
        total: result.total,
        nextCursor: result.nextCursor,
      });
    });
  }

  private async refresh(): Promise<void> {
    await this.run(() => this.reload());
  }

  private async reload(): Promise<void> {
    const seq = this.querySeq;
    const { search, completed, sortBy, sortDir } = this.state.query;
    const result = await this.adapter.query({
      search,
      completed,
      sortBy,
      sortDir,
      limit: LIST_PAGE_SIZE,
    });
    if (seq !== this.querySeq) return;
    this.patch({ items: result.items, total: result.total, nextCursor: result.nextCursor });
  }

  private async run(work: () => Promise<void>): Promise<void> {
    const seq = ++this.querySeq;
    this.patch({ loading: true, error: null });
    try {
      await work();
    } catch (error) {
      if (seq !== this.querySeq) return;
      this.patch({ error: toUserMessage(error) });
    } finally {
      if (seq === this.querySeq) this.patch({ loading: false });
    }
  }

  private patch(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener(this.state);
  }
}

function modeNote(adapter: StorageAdapter): string {
  if (adapter.id === "ephemeral") {
    return "Ephemeral mode stores todos in memory only. Refreshing the page clears the list.";
  }
  if (adapter.id === "scalable") {
    return "Scalable mode stores todos in a separate IndexedDB, pages through indexes, and prefix-searches titles so 10k+ records stay out of the DOM.";
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
