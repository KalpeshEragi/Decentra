// Live forklifts and dock trucks (FE-52, FE-12, FE-18). One forklift trip per real Warehouse event, carrying the real
// goods from the event payload to where they are drawn:
//   MaterialReceived            inbound dock door  -> the rack of the item's zone   (the supplier truck reverses in first)
//   MaterialIssuedToProduction  the item's pallet  -> the line of the production order
//   FinishedGoodsStored         the order's line   -> the rack of the event's zone
//   ShipmentDispatched          finished-goods rack -> the outbound door           (then the truck leaves for the customers)
// Events that change records only (ReservationCommitted, ReservationReleased, ...) move nothing. Trips follow the roads,
// play in real order on three forklifts within about 15 s per poll, then each forklift returns to its charging bay.
// The resting picture never depends on this: racks, pallets and parked trucks are drawn from the live snapshot.
// Pure: the same yard, events and clock always give the same plan.

import type { Live, TimelineItem } from "@/lib/api";
import { Point, routeLength, Seg } from "./cityLayout";
import { pointAlong } from "./customerWalks";
import { roadRoute } from "./roads";
import { DockSlot, dockSlots } from "./siteRules";
import { bayAt, CUSTOMER_EXIT, doorSpot, doorX, FORKLIFTS, lineSpot, MAX_PALLETS, MAX_RACKS, palletSpot, rackSpot,
  SUPPLIER_ENTRY, TRUCK_REAR_Z } from "./yard";

export type TripKind = "receive" | "issue" | "store" | "ship";
export type Trip = { key: string; kind: TripKind; from: Point; to: Point; load: string;
  truck?: { door: number; dir: "in" | "out"; label: string } };
export type Leg = { route: Point[]; t0: number; ms: number; load: string | null };
/** `wait`: ms standing at the start of the route before driving (an outbound truck while it is loaded). */
export type TruckRun = { key: string; door: number; dir: "in" | "out"; route: Point[]; t0: number; wait: number; ms: number; label: string };
export type Yard = { fleet: Leg[][]; trucks: TruckRun[] };

export const EMPTY_YARD: Yard = { fleet: Array.from({ length: FORKLIFTS }, () => []), trucks: [] };
export const BATCH_MS = 15_000, MAX_TRIPS = 12, MIN_TRIP_MS = 4000, MAX_TRIP_MS = 12_000, PAUSE_MS = 400, TRUCK_MS = 4000, STAGGER_MS = 1000;

// ---- from an event to a trip ----------------------------------------------------------------------------------------

export type YardFacts = { live: Live; names: Record<string, string>; slots: DockSlot[] };

const qty = (v: unknown) => Number(v ?? 0).toLocaleString("en", { maximumFractionDigits: 1 });
const at = <T>(list: T[], i: number, max: number) => (i >= 0 && i < Math.min(list.length, max) ? i : 0);

/** The zone an item is stored in: finished products in finished goods, everything else in materials. */
function zoneOf(live: Live, itemId: string): string {
  const s = live.stock.find((x) => x.item_id === itemId);
  return s && /FINISH|PRODUCT/i.test(s.type) ? "FINISHED_GOODS" : "MATERIALS";
}
const rackOf = (live: Live, zone: string) => rackSpot(at(live.zones, live.zones.findIndex((z) => z.zone === zone), MAX_RACKS));
const palletOf = (live: Live, itemId: string) => palletSpot(at(live.stock, live.stock.findIndex((s) => s.item_id === itemId), MAX_PALLETS));
function lineOf(live: Live, productionOrderId: string): Point {
  const i = live.lines.findIndex((l) => l.orders_today.some((o) => o.id === productionOrderId));
  return lineSpot(Math.max(0, i), Math.max(1, live.lines.length));
}

/** The forklift trip for one timeline item, or null when the item moves nothing. `slots`: the dock doors of this and
 *  the previous snapshot (a dispatched shipment has already left the current one). */
export function tripOf(it: TimelineItem, { live, names, slots }: YardFacts): Trip | null {
  if (it.source !== "event" || it.publisher !== "WAREHOUSE") return null;
  const p = it.payload ?? {};
  const key = `${it.time}|${it.type}`;
  const doors = dockSlots(live.docks).doors;
  const item = String(p.item_id ?? ""), sku = names[item] ?? "goods";
  switch (it.type) {
    case "MaterialReceived": {
      const door = slots.find((s) => s.kind === "inbound" && s.label === sku)?.door ?? 0;
      return { key, kind: "receive", from: doorSpot(door, doors), to: rackOf(live, zoneOf(live, item)), load: `${qty(p.quantity)} ${sku}`,
        truck: { door, dir: "in", label: "SUPPLY" } };
    }
    case "MaterialIssuedToProduction": {
      const parts = (p.components as { item_id?: string; issued?: unknown }[] | undefined) ?? [];
      const load = parts.filter((c) => Number(c.issued) > 0).map((c) => `${qty(c.issued)} ${names[c.item_id ?? ""] ?? "parts"}`).join(" · ");
      return { key, kind: "issue", from: palletOf(live, parts[0]?.item_id ?? ""), to: lineOf(live, String(p.production_order_id ?? "")),
        load: load || `${qty(p.kits)} kits` };
    }
    case "FinishedGoodsStored":
      return { key, kind: "store", from: lineOf(live, String(p.production_order_id ?? "")), to: rackOf(live, String(p.zone ?? "")),
        load: `${qty(p.quantity)} ${sku}` };
    case "ShipmentDispatched": {
      const door = slots.find((s) => s.kind === "outbound" && s.id === String(p.order_ref ?? ""))?.door ?? doors - 1;
      return { key, kind: "ship", from: rackOf(live, "FINISHED_GOODS"), to: doorSpot(door, doors), load: `${qty(p.quantity)} ${sku}`,
        truck: { door, dir: "out", label: "SHIP" } };
    }
    default:
      return null;
  }
}

// ---- planning the trips ---------------------------------------------------------------------------------------------

const route = (roads: Seg[], a: Point, b: Point) => roadRoute(roads, a, b) ?? [a, b];
const legEnd = (l: Leg) => l.t0 + l.ms;

/** Add one poll's trips to the yard. Trips run in their real order, each on the forklift that is free first; a trip's
 *  length shrinks with the batch so a poll plays within about 15 s. More than MAX_TRIPS: the latest ones run. */
export function planYard(yard: Yard, trips: Trip[], roads: Seg[], doors: number, now: number): Yard {
  // a forklift keeps its plan until all of it is done (it stands at the end of a finished leg during a pause)
  const fleet = yard.fleet.map((legs) => (legs.some((l) => legEnd(l) > now) ? [...legs] : []));
  const trucks = yard.trucks.filter((t) => t.t0 + t.ms > now);
  const batch = trips.slice(-MAX_TRIPS);
  // trips start one after another (real order), the first few on parallel forklifts a moment apart
  const stagger = Math.min(STAGGER_MS, BATCH_MS / Math.max(1, batch.length));
  const tripMs = Math.min(MAX_TRIP_MS, Math.max(MIN_TRIP_MS,
    ((BATCH_MS - stagger * (FORKLIFTS - 1)) * FORKLIFTS) / Math.max(1, batch.length)));
  const freeAt = fleet.map((legs) => Math.max(now, ...legs.map(legEnd)));
  let lastStart = -Infinity;
  for (const trip of batch) {
    const f = freeAt.indexOf(Math.min(...freeAt));
    freeAt[f] = Math.max(freeAt[f], lastStart + stagger);
    lastStart = freeAt[f];
    const home = bayAt(f);
    const r = [route(roads, home, trip.from), route(roads, trip.from, trip.to), route(roads, trip.to, home)];
    const lens = r.map(routeLength), total = Math.max(1, lens.reduce((a, b) => a + b, 0));
    const ms = lens.map((l) => Math.max(300, ((tripMs - 2 * PAUSE_MS) * l) / total));
    let t = freeAt[f];
    if (trip.truck?.dir === "in") {  // the supplier truck drives in and reverses into its door first
      const door: Point = [doorX(trip.truck.door, doors), TRUCK_REAR_Z];
      trucks.push({ key: trip.key, door: trip.truck.door, dir: "in", route: route(roads, SUPPLIER_ENTRY, door), t0: t, wait: 0, ms: TRUCK_MS,
        label: trip.truck.label });
      t += Math.max(0, TRUCK_MS - ms[0]);
    }
    const legs: Leg[] = [
      { route: r[0], t0: t, ms: ms[0], load: null },
      { route: r[1], t0: t + ms[0] + PAUSE_MS, ms: ms[1], load: trip.load },
      { route: r[2], t0: t + ms[0] + ms[1] + 2 * PAUSE_MS, ms: ms[2], load: null },
    ];
    fleet[f].push(...legs);
    freeAt[f] = legEnd(legs[2]);
    if (trip.truck?.dir === "out") {  // the truck waits at its door while it is loaded, then leaves for the customers
      const door: Point = [doorX(trip.truck.door, doors), TRUCK_REAR_Z];
      const wait = legEnd(legs[1]) + PAUSE_MS - t;
      trucks.push({ key: trip.key, door: trip.truck.door, dir: "out", route: route(roads, door, CUSTOMER_EXIT),
        t0: t, wait, ms: wait + TRUCK_MS * 1.5, label: trip.truck.label });
    }
  }
  return { fleet, trucks };
}

// ---- where things are now -------------------------------------------------------------------------------------------

export type Pose = { x: number; z: number; heading: number };

/** A forklift at `now`: on its leg under way, else standing where its last leg ended, else at its charging bay. */
export function forkliftAt(legs: Leg[], f: number, now: number): Pose & { load: string | null } {
  let last: Leg | null = null;
  for (const l of legs) {
    if (now >= l.t0 && now < legEnd(l)) return { ...pointAlong(l.route, (now - l.t0) / l.ms), load: l.load };
    if (legEnd(l) <= now) last = l;
  }
  if (last) {
    const n = last.route.length;
    const [ax, az] = last.route[Math.max(0, n - 2)], [bx, bz] = last.route[n - 1];
    return { x: bx, z: bz, heading: Math.atan2(bx - ax, bz - az), load: null };
  }
  const [x, z] = bayAt(f);
  return { x, z, heading: Math.PI, load: null };
}

/** A moving truck at `now`, or null when it is not under way. Its origin is the trailer's rear; arriving trucks reverse
 *  the last stretch into the door, so they face away from it there. */
export function truckAt(run: TruckRun, now: number): Pose | null {
  if (now < run.t0 || now >= run.t0 + run.ms) return null;
  const k = Math.max(0, (now - run.t0 - run.wait) / (run.ms - run.wait));
  const pose = pointAlong(run.route, k);
  if (run.dir === "in") {
    const n = run.route.length, total = routeLength(run.route);
    const lastLen = Math.hypot(run.route[n - 1][0] - run.route[n - 2][0], run.route[n - 1][1] - run.route[n - 2][1]);
    if (k * total > total - lastLen) pose.heading += Math.PI;
  }
  return pose;
}

/** Doors whose truck is driving right now: the scene hides the parked truck there meanwhile. */
export const busyDoors = (trucks: TruckRun[], now: number) => new Set(trucks.filter((t) => truckAt(t, now)).map((t) => t.door));
