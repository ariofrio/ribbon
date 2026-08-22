import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import catalogMetadata from "./icon-catalog.json";
import { CATALOG_ICONS } from "./icon-catalog.generated";
import type { ProjectSummary } from "./project-lookup";
import { SECTION_GLYPH } from "./section-icon";
import {
  DEFAULT_PROJECT_ICON,
  DEFAULT_SECTION_ICON,
  ICON_COLORS,
  ICON_MIGRATIONS,
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

// Consumers render the glyph without shipping the catalog themselves, so the
// drawing for each chosen icon travels with it.
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
    /**
     * bb's projects, by id and name.
     *
     * Several of the places bb names a project — a row of the composer's
     * project menu, a row of the mention list — print the name and nothing
     * else, so that is all a client has to recognize the row by. The list
     * travels with the icons rather than through a call of its own, so a
     * rename and an icon edit can never be read half-applied.
     */
    projects: z.array(projectSchema),
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

export const rpcContract = defineRpcContract({
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
  /**
   * The sidebar half runs in a content script, where useSettings() does not
   * reach, so it reads its placement over the same RPC it reads icons on.
   */
  listPlacements: {
    input: z.null(),
    output: z
      .object({ showInThreadHeader: z.boolean(), showInSidebar: z.boolean() })
      .strict(),
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

export const ICON_PLACEMENTS = {
  showInThreadHeader: {
    type: "boolean",
    label: "Show in the thread header",
    description: "Draw the icon before the project name above an open thread.",
    default: true,
  },
  showInSidebar: {
    type: "boolean",
    label: "Show in the sidebar",
    description:
      "Draw the icon on bb's own project and section headers. Sidebars other plugins draw are their own.",
    default: true,
  },
} as const;

export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define(ICON_PLACEMENTS);
  const db = bb.storage.database();
  bb.storage.migrate(db, ICON_MIGRATIONS);
  const store = createIconStore(db);

  const glyphOf = (icon: string) =>
    icon === DEFAULT_SECTION_ICON
      ? SECTION_GLYPH
      : (CATALOG_ICONS[icon] ?? CATALOG_ICONS[DEFAULT_PROJECT_ICON] ?? []);

  let projects: ProjectSummary[] = [];
  let firstRead: Promise<void> | null = null;

  /** Rereads bb's projects, and reports whether the names moved. */
  const readProjects = async () => {
    try {
      const listed = await bb.sdk.projects.list({ includePersonal: true });
      const next = listed.map(({ id, name }) => ({ id, name }));
      const moved = JSON.stringify(next) !== JSON.stringify(projects);
      projects = next;
      return moved;
    } catch {
      // A hiccup listing projects leaves the last list standing; the rows that
      // have only a name to go on keep bb's own folder until the next read.
      return false;
    }
  };

  const ensureProjects = () => (firstRead ??= readProjects().then(() => undefined));

  const view = () => ({
    icons: store.list().map((icon) => ({ ...icon, glyph: glyphOf(icon.icon) })),
    defaults: {
      project: glyphOf(DEFAULT_PROJECT_ICON),
      personal: glyphOf(PERSONAL_PROJECT_ICON),
      section: SECTION_GLYPH,
    },
    projects: [...projects],
  });

  // Only the owner: a listener refetches anyway, and the chosen icon is nobody
  // else's business on a broadcast channel.
  const publish = ({ kind, id }: IconOwner) => {
    bb.realtime.publish("icons-changed", { kind, id });
    return view();
  };

  /**
   * bb publishes no event for a section, so a removed one leaves its icon
   * behind. Sweeping on start and after each write keeps the read path free of
   * an SDK round-trip it would pay on every header mount, and costs nothing in
   * the meantime: bb never reuses an id, so a leftover row is only bytes.
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
    icons: (catalogMetadata as Array<{
      name: string;
      category: string;
      tags: string[];
    }>).flatMap((entry) => {
      const glyph = CATALOG_ICONS[entry.name];
      return glyph === undefined
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

  bb.rpc.register(rpcContract, {
    listIconCatalog: () => catalog,
    async listIcons() {
      await ensureProjects();
      return view();
    },
    async listPlacements() {
      const { showInThreadHeader, showInSidebar } = await settings.get();
      return { showInThreadHeader, showInSidebar };
    },
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
  // The same event carries renames, which move no icon but do move the names
  // clients recognize a drawn row by.
  bb.background.service("icon-cleanup", {
    async start(signal) {
      void pruneSections();
      void ensureProjects();
      const unsubscribe = bb.sdk.subscribe({
        event: "project:changed",
        callback(event) {
          const orphaned =
            !!event.id &&
            event.changes.includes("project-deleted") &&
            store.clear({ kind: "project", id: event.id });
          // Both endings are the same refetch, so they are announced once
          // rather than twice for a deletion.
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
}
