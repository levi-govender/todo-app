import { createTodo, type CreateTodoInput, type Todo } from "../domain/todo.ts";

export const SEED_COUNTS = [10_000, 50_000, 100_000] as const;
export type SeedCount = (typeof SEED_COUNTS)[number];

export const DEFAULT_SEED = "todo-app";
export const DEFAULT_SEED_COUNT: SeedCount = 10_000;

const VERBS = [
  "Buy",
  "Call",
  "Review",
  "Pay",
  "Schedule",
  "Email",
  "Draft",
  "Book",
  "Fix",
  "Ship",
] as const;

const NOUNS = [
  "milk",
  "invoice",
  "meeting",
  "dentist",
  "report",
  "alpha",
  "beta",
  "tickets",
  "groceries",
  "landlord",
] as const;

const ORIGIN_MS = Date.parse("2020-01-01T00:00:00.000Z");
const RANGE_MS = 6 * 365.25 * 24 * 60 * 60 * 1000;

export type GenerateTodosOptions = {
  seed?: string;
  count: number;
};

export function generateTodos(options: GenerateTodosOptions): Todo[] {
  const seed = options.seed?.trim() || DEFAULT_SEED;
  const count = options.count;
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("Seed count must be a positive integer.");
  }

  const next = mulberry32(hashSeed(seed));
  const todos: Todo[] = [];
  for (let index = 0; index < count; index += 1) {
    todos.push(createTodo(nextInput(next, index)));
  }
  return todos;
}

export function generateTodoInputs(options: GenerateTodosOptions): CreateTodoInput[] {
  return generateTodos(options).map((todo) => ({
    id: todo.id,
    title: todo.title,
    completed: todo.completed,
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
    image: todo.image,
  }));
}

function nextInput(next: () => number, index: number): CreateTodoInput {
  const verb = VERBS[Math.floor(next() * VERBS.length)] ?? "Buy";
  const noun = NOUNS[Math.floor(next() * NOUNS.length)] ?? "milk";
  const createdAt = new Date(ORIGIN_MS + Math.floor(next() * RANGE_MS)).toISOString();
  const updatedOffset = Math.floor(next() * 14 * 24 * 60 * 60 * 1000);
  const updatedAt = new Date(Date.parse(createdAt) + updatedOffset).toISOString();
  return {
    id: uuidFromRng(next),
    title: `${verb} ${noun} ${index + 1}`,
    completed: next() < 0.3,
    createdAt,
    updatedAt,
  };
}

function uuidFromRng(next: () => number): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(next() * 256));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
