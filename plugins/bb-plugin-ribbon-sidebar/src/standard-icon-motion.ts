/**
 * The standard group icons as small solid objects, drawn in the icon style.
 *
 * A book lies on a table, spine at the left, seen from in front and above;
 * opening it, the cover and half the pages turn over on the spine and land
 * flat on the left, the pages bowing into the gutter as they part. A folder
 * stands with its front panel against its back; opening it, the front falls
 * forward on the fold along its bottom.
 *
 * Each frame is the objects posed in 3D and drawn with parallel projection,
 * as icons are: every edge that is a crease or a silhouette is stroked, the
 * seams across a smooth surface are not, and whatever a nearer part covers
 * is masked away. Sharp corners are rounded as the icon set rounds them.
 */

type V2 = [number, number];
type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

interface Solid {
  faces: V3[][];
  /**
   * For a face lying against another solid's, how wide the gap between them
   * shows: its edges are drawn that wide, from nothing while the faces touch
   * to a full stroke once they have parted.
   */
  gaps?: Map<number, number>;
  /** Each face's way out of the solid, where its winding does not say. */
  normals?: V3[];
  /** Lines drawn on the solid besides its edges, such as a fold. */
  lines?: V3[][];
  /** A panel with no thickness, drawn from either side. */
  thin?: boolean;
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

function centroid(points: V3[]): V3 {
  const sum = points.reduce<V3>((c, p) => [c[0] + p[0], c[1] + p[1], c[2] + p[2]], [0, 0, 0]);
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
}

const STROKE = 1.5;

/**
 * One solid as drawn: its strokes, each with the gap it shows or Infinity,
 * and the area it hides behind it.
 */
interface Layer {
  strokes: { points: V2[]; closed: boolean; width: number }[];
  fills: V2[][];
}

// Faces meeting at less than this are one smooth surface.
const CREASE = Math.cos((35 * Math.PI) / 180);

/**
 * Draws solids nearest first, each on its own: where two lie flat against
 * each other, the line between them is the gap they leave, drawn as wide as
 * it is.
 */
function draw(solids: Solid[], view: View): Layer[] {
  const key = (p: V3) => p.map((n) => n.toFixed(4)).join(",");
  type Side = { n: V3; seen: boolean; gap?: number };
  const edges = new Map<string, { solid: number; a: V3; b: V3; sides: Side[] }>();
  const fills: V2[][][] = solids.map(() => []);
  solids.forEach((solid, index) => {
    const middle = centroid(solid.faces.flat());
    solid.faces.forEach((face, faceIndex) => {
      let n = solid.normals?.[faceIndex] ?? normal(face);
      if (!solid.thin && !solid.normals && dot(n, sub(centroid(face), middle)) < 0) {
        n = [-n[0], -n[1], -n[2]];
      }
      const seen = solid.thin || dot(n, view.toward) > 1e-9;
      if (seen) fills[index]!.push(face.map(view.at));
      face.forEach((a, i) => {
        const b = face[(i + 1) % face.length]!;
        if (key(a) === key(b)) return;
        const k = `${index}:${[key(a), key(b)].sort().join("|")}`;
        const edge = edges.get(k) ?? { solid: index, a, b, sides: [] };
        edge.sides.push({ n, seen, gap: solid.gaps?.get(faceIndex) });
        edges.set(k, edge);
      });
    });
  });
  // Segments by solid, then by the width they are drawn.
  const segments: Map<number, V2[][]>[] = solids.map(() => new Map());
  for (const { solid, a, b, sides } of edges.values()) {
    const seen = sides.filter((side) => side.seen);
    if (seen.length === 0) continue;
    if (seen.length >= 2 && dot(seen[0]!.n, seen[1]!.n) > CREASE) continue;
    // The gap shows where it runs across the solid's front, between the
    // face that touches and one turned toward the viewer; along a side, the
    // same edge is the whole book's outline.
    const front = sides.some(({ gap, n }) => gap === undefined && n[1] < -1e-6);
    const width = front
      ? Math.min(Infinity, ...sides.flatMap(({ gap }) => (gap === undefined ? [] : [gap])))
      : Infinity;
    const group = segments[solid]!.get(width) ?? [];
    group.push([view.at(a), view.at(b)]);
    segments[solid]!.set(width, group);
  }
  return solids.map((solid, index) => ({
    strokes: [
      ...[...segments[index]!].flatMap(([width, group]) =>
        chain(group).map((line) => ({ ...line, width })),
      ),
      ...(solid.lines ?? []).map((line) => ({
        points: line.map(view.at),
        closed: false,
        width: Infinity,
      })),
    ],
    fills: fills[index]!,
  }));
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

// The book: two halves, each WIDTH across, DEPTH from front to back, and
// THICKNESS through, one lying on the other while shut, their corners away
// from the spine rounded to CORNER.
const WIDTH = 10.5;
const DEPTH = 17;
const THICKNESS = 2.6;
const CORNER = 2;
// Open, the pages sink this share of a half's thickness into the gutter,
// bowing over this far from the spine.
const GUTTER = 0.8;
const BOW = 3;

// Seen from 50° above the table, in front.
const ELEVATION = (50 * Math.PI) / 180;
const BOOK_VIEW: View = {
  at: ([x, y, z]) => [x, -(y * Math.sin(ELEVATION) + z * Math.cos(ELEVATION))],
  toward: [0, -Math.cos(ELEVATION), Math.sin(ELEVATION)],
};

type Contact = "inner" | "spine";

/**
 * One half of the book, measured across from its spine (a), back from its
 * front (y), and up from its inner face (b): its faces, each with the way
 * out of the half, and which of them touch the other half.
 */
function half(sink: number) {
  const DIP = 6;
  const ROUND = 6;
  const sinkAt = (a: number) => (a < BOW ? sink * (1 - a / BOW) ** 2 : 0);
  const slopeAt = (a: number) => (a < BOW ? (-2 * sink * (1 - a / BOW)) / BOW : 0);
  const dip = Array.from({ length: DIP + 1 }, (_, i) => (BOW * i) / DIP);
  const arc = (ca: number, cy: number, from: number): V2[] =>
    Array.from({ length: ROUND }, (_, k) => {
      const angle = from + ((k + 1) * Math.PI) / 2 / ROUND;
      return [ca + CORNER * Math.cos(angle), cy + CORNER * Math.sin(angle)];
    });
  // The plan, counterclockwise from the spine's front end.
  const plan: V2[] = [
    ...dip.map((a): V2 => [a, 0]),
    [WIDTH - CORNER, 0],
    ...arc(WIDTH - CORNER, CORNER, -Math.PI / 2),
    [WIDTH, DEPTH - CORNER],
    ...arc(WIDTH - CORNER, DEPTH - CORNER, 0),
    ...[...dip].reverse().map((a): V2 => [a, DEPTH]),
  ];
  const faces: V3[][] = [];
  const normals: V3[] = [];
  const contacts = new Map<number, Contact>();
  const face = (points: V3[], normal: V3, contact?: Contact) => {
    if (contact) contacts.set(faces.length, contact);
    faces.push(points);
    const length = Math.hypot(...normal);
    normals.push([normal[0] / length, normal[1] / length, normal[2] / length]);
  };
  const low = ([a, y]: V2): V3 => [a, y, sinkAt(a)];
  const high = ([a, y]: V2): V3 => [a, y, THICKNESS];
  face(plan.map(high), [0, 0, 1]);
  plan.forEach((p, i) => {
    const q = plan[(i + 1) % plan.length]!;
    const spine = p[0] === 0 && q[0] === 0;
    face([low(p), low(q), high(q), high(p)], [q[1] - p[1], p[0] - q[0], 0], spine ? "spine" : undefined);
  });
  for (let i = 0; i < DIP; i += 1) {
    const [a0, a1] = [dip[i]!, dip[i + 1]!];
    face(
      [low([a0, 0]), low([a1, 0]), low([a1, DEPTH]), low([a0, DEPTH])],
      [slopeAt((a0 + a1) / 2), 0, -1],
      "inner",
    );
  }
  face(plan.filter(([a]) => a >= BOW).map(low), [0, 0, -1], "inner");
  return { faces, normals, contacts };
}

/** A half placed in the world by an affine map, its normals carried along. */
function placed(
  { faces, normals, contacts }: ReturnType<typeof half>,
  place: (p: V3) => V3,
  gaps: Record<Contact, number>,
): Solid {
  const world = faces.map((points) => points.map(place));
  return {
    faces: world,
    normals: normals.map((n, i) => sub(place([
      faces[i]![0]![0] + n[0],
      faces[i]![0]![1] + n[1],
      faces[i]![0]![2] + n[2],
    ]), world[i]![0]!)),
    gaps: new Map(
      [...contacts].map(([index, contact]) => [index, gaps[contact]]),
    ),
  };
}

function bookSolids(open: number): Solid[] {
  const shape = half(GUTTER * THICKNESS * open);
  const turn = Math.PI * open;
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  // The halves' inner faces touch while shut, and their spines once open.
  // Seen from the front, the inner faces part as the upper's far edge lifts,
  // and the spines as the upper's spine tilts away from the lower's; the
  // gutter between the open pages is a crease, not a gap.
  const gaps = {
    inner: turn <= Math.PI / 2 ? WIDTH * s * Math.cos(ELEVATION) : Infinity,
    spine: turn >= Math.PI / 2 ? THICKNESS * s : Infinity,
  };
  // The lower half lies still; the upper turns over about the spine's top.
  return [
    placed(shape, ([a, y, b]) => [a * c - b * s, y, THICKNESS + a * s + b * c], gaps),
    placed(shape, ([a, y, b]) => [a, y, THICKNESS - b], gaps),
  ];
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
      thin: true,
    },
    { faces: [BACK.map(upright)], lines: [[upright([8, 7]), upright([12, 7])]], thin: true },
  ];
}

export interface IconFrame {
  /**
   * Each part, nearest first: its strokes, each path with its width, and what
   * it hides behind it.
   */
  layers: { strokes: { d: string; width: number }[]; covers: string }[];
}

/** A layer's strokes as one path for each width they are drawn at. */
function byWidth(layer: Layer, scale: number, place: (p: V2) => V2, round: boolean) {
  const paths = new Map<number, string>();
  for (const stroke of layer.strokes) {
    const width = Math.min(STROKE, stroke.width * scale);
    if (width < 0.01) continue;
    const points = stroke.points.map(place);
    const d = round ? rounded(points, stroke.closed) : polyline(points, stroke.closed);
    paths.set(width, (paths.get(width) ?? "") + d);
  }
  return [...paths].map(([width, d]) => ({ d, width }));
}

/**
 * Frames an object's poses in the icon's box. The scale is one throughout,
 * so nothing grows or shrinks. A book spreads from its spine to both sides,
 * so the view slides to keep it centred; a folder's back stays where it is.
 */
function framed(
  solids: (open: number) => Solid[],
  view: View,
  { follow, round }: { follow: boolean; round: boolean },
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
  const scale = Math.min(20 / shut.width, 18 / shut.height, 23 / spread.width);
  const rest = new Map<number, IconFrame>();
  const frame = (open: number): IconFrame => {
    const along = follow ? open : 0;
    const x = shut.x + (spread.x - shut.x) * along;
    const y = shut.y + (spread.y - shut.y) * along;
    const place = ([px, py]: V2): V2 => [12 + (px - x) * scale, 12 + (py - y) * scale];
    return {
      layers: draw(solids(open), view).map((layer) => ({
        strokes: byWidth(layer, scale, place, round),
        covers: layer.fills.map((fill) => `M${fill.map(place).map(point).join("L")}Z`).join(""),
      })),
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
