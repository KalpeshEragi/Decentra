// Moving along the roads: the City's road segments as a graph, and the shortest way between two places on it.
// Anything that travels (a truck, a messenger, a customer) follows the route this returns instead of cutting across
// plots. Pure: the same roads and places always give the same route.

import type { Point, Seg } from "./cityLayout";

const EPS = 1e-6;
const isVertical = (s: Seg) => s.x1 === s.x2;
const lo = (a: number, b: number) => Math.min(a, b);
const hi = (a: number, b: number) => Math.max(a, b);

/** Does point p lie on segment s (its centre line)? */
function onSeg(s: Seg, [x, z]: Point) {
  return isVertical(s)
    ? Math.abs(x - s.x1) < EPS && z >= lo(s.z1, s.z2) - EPS && z <= hi(s.z1, s.z2) + EPS
    : Math.abs(z - s.z1) < EPS && x >= lo(s.x1, s.x2) - EPS && x <= hi(s.x1, s.x2) + EPS;
}

/** Where a vertical and a horizontal segment cross, if they do. */
function crossing(a: Seg, b: Seg): Point | null {
  if (isVertical(a) === isVertical(b)) return null;
  const [v, h] = isVertical(a) ? [a, b] : [b, a];
  const p: Point = [v.x1, h.z1];
  return onSeg(v, p) && onSeg(h, p) ? p : null;
}

/** The nearest point on segment s to p. */
function nearestOn(s: Seg, [x, z]: Point): Point {
  return isVertical(s) ? [s.x1, Math.max(lo(s.z1, s.z2), Math.min(hi(s.z1, s.z2), z))]
    : [Math.max(lo(s.x1, s.x2), Math.min(hi(s.x1, s.x2), x)), s.z1];
}

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const keyOf = ([x, z]: Point) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`;

/** The nearest point on any road to p (where a traveller joins the road network). */
export function joinPoint(roads: Seg[], p: Point): { at: Point; seg: number } {
  let best = { at: p, seg: -1, d: Infinity };
  roads.forEach((s, i) => {
    const at = nearestOn(s, p), d = dist(at, p);
    if (d < best.d - EPS) best = { at, seg: i, d };
  });
  return { at: best.at, seg: best.seg };
}

/** Graph nodes per segment: its ends, every crossing, every other segment's end on it, and any extra points. */
function buildGraph(roads: Seg[], extra: { at: Point; seg: number }[]) {
  const nodes = new Map<string, Point>();
  const edges = new Map<string, { to: string; d: number }[]>();
  const link = (a: Point, b: Point) => {
    const ka = keyOf(a), kb = keyOf(b), d = dist(a, b);
    if (ka === kb) return;
    edges.get(ka)!.push({ to: kb, d });
    edges.get(kb)!.push({ to: ka, d });
  };
  roads.forEach((s, i) => {
    const pts: Point[] = [[s.x1, s.z1], [s.x2, s.z2]];
    roads.forEach((o, j) => {
      if (i === j) return;
      const c = crossing(s, o);
      if (c) pts.push(c);
      for (const end of [[o.x1, o.z1], [o.x2, o.z2]] as Point[]) if (onSeg(s, end)) pts.push(end);
    });
    for (const e of extra) if (e.seg === i) pts.push(e.at);
    const along = isVertical(s) ? 1 : 0;
    pts.sort((a, b) => a[along] - b[along]);
    for (const p of pts) {
      const k = keyOf(p);
      if (!nodes.has(k)) { nodes.set(k, p); edges.set(k, []); }
    }
    for (let n = 1; n < pts.length; n++) link(pts[n - 1], pts[n]);
  });
  return { nodes, edges };
}

/** The shortest way from `from` to `to` along the roads: from, where it joins the road, the junctions passed,
 *  where it leaves the road, to. Consecutive duplicates are dropped. Null if no road connects them. */
export function roadRoute(roads: Seg[], from: Point, to: Point): Point[] | null {
  if (!roads.length) return null;
  const start = joinPoint(roads, from), end = joinPoint(roads, to);
  const { nodes, edges } = buildGraph(roads, [start, end]);
  const s = keyOf(start.at), t = keyOf(end.at);

  // Dijkstra; the graph is small (tens of nodes), so a plain scan for the nearest open node is enough.
  const best = new Map<string, number>([[s, 0]]);
  const prev = new Map<string, string>();
  const open = new Set<string>([s]);
  const done = new Set<string>();
  while (open.size) {
    let k = "", kd = Infinity;
    for (const o of open) { const d = best.get(o)!; if (d < kd || (d === kd && o < k)) { k = o; kd = d; } }
    open.delete(k);
    if (k === t) break;
    done.add(k);
    for (const e of edges.get(k) ?? []) {
      if (done.has(e.to)) continue;
      const d = kd + e.d;
      if (d < (best.get(e.to) ?? Infinity) - EPS) { best.set(e.to, d); prev.set(e.to, k); open.add(e.to); }
    }
  }
  if (!best.has(t)) return null;

  const path: Point[] = [];
  for (let k: string | undefined = t; k; k = prev.get(k)) path.unshift(nodes.get(k)!);
  return dropStraight([from, ...path, to]);
}

/** Drop repeated points and points in the middle of a straight run, so a route lists only its turns. */
function dropStraight(route: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of route) {
    if (out.length && dist(out[out.length - 1], p) < EPS) continue;
    if (out.length >= 2) {
      const [a, b] = [out[out.length - 2], out[out.length - 1]];
      const cross = (b[0] - a[0]) * (p[1] - b[1]) - (b[1] - a[1]) * (p[0] - b[0]);
      const forward = (b[0] - a[0]) * (p[0] - b[0]) + (b[1] - a[1]) * (p[1] - b[1]);
      if (Math.abs(cross) < EPS && forward > 0) out.pop();
    }
    out.push(p);
  }
  return out;
}
