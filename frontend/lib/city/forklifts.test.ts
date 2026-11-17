import { describe, expect, it } from "vitest";
import type { Live, TimelineItem } from "@/lib/api";
import { makeLayout, onRoad, Point } from "./cityLayout";
import { BATCH_MS, EMPTY_YARD, forkliftAt, planYard, Trip, tripOf, truckAt, YardFacts } from "./forklifts";
import { dockSlots } from "./siteRules";
import { bayAt, doorSpot, doorX, lineSpot, palletSpot, rackSpot, TRUCK_REAR_Z, YARD_ROADS } from "./yard";

const live = {
  stock: [
    { item_id: "pcb", sku: "PCB", name: "Board", type: "RAW_MATERIAL", on_hand: "100", reserved: "0", held: "0" },
    { item_id: "chip", sku: "CHIP", name: "Chip", type: "RAW_MATERIAL", on_hand: "100", reserved: "0", held: "0" },
    { item_id: "phone", sku: "PHONE-P", name: "Phone", type: "FINISHED_PRODUCT", on_hand: "10", reserved: "0", held: "0" },
  ],
  zones: [{ zone: "MATERIALS", capacity_units: "100", occupied_now: "10" }, { zone: "FINISHED_GOODS", capacity_units: "100", occupied_now: "5" }],
  lines: [
    { work_center: "SMT", machine_hours_free: "8", orders_today: [] },
    { work_center: "ASM", machine_hours_free: "8", orders_today: [{ id: "po1", sku: "PHONE-P", quantity: "50", status: "STARTED", quantity_completed: "0" }] },
  ],
  docks: { inbound: [{ commitment_id: "c1", sku: "PCB", quantity: "30", status: "COMMITTED", arrival_day: "2026-11-10" }],
    outbound: [{ order_ref: "ord1", sku: "PHONE-P", quantity: "100", delivery_day: "2026-11-10" }] },
} as unknown as Live;
const names = { pcb: "PCB", chip: "CHIP", phone: "PHONE-P" };
const facts: YardFacts = { live, names, slots: dockSlots(live.docks).slots };
const doors = dockSlots(live.docks).doors;
const ev = (type: string, payload: Record<string, unknown>, publisher = "WAREHOUSE"): TimelineItem =>
  ({ time: "2026-11-11T10:00:00Z", source: "event", type, publisher, payload });
const roads = [...makeLayout(10).roads, ...YARD_ROADS];

describe("tripOf (FE-52)", () => {
  it("receives at the inbound door of that delivery and stores it in the rack of the item's zone", () => {
    const t = tripOf(ev("MaterialReceived", { item_id: "pcb", quantity: "30" }), facts)!;
    expect(t).toMatchObject({ kind: "receive", from: doorSpot(0, doors), to: rackSpot(0), load: "30 PCB", truck: { door: 0, dir: "in" } });
  });

  it("issues from the first component's pallet to the line of the production order, carrying every issued component", () => {
    const t = tripOf(ev("MaterialIssuedToProduction", { production_order_id: "po1", kits: "30",
      components: [{ item_id: "chip", issued: "60" }, { item_id: "pcb", issued: "30" }, { item_id: "pcb", issued: "0" }] }), facts)!;
    expect(t).toMatchObject({ kind: "issue", from: palletSpot(1), to: lineSpot(1, 2), load: "60 CHIP · 30 PCB" });
  });

  it("stores finished goods from the order's line in the rack of the event's own zone", () => {
    const t = tripOf(ev("FinishedGoodsStored", { production_order_id: "po1", item_id: "phone", quantity: "25", zone: "FINISHED_GOODS" }), facts)!;
    expect(t).toMatchObject({ kind: "store", from: lineSpot(1, 2), to: rackSpot(1), load: "25 PHONE-P" });
  });

  it("ships from the finished-goods rack to the door the shipment stood at, even once it left the snapshot", () => {
    const gone = { ...facts, live: { ...live, docks: { inbound: live.docks.inbound, outbound: [] } } as Live };
    const t = tripOf(ev("ShipmentDispatched", { order_ref: "ord1", item_id: "phone", quantity: "100" }), gone)!;
    expect(t).toMatchObject({ kind: "ship", from: rackSpot(1), load: "100 PHONE-P", truck: { door: 1, dir: "out" } });
  });

  it("moves nothing for record-only events or events of other agents", () => {
    expect(tripOf(ev("ReservationCommitted", { item_id: "pcb" }), facts)).toBeNull();
    expect(tripOf(ev("ReservationReleased", { item_id: "pcb" }), facts)).toBeNull();
    expect(tripOf(ev("MaterialReceived", { item_id: "pcb" }, "INVENTORY"), facts)).toBeNull();
  });
});

const trip = (n: number, extra: Partial<Trip> = {}): Trip =>
  ({ key: `t${n}`, kind: "issue", from: palletSpot(0), to: lineSpot(0, 2), load: `${n} PCB`, ...extra });
const legsOf = (y: ReturnType<typeof planYard>) => y.fleet.flat();

describe("planYard", () => {
  it("runs a poll's trips in real order on the forklift free first, within about 15 s, then back to the bay", () => {
    const y = planYard(EMPTY_YARD, [1, 2, 3, 4, 5, 6].map((n) => trip(n)), roads, doors, 0);
    const loaded = legsOf(y).filter((l) => l.load).sort((a, b) => a.t0 - b.t0);
    expect(loaded.map((l) => l.load)).toEqual(["1 PCB", "2 PCB", "3 PCB", "4 PCB", "5 PCB", "6 PCB"]);
    expect(Math.max(...legsOf(y).map((l) => l.t0 + l.ms))).toBeLessThanOrEqual(BATCH_MS + 500);
    y.fleet.forEach((legs, f) => expect(forkliftAt(legs, f, 1e9)).toMatchObject({ x: bayAt(f)[0], z: bayAt(f)[1], load: null }));
  });

  it("carries the load only between the pickup and the drop, along the roads", () => {
    const y = planYard(EMPTY_YARD, [trip(1)], roads, doors, 0);
    const [toPickup, loaded] = y.fleet[0];
    expect(forkliftAt(y.fleet[0], 0, toPickup.t0 + toPickup.ms / 2).load).toBeNull();
    const mid = forkliftAt(y.fleet[0], 0, loaded.t0 + loaded.ms / 2);
    expect(mid.load).toBe("1 PCB");
    expect(onRoad(roads, mid.x, mid.z)).toBe(true);
    expect(loaded.route[0]).toEqual(palletSpot(0));
    expect(loaded.route[loaded.route.length - 1]).toEqual(lineSpot(0, 2));
    for (const p of loaded.route.slice(1, -1)) expect(onRoad(roads, p[0], p[1])).toBe(true);
  });

  it("brings a supplier truck in reversing to its door before unloading; a shipment truck waits to be loaded, then leaves", () => {
    const door: Point = [doorX(0, doors), TRUCK_REAR_Z];
    const y = planYard(EMPTY_YARD, [trip(1, { kind: "receive", from: doorSpot(0, doors), truck: { door: 0, dir: "in", label: "SUPPLY" } }),
      trip(2, { kind: "ship", to: doorSpot(1, doors), truck: { door: 1, dir: "out", label: "SHIP" } })], roads, doors, 0);
    const inbound = y.trucks.find((t) => t.dir === "in")!, outbound = y.trucks.find((t) => t.dir === "out")!;
    const unload = y.fleet.flat().find((l) => l.load === "1 PCB")!;
    expect(unload.t0).toBeGreaterThanOrEqual(inbound.t0 + inbound.ms);
    expect(inbound.route[inbound.route.length - 1]).toEqual(door);
    expect(Math.cos(truckAt(inbound, inbound.t0 + inbound.ms - 50)!.heading)).toBeGreaterThan(0.99);  // reversing in: cab faces the yard
    const load = y.fleet.flat().find((l) => l.load === "2 PCB")!;
    expect(truckAt(outbound, load.t0)).toMatchObject({ x: doorX(1, doors), z: TRUCK_REAR_Z });
    expect(outbound.t0 + outbound.wait).toBeGreaterThanOrEqual(load.t0 + load.ms);
  });
});
