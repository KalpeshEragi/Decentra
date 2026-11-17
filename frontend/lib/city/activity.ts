// The activity feed and toasts (FE-38, FE-39): one plain-words line per timeline item, with where in the City it
// happened. Read-only: every line comes from a published event, a negotiation message, a simulator trigger or a
// failed work item. AI calls stay out of the feed.

import type { TimelineItem } from "@/lib/api";
import { agent, describeEvent, describeTerms } from "@/lib/agents";
import { DISRUPTION_EVENTS } from "@/lib/insight";
import { eventKey, Selection, Tone, words } from "./detail";
import { officeAt } from "./sites";

export type ActKind = "event" | "talk" | "sim" | "fail";
export type Act = { key: string; kind: ActKind; who: string; title: string; text: string; time: string;
  tone: Tone; sel: Selection; disruption: boolean; to?: string; bubble?: string; item: TimelineItem };
export type FeedFilter = "all" | "event" | "talk" | "disruption";

export const PLAN_EVENTS = ["PlanRevised", "PlanAtRisk", "PlanCommitFailed"];

/** Which office a simulator trigger is shown at, from its kind. */
export function triggerPlace(kind: string): string {
  const k = kind.toUpperCase();
  if (/WORKER|ABSENT/.test(k)) return "HR";
  if (/SUPPLIER/.test(k)) return "PURCHASING";
  if (/CUSTOMER|ORDER/.test(k)) return "SALES";
  if (/WAREHOUSE|CAPACITY|STORAGE/.test(k)) return "WAREHOUSE";
  return "SIMULATOR_CLOCK";
}

const office = (code: string): Selection => ({ kind: "office", id: code, at: officeAt(code), label: `${agent(code).name} office` });
const square: Selection = { kind: "square", id: "SQUARE", at: [0, 0, 0], label: "Town Square" };

/** A short stable fingerprint of a payload (djb2), so two events of one type saved in one transaction (one time) by
 *  one publisher, e.g. two MaterialReceived for different items, keep different keys. */
function fingerprint(payload: Record<string, unknown> | undefined) {
  const text = payload ? JSON.stringify(payload) : "";
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** One timeline item as a feed line, or null for items the feed leaves out (AI calls). */
export function toAct(it: TimelineItem, names: Record<string, string>): Act | null {
  const key = `${it.time}|${it.source}|${it.type}|${it.publisher ?? it.from ?? it.agent ?? ""}|${it.session_id ?? ""}|${fingerprint(it.payload)}`;
  switch (it.source) {
    case "event": {
      const pub = it.publisher ?? "?";
      const disruption = !!it.type && it.type in DISRUPTION_EVENTS;
      const tone: Tone = disruption || it.type === "PlanAtRisk" || it.type === "PlanCommitFailed" ? "red"
        : /Completed|Dispatched|Received|Committed|Confirmed/.test(it.type ?? "") ? "green" : it.type === "SimulatedDayStarted" ? "grey" : "blue";
      return { item: it, key, kind: "event", who: pub, title: `${agent(pub).name} published ${it.type}`, text: describeEvent(it), time: it.time, tone, disruption,
        sel: { kind: "billboard", id: eventKey(it), at: [0, 0, 4], label: it.type ?? "event" } };
    }
    case "negotiation": {
      const from = it.from ?? "?", to = it.to ?? "?";
      const terms = describeTerms(it.terms, names);
      return { item: it, key, kind: "talk", who: from, title: `${agent(from).name} → ${agent(to).name} · ${words(it.type ?? "message")}`,
        text: [it.order_label, terms, it.reason_code && words(it.reason_code)].filter(Boolean).join(" · ") || "negotiation message",
        time: it.time, tone: /REJECT|EXPIRE/.test(it.type ?? "") ? "red" : /ACCEPT|AGREE/.test(it.type ?? "") ? "green" : "blue",
        disruption: false, sel: office(to), to, bubble: [words(it.type ?? "message"), terms].filter(Boolean).join(" · ") };
    }
    case "trigger": {
      const place = triggerPlace(String(it.type ?? ""));
      return { item: it, key, kind: "sim", who: "SIMULATOR_CLOCK", title: `Simulator: ${words(it.type ?? "trigger")}`,
        text: `${words(it.status ?? "")}${it.scheduled_day ? ` · for ${it.scheduled_day}` : ""}`, time: it.time, tone: "amber", disruption: false,
        sel: place === "SIMULATOR_CLOCK" ? square : office(place) };
    }
    case "failed_work":
      return { item: it, key, kind: "fail", who: it.agent ?? "?", title: `${agent(it.agent).name}: work failed`, text: it.error ?? "unknown error",
        time: it.time, tone: "red", disruption: false, sel: office(it.agent ?? "PLANNING") };
    default:
      return null;
  }
}

/** Feed lines for the chosen filter, newest first. Grey lines (day ticks) are left out. */
export function feedOf(acts: Act[], filter: FeedFilter, max = 60): Act[] {
  return acts.filter((a) => a.tone !== "grey" && (filter === "all" || (filter === "disruption" ? a.disruption || a.tone === "red" : a.kind === filter)))
    .slice(-max).reverse();
}

/** Lines not seen before. The first call (`seen` null) only sets the baseline: what was there at page load is not
 *  news (FE-39). Grey lines are remembered but never notify. */
export function freshActs(seen: Set<string> | null, acts: Act[]): { seen: Set<string>; fresh: Act[] } {
  if (!seen) return { seen: new Set(acts.map((a) => a.key)), fresh: [] };
  const next = new Set(seen), fresh: Act[] = [];
  for (const a of acts) if (!next.has(a.key)) { next.add(a.key); if (a.tone !== "grey") fresh.push(a); }
  return { seen: next, fresh };
}

export const MAX_TOASTS = 3;
/** How long a toast stays: problems about 12 s, the rest about 7 s (FE-39). */
export const toastMs = (a: Pick<Act, "tone">) => (a.tone === "red" ? 12_000 : 7_000);

/** The order-tracking stage of a Planning demand status: Request → Confirmed → Committed → In production → Shipped.
 *  STOPPED (-1): the order left the flow (commit failed, cancelled, not feasible, expired); never shown as progress. */
export const STAGES = ["Request", "Confirmed", "Committed", "In production", "Shipped"];
export const STOPPED = -1;
export function stageOf(status: string): number {
  const s = status.toUpperCase();
  if (/FAIL|CANCEL|NOT_FEASIBLE|EXPIRE|REJECT/.test(s)) return STOPPED;
  if (/SHIP|DELIVER|DONE|COMPLET/.test(s)) return 4;
  if (/PRODUC|START|PROGRESS|RELEASED/.test(s)) return 3;
  if (/COMMIT|PLANNED|SECURED/.test(s)) return 2;
  if (/CONFIRM/.test(s)) return 1;
  return 0;
}
