import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import type BetterSqlite3 from "better-sqlite3";
import { z } from "zod";
import catalogMetadata from "./icon-catalog.json";
import { CATALOG_ICONS } from "./icon-catalog.generated";
import type { ProjectSummary } from "./project-lookup";
import { SECTION_GLYPH } from "./section-icon";
import {
  DEFAULT_PROJECT_ICON,
  DEFAULT_SECTION_ICON,
  ICON_COLORS,
  ICON_OWNER_KINDS,
  PERSONAL_PROJECT_ICON,
  createIconStore,
  isEditable,
  type IconOwner,
} from "./store";

const ownerSchema = z
  .object({
    kind: z.enum(ICON_OWNER_KINDS),
    id: z.string().min(1).max(256),
  })
  .strict();

const iconSchema = ownerSchema.extend({
  icon: z.string().min(1).max(128),
  color: z.enum(ICON_COLORS).nullable(),
});

// The drawing for each chosen icon travels with it, so a row renders the glyph
// without the catalog.
const glyphSchema = z
  .array(z.tuple([z.string(), z.record(z.string(), z.any())]).readonly())
  .readonly();

const projectSchema = z.object({ id: z.string(), name: z.string() }).strict();

const iconsSchema = z
  .object({
    icons: z.array(iconSchema.extend({ glyph: glyphSchema })),
    defaults: z
      .object({
        project: glyphSchema,
        personal: glyphSchema,
        section: glyphSchema,
      })
      .strict(),
    /** bb's projects, by id and name, read with the icons so a rename and an icon edit never arrive half-applied. */
    projects: z.array(projectSchema),
    /** Whether that list has been read yet; it is filled off the read path. */
    projectsRead: z.boolean(),
  })
  .strict();

const catalogSchema = z
  .object({
    icons: z.array(
      z
        .object({
          name: z.string(),
          category: z.string(),
          tags: z.array(z.string()),
          glyph: glyphSchema,
        })
        .strict(),
    ),
  })
  .strict();

export const iconsRpcContract = defineRpcContract({
  /**
   * The whole picker catalog. It lives here rather than in the app bundle so
   * every client load stays small; the picker asks for it once, on open.
   */
  listIconCatalog: {
    input: z.null(),
    output: catalogSchema,
  },
  listIcons: {
    input: z.null(),
    output: iconsSchema,
  },
  setIcon: {
    input: iconSchema,
    output: iconsSchema,
  },
  clearIcon: {
    input: ownerSchema,
    output: iconsSchema,
  },
});

/**
 * The section, project, and projectless glyphs bb or this plugin already draw
 * for those concepts. Keeping them out of the picker prevents a custom choice
 * from being visually indistinguishable from bb's own chrome.
 */
const RESERVED_GLYPH_NAMES = new Set([
  "list-view",
  DEFAULT_PROJECT_ICON,
  "folder-add",
  "folder-remove",
  PERSONAL_PROJECT_ICON,
  "bubble-chat-add",
]);

function glyphOf(icon: string) {
  return icon === DEFAULT_SECTION_ICON
    ? SECTION_GLYPH
    : (CATALOG_ICONS[icon] ?? CATALOG_ICONS[DEFAULT_PROJECT_ICON] ?? []);
}

export function registerIcons(bb: BbPluginApi, db: BetterSqlite3.Database) {
  const store = createIconStore(db);

  let projects: ProjectSummary[] = [];
  let read = false;

  /**
   * Rereads bb's projects, and reports whether the names moved. The first
   * read moves nothing: announcing it would have every client refetch while
   * bb is still mounting the page.
   */
  const readProjects = async () => {
    try {
      const listed = await bb.sdk.projects.list({ includePersonal: true });
      const next = listed.map(({ id, name }) => ({ id, name }));
      const moved = read && JSON.stringify(next) !== JSON.stringify(projects);
      read = true;
      projects = next;
      return moved;
    } catch {
      return false;
    }
  };

  const view = () => ({
    icons: store.list().map((icon) => ({ ...icon, glyph: glyphOf(icon.icon) })),
    defaults: {
      project: glyphOf(DEFAULT_PROJECT_ICON),
      personal: glyphOf(PERSONAL_PROJECT_ICON),
      section: SECTION_GLYPH,
    },
    projects: [...projects],
    projectsRead: read,
  });

  const publish = ({ kind, id }: IconOwner) => {
    bb.realtime.publish("icons-changed", { kind, id });
    return view();
  };

  /**
   * bb publishes no event for a section, so a removed one leaves its icon
   * behind. Sweeping on start and after each write keeps the read path free.
   */
  const pruneSections = async () => {
    try {
      const sections = await bb.sdk.threadSections.list();
      const dropped = store.keepOnly(
        "section",
        sections.map((section) => section.id),
      );
      if (dropped > 0) bb.realtime.publish("icons-changed", { kind: "section" });
    } catch {
      // A hiccup listing sections must never fail the write that triggered it.
    }
  };

  const catalog = {
    icons: (
      catalogMetadata as Array<{
        name: string;
        category: string;
        tags: string[];
      }>
    ).flatMap((entry) => {
      const glyph = CATALOG_ICONS[entry.name];
      return glyph === undefined || RESERVED_GLYPH_NAMES.has(entry.name)
        ? []
        : [
            {
              name: entry.name,
              category: entry.category,
              tags: entry.tags,
              glyph,
            },
          ];
    }),
  };

  bb.rpc.register(iconsRpcContract, {
    listIconCatalog: () => catalog,
    listIcons: () => view(),
    setIcon(input) {
      if (!isEditable(input)) {
        throw new Error("The personal project's icon is fixed.");
      }
      store.set(input);
      const next = publish(input);
      if (input.kind === "section") void pruneSections();
      return next;
    },
    clearIcon(owner) {
      store.clear(owner);
      return publish(owner);
    },
  });

  // A deleted project's icon would otherwise linger forever; bb reports
  // deletions through project changes rather than a plugin lifecycle event.
  // The same event carries renames, which move the names clients show.
  bb.background.service("icon-cleanup", {
    async start(signal) {
      void pruneSections();
      void readProjects();
      const unsubscribe = bb.sdk.subscribe({
        event: "project:changed",
        callback(event) {
          const orphaned =
            !!event.id &&
            event.changes.includes("project-deleted") &&
            store.clear({ kind: "project", id: event.id });
          void readProjects().then((moved) => {
            if (!orphaned && !moved) return;
            bb.realtime.publish("icons-changed", {
              kind: "project",
              ...(event.id ? { id: event.id } : {}),
            });
          });
        },
      });
      try {
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      } finally {
        unsubscribe();
      }
    },
  });

  return { store, pruneSections };
}
