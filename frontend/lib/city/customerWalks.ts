// When a customer's owner walks from the house to Sales and back (FE-32, FE-33).
// Inquiries are not events, so a new one shows as a rise of the customer's inquiry count in the live data. One poll
// can hold several inquiries of one customer: they become one walk that says how many it carries.

import type { Live } from "@/lib/api";
import { House, houseRoute, Point, routeLength } from "./cityLayout";

export type Customer = Live["customers"][number];
export type Arrival = { customer: Customer; idx: number; count: number };
export type Walk = { id: string; customerId: string; idx: number; label: string; count: number; route: Point[]; slot: number;
  t0: number; walkMs: number };

export const WAIT_MS = 3500;                                 // how long the owner waits at the Sales office
/** Everyone on foot walks at this pace (metres per ms): brisk at City scale, slow enough to follow by eye. */
export const WALK_SPEED = 8 / 1000;
export const GAP_MS = 1500, BATCH_MS = 15000, MAX_WALKERS = 30;  // FE-18: a batch plays in real order, within about 15 s

export const walkEnd = (w: Walk) => w.t0 + 2 * w.walkMs + WAIT_MS;
const stillOutbound = (w: Walk, now: number) => now < w.t0 + w.walkMs + WAIT_MS;

/** What rose since the last snapshot. The first snapshot (`seen` null) only sets the baseline: old inquiries are
 *  not news (FE-12). Arrivals come in the real order of their latest inquiry. */
export function newInquiries(seen: Map<string, number> | null, customers: Customer[]) {
  const next = new Map(customers.map((c) => [c.id, c.inquiry_count]));
  const arrivals: Arrival[] = [];
  if (seen) customers.forEach((customer, idx) => {
    const count = customer.inquiry_count - (seen.get(customer.id) ?? 0);
    if (count > 0) arrivals.push({ customer, idx, count });
  });
  arrivals.sort((a, b) => (a.customer.latest_inquiry?.created_at ?? "").localeCompare(b.customer.latest_inquiry?.created_at ?? ""));
  return { next, arrivals };
}

/** Add arrivals to the walks under way. An owner still on the way out takes the new inquiries along; one already going
 *  home sets out again afterwards. More than MAX_WALKERS at once: the latest ones walk; the resting picture stays true. */
export function addWalks(walks: Walk[], arrivals: Arrival[], houses: House[], now: number): Walk[] {
  const out = dropEnded(walks, now).map((w) => ({ ...w }));
  const gap = Math.min(GAP_MS, BATCH_MS / Math.max(1, arrivals.length));
  arrivals.slice(-MAX_WALKERS).forEach((a, i) => {
    const mine = out.filter((w) => w.customerId === a.customer.id);
    const going = mine.find((w) => stillOutbound(w, now));
    if (going) { going.count += a.count; return; }
    const house = houses[a.idx];
    if (!house) return;
    const route = houseRoute(house, i % 5);
    out.push({ id: `${a.customer.id}#${now}#${i}`, customerId: a.customer.id, idx: a.idx, label: a.customer.label, count: a.count,
      route, slot: i % 5, t0: Math.max(now + i * gap, ...mine.map(walkEnd)),
      walkMs: routeLength(route) / WALK_SPEED });
  });
  return out;
}

/** The walks still under way at `now` (the same array when nothing ended, so React can skip a render). */
export function dropEnded(walks: Walk[], now: number): Walk[] {
  const kept = walks.filter((w) => walkEnd(w) > now);
  return kept.length === walks.length ? walks : kept;
}

/** Where one walk stands at `now`: `null` while it has not started or is over. */
export function walkState(w: Walk, now: number) {
  const ms = now - w.t0;
  if (ms < 0 || ms >= walkEnd(w) - w.t0) return null;
  if (ms < w.walkMs) return { ...pointAlong(w.route, ms / w.walkMs), phase: "out" as const, moving: true };
  if (ms < w.walkMs + WAIT_MS) return { ...pointAlong(w.route, 1), phase: "waiting" as const, moving: false };
  return { ...pointAlong(w.route, 1 - (ms - w.walkMs - WAIT_MS) / w.walkMs, true), phase: "home" as const, moving: true };
}

/** Position and heading a fraction `t` (0..1) along a route. `back`: facing the way home. */
export function pointAlong(route: Point[], t: number, back = false) {
  let left = Math.max(0, Math.min(1, t)) * routeLength(route);
  for (let i = 1; i < route.length; i++) {
    const [x0, z0] = route[i - 1], [x1, z1] = route[i], len = Math.hypot(x1 - x0, z1 - z0);
    if (left <= len && len > 0) {
      const f = left / len;
      return { x: x0 + (x1 - x0) * f, z: z0 + (z1 - z0) * f, heading: Math.atan2(x1 - x0, z1 - z0) + (back ? Math.PI : 0) };
    }
    left -= len;
  }
  const [x, z] = route[route.length - 1];
  return { x, z, heading: 0 };
}

export const inquiryWords = (n: number) => `${n} ${n === 1 ? "inquiry" : "inquiries"}`;

/** ?customers=N: made-up houses to measure fps at 10, 100 and 500 customers (FE-15). Marked as a preview everywhere. */
export function previewCustomers(n: number): Customer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `preview-${i}`, name: null, label: `Preview ${i + 1}`, created_at: "", has_open_order: i % 4 === 0, open_orders: [],
    inquiry_count: i % 3 === 0 ? 1 + (i % 2) : 0, latest_inquiry: null }));
}
export const isPreview = (customerId: string) => customerId.startsWith("preview-");
