import {
  PluginCliError,
  cliCommand,
  defineCli,
  defineRpcContract,
  type BbPluginApi,
} from "@get-bb/plugin-sdk";
import { z } from "zod";

/** bb keeps project-less threads in the personal project, under a reserved id. */
export const PERSONAL_PROJECT_ID = "proj_personal";

const DEFAULTS_KEY = "defaults";

const defaultSchema = z
  .object({ projectId: z.string(), sectionId: z.string() })
  .strict();
const namedSchema = z.object({ id: z.string(), name: z.string() }).strict();
const defaultsSchema = z.object({ defaults: z.array(defaultSchema) }).strict();

export type DefaultSection = z.infer<typeof defaultSchema>;

/**
 * Versioned, because another plugin's sidebar calls these over HTTP and may
 * be a release behind or ahead of this one.
 */
export const defaultSectionsRpcContract = defineRpcContract({
  listDefaultsV1: { input: z.null(), output: defaultsSchema },
  setDefaultV1: {
    input: z
      .object({
        projectId: z.string().min(1),
        sectionId: z.string().min(1).nullable(),
      })
      .strict(),
    output: defaultsSchema,
  },
  readSettings: {
    input: z.null(),
    output: z
      .object({
        defaults: z.array(defaultSchema),
        projects: z.array(namedSchema),
        sections: z.array(namedSchema),
      })
      .strict(),
  },
});

const storedSchema = z.record(z.string(), z.string());

class DefaultsError extends Error {}

export default async function plugin(bb: BbPluginApi) {
  const read = async (): Promise<Record<string, string>> => {
    const parsed = storedSchema.safeParse(await bb.storage.kv.get(DEFAULTS_KEY));
    return parsed.success ? parsed.data : {};
  };
  const write = async (defaults: Record<string, string>) => {
    await bb.storage.kv.set(DEFAULTS_KEY, defaults);
    bb.realtime.publish("defaults-changed", null);
  };
  const named = async () => {
    const [projects, sections] = await Promise.all([
      bb.sdk.projects.list({ includePersonal: true }),
      bb.sdk.threadSections.list(),
    ]);
    return {
      projects: projects
        .filter(({ id }) => id !== PERSONAL_PROJECT_ID)
        .map(({ id, name }) => ({ id, name })),
      sections: sections.map(({ id, name }) => ({ id, name })),
    };
  };

  /**
   * bb publishes nothing a plugin can hear when a project or section is
   * removed, so every read drops the defaults that point at one.
   */
  const live = async () => {
    const { projects, sections } = await named();
    const stored = await read();
    const projectIds = new Set(projects.map(({ id }) => id));
    const sectionIds = new Set(sections.map(({ id }) => id));
    const kept = Object.fromEntries(
      Object.entries(stored).filter(
        ([projectId, sectionId]) =>
          projectIds.has(projectId) && sectionIds.has(sectionId),
      ),
    );
    if (Object.keys(kept).length !== Object.keys(stored).length) {
      await write(kept);
    }
    return { defaults: kept, projects, sections };
  };

  const listOf = (defaults: Record<string, string>): DefaultSection[] =>
    Object.entries(defaults)
      .map(([projectId, sectionId]) => ({ projectId, sectionId }))
      .sort((a, b) => a.projectId.localeCompare(b.projectId));

  const setDefault = async (projectId: string, sectionId: string | null) => {
    if (projectId === PERSONAL_PROJECT_ID) {
      throw new DefaultsError(
        "The personal project has no default section: bb's Threads heading starts its threads in none.",
      );
    }
    const { defaults, projects, sections } = await live();
    if (!projects.some(({ id }) => id === projectId)) {
      throw new DefaultsError(`No project with the id "${projectId}".`);
    }
    if (sectionId !== null && !sections.some(({ id }) => id === sectionId)) {
      throw new DefaultsError(`No section with the id "${sectionId}".`);
    }
    const next = { ...defaults };
    if (sectionId === null) delete next[projectId];
    else next[projectId] = sectionId;
    await write(next);
    return next;
  };

  bb.rpc.register(defaultSectionsRpcContract, {
    async listDefaultsV1() {
      return { defaults: listOf((await live()).defaults) };
    },
    async setDefaultV1({ projectId, sectionId }) {
      return { defaults: listOf(await setDefault(projectId, sectionId)) };
    },
    async readSettings() {
      const { defaults, projects, sections } = await live();
      return { defaults: listOf(defaults), projects, sections };
    },
  });

  bb.events.on("thread.created", async ({ thread }) => {
    // A section chosen at creation wins; a child shows its root's section; a
    // fork belongs beside its source; hidden threads are plugins' workers.
    if (
      thread.parentThreadId !== null ||
      thread.sectionId !== null ||
      thread.originKind === "fork" ||
      thread.sourceThreadId !== null ||
      thread.visibility === "hidden" ||
      thread.projectId === PERSONAL_PROJECT_ID
    ) {
      return;
    }
    const sectionId = (await read())[thread.projectId];
    if (sectionId === undefined) return;
    // The event fires after the row exists, so a client may have placed the
    // thread since.
    const current = await bb.sdk.threads.get({ threadId: thread.id });
    if (current.parentThreadId !== null || current.sectionId !== null) return;
    try {
      await bb.sdk.threads.update({ threadId: thread.id, sectionId });
    } catch (error) {
      const sections = await bb.sdk.threadSections.list();
      if (sections.some(({ id }) => id === sectionId)) throw error;
      await live();
    }
  });

  const resolve = (
    kind: "project" | "section",
    items: ReadonlyArray<{ id: string; name: string }>,
    query: string,
  ) => {
    const byId = items.find(({ id }) => id === query);
    if (byId) return byId;
    const folded = query.toLocaleLowerCase();
    const byName = items.filter(
      ({ name }) => name.toLocaleLowerCase() === folded,
    );
    if (byName.length === 1) return byName[0]!;
    throw new PluginCliError(
      byName.length === 0
        ? `No ${kind} named or with the id "${query}".`
        : `${byName.length} ${kind}s are named "${query}".`,
      {
        code: `${kind}_not_found`,
        hint: `Use the ${kind}'s id, or one of: ${items.map(({ name }) => name).join(", ")}.`,
      },
    );
  };

  const run = async (action: () => Promise<string>) => {
    try {
      return { exitCode: 0, stdout: await action() };
    } catch (error) {
      if (error instanceof DefaultsError) {
        throw new PluginCliError(error.message, { code: "invalid_default" });
      }
      throw error;
    }
  };

  bb.cli.register(
    defineCli({
      name: bb.pluginId,
      summary: "Give each project a default section for its new threads",
      description:
        "A new root thread created without a section starts in its project's default section. Forks, child threads, and threads given a section when created are left alone. Projects and sections can be named by id or by name.",
      commands: {
        list: cliCommand({
          summary: "List every project's default section",
          options: {
            json: { type: "boolean", description: "Emit machine-readable JSON" },
          },
          async run(input) {
            const { defaults, projects, sections } = await live();
            const rows = projects.flatMap((project) => {
              const section = sections.find(
                ({ id }) => id === defaults[project.id],
              );
              return section
                ? [
                    {
                      projectId: project.id,
                      project: project.name,
                      sectionId: section.id,
                      section: section.name,
                    },
                  ]
                : [];
            });
            if (input.options.json) {
              return { exitCode: 0, stdout: JSON.stringify(rows) };
            }
            return {
              exitCode: 0,
              stdout:
                rows.length === 0
                  ? "No project has a default section."
                  : rows
                      .map(({ project, section }) => `${project}\t${section}`)
                      .join("\n"),
            };
          },
        }),
        set: cliCommand({
          summary: "Start a project's new threads in a section",
          positionals: [
            { name: "project", description: "Project name or id", required: true },
            { name: "section", description: "Section name or id", required: true },
          ],
          async run(input) {
            return run(async () => {
              const { projects, sections } = await named();
              const project = resolve("project", projects, input.positionals.project);
              const section = resolve("section", sections, input.positionals.section);
              await setDefault(project.id, section.id);
              return `${project.name} → ${section.name}`;
            });
          },
        }),
        clear: cliCommand({
          summary: "Start a project's new threads in no section",
          positionals: [
            { name: "project", description: "Project name or id", required: true },
          ],
          async run(input) {
            return run(async () => {
              const { projects } = await named();
              const project = resolve("project", projects, input.positionals.project);
              await setDefault(project.id, null);
              return `${project.name} → Threads`;
            });
          },
        }),
      },
    }),
  );
}
