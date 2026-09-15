import type { Todo } from "../domain/todo.ts";
import type { TodoQuery, TodoQueryResult } from "./adapter.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function applyTodoQuery(records: readonly Todo[], query: TodoQuery = {}): TodoQueryResult {
  const search = query.search?.trim().toLowerCase() ?? "";
  const sortBy = query.sortBy ?? "createdAt";
  const sortDir = query.sortDir ?? "desc";
  const limit = clampLimit(query.limit);

  const filtered = records.filter((todo) => {
    if (query.completed === true && !todo.completed) return false;
    if (query.completed === false && todo.completed) return false;
    if (search && !todo.title.toLowerCase().includes(search)) return false;
    return true;
  });

  filtered.sort((a, b) => compareTodos(a, b, sortBy, sortDir));

  const offset = decodeCursor(query.cursor);
  const page = filtered.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    items: page,
    nextCursor: nextOffset < filtered.length ? encodeCursor(nextOffset) : null,
    total: filtered.length,
  };
}

export function compareTodos(
  a: Todo,
  b: Todo,
  sortBy: NonNullable<TodoQuery["sortBy"]>,
  sortDir: NonNullable<TodoQuery["sortDir"]>,
): number {
  const left = a[sortBy];
  const right = b[sortBy];
  const direction = sortDir === "asc" ? 1 : -1;
  if (left < right) return -1 * direction;
  if (left > right) return 1 * direction;
  if (a.id < b.id) return -1 * direction;
  if (a.id > b.id) return 1 * direction;
  return 0;
}

export function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

function encodeCursor(offset: number): string {
  return offset.toString(10);
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const offset = Number.parseInt(cursor, 10);
  return Number.isInteger(offset) && offset > 0 ? offset : 0;
}
