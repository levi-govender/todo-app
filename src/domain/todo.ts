export const TODO_SCHEMA_VERSION = 1;
export const TITLE_MAX_LENGTH = 200;

export class TodoValidationError extends Error {
  readonly code = "TODO_VALIDATION";

  constructor(message: string) {
    super(message);
    this.name = "TodoValidationError";
  }
}

export type ImageRef = {
  id: string;
  mimeType: string;
  sizeBytes: number;
};

export type Todo = {
  schemaVersion: number;
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  image: ImageRef | null;
};

export type CreateTodoInput = {
  title: string;
  completed?: boolean;
  image?: ImageRef | null;
  createdAt?: string;
  updatedAt?: string;
  id?: string;
};

export type UpdateTodoInput = {
  title?: string;
  completed?: boolean;
  image?: ImageRef | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

export function createTodo(input: CreateTodoInput, clock: () => string = nowIso): Todo {
  const createdAt = input.createdAt ?? clock();
  const updatedAt = input.updatedAt ?? createdAt;
  return validateTodo({
    schemaVersion: TODO_SCHEMA_VERSION,
    id: input.id ?? createId(),
    title: input.title,
    completed: input.completed ?? false,
    createdAt,
    updatedAt,
    image: input.image ?? null,
  });
}

export function applyTodoUpdate(
  current: Todo,
  patch: UpdateTodoInput,
  clock: () => string = nowIso,
): Todo {
  return validateTodo({
    ...current,
    title: patch.title ?? current.title,
    completed: patch.completed ?? current.completed,
    image: patch.image === undefined ? current.image : patch.image,
    updatedAt: clock(),
  });
}

export function migrateTodo(raw: unknown): Todo {
  if (!isRecord(raw)) {
    throw new TodoValidationError("Todo record must be an object.");
  }

  const version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  if (version > TODO_SCHEMA_VERSION) {
    throw new TodoValidationError(`Unsupported schema version ${version}.`);
  }

  return validateTodo({
    schemaVersion: TODO_SCHEMA_VERSION,
    id: String(raw.id ?? ""),
    title: String(raw.title ?? ""),
    completed: Boolean(raw.completed),
    createdAt: String(raw.createdAt ?? ""),
    updatedAt: String(raw.updatedAt ?? raw.createdAt ?? ""),
    image: raw.image == null ? null : parseImageRef(raw.image),
  });
}

export function validateTodo(candidate: Todo): Todo {
  if (!UUID_PATTERN.test(candidate.id)) {
    throw new TodoValidationError("Todo id must be a UUID.");
  }

  const title = normalizeTitle(candidate.title);
  if (!title) {
    throw new TodoValidationError("Title is required.");
  }
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TodoValidationError(`Title must be ${TITLE_MAX_LENGTH} characters or fewer.`);
  }

  if (typeof candidate.completed !== "boolean") {
    throw new TodoValidationError("completed must be a boolean.");
  }

  const createdAt = parseIso(candidate.createdAt, "createdAt");
  const updatedAt = parseIso(candidate.updatedAt, "updatedAt");
  if (updatedAt.getTime() < createdAt.getTime()) {
    throw new TodoValidationError("updatedAt cannot be earlier than createdAt.");
  }

  return {
    schemaVersion: TODO_SCHEMA_VERSION,
    id: candidate.id,
    title,
    completed: candidate.completed,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    image: candidate.image ? parseImageRef(candidate.image) : null,
  };
}

function parseImageRef(raw: unknown): ImageRef {
  if (!isRecord(raw)) {
    throw new TodoValidationError("image must be an object or null.");
  }
  if (!UUID_PATTERN.test(String(raw.id ?? ""))) {
    throw new TodoValidationError("image.id must be a UUID.");
  }
  const mimeType = String(raw.mimeType ?? "").trim();
  if (!mimeType.includes("/")) {
    throw new TodoValidationError("image.mimeType is required.");
  }
  const sizeBytes = Number(raw.sizeBytes);
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new TodoValidationError("image.sizeBytes must be a positive integer.");
  }
  return { id: String(raw.id), mimeType, sizeBytes };
}

function parseIso(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TodoValidationError(`${field} must be a valid ISO timestamp.`);
  }
  return date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
