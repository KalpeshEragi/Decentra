import { describe, expect, it } from "vitest";
import type { Live, TimelineItem } from "@/lib/api";
import { detailFor, latestEvents, Selection, workersAt } from "./detail";
import { resolveMode } from "./timeOfDay";

const live = {
  clock: { day: "2026-01-05", hour: 9, shift: [8, 16], status: "PAUSED", waiting: {}, pause_reason: null },
  ai_enabled: false, run: null,
  kpis: { stock_on_hand: "130", orders_open: 1, orders_completed: 0, on_time_percent: null, plan_at_risk: 0, ai_calls: 0 },
  stock: [{ item_id: "i1", sku: "MB", name: "Motherboard", type: "RAW", on_hand: "100", reserved: "30", held: "10" }],
  zones: [], docks: { inbound: [], outbound: [] }, orders: [], suppliers: [],
  workers: [
    { code: "W1", name: "Ana", primary_skill: "SMT", secondary_skills: [], absent: false },
    { code: "W2", name: "Bo", primary_skill: "ASSEMBLY", secondary_skills: [], absent: false },
    { code: "W3", name: "Cy", primary_skill: "SMT", secondary_skills: [], absent: true },
  ],
  lines: [{ work_center: "SMT", machine_hours_free: "6", orders_today: [] }],
  negotiations_open: [{ session_id: "s1", case_id: "c1", starter: "PLANNING", owner: "HR", resource_type: "WORKFORCE", status: "OPEN", round: 2 }],
  customers: [{ id: "u1", name: "Acme", label: "Acme", created_at: "", has_open_order: true, open_orders: ["SO-1"], inquiry_count: 2,
    latest_inquiry: { id: "q1", stage: "QUOTED", created_at: "", product: "Laptop", quantity: "5" } }],
} as unknown as Live;

const sel = (kind: Selection["kind"], id: string): Selection => ({ kind, id, at: [0, 0, 0], label: id });

describe("detailFor", () => {
  it("shows stock as the backend reports it, with free = on hand − reserved − held", () => {
    const d = detailFor(sel("stock", "i1"), live, []);
    expect(Object.fromEntries(d.rows)).toMatchObject({ "On hand": "100", Reserved: "30", Held: "10", Free: "60" });
  });

  it("says so when the element is gone instead of making it up", () => {
    expect(detailFor(sel("stock", "gone"), live, []).note).toMatch(/no longer/i);
    expect(detailFor(sel("house", "u-gone"), live, []).note).toMatch(/no longer/i);
    expect(detailFor(sel("house", "preview-3"), live, []).chip?.text).toBe("preview");
    expect(detailFor(sel("stock", "i1"), null, []).eyebrow).toBe("Waiting");
  });

  it("shows a customer's house from Sales's records", () => {
    const d = detailFor(sel("house", "u1"), live, []);
    expect(d.chip?.text).toBe("1 open order");
    expect(Object.fromEntries(d.rows)["Latest inquiry"]).toBe("Laptop × 5");
  });

  it("shows an office's open negotiations from either side", () => {
    expect(detailFor(sel("office", "HR"), live, []).chip?.text).toBe("1 negotiating");
    expect(detailFor(sel("office", "SALES"), live, []).chip?.text).toBe("Idle");
  });

  it("puts only present workers of the matching skill at a line", () => {
    expect(workersAt("SMT", live.workers).map((w) => w.code)).toEqual(["W1"]);
    expect(workersAt("ASM", live.workers).map((w) => w.code)).toEqual(["W2"]);
  });
});

describe("latestEvents", () => {
  it("keeps only events, newest first, up to n", () => {
    const items: TimelineItem[] = [
      { time: "t1", source: "event", type: "A", publisher: "SALES" },
      { time: "t2", source: "negotiation", type: "OFFER" },
      { time: "t3", source: "event", type: "B", publisher: "HR" },
    ];
    expect(latestEvents(items, 5).map((e) => e.type)).toEqual(["B", "A"]);
    expect(latestEvents(items, 1)).toHaveLength(1);
  });
});

describe("resolveMode", () => {
  it("follows the viewer's clock in Auto and keeps a manual pick", () => {
    const at = (h: number) => new Date(2026, 10, 9, h);
    expect([4, 5, 12, 18, 22].map((h) => resolveMode("AUTO", at(h)))).toEqual(["MIDNIGHT", "MORNING", "AFTERNOON", "EVENING", "NIGHT"]);
    expect(resolveMode("NIGHT", at(12))).toBe("NIGHT");
  });
});
