import type BetterSqlite3 from "better-sqlite3";

type Database = BetterSqlite3.Database;

export const ICON_MIGRATIONS = [
  // Shipped when only projects could hold an icon. Append below; never edit.
  `
    CREATE TABLE IF NOT EXISTS project_icon (
      project_id TEXT PRIMARY KEY,
      icon TEXT NOT NULL,
      color TEXT,
      updated_at INTEGER NOT NULL
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS icon (
      owner_kind TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (owner_kind, owner_id)
    );
  `,
  `
    INSERT OR IGNORE INTO icon(owner_kind, owner_id, icon, color, updated_at)
    SELECT 'project', project_id, icon, color, updated_at FROM project_icon;
  `,
  // Safe to drop: bb runs every unapplied statement in one transaction, so the
  // copy above either committed with it or never happened.
  `DROP TABLE project_icon;`,
];

/** What an icon can belong to. A section is bb's manual sidebar grouping. */
export const ICON_OWNER_KINDS = ["project", "section"] as const;

export type IconOwnerKind = (typeof ICON_OWNER_KINDS)[number];

export interface IconOwner {
  kind: IconOwnerKind;
  id: string;
}

export const DEFAULT_PROJECT_ICON = "folder-01";
export const PERSONAL_PROJECT_ICON = "bubble-chat";
/**
 * Not a catalog entry: bb's own section mark has no Hugeicons equivalent, so
 * the plugin draws it itself. See section-icon.ts.
 */
export const DEFAULT_SECTION_ICON = "section";

/** bb's own palette, the one behind favicon colors. */
export const ICON_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
] as const;

export type IconColor = (typeof ICON_COLORS)[number];

export interface StoredIcon extends IconOwner {
  icon: string;
  /** Null means the icon inherits the surrounding text color. */
  color: IconColor | null;
}

export interface IconStore {
  list(): StoredIcon[];
  set(icon: StoredIcon): void;
  clear(owner: IconOwner): boolean;
  /**
   * Drops every icon of one kind whose owner is gone, and reports how many.
   * bb publishes no event when a section is created, renamed, or removed, so
   * a section icon can only be found orphaned by comparing against the live
   * list.
   */
  keepOnly(kind: IconOwnerKind, ids: readonly string[]): number;
}

export function createIconStore(db: Database): IconStore {
  const listRows = db.prepare(`
    SELECT owner_kind, owner_id, icon, color
    FROM icon
    ORDER BY owner_kind, owner_id
  `);
  const upsertRow = db.prepare(`
    INSERT INTO icon(owner_kind, owner_id, icon, color, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner_kind, owner_id) DO UPDATE SET
      icon = excluded.icon,
      color = excluded.color,
      updated_at = excluded.updated_at
  `);
  const deleteRow = db.prepare(
    "DELETE FROM icon WHERE owner_kind = ? AND owner_id = ?",
  );
  const listIdsOfKind = db.prepare(
    "SELECT owner_id FROM icon WHERE owner_kind = ?",
  );

  return {
    list() {
      return (
        listRows.all() as Array<{
          owner_kind: string;
          owner_id: string;
          icon: string;
          color: string | null;
        }>
      ).map((row) => ({
        kind: row.owner_kind as IconOwnerKind,
        id: row.owner_id,
        icon: row.icon,
        color: (row.color as IconColor | null) ?? null,
      }));
    },
    set({ kind, id, icon, color }) {
      upsertRow.run(kind, id, icon, color, Date.now());
    },
    clear({ kind, id }) {
      return deleteRow.run(kind, id).changes > 0;
    },
    keepOnly(kind, ids) {
      const live = new Set(ids);
      const stale = (
        listIdsOfKind.all(kind) as Array<{ owner_id: string }>
      ).filter((row) => !live.has(row.owner_id));
      for (const row of stale) deleteRow.run(kind, row.owner_id);
      return stale.length;
    },
  };
}

/**
 * The icon an owner shows when the user has not chosen one. Which project is
 * the personal one is bb's to say, so it is passed in rather than recognized
 * by its id; null means bb has not said yet.
 */
export function defaultIcon(
  { kind, id }: IconOwner,
  personalProjectId: string | null,
): string {
  if (kind === "section") return DEFAULT_SECTION_ICON;
  return id === personalProjectId
    ? PERSONAL_PROJECT_ICON
    : DEFAULT_PROJECT_ICON;
}

/** Whether the user may choose this owner's icon. */
export function isEditable(
  { kind, id }: IconOwner,
  personalProjectId: string | null,
): boolean {
  return kind === "section" || id !== personalProjectId;
}
