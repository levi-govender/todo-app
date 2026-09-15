import { ImageValidationError, readImageFile } from "./domain/image.ts";
import { TodoValidationError, type CreateTodoInput, type Todo } from "./domain/todo.ts";
import { DEFAULT_SEED, DEFAULT_SEED_COUNT, generateTodoInputs } from "./seed/generate.ts";
import {
  type StorageAdapter,
  type StorageMode,
  StorageNotFoundError,
  StorageUnavailableError,
  type TodoQuery,
} from "./storage/adapter.ts";
import { createAdapter } from "./storage/registry.ts";
import { loadStorageMode, saveStorageMode } from "./storage/settings.ts";

export const LIST_PAGE_SIZE = 50;
export const IMAGE_CACHE_LIMIT = 24;

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
  retryable: boolean;
  editingId: string | null;
  imageUrls: Record<string, string>;
  mode: StorageMode;
  modeNote: string;
};

export type AppListener = (state: AppState) => void;

export class TodoApp {
  private adapter: StorageAdapter;
  private listeners = new Set<AppListener>();
  private querySeq = 0;
  private imageCache = new Map<string, string>();
  private imageLoads = 0;
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
    retryable: false,
    editingId: null,
    imageUrls: {},
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
    try {
      await this.adapter.init();
    } catch (error) {
      if (this.adapter.id === "ephemeral") {
        this.patch({ error: toUserMessage(error), retryable: true, loading: false });
        return;
      }
      this.adapter = createAdapter("ephemeral");
      await this.adapter.init();
      await this.refresh();
      this.patch({
        mode: this.adapter.id,
        modeNote: modeNote(this.adapter),
        error: `${toUserMessage(error)} Using ephemeral storage for this session.`,
        retryable: true,
        loading: false,
      });
      return;
    }
    await this.refresh();
  }

  async retry(): Promise<void> {
    await this.run(async () => {
      const preferred = loadStorageMode();
      this.adapter = createAdapter(preferred);
      await this.adapter.init();
      this.clearImageCache();
      this.patch({
        mode: this.adapter.id,
        modeNote: modeNote(this.adapter),
        editingId: null,
        nextCursor: null,
        imageUrls: {},
        retryable: false,
      });
      await this.reload();
    });
  }

  async setMode(mode: StorageMode): Promise<void> {
    if (mode === this.adapter.id) return;
    await this.run(async () => {
      const next = createAdapter(mode);
      await next.init();
      this.adapter = next;
      saveStorageMode(mode);
      this.clearImageCache();
      this.patch({
        mode: this.adapter.id,
        modeNote: modeNote(this.adapter),
        editingId: null,
        nextCursor: null,
        imageUrls: {},
        retryable: false,
      });
      await this.reload();
    });
  }

  async create(title: string, file?: File | null): Promise<void> {
    await this.run(async () => {
      const input: CreateTodoInput = { title };
      if (file && file.size > 0) {
        const bytes = await readImageFile(file);
        input.image = await this.adapter.putImage(bytes);
      }
      await this.adapter.create(input);
      await this.reload();
    });
  }

  async attachImage(id: string, file: File): Promise<void> {
    const current = this.state.items.find((item) => item.id === id);
    if (!current) return;
    await this.run(async () => {
      const bytes = await readImageFile(file);
      const image = await this.adapter.putImage(bytes);
      await this.adapter.update(id, { image });
      if (current.image) await this.adapter.deleteImage(current.image.id);
      await this.reload();
    });
  }

  async removeImage(id: string): Promise<void> {
    const current = this.state.items.find((item) => item.id === id);
    const image = current?.image;
    if (!image) return;
    await this.run(async () => {
      await this.adapter.update(id, { image: null });
      await this.adapter.deleteImage(image.id);
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

  async loadImage(todoId: string): Promise<void> {
    const todo = this.state.items.find((item) => item.id === todoId);
    if (!todo?.image) return;
    if (this.imageCache.has(todoId)) return;
    const stored = await this.adapter.getImage(todo.image.id);
    if (!stored) return;
    if (this.state.items.every((item) => item.id !== todoId)) return;
    if (this.imageCache.has(todoId)) return;
    this.imageLoads += 1;
    const url =
      typeof URL !== "undefined" && typeof Blob !== "undefined"
        ? URL.createObjectURL(new Blob([stored.bytes], { type: stored.mimeType }))
        : `loaded:${todo.image.id}`;
    this.imageCache.set(todoId, url);
    while (this.imageCache.size > IMAGE_CACHE_LIMIT) {
      const oldest = this.imageCache.keys().next().value;
      if (!oldest) break;
      this.revokeCached(oldest);
    }
    this.patch({ imageUrls: Object.fromEntries(this.imageCache) });
  }

  imageLoadCount(): number {
    return this.imageLoads;
  }

  async loadMore(): Promise<void> {
    const cursor = this.state.nextCursor;
    if (!cursor) return;
    await this.run(async () => {
      const seq = this.querySeq;
      const { search, completed, sortBy, sortDir } = this.state.query;
      const result = await this.timedQuery({
        search,
        completed,
        sortBy,
        sortDir,
        cursor,
        limit: LIST_PAGE_SIZE,
      });
      if (seq !== this.querySeq) return;
      const items = [...this.state.items, ...result.items];
      this.pruneImageCache(items);
      this.patch({
        items,
        total: result.total,
        nextCursor: result.nextCursor,
        imageUrls: Object.fromEntries(this.imageCache),
      });
    });
  }

  private async refresh(): Promise<void> {
    await this.run(() => this.reload());
  }

  private async reload(): Promise<void> {
    const seq = this.querySeq;
    const { search, completed, sortBy, sortDir } = this.state.query;
    const result = await this.timedQuery({
      search,
      completed,
      sortBy,
      sortDir,
      limit: LIST_PAGE_SIZE,
    });
    if (seq !== this.querySeq) return;
    this.pruneImageCache(result.items);
    this.patch({
      items: result.items,
      total: result.total,
      nextCursor: result.nextCursor,
      imageUrls: Object.fromEntries(this.imageCache),
    });
  }

  private async timedQuery(query: TodoQuery) {
    performance.mark("todo-query:start");
    try {
      return await this.adapter.query(query);
    } finally {
      performance.mark("todo-query:end");
      performance.measure("todo-query", "todo-query:start", "todo-query:end");
    }
  }

  private pruneImageCache(items: Todo[]): void {
    const keep = new Set(items.map((item) => item.id));
    for (const id of [...this.imageCache.keys()]) {
      if (!keep.has(id)) this.revokeCached(id);
    }
  }

  private clearImageCache(): void {
    for (const id of [...this.imageCache.keys()]) this.revokeCached(id);
  }

  private revokeCached(todoId: string): void {
    const url = this.imageCache.get(todoId);
    this.imageCache.delete(todoId);
    if (url && typeof URL !== "undefined" && url.startsWith("blob:")) URL.revokeObjectURL(url);
  }

  private async run(work: () => Promise<void>): Promise<void> {
    const seq = ++this.querySeq;
    this.patch({ loading: true, error: null, retryable: false });
    try {
      await work();
    } catch (error) {
      if (seq !== this.querySeq) return;
      this.patch({ error: toUserMessage(error), retryable: error instanceof StorageUnavailableError });
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
    error instanceof ImageValidationError ||
    error instanceof StorageNotFoundError ||
    error instanceof StorageUnavailableError
  ) {
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
