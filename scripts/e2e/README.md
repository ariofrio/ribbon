# End-to-end suites

Run the suites against an isolated bb server and host daemon:

```sh
npm run test:e2e
npm run test:e2e -- --list
npm run test:e2e -- --case thread-titles:once
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
