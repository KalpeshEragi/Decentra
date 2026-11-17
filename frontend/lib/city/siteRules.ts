// What the buildings show, as pure rules over the live snapshot (FE-12: the resting picture is drawn from the live
// state, so a reload or a missed event still shows the truth). The scene only draws what these return.

import type { Live } from "@/lib/api";
import type { House } from "./cityLayout";

// ---- factory lines (FE-47) ----------------------------------------------------------------------------------------

export type LineLight = "started" | "planned" | "idle";
/** Green while an order on the line has started, amber when orders are planned for today, grey otherwise. */
export function lineLight(line: Live["lines"][number]): LineLight {
  const st = line.orders_today.map((o) => o.status.toUpperCase());
  if (st.some((s) => /START|PROGRESS|RUNNING/.test(s))) return "started";
  if (st.some((s) => /PLAN|FIRM|RELEASE/.test(s))) return "planned";
  return "idle";
}

// ---- warehouse docks ----------------------------------------------------------------------------------------------

export const MIN_DOORS = 6, MAX_DOORS = 10;
export type DockSlot = { door: number; kind: "inbound" | "outbound"; id: string; label: string; status: string; day: string };

/** One truck per pending delivery (today and tomorrow) or shipment, inbound first, at most one per door.
 *  `hidden`: how many more are pending than there are doors (the cards list them all). */
export function dockSlots(docks: Live["docks"]): { doors: number; slots: DockSlot[]; hidden: number } {
  const all: Omit<DockSlot, "door">[] = [
    ...docks.inbound.map((d) => ({ kind: "inbound" as const, id: d.commitment_id, label: d.sku ?? "Delivery", status: d.status, day: d.arrival_day })),
    ...docks.outbound.map((d) => ({ kind: "outbound" as const, id: d.order_ref, label: d.order_ref, status: "SHIPPING", day: d.delivery_day })),
  ];
  const doors = Math.min(MAX_DOORS, Math.max(MIN_DOORS, all.length));
  return { doors, slots: all.slice(0, doors).map((s, door) => ({ ...s, door })), hidden: Math.max(0, all.length - doors) };
}

export type PinColor = "blue" | "amber" | "red" | "green";
/** A supplier delivery's pin (FE-27): red delayed, green received, amber arriving today or tomorrow, blue otherwise. */
export function deliveryPin(status: string, arrivalDay: string, today: string): PinColor {
  const s = status.toUpperCase();
  if (/DELAY/.test(s)) return "red";
  if (/RECEIV/.test(s)) return "green";
  const days = (Date.parse(arrivalDay) - Date.parse(today)) / 86_400_000;
  return days <= 1 ? "amber" : "blue";
}

// ---- stock and storage --------------------------------------------------------------------------------------------

/** Box layers on a stock pallet: a log scale of on hand (1 layer for a few units, 6 at most), 0 when empty. */
export const stackLayers = (onHand: number) => (onHand <= 0 ? 0 : Math.min(6, Math.max(1, Math.ceil(Math.log10(onHand + 1) * 1.6))));
/** Filled slots of a 12-slot zone rack, from occupied / capacity. */
export const rackSlots = (occupied: number, capacity: number) => Math.round(Math.min(1, Math.max(0, occupied / Math.max(1, capacity))) * 12);

// ---- house labels (FE-32) -----------------------------------------------------------------------------------------

export const LABEL_NEAR = 240, MAX_NEAR_LABELS = 24;
/** Which houses show their name: from afar none; near, the closest few; always a hovered or selected house and every
 *  house whose customer has an open order. `camera`: x, y, z of the camera. */
export function labelledHouses(houses: House[], open: Set<number>, camera: [number, number, number],
  hovered: number | null, selected: number | null): number[] {
  const near = houses.map((h) => [h.idx, Math.hypot(camera[0] - h.x, camera[1], camera[2] - h.z)] as const)
    .filter(([, d]) => d < LABEL_NEAR).sort((a, b) => a[1] - b[1]).slice(0, MAX_NEAR_LABELS).map(([i]) => i);
  const shown = new Set<number>([...open, ...near]);
  for (const i of [hovered, selected]) if (i !== null && i >= 0 && i < houses.length) shown.add(i);
  return [...shown].filter((i) => i < houses.length).sort((a, b) => a - b);
}
