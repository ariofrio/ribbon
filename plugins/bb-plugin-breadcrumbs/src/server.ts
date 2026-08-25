import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const projectId = z.string().min(1);
const sectionId = z.string().min(1);
const ok = z.object({ ok: z.literal(true) }).strict();

export const CRUMBS = {
  showSection: {
    type: "boolean",
    label: "Show the section",
    description: "Put the thread's sidebar section before its project.",
    default: true,
  },
  showProject: {
    type: "boolean",
    label: "Show the project",
    description: "Put the thread's project before its title.",
    default: true,
  },
  showAncestors: {
    type: "boolean",
    label: "Show the parent and ancestor threads",
    description:
      "Put the thread's parent and every ancestor above it before its title.",
    default: false,
  },
} as const;

export const rpcContract = defineRpcContract({
  renameProject: {
    input: z.object({ projectId, name: z.string().trim().min(1) }).strict(),
    output: ok,
  },
  removeProject: {
    input: z.object({ projectId }).strict(),
    output: ok,
  },
  /**
   * bb serves no section list to the app, and publishes no event when one is
   * created, renamed, or removed, so the crumb reads names here and refetches
   * on its own.
   */
  listSections: {
    input: z.null(),
    output: z
      .object({
        sections: z.array(
          z.object({ id: z.string(), name: z.string() }).strict(),
        ),
      })
      .strict(),
  },
  /**
   * Everything the crumbs draw, for one thread, from bb's own records.
   *
   * The sidebar's live view would answer most of this, but it is the wrong
   * source: it hydrates in pieces, so a header can mount beside it while it
   * still reports no projects and no threads, and nothing corrects that for a
   * plugin — bb publishes no section event, and a plugin cannot subscribe to
   * bb's own entity events from the app. One call, one settled answer.
   */
  trailForThread: {
    input: z.object({ threadId: z.string().min(1) }).strict(),
    output: z
      .object({
        section: z.object({ id: z.string(), name: z.string() }).nullable(),
        project: z
          .object({
            id: z.string(),
            name: z.string(),
            isPersonal: z.boolean(),
          })
          .nullable(),
        ancestors: z.array(
          z.object({ id: z.string(), title: z.string() }).strict(),
        ),
      })
      .strict(),
  },
  renameSection: {
    input: z.object({ sectionId, name: z.string().trim().min(1) }).strict(),
    output: ok,
  },
  removeSection: {
    input: z.object({ sectionId }).strict(),
    output: ok,
  },
  /** Which crumbs to draw; the header slot could read these from useSettings, but one call keeps the crumb's own loading in step. */
  listCrumbs: {
    input: z.null(),
    output: z
      .object({
        showSection: z.boolean(),
        showProject: z.boolean(),
        showAncestors: z.boolean(),
      })
      .strict(),
  },
});

export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define(CRUMBS);

  bb.rpc.register(rpcContract, {
    async renameProject({ projectId, name }) {
      await bb.sdk.projects.update({ projectId, name });
      return { ok: true as const };
    },
    async removeProject({ projectId }) {
      await bb.sdk.projects.delete({ projectId });
      return { ok: true as const };
    },
    async listSections() {
      const sections = await bb.sdk.threadSections.list();
      return {
        sections: sections.map(({ id, name }) => ({ id, name })),
      };
    },
    async trailForThread({ threadId }) {
      const read = (id: string) =>
        bb.sdk.threads.get({ threadId: id }).catch(() => null) as Promise<{
          parentThreadId?: string | null;
          sectionId?: string | null;
          projectId?: string | null;
          title?: string | null;
          titleFallback?: string | null;
        } | null>;

      /**
       * Parents only, deliberately.
       *
       * bb records two ways a thread can come from another: a thread spawned
       * under one carries `parentThreadId`, and a fork carries
       * `sourceThreadId` with no parent at all. The SDK calls
       * `parentThreadId` "the thread this one was forked from or spawned
       * under", but a fork does not set it — so following it alone is what
       * gives ancestry without fork sources, which bb already shows elsewhere.
       *
       * Oldest first, excluding the thread itself. A parent bb cannot serve,
       * or a cycle, stops the walk rather than spinning the header.
       */
      const seen = new Set<string>([threadId]);
      const self = await read(threadId);
      const ancestors: Array<{ id: string; title: string }> = [];
      let current = self;
      /**
       * The nearest section walking up, the thread's own included, which is
       * the rule Icons and Thread stages apply to the icon beside this crumb.
       */
      let nearestSectionId =
        typeof self?.sectionId === "string" ? self.sectionId : null;
      while (current !== null && typeof current.parentThreadId === "string") {
        const id: string = current.parentThreadId;
        if (seen.has(id)) break;
        seen.add(id);
        current = await read(id);
        if (current === null) break;
        if (nearestSectionId === null && typeof current.sectionId === "string") {
          nearestSectionId = current.sectionId;
        }
        const named = current.title ?? current.titleFallback ?? "";
        ancestors.unshift({
          id,
          title: named.trim() === "" ? "Untitled" : named,
        });
      }

      const rootSectionId = nearestSectionId;
      const sections =
        rootSectionId === null
          ? []
          : await bb.sdk.threadSections.list().catch(() => []);
      const found = sections.find((section) => section.id === rootSectionId);

      const projectId = self?.projectId ?? null;
      const project =
        projectId === null
          ? null
          : await bb.sdk.projects.get({ projectId }).catch(() => null);

      return {
        section:
          rootSectionId === null || found === undefined
            ? null
            : { id: found.id, name: found.name },
        project:
          project === null
            ? null
            : {
                id: projectId as string,
                name: project.name,
                isPersonal: project.kind === "personal",
              },
        ancestors,
      };
    },
    async renameSection({ sectionId, name }) {
      await bb.sdk.threadSections.update({ id: sectionId, name });
      return { ok: true as const };
    },
    async removeSection({ sectionId }) {
      // bb moves the section's threads back to Unorganized itself.
      await bb.sdk.threadSections.delete({ id: sectionId });
      return { ok: true as const };
    },
    async listCrumbs() {
      const { showSection, showProject, showAncestors } = await settings.get();
      return { showSection, showProject, showAncestors };
    },
  });
}
