// The one state every screenshot is taken from: three projects, a handful of
// threads spread across the stages, and the icons and stage assignments the
// plugins add. Keeping every capture on this fixture is what makes shots of
// the same area comparable.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * One product in two repositories, which is the shape a section exists for:
 * a frontend and a backend whose threads belong together without belonging to
 * the same project.
 */
export const PROJECTS = [
  { name: "atlas-web", icon: "web-programming", color: "blue" },
  { name: "atlas-api", icon: "server-stack-01", color: "teal" },
];

/** The section both repositories' threads are filed under. */
export const SECTION = { name: "Atlas", icon: "globe", color: "purple" };

/** bb's own project for threads that belong to no repository. */
export const PERSONAL_PROJECT_ID = "proj_personal";

// Stage names match the Thread stages plugin's CLI vocabulary. The spread —
// two deferred, one each idle, active and blocked, five completed — fills every
// stage while keeping the collapsed ones worth collapsing.
export const THREADS = [
  {
    project: "atlas-web",
    title: "Polish analytics dashboard",
    // The thread the shots open, in the stage a thread sits in most of the
    // time: bb returns a thread to Idle the moment its turn ends.
    stage: "Idle",
    prompt:
      "Polish the analytics dashboard. Improve the metric cards, add keyboard navigation, and verify the loading state.",
    reply:
      "Dashboard polish is in place.\n\n- Refined metric formatting and loading states\n- Added keyboard-focus coverage\n- Verified all 18 dashboard tests pass",
  },
  {
    project: "atlas-api",
    title: "Investigate webhook retries",
    // Its turn never ends, which is how the fixture keeps one thread running
    // and one stage occupied by a thread bb placed there itself.
    stage: null,
    hang: true,
    prompt: "Investigate why webhook retries stall after the third attempt.",
    reply:
      "Reproducing the stalled retry against the events fixture, then tracing the backoff timer.",
  },
  {
    // Not every thread belongs to a repository. This one is bb's personal
    // project, filed under the section anyway: work on the product that is not
    // work on either side of it.
    project: null,
    title: "Compare managed Postgres plans",
    stage: "Blocked",
    prompt: "Compare managed Postgres plans for a small production app.",
    reply:
      "For this size, the shared tiers on Neon and Supabase both cover it, and Neon's branching is the one that pays off during migrations.",
  },
  {
    project: "atlas-web",
    title: "Replace the legacy filter drawer",
    stage: "Deferred",
    prompt: "Replace the legacy filter drawer with the new panel.",
    reply: "Sketched the swap; it waits on the panel's focus behaviour landing first.",
  },
  {
    project: "atlas-api",
    title: "Migrate export jobs to the new queue",
    stage: "Deferred",
    prompt: "Migrate the export jobs to the new queue.",
    reply: "Mapped the job payloads; the cutover needs a maintenance window.",
  },
  {
    project: "atlas-web",
    title: "Add keyboard navigation to filters",
    stage: "Completed",
    prompt: "Add keyboard navigation to the filter controls.",
    reply: "Arrow keys move between filters and Escape closes the open one.",
  },
  {
    project: "atlas-web",
    title: "Fix chart legends on locale switch",
    stage: "Completed",
    prompt: "Fix the chart legends when the locale changes.",
    reply: "Legends re-render on locale change, and the number formats follow it.",
  },
  {
    project: "atlas-web",
    title: "Ship the empty-state illustration",
    stage: "Completed",
    prompt: "Ship the empty-state illustration for reports.",
    reply: "The empty report view now carries the illustration and a single call to action.",
  },
  {
    project: "atlas-api",
    title: "Make webhook delivery idempotent",
    stage: "Completed",
    prompt: "Make webhook delivery idempotent per event id.",
    reply: "Deliveries are now idempotent per event id, and replays are safe.",
  },
  {
    project: "atlas-api",
    title: "Retire the v1 pricing endpoint",
    stage: "Completed",
    prompt: "Retire the v1 pricing endpoint.",
    reply: "v1 is gone and its callers are on v2; the redirect stays for one release.",
  },
];

/** Asked in the side chat the keyboard-shortcut screenshot opens. */
/**
 * The thread every shot is framed around. Named here, beside the threads
 * themselves, so the fixture and the shots cannot disagree about which one it
 * is — the fixture has to know in order to leave it read.
 */
export const FEATURED_THREAD = "Polish analytics dashboard";

/** The project that thread runs in, which the shots name their locators after. */
export const FEATURED_PROJECT = THREADS.find(
  (thread) => thread.title === FEATURED_THREAD,
).project;

export const SIDE_CHAT_QUESTION = "What did the dashboard pass end up covering?";

/** Every thread answers from its own entry, plus the side chat a shot opens. */
export const TRANSCRIPTS = [
  ...THREADS.map(({ prompt, reply, hang }) => ({
    prompt,
    ...(hang ? { hang } : {}),
    updates: [chunk(reply)],
  })),
  {
    prompt: SIDE_CHAT_QUESTION,
    updates: [
      chunk(
        "The metric cards, the focus order, and the loading states. Eighteen dashboard tests cover them.",
      ),
    ],
  },
  { prompt: "*", updates: [chunk("Done.")] },
];

function chunk(text) {
  return {
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text },
  };
}

/** The scripted agent stands in for a real one; see agent.mjs. */
export const AGENT = {
  id: "screenshots",
  displayName: "bb",
  modelId: "fixture",
  modelName: "Demo",
};

export function writeManagedConfig({ dataDir, harnessDir }) {
  const transcriptsPath = join(dataDir, "transcripts.json");
  writeFileSync(transcriptsPath, JSON.stringify(TRANSCRIPTS, null, 2));
  writeFileSync(
    join(dataDir, "config.json"),
    `${JSON.stringify(
      {
        customAcpAgents: [
          {
            id: AGENT.id,
            displayName: AGENT.displayName,
            command: process.execPath,
            args: [join(harnessDir, "agent.mjs")],
            env: {
              BB_SCREENSHOT_TRANSCRIPTS: transcriptsPath,
              BB_SCREENSHOT_MODEL_ID: AGENT.modelId,
              BB_SCREENSHOT_MODEL_NAME: AGENT.modelName,
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

export function seed({ stack, workspaceRoot, bb, assignStages = true }) {
  const run = (args) =>
    execFileSync(bb, [...args], { env: stack.env, encoding: "utf8" });
  const runJson = (args) => JSON.parse(run([...args, "--json"]));

  run(["settings", "reload"]);

  // Each run rebuilds the workspaces so a repeat run commits the same history.
  rmSync(workspaceRoot, { recursive: true, force: true });

  const projects = new Map();
  for (const project of PROJECTS) {
    const root = join(workspaceRoot, project.name.toLowerCase().replace(/ /gu, "-"));
    mkdirSync(root, { recursive: true });
    execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: root });
    writeFileSync(join(root, "README.md"), `# ${project.name}\n`);
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "--quiet", "-m", "Initial commit"], {
      cwd: root,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "bb",
        GIT_AUTHOR_EMAIL: "bb@example.com",
        GIT_COMMITTER_NAME: "bb",
        GIT_COMMITTER_EMAIL: "bb@example.com",
      },
    });
    const created = runJson([
      "project",
      "create",
      "--name",
      project.name,
      "--root",
      root,
      "--machine",
      "screenshots",
    ]);
    projects.set(project.name, { ...created, root, spec: project });
  }

  const section = runJson(["thread", "section", "create", SECTION.name]);

  const threads = new Map();
  const spawn = (spec, project) => {
    const created = runJson([
      "thread",
      "spawn",
      "--project",
      // A personal thread has no repository to run in; bb provisions its
      // workspace itself, so it names neither a machine nor an environment.
      project?.id ?? PERSONAL_PROJECT_ID,
      ...(project
        ? ["--machine", "screenshots", "--environment", project.root]
        : []),
      "--provider",
      `acp-${AGENT.id}`,
      "--model",
      AGENT.modelId,
      "--title",
      spec.title,
      // The scripted agent declares no approval surface, so bb allows only the
      // two modes that never ask.
      "--permission-mode",
      "accept-edits",
      "--prompt",
      spec.prompt,
    ]);
    threads.set(spec.title, created);
    return created;
  };

  for (const spec of THREADS) spawn(spec, projects.get(spec.project));

  // Every thread belongs to the product, whichever repository it runs in, and
  // the one that runs in none belongs to it too.
  for (const spec of THREADS) {
    run(["thread", "update", threads.get(spec.title).id, "--section", section.id]);
  }

  // Thread stages moves a thread itself while its turn runs, so hand-set
  // stages only stick once every answered thread has settled.
  for (const spec of THREADS) {
    if (spec.stage === null) continue;
    run(["thread", "wait", threads.get(spec.title).id, "--status", "idle"]);
  }
  if (assignStages) {
    for (const spec of THREADS) {
      if (spec.stage === null) continue;
      run(["thread-stages", "update", threads.get(spec.title).id, "--stage", spec.stage]);
    }
  }

  // Only an opened thread paints the "NEW" divider and then clears it moments
  // later, mid-capture on a slow machine, and only this one is ever opened. The
  // rest are left alone: their unread state cannot change while a shot is being
  // taken, and the sidebar keeps the unread mark a busy bb actually carries.
  run(["thread", "read", threads.get(FEATURED_THREAD).id]);

  return { projects, section, threads, run, runJson };
}

export async function applyPluginState({ stack, projects, section }) {
  const owners = [
    ...[...projects].map(([name, project]) => [
      name,
      { kind: "project", id: project.id, ...project.spec },
    ]),
    ["the section", { kind: "section", id: section.id, ...SECTION }],
  ];
  for (const [name, owner] of owners) {
    const { kind, id, icon, color } = owner;
    const response = await fetch(
      new URL(
        `/api/v1/plugins/icons/rpc/setIcon`,
        stack.serverUrl,
      ),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, id, icon, color }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Could not set the ${name} icon: ${response.status} ${await response.text()}`,
      );
    }
  }
}
