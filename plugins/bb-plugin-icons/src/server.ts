import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import catalogMetadata from "./icon-catalog.json";
import { CATALOG_ICONS } from "./icon-catalog.generated";
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
  /**
   * The section a thread is filed under, for the header's fallback icon.
   *
   * bb keeps a section on the root thread, so a child reports its root's. It
   * comes from bb because a header can mount before the sidebar hydrates.
   */
  sectionForThread: {
    input: z.object({ threadId: z.string().min(1) }).strict(),
    output: z.object({ sectionId: z.string().nullable() }).strict(),
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

  const view = () => ({
    icons: store.list().map((icon) => ({ ...icon, glyph: glyphOf(icon.icon) })),
    defaults: {
      project: glyphOf(DEFAULT_PROJECT_ICON),
      personal: glyphOf(PERSONAL_PROJECT_ICON),
      section: SECTION_GLYPH,
    },
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

  /**
   * The glyphs an owner already draws when nobody has picked for it.
   *
   * They are left out of the picker. Choosing one stores a row that looks like
   * having chosen nothing, and a project's row outranks its section's icon on
   * every thread in it, so the pick changes the sidebar while appearing not to.
   * A section's default is composed below rather than taken from the catalog,
   * so only these two need dropping.
   */
  const defaultGlyphNames = new Set([
    DEFAULT_PROJECT_ICON,
    PERSONAL_PROJECT_ICON,
  ]);

  const catalog = {
    icons: (catalogMetadata as Array<{
      name: string;
      category: string;
      tags: string[];
    }>).flatMap((entry) => {
      const glyph = CATALOG_ICONS[entry.name];
      return glyph === undefined || defaultGlyphNames.has(entry.name)
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
    listIcons: () => view(),
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
    async sectionForThread({ threadId }) {
      const read = (id: string) =>
        bb.sdk.threads.get({ threadId: id }).catch(() => null) as Promise<{
          parentThreadId?: string | null;
          sectionId?: string | null;
        } | null>;

      // Walks parents only. A fork carries a source rather than a parent and
      // sits at the root, so it is filed on its own, exactly as bb shows it.
      const seen = new Set<string>();
      let current = await read(threadId);
      while (current !== null) {
        if (typeof current.sectionId === "string") {
          return { sectionId: current.sectionId };
        }
        const parent = current.parentThreadId;
        if (typeof parent !== "string" || seen.has(parent)) break;
        seen.add(parent);
        current = await read(parent);
      }
      return { sectionId: null };
    },
  });

  // A deleted project's icon would otherwise linger forever; bb reports
  // deletions through project changes rather than a plugin lifecycle event.
  bb.background.service("icon-cleanup", {
    async start(signal) {
      void pruneSections();
      const unsubscribe = bb.sdk.subscribe({
        event: "project:changed",
        callback(event) {
          if (!event.id || !event.changes.includes("project-deleted")) return;
          if (store.clear({ kind: "project", id: event.id })) {
            bb.realtime.publish("icons-changed", {
              kind: "project",
              id: event.id,
            });
          }
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
