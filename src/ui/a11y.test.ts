// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import axe from "axe-core";
import page from "../../index.html?raw";
import { TodoApp } from "../app.ts";
import { MemoryStorageAdapter } from "../storage/memory.ts";
import { bindUi } from "./bind.ts";
import { readFileSync } from "node:fs";

const css = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

function mountPage(): void {
  const body = page.split("<body>")[1]?.split("</body>")[0] ?? "";
  document.documentElement.lang = "en";
  document.title = "Todo";
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/, "");
}

describe("accessibility and responsive layout", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("has landmarks, skip link, labelled controls, and no serious axe issues", async () => {
    mountPage();
    const app = new TodoApp(new MemoryStorageAdapter());
    bindUi(document, app);
    await app.start();
    await app.create("Buy milk");

    expect(document.querySelector("html")?.lang || document.documentElement.lang).toBe("en");
    expect(document.querySelector(".skip-link")?.getAttribute("href")).toBe("#todo-list");
    expect(document.querySelector("header")).toBeTruthy();
    expect(document.querySelector("main")).toBeTruthy();
    expect(document.querySelector("#todo-list")?.getAttribute("aria-labelledby")).toBe("list-heading");

    for (const control of document.querySelectorAll("input, select, button, a")) {
      if (!(control instanceof HTMLElement) || control.hidden || control.closest("[hidden]")) continue;
      expect(accessibleName(control).length, control.outerHTML).toBeGreaterThan(0);
    }

    const results = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
      rules: { "color-contrast": { enabled: false } },
    });
    const blocking = results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  it("supports keyboard CRUD and restores focus after add and edit", async () => {
    mountPage();
    const app = new TodoApp(new MemoryStorageAdapter());
    bindUi(document, app);
    await app.start();

    const title = document.querySelector<HTMLInputElement>("#todo-title");
    const form = document.querySelector<HTMLFormElement>("#todo-form");
    expect(title && form).toBeTruthy();
    if (!title || !form) return;
    title.value = "Walk dog";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.getState().items.map((item) => item.title)).toEqual(["Walk dog"]);
    expect(document.activeElement).toBe(title);

    const edit = document.querySelector<HTMLButtonElement>("[data-action=edit]");
    edit?.click();
    await Promise.resolve();
    await Promise.resolve();
    const editInput = document.querySelector<HTMLInputElement>("#todo-list input[name=title]");
    expect(document.activeElement).toBe(editInput);

    const editForm = document.querySelector<HTMLFormElement>(".todo-edit");
    if (editInput) editInput.value = "Walk the dog";
    editForm?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.getState().items[0]?.title).toBe("Walk the dog");

    document.querySelector<HTMLButtonElement>("[data-action=delete]")?.click();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.getState().items).toHaveLength(0);
  });

  it("documents desktop and mobile breakpoints and visible focus styles", () => {
    expect(css).toContain("@media (min-width: 720px)");
    expect(css).toContain("@media (max-width: 719px)");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("width: min(44rem, calc(100% - 2rem))");
  });
});

function accessibleName(element: HTMLElement): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    return (
      labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ")
        .trim() || element.getAttribute("aria-label") || ""
    );
  }
  if (element.getAttribute("aria-label")) return element.getAttribute("aria-label") ?? "";
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label?.textContent) return label.textContent.trim();
  }
  const wrapper = element.closest("label");
  if (wrapper?.textContent) return wrapper.textContent.trim();
  return (element.textContent ?? "").trim();
}
