/**
 * The standard section book, opening and shutting as a book does.
 *
 * The shut book is a cover over a block of pages whose bottom edge shows as a
 * strip; the open book is two pages spread about a spine. Opening, the cover
 * swings about its spine and lands as the left page, the page block beneath
 * it becomes the right page, and the spine slides from the cover's left edge
 * to the middle.
 *
 * Each leaf is one outline of cubic segments in both poses, measured from its
 * spine (u) and down the canvas (y), with the same number of segments in each
 * so a frame can blend them. Both poses are today's icons, cut up so their
 * parts line up, never redrawn: frame 0 is the shut icon and frame 1 the open
 * one.
 */

type Point = readonly [number, number];
/** A cubic from the previous segment's end: two controls and an end point. */
type Segment = readonly [Point, Point, Point];
interface Outline {
  start: Point;
  segments: readonly Segment[];
}

const line = (from: Point, to: Point): Segment => [
  [from[0] + (to[0] - from[0]) / 3, from[1] + (to[1] - from[1]) / 3],
  [from[0] + ((to[0] - from[0]) * 2) / 3, from[1] + ((to[1] - from[1]) * 2) / 3],
  to,
];

/** Splits a cubic in two at `t`, both parts tracing it exactly. */
function split(from: Point, [c1, c2, to]: Segment, t: number): [Segment, Segment] {
  const at = (a: Point, b: Point): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const a = at(from, c1);
  const b = at(c1, c2);
  const c = at(c2, to);
  const d = at(a, b);
  const e = at(b, c);
  const f = at(d, e);
  return [
    [a, d, f],
    [e, c, to],
  ];
}

const halve = (from: Point, segment: Segment) => split(from, segment, 0.5);

/** Splits a cubic whose height runs one way where it crosses `y`. */
function splitAtY(from: Point, segment: Segment, y: number): [Segment, Segment] {
  const rising = segment[2][1] > from[1];
  let low = 0;
  let high = 1;
  for (let step = 0; step < 50; step += 1) {
    const t = (low + high) / 2;
    const [[, , point]] = split(from, segment, t);
    if (point[1] < y === rising) low = t;
    else high = t;
  }
  return split(from, segment, (low + high) / 2);
}

/**
 * An outline from a start point and a list of parts, each a straight run to
 * a point or a cubic, halved as often as asked so the poses pair up.
 */
function outline(
  start: Point,
  parts: readonly (
    | { to: Point; halves?: number }
    | { curve: Segment; halves?: number }
  )[],
): Outline {
  const segments: Segment[] = [];
  let from = start;
  for (const part of parts) {
    let pieces: Segment[] = ["to" in part ? line(from, part.to) : part.curve];
    for (let times = part.halves ?? 0; times > 0; times -= 1) {
      let at = from;
      pieces = pieces.flatMap((piece) => {
        const halves = halve(at, piece);
        at = piece[2];
        return halves;
      });
    }
    segments.push(...pieces);
    from = segments.at(-1)![2];
  }
  return { start, segments };
}

// The shut book's spine is its cover's left edge, x 5.2; the open book's is
// the middle, x 12. Outlines below are in (u, y): u is the distance from the
// spine, away from it, on the leaf's own side.
const SHUT_SPINE = 5.2;
const OPEN_SPINE = 12;

/**
 * Every leaf, in either pose, runs: its top edge away from the spine, the far
 * top corner (2), the far edge, the far bottom corner (4), the bottom edge,
 * the drop to the spine's foot, the spine, and the corner back to the top (2).
 */

// The open book's pages, from book-open-01 remapped to y 3 to 21: the right
// page as drawn, the left page its mirror.
const OPEN_PAGE = outline([4, 3], [
  { to: [5.4, 3] },
  { curve: [[7.568, 3], [8.652, 3], [9.326, 3.697]] },
  { curve: [[10, 4.394], [10, 5.515], [10, 7.758]] },
  { to: [10, 13.241] },
  { curve: [[10, 15.485], [10, 16.606], [9.326, 17.303]], halves: 1 },
  { curve: [[8.653, 18], [7.568, 18], [5.4, 18]], halves: 1 },
  { to: [3.05, 18] },
  { curve: [[1.567, 18], [0.291, 19.256], [0, 21]] },
  { to: [0, 5.069] },
  { curve: [[0.944, 3.767], [2, 3], [4, 3]], halves: 1 },
]);

// The shut book's cover, from book-03 remapped: its bottom edge is the line
// above the strip, and its spine runs down to the strip's rounded end.
const SHUT_COVER = outline([5.1, 3], [
  { to: [10.2, 3] },
  { curve: [[11.803, 3], [12.604, 3], [13.102, 3.549]] },
  { curve: [[13.6, 4.098], [13.6, 4.982], [13.6, 6.75]] },
  { to: [13.6, 18] },
  { to: [13.6, 18], halves: 1 },
  { to: [13.6, 18], halves: 1 },
  { to: [1.7, 18] },
  { curve: [[0.761, 18], [0, 18.672], [0, 19.5]] },
  { to: [0, 8.625] },
  { curve: [[0, 5.973], [0, 4.648], [0.747, 3.824]] },
  { curve: [[1.494, 3], [2.696, 3], [5.1, 3]] },
]);

// The shut book's page block: hidden under the cover but for the strip along
// its bottom, whose far end curls in where the pages' edges show.
const SHUT_PAGES = outline([5.1, 3], [
  { to: [10.2, 3] },
  { curve: [[11.803, 3], [12.604, 3], [13.102, 3.549]] },
  { curve: [[13.6, 4.098], [13.6, 4.982], [13.6, 6.75]] },
  { to: [13.6, 18] },
  { to: [13.175, 18] },
  { curve: [[13.175, 18], [12.325, 18.572], [12.325, 19.5]] },
  { curve: [[12.325, 20.428], [13.175, 21], [13.175, 21]] },
  { to: [13.6, 21] },
  { to: [1.7, 21] },
  { curve: [[0.761, 21], [0, 20.328], [0, 19.5]] },
  { to: [0, 8.625] },
  { curve: [[0, 5.973], [0, 4.648], [0.747, 3.824]] },
  { curve: [[1.494, 3], [2.696, 3], [5.1, 3]] },
]);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const blend = (a: Outline, b: Outline, t: number): Outline => {
  if (a.segments.length !== b.segments.length) {
    throw new Error("Book leaves must pair segment for segment");
  }
  const point = (p: Point, q: Point): Point => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
  return {
    start: point(a.start, b.start),
    segments: a.segments.map(
      (segment, index) =>
        segment.map((p, k) => point(p, b.segments[index]![k]!)) as unknown as Segment,
    ),
  };
};

const round = (n: number) => String(Math.round(n * 1000) / 1000);

/** An outline as path data, placed on the canvas; closed unless `open`. */
function place(
  leaf: Outline,
  toCanvas: (p: Point) => Point = (p) => p,
  open = false,
): string {
  const at = (p: Point) => toCanvas(p).map(round).join(" ");
  return (
    `M${at(leaf.start)}` +
    leaf.segments.map((segment) => `C${segment.map(at).join(" ")}`).join("") +
    (open ? "" : "Z")
  );
}

export interface BookFrame {
  /** The cover, swinging about the spine; the left page once open. */
  cover: string;
  /** The page block; the right page once open. Hidden under the cover. */
  pages: string;
}

/**
 * The book at `open` from 0, shut, to 1, open. The cover turns half a circle
 * about the spine: its far edge sweeps across in a cosine, the way a turning
 * leaf looks from the front, and nears the eye a little as it stands up.
 */
export function bookFrame(open: number): BookFrame {
  const spine = lerp(SHUT_SPINE, OPEN_SPINE, open);
  const turn = Math.cos(Math.PI * open);
  const lift = 1 + 0.08 * Math.sin(Math.PI * open);
  const cover = blend(SHUT_COVER, OPEN_PAGE, open);
  const pages = blend(SHUT_PAGES, OPEN_PAGE, open);
  return {
    cover: place(cover, ([u, y]) => [spine + u * turn, 12 + (y - 12) * lift]),
    pages: place(pages, ([u, y]) => [spine + u, y]),
  };
}

/*
 * The standard project folder, opening and shutting as a folder does.
 *
 * Shut, folder-closed is a back panel with its tab, and a front panel lying
 * flat against it whose top edge crosses the folder at y 11. Open, folder-02
 * is the back panel standing, a little narrower, and the front panel fallen
 * forward, its top edge thrown to the right of its foot. Opening, the front
 * falls, and the back's sides grow down behind it to where it now shows them.
 *
 * As with the book, both poses are the icons themselves, cut to pair up.
 */

// folder-closed's sides, each one cubic from the tab's level down to its
// bottom corner, split where the front's top edge meets them.
const [SHUT_RIGHT_TOP, SHUT_RIGHT_BELOW] = splitAtY(
  [22, 12.25],
  [[22, 15.7612], [22, 17.5167], [21.1573, 18.7779]],
  13,
);
const [SHUT_LEFT_BELOW, SHUT_LEFT_TOP] = splitAtY(
  [3.46447, 19.5355],
  [[2, 18.0711], [2, 15.714], [2, 11]],
  13,
);

const SHUT_FRONT = outline([2, 13], [
  { curve: [[2.06427, 12.3499], [2.20951, 11.9124], [2.53777, 11.5858]] },
  { curve: [[3.12654, 11], [4.07416, 11], [5.9694, 11]] },
  { to: [18.0306, 11] },
  { curve: [[19.9258, 11], [20.8735, 11], [21.4622, 11.5858]] },
  { curve: [[21.7905, 11.9124], [21.9357, 12.3499], [22, 13]] },
  { curve: SHUT_RIGHT_BELOW, halves: 1 },
  { curve: [[20.7926, 19.3238], [20.3238, 19.7926], [19.7779, 20.1573]] },
  { curve: [[18.5167, 21], [16.7612, 21], [13.25, 21]] },
  { to: [12, 21] },
  { curve: [[7.28595, 21], [4.92893, 21], [3.46447, 19.5355]] },
  { curve: SHUT_LEFT_BELOW, halves: 1 },
]);

// folder-02's front, from the same corner round the same way.
const [OPEN_RIGHT_TOP, OPEN_RIGHT_BELOW] = split(
  [21.7422, 11.8787],
  [[22.3397, 12.7575], [21.8405, 14.0002], [20.842, 16.4856]],
  0.5,
);
const OPEN_FRONT = outline([3.45643, 14.7717], [
  { curve: [[4.19029, 12.9449], [4.55723, 12.0316], [5.3224, 11.5158]] },
  { curve: [[6.08757, 11], [7.07557, 11], [9.05157, 11]] },
  { to: [17.1119, 11] },
  { curve: [[19.8004, 11], [21.1446, 11], [21.7422, 11.8787]] },
  { curve: OPEN_RIGHT_TOP },
  { curve: OPEN_RIGHT_BELOW },
  { to: [20.5436, 17.2283] },
  { curve: [[19.8097, 19.0551], [19.4428, 19.9684], [18.6776, 20.4842]] },
  { curve: [[17.9124, 21], [16.9244, 21], [14.9484, 21]] },
  { to: [6.88812, 21] },
  { curve: [[4.19961, 21], [2.85535, 21], [2.25782, 20.1213]] },
  { curve: [[1.66029, 19.2425], [2.15953, 17.9998], [3.15802, 15.5144]] },
  { to: [3.45643, 14.7717] },
]);

// The back, from where the front hides its left side, over the tab, and down
// its right side to where the front hides it again.
const SHUT_BACK = outline([2, 13], [
  { curve: SHUT_LEFT_TOP },
  { to: [2, 7.94427] },
  { curve: [[2, 6.1278], [2, 5.21956], [2.38032, 4.53806]] },
  { curve: [[2.65142, 4.05227], [3.05227, 3.65142], [3.53806, 3.38032]] },
  { curve: [[4.21956, 3], [5.1278, 3], [6.94427, 3]] },
  { curve: [[8.10802, 3], [8.6899, 3], [9.19926, 3.19101]] },
  { curve: [[10.3622, 3.62712], [10.8418, 4.68358], [11.3666, 5.73313]] },
  { to: [12, 7] },
  { to: [16.75, 7] },
  { curve: [[18.8567, 7], [19.91, 7], [20.6667, 7.50559]] },
  { curve: [[20.9943, 7.72447], [21.2755, 8.00572], [21.4944, 8.33329]] },
  { curve: [[22, 9.08996], [22, 10.1433], [22, 12.25]] },
  { curve: SHUT_RIGHT_TOP },
]);
const OPEN_BACK = outline([2, 19], [
  { to: [2, 7.54902], halves: 1 },
  { curve: [[2, 6.10516], [2, 5.38322], [2.24332, 4.81647]] },
  { curve: [[2.5467, 4.10985], [3.10985, 3.5467], [3.81647, 3.24332]] },
  { curve: [[4.38322, 3], [5.09805, 3], [6.54902, 3]] },
  { to: [7.04311, 3] },
  { curve: [[7.64819, 3], [8.22075, 3.27394], [8.60041, 3.74509]] },
  { to: [10.4175, 6] },
  { to: [16, 6] },
  { curve: [[17.4001, 6], [18.1002, 6], [18.635, 6.27248]] },
  { curve: [[19.1054, 6.51217], [19.4878, 6.89462], [19.7275, 7.36502]] },
  { curve: [[20, 7.8998], [20, 8.59987], [20, 10]] },
  { to: [20, 11] },
]);

// The fold at the tab's foot, along the back's top edge.
const SHUT_TAB = outline([12, 7], [{ to: [8, 7] }]);
const OPEN_TAB = outline([10.4175, 6], [{ to: [7, 6] }]);

export interface FolderFrame {
  /** The back panel's outline, where the front leaves it showing. */
  back: string;
  /** The fold at the foot of the tab. */
  tab: string;
  /** The front panel. */
  front: string;
}

/** The folder at `open` from 0, shut, to 1, open. */
export function folderFrame(open: number): FolderFrame {
  return {
    back: place(blend(SHUT_BACK, OPEN_BACK, open), undefined, true),
    tab: place(blend(SHUT_TAB, OPEN_TAB, open), undefined, true),
    front: place(blend(SHUT_FRONT, OPEN_FRONT, open)),
  };
}
