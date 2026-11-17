import { describe, expect, it } from "vitest";
import { makeLayout } from "./cityLayout";
import { addWalks, BATCH_MS, Customer, MAX_WALKERS, newInquiries, pointAlong, WAIT_MS, walkEnd, walkState } from "./customerWalks";

const customer = (i: number, inquiries: number, at = `2026-11-09T10:${String(i).padStart(2, "0")}:00Z`): Customer => ({
  id: `c${i}`, name: null, label: `Customer ${i + 1}`, created_at: "", has_open_order: false, open_orders: [],
  inquiry_count: inquiries, latest_inquiry: inquiries ? { id: `q${i}`, stage: "OPEN", created_at: at, product: null, quantity: null } : null });

const houses = makeLayout(100).houses;

describe("newInquiries", () => {
  it("treats the first snapshot as the baseline, not as news (FE-12)", () => {
    const { arrivals, next } = newInquiries(null, [customer(0, 3)]);
    expect(arrivals).toEqual([]);
    expect(next.get("c0")).toBe(3);
  });

  it("reports how much each count rose, in the real order of the inquiries", () => {
    const seen = new Map([["c0", 1], ["c1", 0]]);
    const later = customer(0, 3, "2026-11-09T10:30:00Z"), earlier = customer(1, 1, "2026-11-09T10:10:00Z");
    const { arrivals } = newInquiries(seen, [later, earlier, customer(2, 0)]);
    expect(arrivals.map((a) => [a.customer.id, a.count, a.idx])).toEqual([["c1", 1, 1], ["c0", 2, 0]]);
  });

  it("counts a customer that is new since the last snapshot", () => {
    const { arrivals } = newInquiries(new Map(), [customer(0, 1)]);
    expect(arrivals).toHaveLength(1);
  });
});

describe("addWalks", () => {
  const arrival = (i: number, count = 1) => ({ customer: customer(i, count), idx: i, count });

  it("merges a new inquiry into a walk still on its way out", () => {
    const one = addWalks([], [arrival(0)], houses, 0);
    const two = addWalks(one, [arrival(0, 2)], houses, 1000);
    expect(two).toHaveLength(1);
    expect(two[0].count).toBe(3);
  });

  it("sends the owner out again after the walk home ends", () => {
    const one = addWalks([], [arrival(0)], houses, 0);
    const homeward = one[0].t0 + one[0].walkMs + WAIT_MS + 10;
    const two = addWalks(one, [arrival(0)], houses, homeward);
    expect(two).toHaveLength(2);
    expect(two[1].t0).toBe(walkEnd(one[0]));
  });

  it("plays a big batch one after another within about 15 s, at most 30 walkers (FE-18)", () => {
    const walks = addWalks([], Array.from({ length: 80 }, (_, i) => arrival(i)), houses, 0);
    expect(walks).toHaveLength(MAX_WALKERS);
    const starts = walks.map((w) => w.t0);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    expect(Math.max(...starts)).toBeLessThanOrEqual(BATCH_MS);
  });

  it("skips a customer with no house", () => {
    expect(addWalks([], [{ ...arrival(0), idx: 9999 }], houses, 0)).toEqual([]);
  });
});

describe("walkState", () => {
  const [w] = addWalks([], [{ customer: customer(5, 1), idx: 5, count: 1 }], houses, 1000);

  it("goes out, waits at Sales, comes home, then ends", () => {
    expect(walkState(w, 999)).toBeNull();
    expect(walkState(w, 1000)).toMatchObject({ phase: "out", moving: true });
    const waiting = walkState(w, 1000 + w.walkMs + 10)!;
    expect(waiting).toMatchObject({ phase: "waiting", moving: false });
    expect([waiting.x, waiting.z]).toEqual(w.route.at(-1));
    expect(walkState(w, 1000 + w.walkMs + WAIT_MS + 10)).toMatchObject({ phase: "home" });
    expect(walkState(w, walkEnd(w))).toBeNull();
  });
});

describe("pointAlong", () => {
  it("interpolates by distance and clamps to the ends", () => {
    const route: [number, number][] = [[0, 0], [10, 0], [10, 30]];
    expect(pointAlong(route, 0)).toMatchObject({ x: 0, z: 0 });
    expect(pointAlong(route, 0.5)).toMatchObject({ x: 10, z: 10 });
    expect(pointAlong(route, 2)).toMatchObject({ x: 10, z: 30 });
  });
});
