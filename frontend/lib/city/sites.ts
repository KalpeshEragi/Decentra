// The City's Sites (FE-21, FE-34) and where each agent's office stands. Positions are in world units (x east, z south).

export type SiteKey = "CITY" | "SQUARE" | "SALES" | "PLANNING" | "PURCHASING" | "HR" | "WAREHOUSE" |
  "FACTORY" | "SUPPLIERS" | "CUSTOMERS";

/** One entry of the site switcher: where the camera looks, how far away, and an optional fixed angle (degrees). */
export type Site = { key: SiteKey; label: string; at: [number, number, number]; dist: number; az?: number; polar?: number };

export const SITES: Site[] = [
  { key: "CITY", label: "Whole City", at: [55, 0, -5], dist: 600 },
  { key: "SQUARE", label: "Town Square", at: [0, 16, 0], dist: 120, az: -8, polar: 62 },  // low, facing one side of the board (FE-36)
  { key: "SALES", label: "Sales", at: [-58, 0, -58], dist: 110 },
  { key: "PLANNING", label: "Planning", at: [58, 0, -58], dist: 125 },
  { key: "PURCHASING", label: "Purchasing", at: [58, 0, 58], dist: 110 },
  { key: "HR", label: "HR", at: [-58, 0, 58], dist: 110 },
  { key: "WAREHOUSE", label: "Warehouse", at: [151, 0, 26], dist: 190 },
  { key: "FACTORY", label: "Factory", at: [150, 0, -58], dist: 130 },
  { key: "SUPPLIERS", label: "Supplier depots", at: [300, 0, -28], dist: 190 },
  { key: "CUSTOMERS", label: "Customer neighbourhood", at: [-185, 0, 0], dist: 170 },
];

export const siteOf = (key: SiteKey): Site => SITES.find((s) => s.key === key) ?? SITES[0];

/** Where each agent's office stands: activity by an agent is shown (pulse, camera) at its office.
 *  Inventory's and Warehouse's offices are attached to the warehouse (FE-16); the simulator shows at the square. */
export const OFFICE_AT: Record<string, [number, number, number]> = {
  SALES: [-58, 0, -58], PLANNING: [58, 0, -58], PURCHASING: [58, 0, 58], HR: [-58, 0, 58],
  WAREHOUSE: [106, 0, 3], INVENTORY: [192, 0, -5], SIMULATOR_CLOCK: [0, 0, -2],
};
export const officeAt = (code: string | undefined): [number, number, number] => OFFICE_AT[code ?? ""] ?? OFFICE_AT.SIMULATOR_CLOCK;
