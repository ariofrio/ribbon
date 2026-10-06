/**
 * The standard group icons as small solid objects, drawn in the icon style.
 *
 * A book lies on a table, spine at the left, seen from in front and above:
 * two pages, one over the other, joined by a rounded spine. Opening it, the
 * top page turns over on the spine and lands flat on the left, the spine
 * uncurling beneath it and the pages bowing into the gutter. A folder stands
 * with its front panel against its back; opening it, the front falls forward
 * on the fold along its bottom. Two message bubbles stand one behind the
 * other; opening them, the back one slides out from behind the front one.
 *
 * Each part is a panel with no thickness, posed in 3D and drawn with parallel
 * projection, as icons are: every edge that is a crease, a fold or a panel's
 * border is stroked, the seams across a smooth surface are not, and whatever
 * a nearer part covers is masked away.
 */

type V2 = [number, number];
type V3 = [number, number, number];

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A panel, or several joined, with no thickness, drawn from either side. */
interface Solid {
  faces: V3[][];
  /** For a curved panel, each face's outward side. */
  normals?: V3[];
  /** Lines drawn on the panel besides its edges, such as a fold. */
  lines?: V3[][];
  /** Panels with the same name are one surface where their edges meet. */
  join?: string;
}

/** A parallel view: where a point lands, and which way the viewer is. */
interface View {
  at: (p: V3) => V2;
  toward: V3;
}

function normal(face: V3[]): V3 {
  let n: V3 = [0, 0, 0];
  for (let i = 0; i < face.length; i += 1) {
    const a = face[i]!;
    const b = face[(i + 1) % face.length]!;
    n = [
      n[0] + (a[1] - b[1]) * (a[2] + b[2]),
      n[1] + (a[2] - b[2]) * (a[0] + b[0]),
      n[2] + (a[0] - b[0]) * (a[1] + b[1]),
    ];
  }
  const length = Math.hypot(...n) || 1;
  return [n[0] / length, n[1] / length, n[2] / length];
}

/** One part as drawn: its strokes, and the area it hides behind it. */
interface Layer {
  strokes: { points: V2[]; closed: boolean }[];
  fills: V2[][];
}

// Faces meeting at less than this are one smooth surface.
const CREASE = Math.cos((35 * Math.PI) / 180);

/**
 * Draws panels nearest first. A curved one hides its own far side: what faces
 * away is drawn as a layer of its own, behind what faces the viewer.
 */
function draw(solids: Solid[], view: View): Layer[] {
  const key = (p: V3) => p.map((n) => n.toFixed(4)).join(",");
  const base: number[] = [];
  let count = 0;
  for (const solid of solids) {
    base.push(count);
    count += solid.normals ? 2 : 1;
  }
  type Side = { layer: number; solid: number; n: V3; facing: boolean };
  const edges = new Map<string, { a: V3; b: V3; sides: Side[] }>();
  const fills: V2[][][] = Array.from({ length: count }, () => []);
  solids.forEach((solid, index) => {
    solid.faces.forEach((face, faceIndex) => {
      const n = solid.normals?.[faceIndex] ?? normal(face);
      const facing = dot(n, view.toward) > 1e-9;
      const layer = base[index]! + (solid.normals && !facing ? 1 : 0);
      fills[layer]!.push(face.map(view.at));
      face.forEach((a, i) => {
        const b = face[(i + 1) % face.length]!;
        if (key(a) === key(b)) return;
        const k = `${solid.join ?? index}:${[key(a), key(b)].sort().join("|")}`;
        const edge = edges.get(k) ?? { a, b, sides: [] };
        edge.sides.push({ layer, solid: index, n, facing });
        edges.set(k, edge);
      });
    });
  });
  const segments: V2[][][] = Array.from({ length: count }, () => []);
  for (const { a, b, sides } of edges.values()) {
    if (sides.length >= 2) {
      // A panel may meet the next on either side; but where a curved one
      // turns from facing the viewer to facing away, that fold is its outline.
      const [p, q] = [sides[0]!, sides[1]!];
      const fold = p.solid === q.solid && solids[p.solid]!.normals && p.facing !== q.facing;
      if (!fold && Math.abs(dot(p.n, q.n)) > CREASE) continue;
    }
    segments[Math.min(...sides.map((side) => side.layer))]!.push([view.at(a), view.at(b)]);
  }
  solids.forEach((solid, index) => {
    for (const line of solid.lines ?? []) {
      for (let i = 1; i < line.length; i += 1) {
        segments[base[index]!]!.push([view.at(line[i - 1]!), view.at(line[i]!)]);
      }
    }
  });
  return segments.map((group, index) => ({ strokes: chain(group), fills: fills[index]! }));
}

/** Joins segments end to end into as few polylines as they make. */
function chain(segments: V2[][]): { points: V2[]; closed: boolean }[] {
  const key = (p: V2) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const ends = segments.map(([a, b]) => [key(a!), key(b!)] as const);
  const at = new Map<string, number[]>();
  ends.forEach(([a, b], index) => {
    for (const k of [a, b]) at.set(k, [...(at.get(k) ?? []), index]);
  });
  const used = new Set<number>();
  // The segment from `k` not yet in a line, and the point it leads to.
  const next = (k: string): [number, V2, string] | null => {
    for (const index of at.get(k) ?? []) {
      if (used.has(index)) continue;
      used.add(index);
      const [a, b] = ends[index]!;
      return a === k ? [index, segments[index]![1]!, b] : [index, segments[index]![0]!, a];
    }
    return null;
  };
  const lines: { points: V2[]; closed: boolean }[] = [];
  segments.forEach(([a, b], index) => {
    if (used.has(index)) return;
    used.add(index);
    const points: V2[] = [a!, b!];
    let head = ends[index]![0];
    let tail = ends[index]![1];
    for (let step = next(tail); step; step = next(tail)) {
      points.push(step[1]);
      tail = step[2];
    }
    for (let step = next(head); step; step = next(head)) {
      points.unshift(step[1]);
      head = step[2];
    }
    const closed = points.length > 2 && head === tail;
    if (closed) points.pop();
    lines.push({ points, closed });
  });
  return lines;
}

const RADIUS = 2;
const GENTLE = (10 * Math.PI) / 180;
const SHARP = (30 * Math.PI) / 180;
const num = (n: number) => String(Math.round(n * 1000) / 1000);
const point = (p: V2) => `${num(p[0])} ${num(p[1])}`;

/** Path data for a polyline as it is. */
const polyline = (points: V2[], closed: boolean) =>
  `M${points.map(point).join("L")}${closed ? "Z" : ""}`;

/** Path data for a polyline, its sharp corners rounded. */
function rounded(points: V2[], closed: boolean): string {
  const n = points.length;
  if (n < 3) return `M${point(points[0]!)}L${point(points[n - 1]!)}`;
  const corner = (i: number) => {
    const prev = points[(i - 1 + n) % n]!;
    const here = points[i]!;
    const next = points[(i + 1) % n]!;
    const d1 = Math.hypot(here[0] - prev[0], here[1] - prev[1]);
    const d2 = Math.hypot(next[0] - here[0], next[1] - here[1]);
    if (d1 === 0 || d2 === 0) return null;
    const u1: V2 = [(here[0] - prev[0]) / d1, (here[1] - prev[1]) / d1];
    const u2: V2 = [(next[0] - here[0]) / d2, (next[1] - here[1]) / d2];
    const turn = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    if (turn < GENTLE) return null;
    // Rounded more as the corner sharpens, so none rounds all at once.
    const share = Math.min(1, (turn - GENTLE) / (SHARP - GENTLE));
    const cut = Math.min(RADIUS * Math.tan(turn / 2) * share * share * (3 - 2 * share), d1 / 2, d2 / 2);
    return {
      in: [here[0] - u1[0] * cut, here[1] - u1[1] * cut] as V2,
      at: here,
      out: [here[0] + u2[0] * cut, here[1] + u2[1] * cut] as V2,
    };
  };
  const first = closed ? corner(0) : null;
  let d = `M${point(first ? first.out : points[0]!)}`;
  for (let i = 1; i < n; i += 1) {
    const c = closed || i < n - 1 ? corner(i) : null;
    d += c ? `L${point(c.in)}Q${point(c.at)} ${point(c.out)}` : `L${point(points[i]!)}`;
  }
  if (closed) d += first ? `L${point(first.in)}Q${point(first.at)} ${point(first.out)}Z` : "Z";
  return d;
}

// The book: two pages, each WIDTH across and DEPTH from front to back, their
// corners away from the spine rounded to CORNER. Shut, they lie LIFT apart,
// the book's thickness; open, they sink SINK into the gutter, bowing over
// BOW from the spine.
const WIDTH = 10.5;
const DEPTH = 17;
const CORNER = 2;
const LIFT = 4.3;
const SINK = 2.08;
const BOW = 3;

// Seen from 50° above the table, in front.
const ELEVATION = (50 * Math.PI) / 180;
const BOOK_VIEW: View = {
  at: ([x, y, z]) => [x, -(y * Math.sin(ELEVATION) + z * Math.cos(ELEVATION))],
  toward: [0, -Math.cos(ELEVATION), Math.sin(ELEVATION)],
};

/**
 * One page of the book, measured across from the spine (a) and back from its
 * front (y): flat, but bowing down into the spine by `sink` as it opens.
 */
function page(sink: number, place: (a: number, y: number, rise: number) => V3): Solid {
  const DIP = 6;
  const ROUND = 6;
  const riseAt = (a: number) => (a < BOW ? sink * (1 - (1 - a / BOW) ** 2) : sink);
  const dip = Array.from({ length: DIP + 1 }, (_, i) => (BOW * i) / DIP);
  const arc = (ca: number, cy: number, from: number): V2[] =>
    Array.from({ length: ROUND }, (_, k) => {
      const angle = from + ((k + 1) * Math.PI) / 2 / ROUND;
      return [ca + CORNER * Math.cos(angle), cy + CORNER * Math.sin(angle)];
    });
  const plan: V2[] = [
    ...dip.map((a): V2 => [a, 0]),
    [WIDTH - CORNER, 0],
    ...arc(WIDTH - CORNER, CORNER, -Math.PI / 2),
    [WIDTH, DEPTH - CORNER],
    ...arc(WIDTH - CORNER, DEPTH - CORNER, 0),
    ...[...dip].reverse().map((a): V2 => [a, DEPTH]),
  ];
  const at = ([a, y]: V2) => place(a, y, riseAt(a));
  const faces: V3[][] = [];
  for (let i = 0; i < DIP; i += 1) {
    const [a0, a1] = [dip[i]!, dip[i + 1]!];
    faces.push([at([a0, 0]), at([a1, 0]), at([a1, DEPTH]), at([a0, DEPTH])]);
  }
  faces.push(plan.filter(([a]) => a >= BOW).map(at));
  return { faces };
}

/**
 * The spine: a strip of cover curling from the bottom page's spine edge, at
 * the origin, round to the top page's. Shut, it is half a circle as tall as
 * the book is thick; it curls less as the book opens and shortens as the
 * pages settle, until they meet at the gutter. It leaves the bottom page and
 * reaches the top one along their own slopes, so it and they are one surface.
 */
function spineArc(open: number, slope: number, turn: number) {
  const length = ((Math.PI * LIFT) / 2) * (1 - open) ** 2;
  // As many facets as keep it round; once it is too tight to draw round, its
  // joints are folds, and it narrows into the fold at the gutter.
  const STEPS = Math.max(1, Math.min(12, Math.round(length / 0.6)));
  const lean = Math.atan(slope);
  // Heading along the spine, from backward along the bottom page to forward
  // along the top one, turning evenly.
  const from = Math.PI + lean;
  const to = turn - lean;
  const points: V2[] = [];
  for (let i = 0; i <= STEPS; i += 1) {
    const t = (length * i) / STEPS;
    const bend = (from - to) / (length || 1);
    const heading = from - bend * t;
    points.push(
      Math.abs(bend) < 1e-6
        ? [t * Math.cos(from), t * Math.sin(from)]
        : [(Math.sin(heading) - Math.sin(from)) / -bend, (Math.cos(heading) - Math.cos(from)) / bend],
    );
  }
  const faces: V3[][] = [];
  const normals: V3[] = [];
  for (let i = 0; i < STEPS; i += 1) {
    const [q0, q1] = [points[i]!, points[i + 1]!];
    faces.push([[q0[0], 0, q0[1]], [q1[0], 0, q1[1]], [q1[0], DEPTH, q1[1]], [q0[0], DEPTH, q0[1]]]);
    // Outward is to the left of the way the spine runs.
    const length = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) || 1;
    normals.push([-(q1[1] - q0[1]) / length, 0, (q1[0] - q0[0]) / length]);
  }
  return { solid: { faces, normals, join: "book" } as Solid, hinge: points.at(-1)! };
}

function bookSolids(open: number): Solid[] {
  const sink = SINK * open;
  const turn = Math.PI * open;
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const slope = (2 * sink) / BOW;
  const { solid: spine, hinge } = spineArc(open, slope, turn);
  // The top page turns over from the end of the spine; its bow is toward the
  // bottom page while shut, and upward once it lies open.
  const upper = page(sink, (a, y, rise) => [hinge[0] + a * c + rise * s, y, hinge[1] + a * s - rise * c]);
  const lower = page(sink, (a, y, rise) => [a, y, rise]);
  return [{ ...upper, join: "book" }, spine, { ...lower, join: "book" }];
}

// folder-closed, point by point: the back with its tab, the fold along the
// tab's foot, and the front, whose top edge crosses the folder at y 11.
function trace(d: string): V2[] {
  const tokens = d.match(/[MHVLC]|-?\d*\.?\d+/g)!;
  const points: V2[] = [];
  let at: V2 = [0, 0];
  let i = 0;
  const next = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === "M" || command === "L") at = [next(), next()];
    else if (command === "H") at = [next(), at[1]];
    else if (command === "V") at = [at[0], next()];
    else {
      const c1: V2 = [next(), next()];
      const c2: V2 = [next(), next()];
      const to: V2 = [next(), next()];
      const from = at;
      for (let k = 1; k < 8; k += 1) {
        const t = k / 8;
        const m = 1 - t;
        points.push([
          m ** 3 * from[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t ** 3 * to[0],
          m ** 3 * from[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t ** 3 * to[1],
        ]);
      }
      at = to;
    }
    points.push(at);
  }
  return points;
}

const BACK = trace(
  "M12 7H16.75C18.8567 7 19.91 7 20.6667 7.50559C20.9943 7.72447 21.2755 8.00572 21.4944 8.33329C22 9.08996 22 10.1433 22 12.25C22 15.7612 22 17.5167 21.1573 18.7779C20.7926 19.3238 20.3238 19.7926 19.7779 20.1573C18.5167 21 16.7612 21 13.25 21H12C7.28595 21 4.92893 21 3.46447 19.5355C2 18.0711 2 15.714 2 11V7.94427C2 6.1278 2 5.21956 2.38032 4.53806C2.65142 4.05227 3.05227 3.65142 3.53806 3.38032C4.21956 3 5.1278 3 6.94427 3C8.10802 3 8.6899 3 9.19926 3.19101C10.3622 3.62712 10.8418 4.68358 11.3666 5.73313",
);
const FRONT = [
  ...trace(
    "M2 13C2.06427 12.3499 2.20951 11.9124 2.53777 11.5858C3.12654 11 4.07416 11 5.9694 11H18.0306C19.9258 11 20.8735 11 21.4622 11.5858C21.7905 11.9124 21.9357 12.3499 22 13",
  ),
  ...BACK.slice(
    BACK.findIndex(([x, y]) => x === 22 && y === 12.25),
    BACK.findIndex(([x, y]) => x === 2 && y === 11),
  ).filter(([, y]) => y > 13),
];

// The front falls this far forward, open.
const FALL = (45 * Math.PI) / 180;
// Seen square on from a little above and to the right, with depth drawn as
// a slant: each unit nearer the viewer moves a point right 0.3 and down 0.2.
// The back and the shut front are square to the viewer, so they keep the
// icon's own shape.
const FOLDER_VIEW: View = {
  at: ([x, y, z]) => [x - 0.3 * y, 21 - z - 0.2 * y],
  toward: [0.3, -1, 0.2],
};

function folderSolids(open: number): Solid[] {
  const fall = FALL * open;
  const upright = ([x, y]: V2): V3 => [x, 0, 21 - y];
  return [
    {
      faces: [
        FRONT.map((p) => {
          const [x, , z] = upright(p);
          return [x, -z * Math.sin(fall), z * Math.cos(fall)];
        }),
      ],
    },
    { faces: [BACK.map(upright)], lines: [[upright([8, 7]), upright([12, 7])]] },
  ];
}

// message-multiple-01's front bubble, point by point, and its two lines.
const MESSAGE = trace(
  "M12.345 17.4868C15.9006 17.2526 18.7328 14.4069 18.9658 10.8344C19.0114 10.1353 19.0114 9.41131 18.9658 8.71219C18.7328 5.13969 15.9006 2.29401 12.345 2.05985C11.132 1.97997 9.86553 1.98013 8.65499 2.05985C5.09943 2.29401 2.26725 5.13969 2.0342 8.71219C1.9886 9.41131 1.9886 10.1353 2.0342 10.8344C2.11908 12.1356 2.69992 13.3403 3.38372 14.3576C3.78076 15.0697 3.51873 15.9586 3.10518 16.735C2.807 17.2948 2.65791 17.5747 2.77762 17.7769C2.89732 17.9791 3.16472 17.9856 3.69951 17.9985C4.75712 18.024 5.47028 17.7269 6.03638 17.3134C6.35744 17.0788 6.51798 16.9615 6.62862 16.9481C6.73926 16.9346 6.957 17.0234 7.39241 17.2011C7.78374 17.3608 8.23812 17.4593 8.65499 17.4868C9.86553 17.5665 11.132 17.5666 12.345 17.4868",
);
const TEXT: V2[][] = [
  [[7.5, 8], [10.5, 8]],
  [[7.5, 12], [13.5, 12]],
];
// Its back bubble is the front one mirrored, down to the right. Shut, it is
// tucked behind the front one, so only one shows. A bubble's mirror image
// cannot hide behind it, its tail sticks out past the rounded corner; a
// twentieth smaller, about the corner the icon draws it at, it can.
const MIRRORED = MESSAGE.map(([x, y]): V2 => [23.98 - x, y + 4.06]);
const BEHIND_CORNER: V2 = [Math.max(...MIRRORED.map(([x]) => x)), Math.max(...MIRRORED.map(([, y]) => y))];
const BEHIND = MIRRORED.map(([x, y]): V2 => [
  BEHIND_CORNER[0] + (x - BEHIND_CORNER[0]) * 0.95,
  BEHIND_CORNER[1] + (y - BEHIND_CORNER[1]) * 0.95,
]);
// The shortest slide back that puts all of it out of sight.
const TUCKED: V2 = [-3.75, -5.75];

// Seen square on, as the icon is drawn.
const FLAT_VIEW: View = {
  at: ([x, , z]) => [x, 21 - z],
  toward: [0, -1, 0],
};

function messagesSolids(open: number): Solid[] {
  const upright = ([x, y]: V2, depth: number): V3 => [x, depth, 21 - y];
  const away = 1 - open;
  return [
    { faces: [MESSAGE.map((p) => upright(p, 0))], lines: TEXT.map((line) => line.map((p) => upright(p, 0))) },
    { faces: [BEHIND.map(([x, y]) => upright([x + TUCKED[0] * away, y + TUCKED[1] * away], 1))] },
  ];
}

export interface IconFrame {
  /** Each part, nearest first: its strokes, and what it hides behind it. */
  layers: { d: string; covers: string }[];
  /** How far past a nearer part's outline what lies behind it stays hidden. */
  gap?: number;
}

/**
 * A polygon wound one way, so that overlapping ones in a single path add up
 * under the nonzero rule instead of cancelling.
 */
function clockwise(points: V2[]): V2[] {
  let area = 0;
  points.forEach(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length]!;
    area += x0 * y1 - x1 * y0;
  });
  return area < 0 ? [...points].reverse() : points;
}

/**
 * Frames an object's poses in the icon's box. The scale is one throughout,
 * so nothing grows or shrinks. A book spreads from its spine to both sides,
 * so the view slides to keep it centred; a folder's back stays where it is.
 */
function framed(
  solids: (open: number) => Solid[],
  view: View,
  { follow, round, scale: fixed, gap }: { follow: boolean; round: boolean; scale?: number; gap?: number },
) {
  const bounds = (open: number) => {
    const points = draw(solids(open), view).flatMap((layer) =>
      layer.strokes.flatMap((stroke) => stroke.points),
    );
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return { width: x1 - x0, height: y1 - y0, x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  };
  const [shut, spread] = [bounds(0), bounds(1)];
  const scale = fixed ?? Math.min(20 / shut.width, 18 / shut.height, 23 / spread.width);
  const rest = new Map<number, IconFrame>();
  const frame = (open: number): IconFrame => {
    const along = follow ? open : 0;
    const x = shut.x + (spread.x - shut.x) * along;
    const y = shut.y + (spread.y - shut.y) * along;
    const place = ([px, py]: V2): V2 => [12 + (px - x) * scale, 12 + (py - y) * scale];
    return {
      layers: draw(solids(open), view).map((layer) => ({
        d: layer.strokes
          .map(({ points, closed }) => (round ? rounded : polyline)(points.map(place), closed))
          .join(""),
        covers: layer.fills.map((fill) => `M${clockwise(fill.map(place)).map(point).join("L")}Z`).join(""),
      })),
      ...(gap === undefined ? {} : { gap }),
    };
  };
  // Most headings are at rest, so their poses are drawn once.
  return (open: number): IconFrame => {
    if (open !== 0 && open !== 1) return frame(open);
    const drawn = rest.get(open) ?? frame(open);
    rest.set(open, drawn);
    return drawn;
  };
}

/** The book at `open`, from 0 shut to 1 open. */
export const bookFrame = framed(bookSolids, BOOK_VIEW, { follow: true, round: false });
/** The folder at `open`, from 0 shut to 1 open. */
export const folderFrame = framed(folderSolids, FOLDER_VIEW, { follow: false, round: true });
/**
 * The two messages at `open`, from 0 shut to 1 open, drawn as
 * message-multiple-01 is: at its own size, with a gap where the back bubble
 * passes behind the front one.
 */
export const messagesFrame = framed(messagesSolids, FLAT_VIEW, { follow: true, round: false, scale: 1, gap: 1 });
