# End-to-end suites

Run the suites against an isolated bb server and host daemon:

```sh
npm run test:e2e
npm run test:e2e -- --list
npm run test:e2e -- --case thread-titles:once
npm run test:e2e -- --group placement
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

CI runs two groups on separate runners, each with its own isolated server, host
daemon, data directory, and full seeded fixture. Every group installs the same
union of plugins and runs the same preparation hooks as the full run, preserving
plugin coexistence. Suites still run sequentially in their original order inside
each group. Without `--group`, the runner retains the full sequential run.

The `placement` group contains the original sequence through `drag-regressions`,
which restores fixture stages and archives its temporary children. The `sidebar`
group contains the rest. Its grouping, child-collapse, child-stage, and later
layout suites stay together because they leave child threads and list state for
later suites. The groups need no state from one another; suite assertions read
the current order or establish the state they test. Both groups must pass before
the required `plugins` gate passes, and one group's failure does not cancel the
other group's coverage or diagnostics.

New suites default to `sidebar`. Set `group: "placement"` in a descriptor when
it belongs with that sequence. Keep suites that depend on each other's state in
the same group, and verify a group's full sequence from a fresh fixture after
changing membership. `--list --group <name>` lists its cases without starting bb;
invalid groups and selections with no cases fail before setup.

The runner prints elapsed times for stack startup, plugin installation, suite
preparation, fixture seeding, each suite (including failures), and shutdown.
Group data and server logs live under `.scratch/e2e/<group>/`; the full run uses
`.scratch/e2e/all/`. Failure traces remain under `.scratch/e2e/`, and CI uploads
separate diagnostic artifacts for each group.
