import { toImageRef, type ImageBytes } from "../domain/image.ts";
import {
  applyTodoUpdate,
  createTodo,
  type CreateTodoInput,
  type ImageRef,
  type Todo,
  type UpdateTodoInput,
} from "../domain/todo.ts";
import {
  type StorageAdapter,
  type StorageCapabilities,
  StorageNotFoundError,
  type TodoQuery,
  type TodoQueryResult,
} from "./adapter.ts";
import { applyTodoQuery } from "./query.ts";

export class MemoryStorageAdapter implements StorageAdapter {
  readonly id = "ephemeral" as const;
  readonly label = "Ephemeral (memory)";
  readonly capabilities: StorageCapabilities = {
    persistsAcrossReload: false,
    images: true,
    indexedQuery: false,
  };

  private readonly records = new Map<string, Todo>();
  private readonly images = new Map<string, ImageBytes>();

  async init(): Promise<void> {
    this.records.clear();
    this.images.clear();
  }

  async create(input: CreateTodoInput): Promise<Todo> {
    const todo = createTodo(input);
    this.records.set(todo.id, todo);
    return todo;
  }

  async update(id: string, patch: UpdateTodoInput): Promise<Todo> {
    const current = this.records.get(id);
    if (!current) throw new StorageNotFoundError(id);
    const next = applyTodoUpdate(current, patch);
    this.records.set(id, next);
    return next;
  }

  async delete(id: string): Promise<void> {
    const current = this.records.get(id);
    if (!current) throw new StorageNotFoundError(id);
    if (current.image) this.images.delete(current.image.id);
    this.records.delete(id);
  }

  async get(id: string): Promise<Todo | null> {
    return this.records.get(id) ?? null;
  }

  async query(query?: TodoQuery): Promise<TodoQueryResult> {
    return applyTodoQuery([...this.records.values()], query);
  }

  async clear(): Promise<void> {
    this.records.clear();
    this.images.clear();
  }

  async bulkCreate(inputs: CreateTodoInput[]): Promise<void> {
    for (const input of inputs) {
      const todo = createTodo(input);
      this.records.set(todo.id, todo);
    }
  }

  async putImage(image: ImageBytes): Promise<ImageRef> {
    this.images.set(image.id, image);
    return toImageRef(image);
  }

  async getImage(id: string): Promise<ImageBytes | null> {
    return this.images.get(id) ?? null;
  }

  async deleteImage(id: string): Promise<void> {
    this.images.delete(id);
  }
}
