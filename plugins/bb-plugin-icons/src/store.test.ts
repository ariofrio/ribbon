import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ICON_MIGRATIONS,
  createIconStore,
  defaultIcon,
  isEditable,
  type IconStore,
} from "./store";

/** How bb applies them: every unapplied statement in one transaction. */
function migrate(db: Database.Database, upTo = ICON_MIGRATIONS.length) {
  db.transaction(() => {
    for (const statement of ICON_MIGRATIONS.slice(0, upTo)) db.exec(statement);
  })();
}

describe("icon store", () => {
  let db: Database.Database;
  let store: IconStore;

  beforeEach(() => {
    db = new Database(":memory:");
    migrate(db);
    store = createIconStore(db);
  });

  afterEach(() => db.close());

  it("keeps one icon per owner", () => {
    store.set({ kind: "project", id: "proj_a", icon: "rocket", color: "purple" });
    store.set({ kind: "project", id: "proj_b", icon: "coffee-01", color: null });
    store.set({ kind: "project", id: "proj_a", icon: "flash", color: null });

    expect(store.list()).toEqual([
      { kind: "project", id: "proj_a", icon: "flash", color: null },
      { kind: "project", id: "proj_b", icon: "coffee-01", color: null },
    ]);
  });

  it("tells a section apart from a project that shares its id", () => {
    store.set({ kind: "project", id: "shared", icon: "rocket", color: null });
    store.set({ kind: "section", id: "shared", icon: "flash", color: "teal" });

    expect(store.list()).toEqual([
      { kind: "project", id: "shared", icon: "rocket", color: null },
      { kind: "section", id: "shared", icon: "flash", color: "teal" },
    ]);
    expect(store.clear({ kind: "section", id: "shared" })).toBe(true);
    expect(store.list()).toEqual([
      { kind: "project", id: "shared", icon: "rocket", color: null },
    ]);
  });

  it("clears an owner back to its default", () => {
    store.set({ kind: "project", id: "proj_a", icon: "rocket", color: "red" });

    expect(store.clear({ kind: "project", id: "proj_a" })).toBe(true);
    expect(store.clear({ kind: "project", id: "proj_a" })).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it("drops icons whose owner is gone, leaving the other kind alone", () => {
    store.set({ kind: "section", id: "sec_live", icon: "rocket", color: null });
    store.set({ kind: "section", id: "sec_gone", icon: "flash", color: null });
    store.set({ kind: "project", id: "proj_a", icon: "coffee-01", color: null });

    expect(store.keepOnly("section", ["sec_live"])).toBe(1);
    expect(store.keepOnly("section", ["sec_live"])).toBe(0);
    expect(store.list()).toEqual([
      { kind: "project", id: "proj_a", icon: "coffee-01", color: null },
      { kind: "section", id: "sec_live", icon: "rocket", color: null },
    ]);
  });

  it("carries icons chosen before sections existed onto the new table", () => {
    const old = new Database(":memory:");
    migrate(old, 1);
    old
      .prepare(
        "INSERT INTO project_icon(project_id, icon, color, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run("proj_a", "store-01", "blue", 1);

    migrate(old);

    expect(createIconStore(old).list()).toEqual([
      { kind: "project", id: "proj_a", icon: "store-01", color: "blue" },
    ]);
    expect(
      old
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_icon'",
        )
        .all(),
    ).toEqual([]);
    old.close();
  });

  it("defaults projects to a folder, the personal project to a chat bubble, and sections to bb's own mark", () => {
    expect(defaultIcon({ kind: "project", id: "proj_other" }, "proj_mine")).toBe(
      "folder-01",
    );
    expect(defaultIcon({ kind: "project", id: "proj_mine" }, "proj_mine")).toBe(
      "bubble-chat",
    );
    expect(defaultIcon({ kind: "section", id: "sec_a" }, "proj_mine")).toBe(
      "section",
    );
  });

  it("leaves the personal project's icon fixed and every section editable", () => {
    expect(isEditable({ kind: "project", id: "proj_other" }, "proj_mine")).toBe(
      true,
    );
    expect(isEditable({ kind: "project", id: "proj_mine" }, "proj_mine")).toBe(
      false,
    );
    expect(isEditable({ kind: "section", id: "proj_mine" }, "proj_mine")).toBe(
      true,
    );
  });

  it("treats every project as editable until bb has named the personal one", () => {
    expect(isEditable({ kind: "project", id: "proj_personal" }, null)).toBe(
      true,
    );
  });
});
