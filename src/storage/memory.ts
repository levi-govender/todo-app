import {
  applyTodoUpdate,
  createTodo,
  type CreateTodoInput,
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
    images: false,
    indexedQuery: false,
  };

  private readonly records = new Map<string, Todo>();

  async init(): Promise<void> {
    this.records.clear();
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
    if (!this.records.delete(id)) throw new StorageNotFoundError(id);
  }

  async get(id: string): Promise<Todo | null> {
    return this.records.get(id) ?? null;
  }

  async query(query?: TodoQuery): Promise<TodoQueryResult> {
    return applyTodoQuery([...this.records.values()], query);
  }

  async clear(): Promise<void> {
    this.records.clear();
  }

  async bulkCreate(inputs: CreateTodoInput[]): Promise<void> {
    for (const input of inputs) {
      const todo = createTodo(input);
      this.records.set(todo.id, todo);
    }
  }
}
