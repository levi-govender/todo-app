import { describe, expect, it } from "vitest";
import { generateTodos } from "./generate.ts";

describe("generateTodos", () => {
  it("is repeatable for the same seed", () => {
    const first = generateTodos({ seed: "bench", count: 25 });
    const second = generateTodos({ seed: "bench", count: 25 });
    expect(first).toEqual(second);
    expect(new Set(first.map((todo) => todo.id)).size).toBe(25);
  });

  it("changes when the seed changes", () => {
    const first = generateTodos({ seed: "alpha", count: 10 });
    const second = generateTodos({ seed: "beta", count: 10 });
    expect(first.map((todo) => todo.id)).not.toEqual(second.map((todo) => todo.id));
  });

  it("covers titles, completion, and timestamps", () => {
    const todos = generateTodos({ seed: "todo-app", count: 200 });
    const titles = new Set(todos.map((todo) => todo.title.split(" ").slice(0, 2).join(" ")));
    expect(titles.size).toBeGreaterThan(8);
    expect(todos.some((todo) => todo.completed)).toBe(true);
    expect(todos.some((todo) => !todo.completed)).toBe(true);
    const created = todos.map((todo) => Date.parse(todo.createdAt));
    expect(Math.min(...created)).toBeGreaterThanOrEqual(Date.parse("2020-01-01T00:00:00.000Z"));
    expect(todos.every((todo) => Date.parse(todo.updatedAt) >= Date.parse(todo.createdAt))).toBe(
      true,
    );
  });
});
