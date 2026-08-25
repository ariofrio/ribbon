# Ribbon Instructions

A rule a check can enforce lives in the check, not here. Read the check when
you need the detail, and run it rather than reasoning about it:

| Check | Enforces |
| --- | --- |
| `npm run check:layout` — `scripts/plugin-layout.mjs` | sentence-case plugin names, entry points under `src/`, what may sit in a plugin root, the `files` exclusions for tests and screenshots, and the `@/` alias in both tsconfig and vitest |
| `npm run check:ui` — `scripts/vendor-ui.mjs` | every file under `src/vendor/` is bb's, verbatim, and explained by `vendor-ui.json` |
| `npm run check:heading-icons` — `scripts/heading-icons.mjs` | `assets/icons/` matches each plugin's own icon |
| `npm test` — `scripts/screenshots/trigger.test.mjs`, `scripts/workflows.test.mjs` | which paths make CI recapture, and that every CI job runs once and is required |

What follows is here because no check can decide it, or because it has to be
decided before the work starts.

## UI components

- Prefer the matching component from bb's release-pinned `@bb` shadcn registry over composing the control directly from Radix or recreating bb's chrome. Use primitives or a bespoke component only when the registry component cannot support the required interaction, and preserve the native motion, focus, responsive, and portal behavior in that exception.
- Layer plugin behavior by composing around a component rather than editing one. bb exports seams for this and its own app composes with them, so read how `apps/app/src/components/` solves the same problem first, and grep the vendored copies for what is available. A `className` from an outer component wins through `cn`, which covers most styling gaps.
- Add or drop a component by editing the item list in `vendor-ui.json` and running `npm run build:ui`, never `npx shadcn add`.
- A `scripts/` helper that imports plugin code reaches into `src/`, and anything it generates belongs in `src/` too.

## Workflow

- After every atomic plugin change that you are confident works correctly, install or reload it in bb as applicable, verify it with the relevant tests and checks, then commit and push it before moving on.
- Merge a pull request with squash, and let GitHub write the commit message. `gh pr merge --squash` wants no `--subject` and no `--body`; passing either overrides a deliberate setting. Title the pull request the way the commit should read, and put the reasoning in its body — a commit body written locally does not survive the merge.

## Screenshots

- CI owns screenshot recapture and its commits. For ordinary plugin changes, do not run `npm run screenshots` locally or commit generated images; the pull-request workflow runs the full suite and pushes the authoritative bytes, and main recaptures if a branch merged without them.
- Run screenshots locally only when the user explicitly asks to inspect a capture or when developing or debugging the screenshot harness. Treat the generated images as disposable and restore them before committing. Every local capture comes from `npm run screenshots`; never edit or replace its files by hand, and do not use `--only` because every shot shares one seeded bb whose state changes throughout a full run.
- Two runs must write the same files byte for byte, on one machine and on two machines running the same container.
- Keep whatever the capturing machine brings with it out of frame, and wait for whatever the app resolves late rather than racing it.
- Nothing records what a shot was captured from, and nothing should: two runs write the same bytes, so git already reports whether a screenshot changed.
- The pinned CI container is the authoritative renderer, and its Chromium comes from the `playwright` version in `package-lock.json`. A branch need not be up to date with main before it merges. CI's second recapture commit is pushed with a deploy key, because GitHub Actions cannot be a bypass actor on a repository a person owns.
- Adding an input that can change a screenshot means adding it to `affects.mjs`, which decides whether a pull request captures at all. It cannot become the workflow's `paths:` filter, because a skipped workflow never reports its check and the pull request requiring it could never merge.

## Testing

- For bb UI tests and experiments, never drive the user's active bb client. Instead, for client-only state, use an agent-owned web or desktop client connected to the existing bb server. When the test can modify server or host-daemon state, start an isolated client with its own server and host daemon.
- Check a UI change by its rendered effect — `getComputedStyle`, real pointer and keyboard events — never by class names or DOM attributes. Markup that reads correctly still renders nothing when a plugin class falls outside the `@scope` root bb compiles its stylesheet into, and a dispatched `click()` passes where a real one is swallowed.
- Wait for a condition, never for a duration. A sleep is a guess about a machine, and the machine that captures is the one that is busy. What a `waitForTimeout` was standing in for can always be named — an animation's own `finished`, focus reaching a composer, a node arriving — and naming it is the fix.
- Wait for what a plugin drew, inside the container only that plugin installs. A label, role, or name bb also uses somewhere else is answered by bb's own control, and the wait returns before the plugin has drawn anything. Ask of any wait whether something other than the thing being waited for can satisfy it; if so, it can fail by succeeding, and no timeout will tell you. Spend slack on the timeout and never on weakening the assertion.
- A difference percentage between two captures says whether they differ, never how. Align before measuring: solve for the whole-pixel offset that minimises the difference, then measure the residual there. A residual that collapses means the picture moved. A residual that will not fall, with shifting either way making it worse, means nothing moved and the pixels were drawn differently — which separates a font laying text out differently from one merely rasterising it differently.
