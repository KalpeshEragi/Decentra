import { describe, expect, it } from "vitest";
import type { Live } from "@/lib/api";
import { makeLayout } from "./cityLayout";
import { deliveryPin, dockSlots, labelledHouses, LABEL_NEAR, lineLight, MAX_DOORS, rackSlots, stackLayers } from "./siteRules";

const line = (...statuses: string[]): Live["lines"][number] => ({ work_center: "SMT", machine_hours_free: "4",
  orders_today: statuses.map((status, i) => ({ id: `o${i}`, sku: null, quantity: "1", status, quantity_completed: "0" })) });

describe("lineLight (FE-47)", () => {
  it("is green once an order started, amber when only planned, grey otherwise", () => {
    expect(lineLight(line("PLANNED", "STARTED"))).toBe("started");
    expect(lineLight(line("PLANNED"))).toBe("planned");
    expect(lineLight(line("FIRM"))).toBe("planned");
    expect(lineLight(line())).toBe("idle");
    expect(lineLight(line("COMPLETED"))).toBe("idle");  // finished work is not planned work
  });
});

describe("dockSlots", () => {
  const inbound = (n: number) => Array.from({ length: n }, (_, i) => ({ commitment_id: `c${i}`, sku: "MB", quantity: "5", status: "COMMITTED", arrival_day: "2026-01-05" }));
  const outbound = (n: number) => Array.from({ length: n }, (_, i) => ({ order_ref: `SO-${i}`, sku: "LT", quantity: "2", delivery_day: "2026-01-06" }));

  it("puts deliveries first, then shipments, one per door, with at least 6 doors", () => {
    const { doors, slots, hidden } = dockSlots({ inbound: inbound(2), outbound: outbound(1) });
    expect(doors).toBe(6);
    expect(slots.map((s) => [s.door, s.kind])).toEqual([[0, "inbound"], [1, "inbound"], [2, "outbound"]]);
    expect(hidden).toBe(0);
  });

  it("never shows more trucks than doors and says how many it left out", () => {
    const { doors, slots, hidden } = dockSlots({ inbound: inbound(8), outbound: outbound(5) });
    expect(doors).toBe(MAX_DOORS);
    expect(slots).toHaveLength(MAX_DOORS);
    expect(hidden).toBe(3);
  });
});

describe("deliveryPin (FE-27)", () => {
  it("is red when delayed, green when received, amber within a day, blue later", () => {
    expect(deliveryPin("DELAYED", "2026-01-05", "2026-01-05")).toBe("red");
    expect(deliveryPin("RECEIVED", "2026-01-05", "2026-01-05")).toBe("green");
    expect(deliveryPin("COMMITTED", "2026-01-06", "2026-01-05")).toBe("amber");
    expect(deliveryPin("COMMITTED", "2026-01-09", "2026-01-05")).toBe("blue");
  });
});

describe("stock and racks", () => {
  it("grows a pallet with on hand on a log scale, empty when nothing is there", () => {
    expect([0, 1, 9, 99, 1e9].map(stackLayers)).toEqual([0, 1, 2, 4, 6]);
    expect(rackSlots(0, 100)).toBe(0);
    expect(rackSlots(50, 100)).toBe(6);
    expect(rackSlots(500, 100)).toBe(12);
    expect(rackSlots(5, 0)).toBe(12);  // no capacity reported: shown full rather than invented space
  });
});

describe("labelledHouses (FE-32)", () => {
  const { houses } = makeLayout(100);
  const far: [number, number, number] = [0, 600, 0];

  it("shows no names from afar except open orders, hovered and selected houses", () => {
    expect(labelledHouses(houses, new Set([3, 40]), far, 7, 12)).toEqual([3, 7, 12, 40]);
  });

  it("shows the nearest houses when zoomed in, at most 24", () => {
    const h = houses[50];
    const shown = labelledHouses(houses, new Set(), [h.x, 60, h.z], null, null);
    expect(shown).toContain(50);
    expect(shown.length).toBeLessThanOrEqual(24);
    for (const i of shown) expect(Math.hypot(houses[i].x - h.x, 60, houses[i].z - h.z)).toBeLessThan(LABEL_NEAR);
  });
});
