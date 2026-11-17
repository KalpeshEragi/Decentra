import { describe, expect, it } from "vitest";
import type { TimelineItem } from "@/lib/api";
import { feedOf, freshActs, stageOf, STOPPED, toAct, triggerPlace } from "./activity";
import { officeAt } from "./sites";

const at = "2026-11-09T10:00:00Z";
const event = (type: string, publisher = "PLANNING"): TimelineItem => ({ time: at, source: "event", type, publisher, subscribers: ["SALES"] });

describe("toAct", () => {
  it("marks disruptions and plan trouble red, finished work green, day ticks grey", () => {
    expect(toAct(event("SupplierDeliveryDelayed", "PURCHASING"), {})).toMatchObject({ tone: "red", disruption: true });
    expect(toAct(event("PlanAtRisk"), {})).toMatchObject({ tone: "red", disruption: false });
    expect(toAct(event("MaterialReceived", "WAREHOUSE"), {})!.tone).toBe("green");
    expect(toAct(event("SimulatedDayStarted", "SIMULATOR_CLOCK"), {})!.tone).toBe("grey");
  });

  it("points a negotiation message at the receiving office, with the sender as who", () => {
    const a = toAct({ time: at, source: "negotiation", type: "REJECT", from: "PLANNING", to: "INVENTORY", session_id: "s1" }, {})!;
    expect(a).toMatchObject({ kind: "talk", who: "PLANNING", to: "INVENTORY", tone: "red" });
    expect(a.sel).toMatchObject({ kind: "office", id: "INVENTORY", at: officeAt("INVENTORY") });
  });

  it("places a trigger at the office of what it changes, and leaves AI calls out", () => {
    expect(toAct({ time: at, source: "trigger", type: "WORKER_ABSENT", status: "APPLIED" }, {})!.sel.id).toBe("HR");
    expect(toAct({ time: at, source: "ai_call", agent: "SALES" }, {})).toBeNull();
    expect(triggerPlace("supplier_delay")).toBe("PURCHASING");
    expect(triggerPlace("SOMETHING_ELSE")).toBe("SIMULATOR_CLOCK");
  });

  it("gives two different negotiation sessions at the same moment different keys", () => {
    const m = (s: string): TimelineItem => ({ time: at, source: "negotiation", type: "OFFER", from: "PLANNING", to: "HR", session_id: s });
    expect(toAct(m("a"), {})!.key).not.toBe(toAct(m("b"), {})!.key);
  });

  it("gives two events of one type saved together (same time, same publisher) different keys, the same on every poll", () => {
    const e = (item: string): TimelineItem => ({ ...event("MaterialReceived", "WAREHOUSE"), payload: { item_id: item, quantity: "40" } });
    expect(toAct(e("a"), {})!.key).not.toBe(toAct(e("b"), {})!.key);
    expect(toAct(e("a"), {})!.key).toBe(toAct(e("a"), {})!.key);
  });
});

describe("freshActs and feedOf", () => {
  const acts = [event("OrderConfirmed", "SALES"), event("SimulatedDayStarted", "SIMULATOR_CLOCK")].map((e) => toAct(e, {})!);

  it("does not notify what was there at page load, then notifies only new, non-grey lines (FE-39)", () => {
    const first = freshActs(null, acts);
    expect(first.fresh).toEqual([]);
    const newer = [...acts, toAct({ ...event("PlanRevised"), time: "2026-11-09T11:00:00Z" }, {})!];
    const second = freshActs(first.seen, newer);
    expect(second.fresh.map((a) => a.title)).toEqual(["Planning published PlanRevised"]);
    expect(freshActs(second.seen, newer).fresh).toEqual([]);
  });

  it("filters the feed and lists it newest first without grey lines", () => {
    const all = [...acts, toAct(event("PlanAtRisk"), {})!];
    expect(feedOf(all, "all").map((a) => a.title)).toEqual(["Planning published PlanAtRisk", "Sales published OrderConfirmed"]);
    expect(feedOf(all, "disruption")).toHaveLength(1);
    expect(feedOf(all, "talk")).toHaveLength(0);
  });
});

describe("stageOf", () => {
  it("follows Planning's demand statuses and never shows a failed order as progress", () => {
    expect(["RECEIVED", "PLANNING", "ANSWERED"].map(stageOf)).toEqual([0, 0, 0]);
    expect(["CONFIRMED", "COMMITTED", "STARTED", "COMPLETED"].map(stageOf)).toEqual([1, 2, 3, 4]);
    expect(["COMMIT_FAILED", "CANCELLED", "NOT_FEASIBLE", "EXPIRED"].map(stageOf)).toEqual([STOPPED, STOPPED, STOPPED, STOPPED]);
  });
});
