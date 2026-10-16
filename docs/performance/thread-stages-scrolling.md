# Thread stages scrolling and scalability

[PR #199](https://github.com/ariofrio/ribbon/pull/199) restores bounded row
mounting while filling the visible window synchronously before paint. Keeping
all rows mounted hid the original empty placeholders, but made memory and
ordinary updates grow with every expanded row.

## Renderer

[SidebarWindowedItems](../../plugins/bb-plugin-thread-stages/src/app/list/SidebarWindowedItems.tsx)
uses measured heights, compressed spacers, a small overscan, and a recently
visible cache. Its 48-row budget includes the visible window and weights cached
parents by their estimated descendant count. Selection, renaming, and keyboard
focus can retain additional rows. The total is per window, not a global cap of
48 DOM elements; offscreen child windows release their caches.

[sidebarScrollUpdates](../../plugins/bb-plugin-thread-stages/src/app/list/sidebarScrollUpdates.ts)
updates nested windows in one synchronous React commit per scroll event and
reconciles them after ancestor geometry changes. This matters when a parent's
height correction moves a child window without resizing the child itself.
Offscreen shortcut destinations remain encoded on spacers.

Rows use their full existing presentation and controls. The host's split gesture
registration attaches on the original pointer/focus/context input; empty quick
action configurations subscribe to no action resolver. Folding freezes the
current window. Expanded Deferred and Completed previews use the same windowed
renderer as the main band.

## Matched measurements

Apple M1, 16 GiB RAM, macOS arm64, BB 0.46.0, SDK 0.6.37, repository-pinned
Playwright/Chromium, 1280×900 viewport. Two runs per cell. Each renderer uses
Ribbon's complete row presentation: “original” swaps in the upstream virtualizer;
“mounted” uses the previous PR implementation; “bounded” uses this change.

The workload includes repeated native wheel input, eight distant jumps, a full
traversal in both directions, and a selected-thread rename. Heap is the whole
client's retained JavaScript heap after GC and traversal, not plugin-only memory.
RSS is renderer-process memory. Raw observations and the apparatus are retained
in this BB thread's `reports/sidebar-scalability/final` artifact directory.

| Added rows | Original heap | Mounted heap | Bounded heap | Bounded mounted wrappers |
| ---: | ---: | ---: | ---: | ---: |
| 600 | 41.8–41.9 MiB | 112.7–133.8 MiB | 40.5–41.5 MiB | 49 |
| 2,400 | 48.0–48.2 MiB | 352.4–436.4 MiB | 47.2–47.3 MiB | 49 |
| 9,600 | 69.4–69.9 MiB | Not attempted | 65.8–65.8 MiB | 49 |

At 2,400 rows, mounted renderer RSS after traversal was 813–909 MiB versus
327–331 MiB bounded; startup peaks were 931–955 MiB versus 283–302 MiB.
The mounted selected-thread rename produced 746–797 ms main-thread tasks;
bounded had no reported task of 50 ms or longer. At 600 rows those mounted
rename tasks were already 209–218 ms. No deliberate out-of-memory test was run.

| Added rows, 4× CPU slowdown | Original blank frames, each run | Bounded blank frames | Bounded maximum frame gap | Bounded rename task |
| ---: | ---: | ---: | ---: | ---: |
| 600 | 126 / 120 | 0 / 0 | 175.0–190.1 ms | 61–65 ms |
| 2,400 | 145 / 142 | 0 / 0 | 165.7–175.1 ms | 112–114 ms |
| 9,600 | 176 / 190 | 0 / 0 | 176.6–200.5 ms | 204–208 ms |

Visibility is sampled every animation frame and again after paint when the scroll
offset has not changed. Spacers are included. A timer observing a *future* scroll
offset is counted separately; the next animation frame must still contain its
rows. Instrumentation adds work, especially to the original renderer's thousands
of placeholder elements. These are stress measurements, not a claim of constant
60 fps. At normal CPU, bounded maximum gaps ranged from 62–220 ms across the
matched sizes/runs; every run had zero blank frames.

The dedicated 9,600-row regression at 1280×800 recorded 84.6 ms maximum gap,
zero blanks, 69.4 MiB heap after traversal and 49 wrappers. Expanded Completed
recorded 89.1 ms, zero blanks, 68.7 MiB and 54 wrappers, including keyboard focus
retention. Their rename tasks were 74 and 85 ms. Folding peaked at 48 and 53
wrappers respectively, and retained the selected row exactly once.

The Mac entered maintenance sleep during the initial expanded-preview startup,
which invalidated that run with a plugin load timeout. The successful rerun used
`caffeinate -is` for the test process; no persistent power setting changed.

## Limits

Mounted row DOM and behavior now stay bounded with list length. Thread data,
height/navigation metadata, backend enumeration, and global client model updates
still grow with the dataset. The 9,600-row rename crosses 200 ms under 4× CPU
slowdown; this change does not make arbitrarily large model updates constant-time.

Ribbon's existing backend enumeration guard rejects sufficiently large datasets
before a renderer loads. A 24,000-thread experiment failed with
`Thread list exceeds 10000 entries.` The current 100-entry pagination loop accepts
10,099 entries and rejects 10,100 per enumeration, as confirmed against
[listAllThreads](../../plugins/bb-plugin-thread-stages/src/ribbon/workflow/list-all-threads.ts).
The startup enumerators use the same boundary. This guard is unchanged; results
at 9,600 added rows leave room for the fixture's existing threads.

## Regression checks

Run with the repository's required Node version:

```sh
npm run release:check --workspace plugins/bb-plugin-thread-stages
npm test
npm run test:e2e -- --group sidebar
npm run test:e2e -- --group placement
```

The sidebar scroll suite covers flat/nested 600-row lists at 4× CPU, real native
scrollbar dragging to both limits, and 9,600-row main/Completed lists at normal
CPU. Large cases enforce zero blanks, a 200 ms frame/task budget, retained heap
below 160 MiB, traversal growth below 32 MiB, fewer than 200 mounted wrappers,
keyboard expansion focus, bounded title-update tasks, and bounded folding. Unit regressions cover geometry
corrections, batched nested updates, focus, offscreen navigation, removal/reorder,
subtree-weighted caching, and first-input split registration.

<sub>Written by Codex</sub>
