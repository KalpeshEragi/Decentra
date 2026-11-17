// Negotiation messengers (FE-23, FE-47): when a real negotiation message arrives, the sending agent's character walks
// the roads from its office to the other office carrying a glowing envelope, with a short code-written bubble. One
// poll's messages set out one after another in their real order, all within about 15 s (FE-18), at walking pace.
// Pure: the same roads, messages and clock always give the same walks.

import { PLOTS, Point, routeLength, Seg } from "./cityLayout";
import { pointAlong, WALK_SPEED } from "./customerWalks";
import { roadRoute } from "./roads";
import { officeAt } from "./sites";

export type Message = { key: string; from: string; to: string; label: string };
export type Messenger = Message & { route: Point[]; t0: number; ms: number };

export const MAX_MESSENGERS = 6, GAP_MS = 1500, BATCH_MS = 15_000;

/** From an office to where it meets the outside: its door, then the gap in its plot fence (FE-41). Offices on the
 *  warehouse Site have no plot of their own: they step straight out onto the Site pavement. */
export function officeExit(code: string): Point[] {
  const [x, , z] = officeAt(code);
  const plot = PLOTS[code as keyof typeof PLOTS];
  if (!plot) return [[x, z]];
  const south = plot.rect[3];
  return [[x, z], [plot.gateX, south - 4], [plot.gateX, south + 0.5]];
}

/** Office to office: out through the sender's gate, along the roads, in through the receiver's gate. */
export function officeRoute(roads: Seg[], from: string, to: string): Point[] {
  const out = officeExit(from), into = officeExit(to).reverse();
  const a = out[out.length - 1], b = into[0];
  return [...out.slice(0, -1), ...(roadRoute(roads, a, b) ?? [a, b]), ...into.slice(1)];
}

/** Add one poll's messages to the messengers under way (those that ended are dropped). More than MAX_MESSENGERS in one
 *  poll: the latest ones walk (the feed and the arcs still show every negotiation). */
export function addMessengers(walking: Messenger[], messages: Message[], roads: Seg[], now: number): Messenger[] {
  const out = walking.filter((m) => m.t0 + m.ms > now);
  const batch = messages.filter((m) => m.from !== m.to).slice(-MAX_MESSENGERS);
  const gap = Math.min(GAP_MS, BATCH_MS / Math.max(1, batch.length));
  batch.forEach((m, i) => {
    const route = officeRoute(roads, m.from, m.to);
    out.push({ ...m, route, t0: now + i * gap, ms: routeLength(route) / WALK_SPEED });
  });
  return out;
}

/** Where a messenger walks at `now`, or null before it sets out and after it arrived. */
export function messengerAt(m: Messenger, now: number) {
  const k = (now - m.t0) / m.ms;
  return k < 0 || k >= 1 ? null : pointAlong(m.route, k);
}
