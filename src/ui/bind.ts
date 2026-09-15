import type { AppState, TodoApp } from "../app.ts";

export function bindUi(root: Document, app: TodoApp, options: { showSeedTools?: boolean } = {}): void {
  const form = must(root, "#todo-form");
  const titleInput = must<HTMLInputElement>(root, "#todo-title");
  const imageInput = must<HTMLInputElement>(root, "#todo-image");
  const formError = must(root, "#form-error");
  const retry = must<HTMLButtonElement>(root, "#storage-retry");
  const list = must(root, "#todo-list");
  const status = must(root, "#list-status");
  const empty = must(root, "#empty-state");
  const search = must<HTMLInputElement>(root, "#todo-search");
  const filter = must<HTMLSelectElement>(root, "#todo-filter");
  const sort = must<HTMLSelectElement>(root, "#todo-sort");
  const mode = must<HTMLSelectElement>(root, "#storage-mode");
  const modeNote = must(root, "#storage-note");
  const loadMore = must<HTMLButtonElement>(root, "#load-more");
  const seedPanel = root.querySelector("#seed-panel");
  const seedForm = root.querySelector("#seed-form");
  const seedInput = root.querySelector<HTMLInputElement>("#seed-value");
  const seedCount = root.querySelector<HTMLSelectElement>("#seed-count");
  const clearButton = root.querySelector<HTMLButtonElement>("[data-action=clear-all]");

  if (options.showSeedTools && seedPanel instanceof HTMLElement) {
    seedPanel.hidden = false;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = titleInput.value;
    const file = imageInput.files?.[0] ?? null;
    void app.create(title, file).then(() => {
      if (!app.getState().error) {
        titleInput.value = "";
        imageInput.value = "";
        titleInput.focus();
      }
    });
  });

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => app.setSearch(search.value), 200);
  });
  search.addEventListener("change", () => {
    clearTimeout(searchTimer);
    app.setSearch(search.value);
  });
  filter.addEventListener("change", () => {
    if (filter.value === "completed") app.setCompletedFilter(true);
    else if (filter.value === "active") app.setCompletedFilter(false);
    else app.setCompletedFilter(null);
  });
  sort.addEventListener("change", () => {
    const [sortBy, sortDir] = sort.value.split(":") as [
      "title" | "createdAt" | "updatedAt",
      "asc" | "desc",
    ];
    app.setSort(sortBy, sortDir);
  });
  mode.addEventListener("change", () => {
    void app.setMode(mode.value as AppState["mode"]);
  });

  if (seedForm instanceof HTMLFormElement && seedInput && seedCount) {
    seedForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const count = Number(seedCount.value);
      void app.seed(seedInput.value, count);
    });
  }
  clearButton?.addEventListener("click", () => {
    void app.clearAll();
  });
  retry.addEventListener("click", () => {
    void app.retry();
  });
  loadMore.addEventListener("click", () => {
    void app.loadMore();
  });

  list.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const item = target.closest("li[data-id]");
    if (!(item instanceof HTMLElement) || !item.dataset.id) return;
    if (target.type === "checkbox") {
      void app.toggle(item.dataset.id);
      return;
    }
    if (target.type === "file" && target.files?.[0]) {
      void app.attachImage(item.dataset.id, target.files[0]);
    }
  });

  list.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const item = target.closest("li[data-id]");
    if (!(item instanceof HTMLElement) || !item.dataset.id) return;
    const id = item.dataset.id;
    if (target.matches("[data-action=edit]")) app.beginEdit(id);
    if (target.matches("[data-action=cancel]")) app.cancelEdit();
    if (target.matches("[data-action=delete]")) void app.remove(id);
    if (target.matches("[data-action=remove-image]")) void app.removeImage(id);
  });

  list.addEventListener("submit", (event) => {
    event.preventDefault();
    const formEl = event.target;
    if (!(formEl instanceof HTMLFormElement)) return;
    const item = formEl.closest("li[data-id]");
    const input = formEl.querySelector("input[name=title]");
    if (!(item instanceof HTMLElement) || !item.dataset.id) return;
    if (!(input instanceof HTMLInputElement)) return;
    void app.saveTitle(item.dataset.id, input.value);
  });

  const observer =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting || !(entry.target instanceof HTMLElement) || !entry.target.dataset.id) {
                continue;
              }
              void app.loadImage(entry.target.dataset.id);
              observer?.unobserve(entry.target);
            }
          },
          { rootMargin: "80px" },
        );

  app.subscribe((state) => render(state));

  function render(state: AppState): void {
    mode.value = state.mode;
    modeNote.textContent = state.modeNote;
    formError.hidden = !state.error;
    formError.textContent = state.error ?? "";
    retry.hidden = !state.retryable;
    status.textContent = state.loading
      ? "Loading todos…"
      : state.total === 0
        ? "0 todos"
        : `Showing ${state.items.length} of ${state.total} todo${state.total === 1 ? "" : "s"}`;
    empty.hidden = state.items.length > 0 || state.loading;
    loadMore.hidden = !state.nextCursor || state.loading;
    list.replaceChildren(
      ...state.items.map((todo) =>
        renderItem(todo, state.editingId === todo.id, state.imageUrls[todo.id]),
      ),
    );
    observeVisibleImages(state);
  }

  function observeVisibleImages(state: AppState): void {
    if (!observer) return;
    observer.disconnect();
    for (const node of list.querySelectorAll<HTMLElement>("li[data-id][data-has-image]")) {
      const id = node.dataset.id;
      if (!id || state.imageUrls[id]) continue;
      observer.observe(node);
    }
  }
}

function renderItem(
  todo: { id: string; title: string; completed: boolean; image: { id: string } | null },
  editing: boolean,
  imageUrl: string | undefined,
): HTMLLIElement {
  const li = document.createElement("li");
  li.dataset.id = todo.id;
  if (todo.image) li.dataset.hasImage = "true";
  li.className = todo.completed ? "todo-item is-complete" : "todo-item";

  if (editing) {
    li.innerHTML = `
      <form class="todo-edit">
        <label class="visually-hidden" for="edit-${todo.id}">Edit title</label>
        <input id="edit-${todo.id}" name="title" type="text" required maxlength="200" value="" />
        <button type="submit">Save</button>
        <button type="button" data-action="cancel">Cancel</button>
      </form>
    `;
    const input = li.querySelector("input");
    if (input instanceof HTMLInputElement) {
      input.value = todo.title;
      queueMicrotask(() => input.focus());
    }
    return li;
  }

  li.innerHTML = `
    <label class="todo-complete">
      <input type="checkbox" ${todo.completed ? "checked" : ""} />
      <span class="visually-hidden">Mark ${escapeHtml(todo.title)} complete</span>
    </label>
    ${
      imageUrl
        ? `<img class="todo-thumb" src="${escapeHtml(imageUrl)}" alt="" />`
        : `<span class="todo-thumb todo-thumb-empty" aria-hidden="true"></span>`
    }
    <p class="todo-title">${escapeHtml(todo.title)}</p>
    <div class="todo-actions">
      <button type="button" data-action="edit">Edit</button>
      <button type="button" data-action="delete">Delete</button>
      ${
        todo.image
          ? `<button type="button" data-action="remove-image">Remove image</button>`
          : `<label class="todo-attach">Add image<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" /></label>`
      }
    </div>
  `;
  return li;
}

function must<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector(selector);
  if (!node) throw new Error(`Missing element ${selector}`);
  return node as T;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
