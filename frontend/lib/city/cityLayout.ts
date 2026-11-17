// The City layout as pure functions of the number of customers, so the City can grow without limit (FE-32, FE-46).
//
// Growth rule (deterministic: a reload never moves anyone):
// - Customers get houses in creation order. 12 houses make one block (two rows of 6 on a street).
// - Blocks are placed west of the main city, nearest first: ring by ring around block 0 (rows at most 2 away from
//   the customer avenue, columns going west), so the neighbourhood stays compact.
// - The neighbourhood fence is the box around all blocks; the City fence is the box around the main city, the
//   supplier depots and the neighbourhood. Both only grow when a new block opens; nothing placed ever moves.
// - Roads grow with it: the customer avenue runs west through every column, a lane between columns links the rows,
//   and each block off the avenue has its own street to that lane.

export type Rect = [number, number, number, number];  // x0, z0, x1, z1
/** One straight road, always along x or along z; `w` is its width. */
export type Seg = { x1: number; z1: number; x2: number; z2: number; w: number };
export type House = { idx: number; x: number; z: number; rot: number; design: number; street: number; lane: number };
export type Point = [number, number];  // x, z

export const CORE: Rect = [-96, -96, 224, 96];                 // the paved main city
export const SUPPLIER_PLOTS: Rect[] = [[262, -100, 338, -42], [262, -14, 338, 44]];  // both sides of the highway (FE-44)
export const HIGHWAY_Z = -28;
export const GATE = { x: 360, z0: -38, z1: -18 };              // the supplier entry gate in the east fence (FE-43)
export const SALES_DOOR: Point = [-58, -43];                   // where customers wait, in front of the Sales office
export const SALES_GATE: Point = [-54, -36];                   // the gap in the Sales plot fence (FE-41)

/** Agent office plots (each fenced, one people gap on its south side at `gateX`, FE-41). */
export const PLOTS: Record<"SALES" | "PLANNING" | "HR" | "PURCHASING", { rect: Rect; gateX: number }> = {
  SALES: { rect: [-80, -80, -36, -36], gateX: -54 },
  PLANNING: { rect: [36, -80, 80, -36], gateX: 52 },
  HR: { rect: [-80, 36, -36, 80], gateX: -50 },
  PURCHASING: { rect: [36, 36, 82, 80], gateX: 63 },
};
export const WAREHOUSE_SITE: Rect = [96, -22, 207, 80];        // warehouse, Inventory and Warehouse offices, docks
export const FACTORY_PLOT: Rect = [115, -76, 185, -40];
export const PLAZA: Rect = [-24, -24, 24, 24];                 // the Town Square (open, no fence)
export const PARKS: Rect[] = [[-22, -82, 22, -34], [-22, 34, 22, 82], [-82, -22, -34, 22], [34, -22, 82, 22]];

export const PER_BLOCK = 12;
export const HOUSE_DESIGNS = 8;
const BLOCK_W = 74, BLOCK_D = 60, GAP_X = 14, GAP_Z = 14, MAX_ROW = 2;
const COL0_X = -185;

export const inRect = (x: number, z: number, [x0, z0, x1, z1]: Rect, m = 0) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m;

/** Block slots ordered nearest-first around block 0 (column 0, row 0); rows limited to ±MAX_ROW. */
function blockSlots(n: number): { col: number; row: number }[] {
  const out: { col: number; row: number; key: number[] }[] = [];
  const rows = [0, -1, 1, -2, 2].filter((r) => Math.abs(r) <= MAX_ROW);
  const cols = Math.ceil(n / rows.length) + MAX_ROW + 1;  // enough columns for every ring that n blocks can reach
  for (let col = 0; col < cols; col++)
    for (const row of rows) out.push({ col, row, key: [Math.max(col, Math.abs(row)), Math.abs(row), col] });
  out.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);
  return out.slice(0, n).map(({ col, row }) => ({ col, row }));
}

export type Layout = { city: Rect; hood: Rect; blocks: Rect[]; houses: House[]; roads: Seg[]; customers: number };

export function makeLayout(customers: number): Layout {
  const nBlocks = Math.max(1, Math.ceil(customers / PER_BLOCK));
  const slots = blockSlots(nBlocks);
  const cx = (col: number) => COL0_X - col * (BLOCK_W + GAP_X);
  const cz = (row: number) => row * (BLOCK_D + GAP_Z);
  const blocks = slots.map(({ col, row }) => [cx(col) - BLOCK_W / 2, cz(row) - BLOCK_D / 2, cx(col) + BLOCK_W / 2, cz(row) + BLOCK_D / 2] as Rect);

  // houses: two rows of 6 facing the block's street (the avenue for row 0)
  const houses: House[] = [];
  slots.forEach(({ col, row }, b) => {
    for (let i = 0; i < PER_BLOCK && houses.length < customers; i++) {
      const side = i < 6 ? -1 : 1, lot = i % 6;
      const idx = b * PER_BLOCK + i;
      houses.push({ idx, x: cx(col) - BLOCK_W / 2 + 7 + lot * 12, z: cz(row) + side * 15, rot: side < 0 ? 0 : Math.PI,
        design: (idx * 7 + 3) % HOUSE_DESIGNS, street: cz(row), lane: cx(col) - BLOCK_W / 2 - GAP_X / 2 });
    }
  });

  const maxCol = Math.max(...slots.map((s) => s.col));
  const hood: Rect = [cx(maxCol) - BLOCK_W / 2 - GAP_X, Math.min(...blocks.map((b) => b[1])) - 4,
    COL0_X + BLOCK_W / 2 + 4, Math.max(...blocks.map((b) => b[3])) + 4];

  const roads: Seg[] = [
    { x1: -88, z1: -88, x2: -88, z2: 88, w: 12 }, { x1: -28, z1: -88, x2: -28, z2: 88, w: 12 },
    { x1: 28, z1: -88, x2: 28, z2: 88, w: 12 }, { x1: 88, z1: -88, x2: 88, z2: -28, w: 12 },
    { x1: 216, z1: -88, x2: 216, z2: 88, w: 12 },
    { x1: -88, z1: -88, x2: 216, z2: -88, w: 12 }, { x1: -88, z1: 88, x2: 216, z2: 88, w: 12 },
    { x1: -88, z1: 28, x2: 28, z2: 28, w: 12 },
    { x1: -88, z1: HIGHWAY_Z, x2: GATE.x - 1, z2: HIGHWAY_Z, w: 16 },           // ends at the supplier gate, inside the fence
    { x1: cx(maxCol) - BLOCK_W / 2 - GAP_X / 2, z1: 0, x2: -88, z2: 0, w: 10 },  // customer avenue through every column
  ];
  for (let col = 0; col <= maxCol; col++) {
    const rows = slots.filter((s) => s.col === col).map((s) => s.row);
    const lane = cx(col) - BLOCK_W / 2 - GAP_X / 2;
    if (rows.some((r) => r !== 0)) roads.push({ x1: lane, z1: cz(Math.min(0, ...rows)), x2: lane, z2: cz(Math.max(0, ...rows)), w: 8 });
    for (const row of rows) if (row !== 0) roads.push({ x1: lane, z1: cz(row), x2: cx(col) + BLOCK_W / 2 - 4, z2: cz(row), w: 8 });
  }

  const city: Rect = [Math.min(-250, hood[0] - 22), Math.min(-130, hood[1] - 18), GATE.x, Math.max(115, hood[3] + 16)];
  return { city, hood, blocks, houses, roads, customers };
}

/** The owner's spot at the front door (the same one the neighbourhood draws). */
export function doorOf(h: House): Point {
  const c = Math.cos(h.rot), s = Math.sin(h.rot);
  return [h.x - c + 5.2 * s, h.z + s + 5.2 * c];
}

/** From the front door to the Sales office along the roads: the block's street, its lane, the customer avenue, the
 *  west road, the highway, the Sales plot gate. `slot` spreads waiting customers side by side. */
export function houseRoute(h: House, slot = 0): Point[] {
  const door = doorOf(h), [sx, sz] = SALES_DOOR, [gx, gz] = SALES_GATE;
  const toAvenue: Point[] = h.street === 0 ? [] : [[h.lane, h.street], [h.lane, 0]];
  return [door, [door[0], h.street], ...toAvenue, [-88, 0], [-88, HIGHWAY_Z], [gx, HIGHWAY_Z], [gx, gz - 2], [sx + (slot - 2) * 2.4, sz]];
}

export const routeLength = (route: Point[]) => route.slice(1).reduce((sum, [x, z], i) => sum + Math.hypot(x - route[i][0], z - route[i][1]), 0);

/** Is (x, z) on a road (within its half width plus a kerb of 1.2, plus margin `m`)? */
export function onRoad(roads: Seg[], x: number, z: number, m = 0) {
  return roads.some((r) => {
    const h = r.w / 2 + 1.2 + m;
    return r.x1 === r.x2 ? Math.abs(x - r.x1) < h && z > Math.min(r.z1, r.z2) - h && z < Math.max(r.z1, r.z2) + h
      : Math.abs(z - r.z1) < h && x > Math.min(r.x1, r.x2) - h && x < Math.max(r.x1, r.x2) + h;
  });
}
