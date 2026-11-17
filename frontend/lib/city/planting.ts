// Where plants and street lamps stand (FE-40, FE-42). Inside the City fence the planting follows a company campus:
// trees in clusters on the open land and along the fence, a few along the main streets, open park lawns (where the
// agents read the events, so no trees there) edged by a continuous low hedge, bushes and flower beds. Outside the fence
// only the meadow for now (the developer chooses what grows there later). Seeded, so the same layout always plants the
// same things.

import { CORE, FACTORY_PLOT, GATE, HIGHWAY_Z, inRect, Layout, onRoad, PARKS, PLAZA, PLOTS, Rect, SUPPLIER_PLOTS, WAREHOUSE_SITE } from "./cityLayout";

/** What grows: the campus oak and the low plants. */
export type PlantKind = "oak" | "bush" | "hedge" | "flowers" | "grass";
/** One plant: where (y = the height it stands on, 0 = ground), its size, and its heading (radians about y). */
export type Plant = { kind: PlantKind; x: number; z: number; s: number; rot: number; y?: number };

/** A small seeded random number generator (0..1), so scenery is the same on every load. Any whole-number seed works,
 *  negative ones too (the state starts in 0..233279; for a positive seed the numbers are the same as before). */
export function seeded(n: number) {
  let s = (((n * 9301 + 49297) % 233280) + 233280) % 233280;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/** Paved or built ground outside the main city: the depot yards and the neighbourhood blocks. */
const paved = (L: Layout, x: number, z: number) =>
  SUPPLIER_PLOTS.some((p) => inRect(x, z, p)) || L.blocks.some((b) => inRect(x, z, b, 1));

/** The low round lawn in the middle of each park, where the agents stand to read the events: radius, top height. */
export const PARK_CIRCLE_R = 4.3, PARK_CIRCLE_TOP = 0.3;

/** Meadow ground where grass tufts grow: everywhere outside the main city (the park and office lawns stay smooth),
 *  except roads and paved ground. */
export const grassGround = (L: Layout, x: number, z: number) =>
  !inRect(x, z, CORE) && !onRoad(L.roads, x, z, 1) && !paved(L, x, z);

/** No trees, bushes or flowers within this distance of the customer neighbourhood: the houses stand in open meadow. */
const HOOD_CLEAR = 25;

/** Places where no free-standing campus tree may stand: plots, the square, roads, the depot yards, the neighbourhood,
 *  the gate. (Plants inside parks and office plots are placed by their own rules.) */
export function blocked(L: Layout, x: number, z: number) {
  return inRect(x, z, PLAZA, 2) || inRect(x, z, WAREHOUSE_SITE, 3) || inRect(x, z, FACTORY_PLOT, 3)
    || Object.values(PLOTS).some((p) => inRect(x, z, p.rect, -1)) || PARKS.some((p) => inRect(x, z, p, -1)) || onRoad(L.roads, x, z, 0.5)
    || SUPPLIER_PLOTS.some((p) => inRect(x, z, p, 3)) || inRect(x, z, L.hood, 2) || inRect(x, z, [GATE.x - 30, GATE.z0 - 12, GATE.x, GATE.z1 + 12]);
}

const HEDGE_LEN = 1.94;  // the hedge model's length (m) at scale 1
/** Neighbouring hedge pieces overlap by this share of their length: the model's rounded ends then meet in one
 *  continuous row instead of showing a seam between pieces. */
const HEDGE_OVERLAP = 0.2;

/** A straight hedge from a to b (along x or z), in equal overlapping pieces, leaving out the gaps [from, to] along
 *  its axis (where a path crosses it). */
function hedgeLine(out: Plant[], a: [number, number], b: [number, number], gaps: [number, number][] = []) {
  const alongX = a[1] === b[1], lo = alongX ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]), hi = alongX ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]);
  const runs: [number, number][] = []; let cur = lo;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > cur) runs.push([cur, g0]); cur = Math.max(cur, g1); }
  if (cur < hi) runs.push([cur, hi]);
  for (const [p, q] of runs) {
    const piece = HEDGE_LEN * (1 - HEDGE_OVERLAP), n = Math.max(1, Math.ceil((q - p) / piece)), step = (q - p) / n;
    for (let k = 0; k < n; k++) {
      const t = p + step * (k + 0.5);
      out.push({ kind: "hedge", x: alongX ? t : a[0], z: alongX ? a[1] : t, s: step / piece, rot: alongX ? 0 : Math.PI / 2 });
    }
  }
}

/** The part of a lawn clear of the roads and their kerbs (some roads run over a lawn's edge). */
function clearOfRoads(L: Layout, [x0, z0, x1, z1]: Rect): Rect {
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, hit = (x: number, z: number) => onRoad(L.roads, x, z, 0.4);
  while (hit(mx, z0) && z0 < mz) z0 += 0.5;
  while (hit(mx, z1) && z1 > mz) z1 -= 0.5;
  while (hit(x0, mz) && x0 < mx) x0 += 0.5;
  while (hit(x1, mz) && x1 > mx) x1 -= 0.5;
  return [x0, z0, x1, z1];
}

/** Inside the fence: every position is computed; only size, heading and the grass around trees are jittered. */
export function campusPlants(L: Layout): Plant[] {
  const out: Plant[] = [], r = seeded(5), [cx0, cz0, cx1, cz1] = L.city;
  const plant = (kind: PlantKind, x: number, z: number, s: number, y?: number) =>
    out.push({ kind, x, z, s: s * (0.92 + r() * 0.16), rot: r() * Math.PI * 2, ...(y ? { y } : {}) });
  const tuftsAround = (x: number, z: number, n: number, reach: number) => {
    for (let k = 0; k < n; k++) { const a = r() * Math.PI * 2, d = 1.2 + r() * reach; plant("grass", x + Math.cos(a) * d, z + Math.sin(a) * d, 2.2); }
  };
  const crossings = L.roads.flatMap((a) => L.roads.filter((b) => b !== a)
    .map((b) => (a.x1 === a.x2 && b.z1 === b.z2 ? [a.x1, b.z1] : null)).filter((p): p is number[] => !!p));

  // 1. a few street trees along the main roads: wide spacing, clear of junctions, so buildings stay in view
  for (const s of L.roads) {
    if (s.w < 10) continue;
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1), dx = (s.x2 - s.x1) / len, dz = (s.z2 - s.z1) / len, off = s.w / 2 + 3.4;
    for (let t = 6; t <= len; t += 24) for (const side of [-1, 1]) {
      const x = s.x1 + dx * t - dz * off * side, z = s.z1 + dz * t + dx * off * side;
      if (!inRect(x, z, [cx0 + 4, cz0 + 4, cx1 - 4, cz1 - 4])) continue;
      if (crossings.some(([px, pz]) => Math.abs(x - px) < 16 && Math.abs(z - pz) < 16) || blocked(L, x, z)) continue;
      plant("oak", x, z, 0.85);
    }
  }

  // 2. parks: an open lawn (no trees: the agents come here to read the events) edged by one continuous low hedge,
  //    corners joined, open only where the cross paths come in; bushes at the path ends, flowers round the planter
  PARKS.forEach((park) => {
    const mx = (park[0] + park[2]) / 2, mz = (park[1] + park[3]) / 2, [x0, z0, x1, z1] = clearOfRoads(L, park), e = 1.4, path: [number, number][] = [[mx - 2.5, mx + 2.5]], pathZ: [number, number][] = [[mz - 2.5, mz + 2.5]];
    hedgeLine(out, [x0 + e, z0 + e], [x1 - e, z0 + e], path); hedgeLine(out, [x0 + e, z1 - e], [x1 - e, z1 - e], path);
    hedgeLine(out, [x0 + e, z0 + e], [x0 + e, z1 - e], pathZ); hedgeLine(out, [x1 - e, z0 + e], [x1 - e, z1 - e], pathZ);
    for (const [x, z] of [[mx - 4, z0 + 3.5], [mx + 4, z0 + 3.5], [mx - 4, z1 - 3.5], [mx + 4, z1 - 3.5],
      [x0 + 3.5, mz - 4], [x0 + 3.5, mz + 4], [x1 - 3.5, mz - 4], [x1 - 3.5, mz + 4]]) plant("bush", x, z, 1.3);
    for (let a = 0; a < 4; a++) for (let k = 0; k < 3; k++) {  // a quarter ring in each corner between the paths
      const t = (a + 0.25 + k * 0.25) * (Math.PI / 2);
      plant("flowers", mx + Math.cos(t) * 6, mz + Math.sin(t) * 6, 1.5);
    }
  });

  // 3. office plots: bushes either side of the gate, a flower bed in the front garden, a small tree in each back corner
  for (const p of Object.values(PLOTS)) {
    const [x0, z0, x1, z1] = p.rect, g = p.gateX;
    plant("bush", g - 3.8, z1 - 1.6, 1.3); plant("bush", g + 3.8, z1 - 1.6, 1.3);
    for (let x = x0 + 4; x <= x1 - 4; x += 1.6) if (Math.abs(x - g) > 12) plant("flowers", x, z1 - 4.4, 1.4);
    for (const x of [x0 + 3.5, x1 - 3.5]) { plant("oak", x, z0 + 3.5, 0.6); tuftsAround(x, z0 + 3.5, 3, 1.5); }
  }

  // 4. the Town Square's four planters: a big round bush on each
  for (const [x, z] of [[-18, 18], [18, 18], [-18, -18], [18, -18]]) plant("bush", x, z, 2.3, 1);

  // 5. the open land between the main city and the outlying plots: a cluster of three on a wide grid
  let n = 0;
  for (let x = cx0 + 22; x <= cx1 - 22; x += 54) for (let z = cz0 + 20; z <= cz1 - 20; z += 54) {
    if (inRect(x, z, CORE, 8) || blocked(L, x, z) || inRect(x, z, L.hood, 8) || onRoad(L.roads, x, z, 8)) continue;
    n++;
    for (const [dx, dz, k] of [[-2.8, -1.8, 0], [2.9, -1.2, 1], [0.2, 3.1, 2]]) if (!(n % 3 === 0 && k === 2)) plant("oak", x + dx, z + dz, 0.95);
    tuftsAround(x, z, 6, 5);
  }

  // 6. a sparse belt just inside the City fence, leaving the supplier gate free
  for (let x = cx0 + 8, k = 0; x <= cx1 - 8; x += 26, k++) for (const z of [cz0 + 5, cz1 - 4])
    if (!onRoad(L.roads, x, z, 2)) plant("oak", x, z, 1);
  for (let z = cz0 + 18; z <= cz1 - 18; z += 26) for (const x of [cx0 + 5, cx1 - 6])
    if (!onRoad(L.roads, x, z, 2) && !(z > GATE.z0 - 10 && z < GATE.z1 + 10)) plant("oak", x, z, 1);

  // the customer neighbourhood stays clear of plants (the developer's choice, 2026-11-16)
  return out.filter((p) => !inRect(p.x, p.z, L.hood, HOOD_CLEAR));
}

/** Street lamps: around the Town Square, along the highway, the south edge, the main north–south roads and the
 *  customer avenue (which grows with the neighbourhood). Their heads glow at night (FE-24). */
export function lampSpots(L: Layout): LampSpot[] {
  const out: [number, number][] = [];
  for (const z of [-22, -8, 8, 22]) out.push([-23.5, z], [23.5, z]);
  for (const x of [-8, 8]) out.push([x, -23.5], [x, 23.5]);
  for (let x = 100; x < GATE.x - 10; x += 22) out.push([x, HIGHWAY_Z - 9.5]);
  for (let x = -80; x <= 210; x += 24) out.push([x, 95.5]);
  for (const x of [-88, -28, 28]) for (let z = -78; z <= 78; z += 24) if (Math.abs(z) > 34) out.push([x + 7.5, z]);
  for (let x = -100; x > L.hood[0]; x -= 22) out.push([x, -7.5]);
  return out.map(([x, z]) => [x, z, facingRoad(L, x, z)]);
}

/** x, z and the heading (radians about y) that turns a lamp's arm, built along +z, over the nearest road. */
export type LampSpot = [number, number, number];

/** The heading from (x, z) to the nearest point of the nearest road: rotating +z by it points at that road. */
export function facingRoad(L: Layout, x: number, z: number) {
  let best = Infinity, heading = 0;
  for (const r of L.roads) {
    const nx = Math.min(Math.max(x, Math.min(r.x1, r.x2)), Math.max(r.x1, r.x2));
    const nz = Math.min(Math.max(z, Math.min(r.z1, r.z2)), Math.max(r.z1, r.z2));
    const d = Math.hypot(nx - x, nz - z);
    if (d > 0 && d < best) { best = d; heading = Math.atan2(nx - x, nz - z); }
  }
  return heading;
}

