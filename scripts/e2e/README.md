# End-to-end suites

Run the suites against an isolated bb server and host daemon:

```sh
npm run test:e2e
npm run test:e2e -- --list
npm run test:e2e -- --case thread-titles:once
npm run test:e2e -- --group placement
npm run test:e2e -- --group ordering
npm run test:e2e -- --group sidebar
```

Add a file under `suites/` named `<name>.suite.mjs`. The runner discovers these
files automatically; adding a suite does not require changing `run.mjs`.

```js
import { verifyExample } from "../example.mjs";

export default {
  id: "example",
  cases: ["interaction"],
  plugins: ["bb-plugin-example"],
  run: verifyExample,
};
```

`run({ stack, fixture, cases })` receives the selected cases. An optional
`prepare({ bb, cliEnv, cases })` hook runs after plugins are installed and before
the shared fixture is seeded. The runner installs the union of selected suites'
plugins once.

Existing suites declare an `order` to preserve their execution sequence against
the shared fixture. New suites can omit it and run afterward in filename order.
Use an explicit order only when a suite requires it; ties use filename order.
Suite IDs and case names must be nonempty and contain no colon. Duplicate IDs,
duplicate cases, and malformed descriptors fail before bb starts.

CI runs three groups on separate runners, each with its own isolated server, host
daemon, data directory, and full seeded fixture. Every group installs the same
union of plugins and runs the same preparation hooks as the full run, preserving
plugin coexistence. Suites still run sequentially in their original order inside
each group. Without `--group`, the runner retains the full sequential run.

The groups divide the measured work while preserving each suite's original order:

- `placement`: composer and shortcut readiness, indicators, completed placement,
  and the full chronological/project stage-placement interaction matrix.
- `ordering`: thread titles, section/machine placement, sorting and reordering,
  plus self-contained PR, routing, title-color, shortcut, model-mention, and
  stage-preview suites. These suites establish the state they test or read the
  current order, so they need no mutations from the placement or sidebar groups.
- `sidebar`: the remaining suites, including the grouping, child-collapse,
  child-stage, and later layout sequence. These stay together because they leave
  child threads and list state for later suites.

Every group must pass before the required `plugins` gate passes. One group's
failure does not cancel another group's coverage or diagnostics.

New suites default to `sidebar`. Set `group: "placement"` or `group: "ordering"`
in a descriptor when it belongs with that sequence. Keep suites that depend on each other's state in
the same group, and verify a group's full sequence from a fresh fixture after
changing membership. `--list --group <name>` lists its cases without starting bb;
invalid groups and selections with no cases fail before setup.

The runner prints elapsed times for stack startup, plugin installation, suite
preparation, fixture seeding, each suite (including failures), and shutdown.
Group data and server logs live under `.scratch/e2e/<group>/`; the full run uses
`.scratch/e2e/all/`. Failure traces remain under `.scratch/e2e/`, and CI uploads
separate diagnostic artifacts for each group.

The platform-shortcut suite starts a fresh client for Linux, Windows, and Mac,
then reuses it for that platform's seven shortcuts. Each interaction resets its
owned thread to a different stage, navigates back through the rendered sidebar,
and waits for composer focus before checking that thread's stage-change RPC.
This avoids repeated application boots while keeping platform state isolated.
Persistence suites retain their reload and fresh-client checks.

The pinned CI container still installs `make` and `g++`: bb-app's bundled
`better-sqlite3` runs `node-gyp rebuild`, even though `node-pty` provides Linux
prebuilds. Both E2E and screenshot CI need this setup.
