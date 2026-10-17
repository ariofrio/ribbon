# Thread stages scrolling and scalability

[PR #199](https://github.com/ariofrio/ribbon/pull/199) keeps viewport virtualization
and fills visible windows synchronously before paint. Full mounting removes
placeholder blanks, but makes memory and ordinary updates grow with every row.
The bounded renderer preserves that memory advantage while eliminating observed
blank frames. Its remaining performance limits are described below.

## Renderer

[SidebarWindowedItems](../../plugins/bb-plugin-thread-stages/src/app/list/SidebarWindowedItems.tsx)
uses measured heights, compressed spacers, and reusable row cells. Movement
inside its existing buffer keeps the same bindings; crossing an edge refills
it in physical DOM order. Links, keyboard navigation, and full row controls
remain in logical document order.

The buffer targets 24 weighted rows or the visible item count plus four spare
cells, whichever is larger. A cached parent counts its estimated descendants.
Required visible content always renders. Selected, renamed, focused, pressed,
menu-owning, and busy rows can retain additional cells with their original
identity; those pins do not consume the viewport's spare buffer. Each nested
window has its own budget, so this is not a global 24-element cap.

Tiny child lists representing at most eight rows retain their recycled cells
but use intrinsic layout inside their bounded parent. Independent groups keep
normal windowing. This avoids multiplying geometry reads and observers at
every tree depth without mounting every small group in a large sidebar.

[sidebarScrollUpdates](../../plugins/bb-plugin-thread-stages/src/app/list/sidebarScrollUpdates.ts)
batches nested window updates before paint and refreshes them after ancestor
geometry changes. Leaf sizes come from ResizeObserver; unknown composite
heights are checked synchronously. Draft presence and Ribbon settings use
shared stores. Split behavior attaches on first input. Expanded previews remain
windowed, owner-specific preview/action state resets on rebinding, and folding
freezes the existing window.

## Matched measurements

The [46 observations](data/thread-stages-scrolling.csv) use Apple M1, 16 GiB RAM,
macOS arm64, Node 22.23.3, BB 0.46.0, SDK 0.6.37, and repository-pinned
Playwright 1.62.1/Chromium, at 1280×900. Each renderer/size/CPU setting has two
runs in a fresh browser. The environment includes BB's default bundled plugins
and Thread stages, with no other optional Ribbon plugins.

All three variants use the same full row implementation from
[commit 3281361](https://github.com/ariofrio/ribbon/commit/3281361cdf97a214ad5703221c3957def690282a).
Only `SidebarWindowedItems.tsx` differs: **original** is the release-pinned
upstream virtualizer, **mounted** is the previous full-mount implementation,
and **pool** is this bounded renderer. Frontend SHA-256 hashes accompany every
CSV observation. Complete raw JSONL, source hashes, environment metadata, and
apparatus are archived in this BB thread's
`reports/sidebar-scalability/current` directory.

The workload includes repeated wheel input, eight distant jumps, complete
native traversals in both directions, and a selected-thread rename. Heap is
retained whole-client JavaScript heap after GC; RSS sums the owned browser's
renderer processes. Neither is plugin-only memory. Host load can vary, so these
are observed ranges rather than universal hardware thresholds.

| Added rows | Original heap | Fully mounted heap | Pool heap | Pool wrappers after traversal |
| ---: | ---: | ---: | ---: | ---: |
| 24 | 35.5–35.8 MiB | 35.5 MiB | 35.8 MiB | 29 |
| 40 | 36.6–37.0 MiB | 37.3–37.4 MiB | 37.9–38.0 MiB | 34 |
| 100 | 37.9 MiB | 43.8–43.9 MiB | 38.3–38.4 MiB | 34 |
| 600 | 39.9–40.0 MiB | 96.8–97.6 MiB | 39.9–40.0 MiB | 34 |
| 2,400 | 46.8–47.1 MiB | 296.5 MiB | 45.1–46.3 MiB | 34 |
| 9,600 | 67.9–68.9 MiB | Not attempted | 65.0–65.8 MiB | 34 |

At 2,400 rows, fully mounted renderer RSS was **733.7–734.0 MiB**, versus
**314.5–314.8 MiB** for the pool. Startup renderer RSS peaked at 732–769 MiB
fully mounted. No deliberate OOM or fully mounted 9,600-row run was attempted.

## Crossover points and costs

- **Small lists:** at 24–40 rows, the pool has a small fixed overhead and can
  scroll more slowly than full mounting. At 40 rows, its heap is about
  0.5–0.7 MiB higher than mounted, and maximum gaps are 53–59 ms versus
  37–42 ms. Full mounting's memory penalty appears between **40 and 100 added
  rows** in this fixture. Viewport size, grouping, and row content move that
  crossover; it is not a universal item-count threshold.
- **Ordinary updates:** mounted rename tasks take **183–186 ms at 600 rows**
  and **658–664 ms at 2,400**. The first tested mounted size over 200 ms is
  2,400, a measured bracket of **600–2,400**. The pool reports no task of
  50 ms or longer for either rename.
- **Scrolling tradeoff:** mounted scrolling remains cheap while memory fits.
  At 600 rows, maximum gaps are 35–40 ms mounted and 44–51 ms pooled;
  at 2,400 they are 54 ms mounted and 50–64 ms pooled. The pool combines
  bounded DOM and zero observed blanks, rather than winning every small-list
  scrolling measurement.
- **Large fixed datasets:** at 9,600 rows, the pool records 45–52 ms maximum
  gaps and 65–72 ms rename tasks at native CPU speed. The original records
  100–126 ms maximum gaps and 112/121 blank frames; the pool records zero.

A zero Long Tasks API value means **no reported task reached 50 ms**, not zero
CPU work. Frame gaps and long tasks are separate measurements.

## Artificial CPU slowdown

These matched runs use 4× CPU slowdown with the same environment and input.
Every pooled run records zero blank frames.

| Added rows | Original blank frames | Pool maximum gap | Pool longest task | Pool rename task |
| ---: | ---: | ---: | ---: | ---: |
| 600 | 125 / 128 | 86–93 ms | 96–101 ms | <50 ms |
| 2,400 | 128 / 126 | 115–116 ms | 94–131 ms | 91–97 ms |
| 9,600 | 155 / 193 | 107–148 ms | 105–121 ms | 195–203 ms |

The 9,600-row model update approaches/exceeds 200 ms under slowdown: its frame
gaps are 205–212 ms. Original rename tasks are 228–257 ms. Thread data and
whole-list model updates still scale with dataset size.

## All-plugin integration and remaining limits

The separate all-Ribbon-plugin suite exercises flat/nested 600-row lists,
a 1,200-pixel-tall viewport, native scrollbar dragging, and 9,600-row main and
Completed lists. Its memory values include those extra plugins and should not
be compared directly with the matched table above.

On M1, the four native-speed 600-row cases record zero blanks and maximum gaps
below 64 ms. Recycled controls retain their original target through drag
cancellation, an open menu scrolled away, rename, and navigation. All six sticky
surface cases pass with 30 additional siblings, including dark/light hover,
selection, and unselected parent containment.

The existing **200 ms budget at artificial 4× CPU still fails on
[Linux CI](https://github.com/ariofrio/ribbon/actions/runs/38995175893)**: 600-row
cases reach 516–1,000 ms frame gaps and up to 1,001 ms tasks, with zero blanks.
Its native-speed 9,600-row cases pass at 133/167 ms maximum gaps. This is a real
remaining stress limit; the PR remains draft while the readiness target is resolved. The editor-test focus condition is now
explicit and the full feature suite passes locally; CI confirmation is pending.
No assertions have been relaxed.

Mounted row DOM and behavior are bounded with list length; data, navigation,
height metadata, and client caches are not constant-size. These fixed-dataset
runs do not establish constant heap under unbounded thread creation/deletion.
The existing [listAllThreads guard](../../plugins/bb-plugin-thread-stages/src/ribbon/workflow/list-all-threads.ts)
accepts 10,099 entries and rejects 10,100 per enumeration. An earlier 24,000-row
attempt failed before rendering with `Thread list exceeds 10000 entries.`
That boundary is unchanged and is not a measured renderer crash limit.

## Regression checks

Use the repository's required Node version and pinned BB CLI:

```sh
npm run release:check --workspace plugins/bb-plugin-thread-stages
npm test
npm run test:e2e -- --group sidebar
npm run test:e2e -- --group features
```

Scrolling probes run every animation frame and after paint at the same scroll
offset, including spacers. Native-speed and 4× cases retain the existing 200 ms
assertions. Large cases also enforce heap below 160 MiB, traversal growth below
32 MiB, fewer than 200 wrappers, keyboard preview focus, bounded model updates,
and bounded folding. Unit tests cover geometry corrections, batched nested
updates, pointer/focus/menu retention, owner resets, stopped pointer events,
subtree-weighted buffering, and tall-viewport spare cells.

<sub>Written by Codex</sub>
