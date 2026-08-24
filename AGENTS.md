# Ribbon Instructions

## Naming

- Write plugin names in sentence case: capitalize only the first word and any proper nouns (e.g. "Missing keyboard shortcuts"). This applies everywhere the name appears, including the `bb.name` field in `package.json`, README headings, and links.

## Layout

- Keep every TypeScript source under the plugin's `src/`, including the `bb.server` and `bb.app` entries, generated data, and co-located `*.test.ts`. Point `bb.server` at `./src/server.ts` and set the tsconfig `@/*` alias to `./src/*`; bb's own scaffold puts these in the plugin root, and the manifest resolves plugin-relative paths either way.
- Everything vendored from bb lives under `src/vendor/`, which `scripts/vendor-ui.mjs` owns outright. Nothing of the plugin's own belongs in there, and every import says `@/vendor/` so a reader can tell whose code it is from the path.
- Leave only packaging and tooling configuration in the plugin root, where npm and each tool require it: `package.json`, `package-lock.json`, `tsconfig.json`, `README.md`, `CHANGELOG.md`, and `LICENSE`, plus `vitest.config.ts` when used. `assets/`, `skills/`, `themes/`, and build-time `scripts/` stay alongside `src/`.
- Ship sources without their tests by ending `files` with `"src", "!src/**/*.test.ts", "!src/**/*.test.tsx"`, and keep README screenshots out of the package by following `"assets"` with `"!assets/screenshot*.png", "!assets/card*.png"`.
- The repository's own `assets/icons/` is generated from each plugin's icon by `npm run build:heading-icons`; never edit those by hand, and `npm run check:heading-icons` reports them stale.
- A `scripts/` helper that imports plugin code reaches into `src/`, and anything it generates belongs in `src/` too.

## UI components

- Prefer the matching component from bb's release-pinned `@bb` shadcn registry over composing the control directly from Radix or recreating bb's chrome. Use primitives or a bespoke component only when the registry component cannot support the required interaction, and preserve the native motion, focus, responsive, and portal behavior in that exception.
- Never edit a vendored component: the next re-vendor reverts it, and until then the plugin drifts from every other surface. `npm run check:ui` fails on any hand-edit, in CI and in a pre-commit hook.
- Layer plugin behavior by composing around a component instead. bb exports seams for this and its own app composes with them, so read how `apps/app/src/components/` solves the same problem first, and grep the vendored copies for what is available. A `className` from an outer component wins through `cn`, which covers most styling gaps.
- A plugin that imports anything under `@/vendor/` from a test needs a `vitest.config.ts` mapping `@` to its `src/`; `tsc` reads the tsconfig path and vitest does not.
- Add or drop a component by editing the item list in `vendor-ui.json` and running `npm run build:ui`, never `npx shadcn add`.

## Workflow

- After every atomic plugin change that you are confident works correctly, install or reload it in bb as applicable, verify it with the relevant tests and checks, then commit and push it before moving on.
- Merge a pull request with squash, and let GitHub write the commit message. `gh pr merge --squash` wants no `--subject` and no `--body`; passing either overrides a deliberate setting. Title the pull request the way the commit should read, and put the reasoning in its body — a commit body written locally does not survive the merge.

## Screenshots

- Every plugin screenshot comes from `npm run screenshots`. Never edit or replace the files it writes by hand; change `scripts/screenshots/shots.mjs` and recapture.
- `--only` is for looking, not for committing. Every shot runs against one seeded bb and the run changes it along the way, so a shot taken on its own starts from a state a full run never gives it. A file that is going to be committed comes from a full run.
- Two runs must write the same files byte for byte, on one machine and on two machines running the same container. That is the bar a change to the harness has to keep.
- Keep whatever the capturing machine brings with it out of frame, and wait for whatever the app resolves late rather than racing it.
- Nothing records what a shot was captured from, and nothing should: two runs write the same bytes, so git already reports whether a screenshot changed.
- The pinned container is the authoritative renderer, and its Chromium comes from the `playwright` version in `package-lock.json`. Capture locally to look sooner, but expect CI's bytes to be the ones that land.
- CI recaptures on the pull request and never on main, which the Protect main ruleset only lets a pull request write to. Main has to arrive current, which is why the Screenshots check is required and strict.
- Adding an input that can change a screenshot means adding it to `affects.mjs`, which decides whether a pull request captures at all. It cannot become the workflow's `paths:` filter, because a skipped workflow never reports its check and the pull request requiring it could never merge.

## Testing

- For bb UI tests and experiments, never drive the user's active bb client. Instead, for client-only state, use an agent-owned web or desktop client connected to the existing bb server. When the test can modify server or host-daemon state, start an isolated client with its own server and host daemon.
- Check a UI change by its rendered effect — `getComputedStyle`, real pointer and keyboard events — never by class names or DOM attributes. Markup that reads correctly still renders nothing when a plugin class falls outside the `@scope` root bb compiles its stylesheet into, and a dispatched `click()` passes where a real one is swallowed.
- Wait for a condition, never for a duration. A sleep is a guess about a machine, and the machine that captures is the one that is busy. What a `waitForTimeout` was standing in for can always be named — an animation's own `finished`, focus reaching a composer, a node arriving — and naming it is the fix.
- Wait for what a plugin drew, inside the container only that plugin installs. A label, role, or name bb also uses somewhere else is answered by bb's own control, and the wait returns before the plugin has drawn anything. Ask of any wait whether something other than the thing being waited for can satisfy it; if so, it can fail by succeeding, and no timeout will tell you. Spend slack on the timeout and never on weakening the assertion.
- A difference percentage between two captures says whether they differ, never how. Align before measuring: solve for the whole-pixel offset that minimises the difference, then measure the residual there. A residual that collapses means the picture moved. A residual that will not fall, with shifting either way making it worse, means nothing moved and the pixels were drawn differently — which separates a font laying text out differently from one merely rasterising it differently.
