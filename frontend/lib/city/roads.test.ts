import { describe, expect, it } from "vitest";
import { GATE, HIGHWAY_Z, makeLayout, onRoad, Point, routeLength, Seg } from "./cityLayout";
import { roadRoute } from "./roads";

/** Every leg between the join and leave points follows one road: axis-aligned and on the road all along. */
function staysOnRoads(roads: Seg[], route: Point[]) {
  for (let i = 2; i < route.length - 1; i++) {
    const [a, b] = [route[i - 1], route[i]];
    if (a[0] !== b[0] && a[1] !== b[1]) return false;
    for (let f = 0; f <= 1; f += 0.1) if (!onRoad(roads, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)) return false;
  }
  return true;
}

describe("roadRoute", () => {
  const { roads } = makeLayout(60);

  it("takes a supplier truck from the gate to the warehouse along the roads", () => {
    const from: Point = [GATE.x - 4, HIGHWAY_Z], to: Point = [150, 20];
    const route = roadRoute(roads, from, to)!;
    expect(route[0]).toEqual(from);
    expect(route.at(-1)).toEqual(to);
    expect(staysOnRoads(roads, route)).toBe(true);
  });

  it("finds the short way, not just any way", () => {
    const route = roadRoute(roads, [-88, -60], [-28, -60])!;
    // along the north road and back down: 28 + 60 + 28, never round the far side of the city
    expect(routeLength(route)).toBeCloseTo(116, 5);
  });

  it("joins the network from off-road places and reaches the neighbourhood", () => {
    const route = roadRoute(roads, [-58, -50], [-300, 20])!;
    expect(staysOnRoads(roads, route)).toBe(true);
    expect(route.length).toBeGreaterThan(3);
  });

  it("turns at a crossing where neither road ends", () => {
    const plus: Seg[] = [{ x1: -10, z1: 0, x2: 10, z2: 0, w: 4 }, { x1: 0, z1: -10, x2: 0, z2: 10, w: 4 }];
    expect(roadRoute(plus, [-10, 0], [0, 10])).toEqual([[-10, 0], [0, 0], [0, 10]]);
  });

  it("lists only the turns", () => {
    const route = roadRoute(roads, [-88, -80], [-88, 80])!;
    expect(route).toEqual([[-88, -80], [-88, 80]]);
  });

  it("is deterministic and says when no road connects two places", () => {
    expect(roadRoute(roads, [300, 0], [-100, 50])).toEqual(roadRoute(roads, [300, 0], [-100, 50]));
    const islands: Seg[] = [{ x1: 0, z1: 0, x2: 10, z2: 0, w: 4 }, { x1: 50, z1: 50, x2: 60, z2: 50, w: 4 }];
    expect(roadRoute(islands, [0, 0], [60, 50])).toBeNull();
    expect(roadRoute([], [0, 0], [1, 1])).toBeNull();
  });
});
