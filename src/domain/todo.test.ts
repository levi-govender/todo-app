import { describe, expect, it } from "vitest";
import {
  TODO_SCHEMA_VERSION,
  TodoValidationError,
  applyTodoUpdate,
  createTodo,
  migrateTodo,
} from "./todo.ts";

describe("createTodo", () => {
  it("normalizes a valid record", () => {
    const todo = createTodo(
      { title: "  Buy milk  ", id: "11111111-1111-4111-8111-111111111111" },
      () => "2026-09-15T08:00:00.000Z",
    );
    expect(todo.title).toBe("Buy milk");
    expect(todo.completed).toBe(false);
    expect(todo.schemaVersion).toBe(TODO_SCHEMA_VERSION);
    expect(todo.image).toBeNull();
    expect(todo.createdAt).toBe("2026-09-15T08:00:00.000Z");
    expect(todo.updatedAt).toBe(todo.createdAt);
  });

  it("rejects an empty title", () => {
    expect(() => createTodo({ title: "   " })).toThrow(TodoValidationError);
  });

  it("rejects a title over 200 characters", () => {
    expect(() => createTodo({ title: "a".repeat(201) })).toThrow(/200/);
  });
});

describe("applyTodoUpdate", () => {
  it("updates title and timestamp", () => {
    const current = createTodo(
      { title: "Old", id: "11111111-1111-4111-8111-111111111111" },
      () => "2026-09-15T08:00:00.000Z",
    );
    const next = applyTodoUpdate(current, { title: "New", completed: true }, () => "2026-09-15T09:00:00.000Z");
    expect(next.title).toBe("New");
    expect(next.completed).toBe(true);
    expect(next.updatedAt).toBe("2026-09-15T09:00:00.000Z");
    expect(next.createdAt).toBe(current.createdAt);
  });
});

describe("migrateTodo", () => {
  it("accepts version 0 records missing schemaVersion", () => {
    const todo = migrateTodo({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Legacy",
      completed: true,
      createdAt: "2026-09-15T08:00:00.000Z",
      updatedAt: "2026-09-15T08:00:00.000Z",
    });
    expect(todo.schemaVersion).toBe(TODO_SCHEMA_VERSION);
    expect(todo.completed).toBe(true);
  });

  it("rejects a future schema version", () => {
    expect(() =>
      migrateTodo({
        schemaVersion: 99,
        id: "11111111-1111-4111-8111-111111111111",
        title: "Nope",
        completed: false,
        createdAt: "2026-09-15T08:00:00.000Z",
        updatedAt: "2026-09-15T08:00:00.000Z",
      }),
    ).toThrow(/Unsupported schema version/);
  });

  it("rejects invalid image metadata", () => {
    expect(() =>
      migrateTodo({
        id: "11111111-1111-4111-8111-111111111111",
        title: "Photo",
        completed: false,
        createdAt: "2026-09-15T08:00:00.000Z",
        updatedAt: "2026-09-15T08:00:00.000Z",
        image: { id: "not-a-uuid", mimeType: "image/png", sizeBytes: 12 },
      }),
    ).toThrow(/image.id/);
  });
});
