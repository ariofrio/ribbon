import assert from "node:assert/strict";
import { AGENT } from "../../screenshots/fixture.mjs";

async function until(check, label) {
  const deadline = Date.now() + 60_000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export async function verifyNewThreads({ fixture }) {
  const { run, runJson, section } = fixture;
  const project = fixture.projects.get("atlas-api");
  assert.ok(project, "The fixture is missing atlas-api");
  const spawn = (title, extra = []) => {
    const thread = runJson([
      "thread", "spawn", "--project", project.id,
      "--machine", "screenshots", "--environment", project.root,
      "--provider", `acp-${AGENT.id}`, "--model", AGENT.modelId,
      "--permission-mode", "accept-edits",
      "--title", title, "--prompt", title, ...extra,
    ]);
    run(["thread", "wait", thread.id, "--status", "idle"]);
    return thread;
  };
  const sectionOf = (thread) => runJson(["thread", "show", thread.id]).thread.sectionId;

  assert.equal(
    run(["default-sections", "set", project.name, section.id]).trim(),
    `${project.name} → ${section.name}`,
  );

  const root = spawn("Default sections: root");
  await until(() => sectionOf(root) === section.id, "the root to start in the default section");

  // A child shows its root's section, so the rule writes none for it.
  const child = spawn("Default sections: child", ["--parent-thread", root.id]);
  // The root above was filed by the same handler; once it ran, a skipped
  // child has had every chance to be filed and was not.
  const sibling = spawn("Default sections: second root");
  await until(() => sectionOf(sibling) === section.id, "the second root to start in the default section");
  assert.equal(sectionOf(child), null);

  run(["default-sections", "clear", project.id]);
  assert.equal(run(["default-sections", "list"]).trim(), "No project has a default section.");
  const after = spawn("Default sections: after clearing");
  const marker = spawn("Default sections: marker", ["--section", section.id]);
  assert.equal(sectionOf(marker), section.id);
  assert.equal(sectionOf(after), null);

  for (const thread of [after, marker, sibling, child, root]) {
    run(["thread", "archive", thread.id]);
  }
}
