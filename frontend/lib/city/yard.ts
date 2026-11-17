// Where things stand on the warehouse and factory Sites, and the yard roads that join them to the City's roads.
// The scene draws from these numbers and the forklift trips and dock trucks (forklifts.ts) drive to them, so a load is
// always set down where its rack, pallet, door or line is drawn. Pure: no React, no Three.js.

import { FACTORY_PLOT, GATE, HIGHWAY_Z, Point, Seg } from "./cityLayout";

// ---- warehouse hall and dock doors ----------------------------------------------------------------------------------

export const HALL = { x: 149, z: 0, w: 74, d: 32, h: 13 };
export const DOCK_FRONT = HALL.z + HALL.d / 2;            // the dock side of the hall, facing the yard
export const TRUCK_REAR_Z = DOCK_FRONT + 2.2;             // a docked truck's rear end (its cab points south)

/** x of dock door `i` of `doors`, spread evenly along the hall front. */
export const doorX = (i: number, doors: number) => HALL.x - HALL.w / 2 + 6 + (i * (HALL.w - 12)) / Math.max(1, doors - 1);
/** Where a forklift loads or unloads a docked truck: beside its trailer, at the door. */
export const doorSpot = (i: number, doors: number): Point => [doorX(i, doors) + 3.5, DOCK_FRONT + 1.5];

// ---- storage: zone racks (west yard) and stock pallets (east yard) --------------------------------------------------

export const MAX_RACKS = 6, MAX_PALLETS = 24;
export const rackAt = (i: number): Point => [108 + (i % 3) * 13, 44 + Math.floor(i / 3) * 10];
export const palletAt = (i: number): Point => [150 + (i % 6) * 6.5, 40 + Math.floor(i / 6) * 7.5];
/** A forklift's spot at a rack or pallet: in the aisle beside it, so the rows in front never block the way. */
export const rackSpot = (i: number): Point => { const [x, z] = rackAt(i); return [x + 6.3, z]; };
export const palletSpot = (i: number): Point => { const [x, z] = palletAt(i); return [x + 3.25, z]; };

// ---- forklift charging bay ------------------------------------------------------------------------------------------

export const FORKLIFTS = 3;  // a display choice, not business data (FE-52)
export const bayAt = (i: number): Point => [103 + i * 3.2, 31];

// ---- factory lines --------------------------------------------------------------------------------------------------

const [FX0, FZ0, FX1, FZ1] = FACTORY_PLOT;
export const FACTORY = { cx: (FX0 + FX1) / 2, cz: (FZ0 + FZ1) / 2, w: FX1 - FX0 - 6, d: FZ1 - FZ0 - 6, gateZ: FZ1 };
/** z of line `i` of `n` inside the open hall. */
export const lineZ = (i: number, n: number) => FZ0 + 9 + i * Math.min(10, (FACTORY.d - 8) / Math.max(1, n - 1));
/** Where a forklift stops at a line: at its east end, past the line light. */
export const lineSpot = (i: number, n: number): Point => [FX1 - 4.5, lineZ(i, n)];

// ---- yard roads and the ends of truck trips -------------------------------------------------------------------------

const APRON_Z = 36.5;                 // between the docked trucks and the racks and pallets
const EAST_LANE_X = 201, GATE_LANE_X = 145, FACTORY_AISLE_Z = FZ1 - 6;
export const YARD_ROADS: Seg[] = [
  { x1: 103, z1: APRON_Z, x2: EAST_LANE_X, z2: APRON_Z, w: 6 },                 // the apron in front of the docks
  { x1: EAST_LANE_X, z1: HIGHWAY_Z, x2: EAST_LANE_X, z2: APRON_Z, w: 6 },       // to the highway, through the north gap
  { x1: GATE_LANE_X, z1: APRON_Z, x2: GATE_LANE_X, z2: 88, w: 6 },              // to the street, through the truck gate
  { x1: FACTORY.cx, z1: HIGHWAY_Z, x2: FACTORY.cx, z2: FACTORY_AISLE_Z, w: 5 }, // into the factory through its gate
  { x1: FACTORY.cx, z1: FACTORY_AISLE_Z, x2: FX1 - 4.5, z2: FACTORY_AISLE_Z, w: 4 },  // the aisle to the line ends
];
/** The warehouse Site fence gap the east lane uses (north side, x from..to). */
export const NORTH_GAP = { from: EAST_LANE_X - 5, to: EAST_LANE_X + 5 };

export const SUPPLIER_ENTRY: Point = [GATE.x - 1, HIGHWAY_Z];  // where supplier trucks enter the City
export const CUSTOMER_EXIT: Point = [-100, 0];                 // shipments leave along the customer avenue
