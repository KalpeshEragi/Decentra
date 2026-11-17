// Event visits: when a published event is delivered, each subscribing agent walks from its office to the nearest
// park, stands on the round lawn in its middle reading the event on the Town Square board for a few seconds, walks to
// the publisher's office, stays briefly, and walks home. Real data only: the event and its subscribers come from the
// timeline (FE-12). The visit is a picture of the subscriber taking note of the publisher's news, not a negotiation:
// real negotiations walk with an envelope (messengers.ts). Pure: the same roads, events and clock give the same walks.

import { PARKS, Point, Rect, routeLength, Seg } from "./cityLayout";
import { pointAlong, WALK_SPEED } from "./customerWalks";
import { officeExit, officeRoute } from "./messengers";
import { PARK_CIRCLE_R, PARK_CIRCLE_TOP } from "./planting";
import { roadRoute } from "./roads";
import { OFFICE_AT } from "./sites";

/** One event delivered to one subscriber. */
export type Delivery = { key: string; who: string; event: string; publisher: string };
export type Phase = "toPark" | "reading" | "toPublisher" | "visiting" | "home";
type Leg = { phase: Phase; ms: number; route: Point[]; face?: Point };
export type Visit = Delivery & { more: number; t0: number; legs: Leg[]; end: number };

export const READ_MS = 4000, VISIT_MS = 3000, MAX_VISITS = 6, GAP_MS = 1500;
/** An agent still busy with earlier visits for longer than this skips the new one (the feed still lists it). */
const QUEUE_MS = 60_000;
/** How far from the publisher's office the visitor stops (its own character stands at the office). */
const STOP_SHORT = 3.5;

const hasOffice = (code: string) => code !== "SIMULATOR_CLOCK" && code in OFFICE_AT;
const centre = ([x0, z0, x1, z1]: Rect): Point => [(x0 + x1) / 2, (z0 + z1) / 2];

/** Where `who` stands on a park's round lawn: around the middle, one place per agent, so readers never overlap. */
export function readingSpot(park: Rect, who: string): Point {
  const codes = Object.keys(OFFICE_AT), a = (codes.indexOf(who) / codes.length) * Math.PI * 2, [mx, mz] = centre(park);
  return [mx + Math.cos(a) * 2, mz + Math.sin(a) * 2];
}

/** From a park's reading spot out along its cross path to the roads and on to `to`: the shortest of the four paths. */
function fromPark(roads: Seg[], park: Rect, spot: Point, to: Point): Point[] {
  const [mx, mz] = centre(park), ends: Point[] = [[mx, park[1]], [mx, park[3]], [park[0], mz], [park[2], mz]];
  return ends.map((end) => [spot, [mx, mz] as Point, ...(roadRoute(roads, end, to) ?? [end, to])])
    .reduce((a, b) => (routeLength(b) < routeLength(a) ? b : a));
}

/** The park nearest to an office (by walking distance) and the way there, ending on the agent's reading spot. */
export function routeToPark(roads: Seg[], who: string): { park: Rect; route: Point[] } {
  const exit = officeExit(who), out = exit[exit.length - 1];
  return PARKS.map((park) => ({ park, route: [...exit.slice(0, -1), ...fromPark(roads, park, readingSpot(park, who), out).reverse()] }))
    .reduce((a, b) => (routeLength(b.route) < routeLength(a.route) ? b : a));
}

/** Ends a route `STOP_SHORT` before its last point. */
function stopShort(route: Point[]): Point[] {
  const [x1, z1] = route[route.length - 1], [x0, z0] = route[route.length - 2] ?? route[0], d = Math.hypot(x1 - x0, z1 - z0);
  if (d <= STOP_SHORT) return route.slice(0, -1);
  return [...route.slice(0, -1), [x1 - ((x1 - x0) / d) * STOP_SHORT, z1 - ((z1 - z0) / d) * STOP_SHORT]];
}

const walk = (phase: Phase, route: Point[]): Leg => ({ phase, route, ms: routeLength(route) / WALK_SPEED });
const stay = (phase: Phase, at: Point, ms: number, face: Point): Leg => ({ phase, route: [at], ms, face });

/** The legs of one visit: to the park, reading (facing the Town Square board), to the publisher, a short stay, home.
 *  A publisher without an office (the simulator) or the subscriber itself: straight home after reading. */
export function visitLegs(roads: Seg[], who: string, publisher: string): Leg[] {
  const { park, route } = routeToPark(roads, who), spot = route[route.length - 1];
  const legs = [walk("toPark", route), stay("reading", spot, READ_MS, [0, 0])];
  if (!hasOffice(publisher) || publisher === who) return [...legs, walk("home", [...route].reverse())];
  const [px, , pz] = OFFICE_AT[publisher], into = officeExit(publisher).reverse();
  const there = stopShort(fromPark(roads, park, spot, into[0]).concat(into.slice(1))), at = there[there.length - 1];
  return [...legs, walk("toPublisher", there), stay("visiting", at, VISIT_MS, [px, pz]),
    walk("home", [at, ...officeRoute(roads, publisher, who).slice(1)])];
}

/** Add one poll's deliveries to the visits under way (those that ended are dropped). Each agent goes once per poll,
 *  for the latest event it received (`more` counts the others); an agent still out goes again after it is back.
 *  Visits set out one after another in real order; more than MAX_VISITS agents in one poll: the latest ones go. */
export function addVisits(visits: Visit[], deliveries: Delivery[], roads: Seg[], now: number): Visit[] {
  const out = visits.filter((v) => v.end > now), latest = new Map<string, { d: Delivery; n: number }>();
  for (const d of deliveries) if (hasOffice(d.who)) {
    const n = (latest.get(d.who)?.n ?? 0) + 1;
    latest.delete(d.who);  // re-insert, so the order follows each agent's latest event
    latest.set(d.who, { d, n });
  }
  [...latest.values()].slice(-MAX_VISITS).forEach(({ d, n }, i) => {
    const t0 = Math.max(now + i * GAP_MS, ...out.filter((v) => v.who === d.who).map((v) => v.end));
    if (t0 - now > QUEUE_MS) return;
    const legs = visitLegs(roads, d.who, d.publisher);
    out.push({ ...d, more: n - 1, t0, legs, end: t0 + legs.reduce((s, l) => s + l.ms, 0) });
  });
  return out;
}

/** Where a visitor is at `now` (y: standing on a park's round lawn), or null before it sets out and after it is home. */
export function visitAt(v: Visit, now: number) {
  let ms = now - v.t0;
  if (ms < 0 || now >= v.end) return null;
  for (const leg of v.legs) {
    if (ms < leg.ms) {
      const moving = !leg.face, p = moving ? pointAlong(leg.route, ms / leg.ms) : { x: leg.route[0][0], z: leg.route[0][1], heading: 0 };
      if (leg.face) p.heading = Math.atan2(leg.face[0] - p.x, leg.face[1] - p.z);
      return { ...p, y: onParkCircle(p.x, p.z) ? PARK_CIRCLE_TOP : 0, moving, phase: leg.phase };
    }
    ms -= leg.ms;
  }
  return null;
}

const onParkCircle = (x: number, z: number) => PARKS.some((p) => { const [mx, mz] = centre(p); return Math.hypot(x - mx, z - mz) < PARK_CIRCLE_R; });
