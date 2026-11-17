import { describe, expect, it } from "vitest";
import { inRect, makeLayout, onRoad, PARKS, PLAZA, PLOTS } from "./cityLayout";
import { campusPlants, lampSpots } from "./planting";
import { connectionOf } from "./connection";

describe("planting (FE-40, FE-42)", () => {
  for (const n of [0, 100, 500]) it(`keeps plants off roads and the square, inside the fence, no trees in the parks (${n} customers)`, () => {
    const L = makeLayout(n);
    const campus = campusPlants(L);
    for (const { x, z, y } of campus) {
      expect(onRoad(L.roads, x, z)).toBe(false);
      if (!y) expect(inRect(x, z, PLAZA)).toBe(false);  // only the square's raised planters stand on it
      expect(inRect(x, z, L.city)).toBe(true);
    }
    // the parks are where the agents read the events: open lawn, no trees; no plants near the customer houses
    for (const { x, z } of campus) expect(inRect(x, z, L.hood, 20)).toBe(false);
    for (const { x, z, kind } of campus) if (kind === "oak") expect(PARKS.some((p) => inRect(x, z, p))).toBe(false);
    // the people gap of every office plot stays free (hedges and bushes included)
    for (const p of Object.values(PLOTS))
      expect(campus.some(({ x, z }) => Math.abs(x - p.gateX) < 3 && Math.abs(z - p.rect[3]) < 2.5)).toBe(false);
  });

  it("plants the same trees on every load, and more lamps as the avenue grows", () => {
    expect(campusPlants(makeLayout(60))).toEqual(campusPlants(makeLayout(60)));
    expect(lampSpots(makeLayout(500)).length).toBeGreaterThan(lampSpots(makeLayout(10)).length);
  });
});

describe("connectionOf", () => {
  it("is connecting before the first answer, live after it", () => {
    expect(connectionOf(null, null, 0).kind).toBe("connecting");
    expect(connectionOf(null, 1000, 2000).kind).toBe("live");
  });

  it("says how old the shown picture is when the backend stops answering", () => {
    expect(connectionOf("timeout", null, 5000)).toMatchObject({ kind: "offline", text: expect.stringContaining("timeout") });
    expect(connectionOf("timeout", 1000, 46_000)).toMatchObject({ kind: "offline", text: expect.stringContaining("45 s ago") });
    expect(connectionOf("timeout", 0, 180_000)).toMatchObject({ text: expect.stringContaining("3 min ago") });
  });
});
