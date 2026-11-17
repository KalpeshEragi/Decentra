import { describe, expect, it } from "vitest";
import { CORE, GATE, houseRoute, inRect, makeLayout, onRoad, PER_BLOCK, Rect, SALES_DOOR, SUPPLIER_PLOTS } from "./cityLayout";

const contains = (outer: Rect, inner: Rect) => outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];

describe("growth rule (FE-46)", () => {
  it("gives one house per customer, 12 to a block", () => {
    expect(makeLayout(0).houses).toHaveLength(0);
    expect(makeLayout(12).blocks).toHaveLength(1);
    expect(makeLayout(13).blocks).toHaveLength(2);
    expect(makeLayout(500).houses).toHaveLength(500);
    expect(makeLayout(500).blocks).toHaveLength(Math.ceil(500 / PER_BLOCK));
  });

  it("never moves a house, block or road when more customers arrive", () => {
    const small = makeLayout(37), big = makeLayout(600);
    expect(big.houses.slice(0, 37)).toEqual(small.houses);
    expect(big.blocks.slice(0, small.blocks.length)).toEqual(small.blocks);
  });

  it("only grows the fences, which always hold everything", () => {
    let prev = makeLayout(1);
    for (const n of [12, 13, 60, 61, 200, 500, 3000]) {
      const l = makeLayout(n);
      expect(contains(l.hood, prev.hood) && contains(l.city, prev.city)).toBe(true);
      for (const b of l.blocks) expect(contains(l.hood, b)).toBe(true);
      expect(contains(l.city, l.hood) && contains(l.city, CORE)).toBe(true);
      for (const p of SUPPLIER_PLOTS) expect(contains(l.city, p)).toBe(true);
      expect(l.city[2]).toBe(GATE.x);  // the supplier gate stays in the east fence
      prev = l;
    }
  });

  it("opens blocks nearest first, west of the city, at most two rows from the avenue", () => {
    const { blocks } = makeLayout(2000);
    const centre = (b: Rect) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    expect(centre(blocks[1])[1]).toBe(0);  // the second block continues the avenue westwards
    for (const b of blocks) {
      expect(b[2]).toBeLessThan(CORE[0]);
      expect(Math.abs(centre(b)[1])).toBeLessThanOrEqual(2 * 74);
    }
  });

  it("puts every house on its own plot", () => {
    const { houses } = makeLayout(500);
    const spots = new Set(houses.map((h) => `${h.x},${h.z}`));
    expect(spots.size).toBe(500);
  });
});

describe("houseRoute", () => {
  it("runs from the front door along the roads to the Sales office", () => {
    const l = makeLayout(500);
    for (const h of [l.houses[0], l.houses[11], l.houses[13], l.houses[250], l.houses[499]]) {
      const route = houseRoute(h);
      // first point is the door, the last two are inside the Sales plot; every turn in between is on a road
      for (const [x, z] of route.slice(1, -2)) expect(onRoad(l.roads, x, z)).toBe(true);
      expect(inRect(route.at(-1)![0], route.at(-1)![1], [SALES_DOOR[0] - 6, SALES_DOOR[1] - 1, SALES_DOOR[0] + 6, SALES_DOOR[1] + 1])).toBe(true);
      // the road legs are straight along x or z
      for (let i = 1; i < route.length - 2; i++) {
        const [a, b] = [route[i - 1], route[i]];
        expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
      }
    }
  });
});
