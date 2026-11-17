// What a clicked City element shows (FE-11, FE-30): only what the backend reports for it, recomputed from every new
// snapshot while it stays selected. When the data no longer has the element, the detail says so instead of guessing.

import type { Live, TimelineItem } from "@/lib/api";
import { agent, describeEvent } from "@/lib/agents";
import { isPreview } from "./customerWalks";

export type CityEvent = { key: string; type: string; publisher: string; time: string; subscribers: string[];
  text: string; payload: Record<string, unknown> };

export const eventKey = (it: Pick<TimelineItem, "time" | "type" | "publisher">) => `${it.time}|${it.type}|${it.publisher}`;

/** The newest published events, newest first (the Town Square board, FE-37). */
export function latestEvents(items: TimelineItem[], n: number): CityEvent[] {
  const out: CityEvent[] = [];
  for (let i = items.length - 1; i >= 0 && out.length < n; i--) {
    const it = items[i];
    if (it.source !== "event" || !it.type) continue;
    out.push({ key: eventKey(it), type: it.type, publisher: it.publisher ?? "?", time: it.time,
      subscribers: it.subscribers ?? [], text: describeEvent(it), payload: it.payload ?? {} });
  }
  return out;
}

export type SelKind = "stock" | "zone" | "inbound" | "outbound" | "office" | "billboard" | "warehouse" | "house" | "line" |
  "worker" | "negotiation" | "factory" | "square" | "forklift" | "dock" | "depot";
export type Selection = { kind: SelKind; id: string; at: [number, number, number]; label: string };

export type Tone = "blue" | "green" | "amber" | "red" | "grey";
export type Detail = { eyebrow: string; title: string; chip?: { text: string; tone: Tone };
  rows: [string, string][]; bars?: { label: string; value: number; max: number }[]; list?: { left: string; right: string }[];
  note?: string };

export const num = (s: string | number | null | undefined) => Number(s ?? 0);
export const fmt = (s: string | number | null | undefined) => num(s).toLocaleString("en", { maximumFractionDigits: 1 });
export const words = (s: string) => s.toLowerCase().replaceAll("_", " ");
export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function toneOf(status: string): Tone {
  const s = status.toUpperCase();
  if (/DELAY|FAIL|REJECT|EXPIRE|RISK|ABSENT/.test(s)) return "red";
  if (/RECEIV|DONE|COMPLET|AGREED|COMMITTED|STOCK/.test(s)) return "green";
  if (/PEND|WAIT|TODAY|LOW/.test(s)) return "amber";
  return "blue";
}

/** A worker stands at a line when the line's work center code starts their primary skill (SMT ↔ SMT, AS ↔ ASSEMBLY).
 *  A display rule only: the live data has no worker-to-line link yet (FE-28, issue 05). */
export const skillMatches = (skill: string, workCenter: string) => skill === workCenter || skill.startsWith(workCenter.slice(0, 2));
export const workersAt = (workCenter: string, workers: Live["workers"]) =>
  workers.filter((w) => !w.absent && skillMatches(w.primary_skill, workCenter));

/** What the backend reports for the selected element. */
export function detailFor(sel: Selection, live: Live | null, events: CityEvent[]): Detail {
  if (!live) return { eyebrow: "Waiting", title: sel.label, rows: [], note: "No answer from the backend yet." };
  switch (sel.kind) {
    case "stock": {
      const s = live.stock.find((x) => x.item_id === sel.id);
      if (!s) return { eyebrow: "Stock", title: sel.label, rows: [], note: "No longer in the live stock list." };
      const free = num(s.on_hand) - num(s.reserved) - num(s.held);
      return { eyebrow: `Stock · ${words(s.type)}`, title: s.name, chip: { text: free > 0 ? "In stock" : "Fully taken", tone: free > 0 ? "green" : "amber" },
        rows: [["SKU", s.sku], ["On hand", fmt(s.on_hand)], ["Reserved", fmt(s.reserved)], ["Held", fmt(s.held)], ["Free", fmt(free)], ["Owner", "Inventory"]],
        bars: [{ label: "Reserved + held of on hand", value: num(s.reserved) + num(s.held), max: Math.max(1, num(s.on_hand)) }] };
    }
    case "zone": {
      const z = live.zones.find((x) => x.zone === sel.id);
      if (!z) return { eyebrow: "Storage zone", title: sel.label, rows: [], note: "No longer in the live zone list." };
      const pct = (100 * num(z.occupied_now)) / Math.max(1, num(z.capacity_units));
      return { eyebrow: "Storage zone · Warehouse", title: words(z.zone), chip: { text: pct > 85 ? "Nearly full" : "Space free", tone: pct > 85 ? "amber" : "green" },
        rows: [["Occupied now", fmt(z.occupied_now)], ["Capacity", fmt(z.capacity_units)], ["Full", `${pct.toFixed(0)} %`]],
        bars: [{ label: "Occupied", value: num(z.occupied_now), max: Math.max(1, num(z.capacity_units)) }] };
    }
    case "inbound": {
      const d = live.docks.inbound.find((x) => x.commitment_id === sel.id);
      if (!d) return { eyebrow: "Inbound truck", title: sel.label, rows: [], note: "Delivery no longer pending." };
      return { eyebrow: "Inbound delivery · supplier truck", title: d.sku ?? "Delivery", chip: { text: words(d.status), tone: toneOf(d.status) },
        rows: [["Quantity", fmt(d.quantity)], ["Arrival day", d.arrival_day], ["Commitment", d.commitment_id.slice(0, 8)], ["Owner", "Purchasing / Warehouse"]] };
    }
    case "outbound": {
      const d = live.docks.outbound.find((x) => x.order_ref === sel.id);
      if (!d) return { eyebrow: "Outbound truck", title: sel.label, rows: [], note: "Shipment no longer pending." };
      return { eyebrow: "Outbound shipment", title: d.sku ?? "Shipment", chip: { text: `due ${d.delivery_day}`, tone: "blue" },
        rows: [["Order", d.order_ref], ["Quantity", fmt(d.quantity)], ["Delivery day", d.delivery_day]] };
    }
    case "dock":
      return { eyebrow: "Dock door", title: sel.label, chip: { text: "Free", tone: "grey" }, rows: [],
        note: "No delivery or shipment at this door in the live data." };
    case "office": {
      const a = agent(sel.id);
      const negs = live.negotiations_open.filter((x) => x.starter === sel.id || x.owner === sel.id);
      const mine = events.filter((e) => e.publisher === sel.id).slice(0, 4);
      return { eyebrow: `${a.name} agent · office`, title: `${a.name} office`,
        chip: { text: negs.length ? `${negs.length} negotiating` : "Idle", tone: negs.length ? "blue" : "grey" },
        rows: [["Open negotiations", String(negs.length)], ["Latest events here", String(mine.length)]],
        list: [...negs.slice(0, 4).map((x) => ({ left: `${agent(x.starter).name} → ${agent(x.owner).name} · ${words(x.resource_type)}`, right: `${words(x.status)} r${x.round}` })),
          ...mine.map((e) => ({ left: e.text, right: hhmm(e.time) }))],
        note: negs.length + mine.length ? undefined : "Nothing open or published by this agent right now." };
    }
    case "billboard": {
      const e = events.find((x) => x.key === sel.id);
      if (!e) return { eyebrow: "Event", title: sel.label, rows: [], note: "This event has scrolled off the board." };
      return { eyebrow: `Event · published by ${agent(e.publisher).name}`, title: e.type, chip: { text: hhmm(e.time), tone: "blue" },
        rows: [["Delivered to", e.subscribers.map((s) => agent(s).name).join(", ") || "—"],
          ...Object.entries(e.payload).slice(0, 6).map(([k, v]) => [words(k), typeof v === "object" ? JSON.stringify(v) : String(v)] as [string, string])],
        note: e.text };
    }
    case "warehouse": {
      const occ = live.zones.reduce((s, z) => s + num(z.occupied_now), 0), cap = live.zones.reduce((s, z) => s + num(z.capacity_units), 0);
      return { eyebrow: "Warehouse site · Warehouse + Inventory", title: "Materials warehouse",
        rows: [["Stock on hand", fmt(live.kpis.stock_on_hand)], ["Inbound pending", String(live.docks.inbound.length)],
          ["Outbound pending", String(live.docks.outbound.length)], ["Zones", String(live.zones.length)]],
        bars: [{ label: "Storage used", value: occ, max: Math.max(1, cap) }],
        list: live.stock.slice(0, 5).map((s) => ({ left: s.name, right: fmt(s.on_hand) })) };
    }
    case "square":
      return { eyebrow: "Town Square · events", title: "Town Square", chip: { text: `${events.length} on the board`, tone: "blue" },
        rows: [], list: events.slice(0, 6).map((e) => ({ left: `${e.type} · ${agent(e.publisher).name}`, right: hhmm(e.time) })),
        note: events.length ? undefined : "No event published in this run yet." };
    case "forklift":
      return { eyebrow: "Forklift · display", title: sel.label, chip: { text: "Not business data", tone: "grey" }, rows: [],
        note: "Forklifts are not in the live data. One drives a trip for each real Warehouse event (goods received, issued to " +
          "production, finished goods stored, shipment dispatched), carrying that event's goods, then parks at the charging bay." };
    case "house": {
      const c = live.customers.find((x) => x.id === sel.id);
      if (!c) return isPreview(sel.id)
        ? { eyebrow: "Customer house · preview", title: sel.label, chip: { text: "preview", tone: "grey" }, rows: [],
          note: "A made-up house from ?customers=N, not a real customer." }
        : { eyebrow: "Customer house", title: sel.label, rows: [], note: "No longer in Sales's customer list." };
      const q = c.latest_inquiry;
      return { eyebrow: "Customer house · Sales's records", title: c.label,
        chip: c.has_open_order ? { text: plural(c.open_orders.length, "open order"), tone: "blue" } : { text: "No open order", tone: "grey" },
        rows: [["Inquiries", String(c.inquiry_count)],
          ["Latest inquiry", q ? [q.product ?? "Product not known yet", q.quantity ? `× ${fmt(q.quantity)}` : ""].join(" ").trim() : "—"],
          ["Inquiry stage", q ? words(q.stage) : "—"]],
        list: c.open_orders.map((o) => ({ left: o, right: "open" })) };
    }
    case "depot": {
      const s = live.suppliers.find((x) => x.id === sel.id);
      if (!s) return { eyebrow: "Supplier depot", title: sel.label, rows: [], note: "No longer in the supplier list." };
      return { eyebrow: "Supplier depot · simulated supplier", title: s.name, rows: [],
        note: "Suppliers are simulated, not agents; talks with them show at the Purchasing office." };
    }
    case "line": {
      const l = live.lines.find((x) => x.work_center === sel.id);
      if (!l) return { eyebrow: "Production line", title: sel.label, rows: [], note: "No longer in the live line list." };
      const staff = workersAt(l.work_center, live.workers);
      return { eyebrow: "Production line · Planning's capacity", title: `Line ${l.work_center}`,
        chip: { text: l.orders_today.length ? `${plural(l.orders_today.length, "order")} today` : "Idle", tone: l.orders_today.length ? "blue" : "grey" },
        rows: [["Machine hours free", fmt(l.machine_hours_free)], ["Workers here", staff.map((w) => w.name).join(", ") || "—"]],
        list: l.orders_today.map((o) => ({ left: `${o.sku ?? "order"} · ${fmt(o.quantity_completed)} / ${fmt(o.quantity)}`, right: words(o.status) })) };
    }
    case "worker": {
      const w = live.workers.find((x) => x.code === sel.id);
      if (!w) return { eyebrow: "Worker", title: sel.label, rows: [], note: "No longer in HR's worker list." };
      return { eyebrow: "Worker · HR", title: w.name, chip: { text: w.absent ? "Absent" : "Present", tone: w.absent ? "red" : "green" },
        rows: [["Code", w.code], ["Primary skill", words(w.primary_skill)], ["Other skills", w.secondary_skills.map(words).join(", ") || "—"]] };
    }
    case "negotiation": {
      const g = live.negotiations_open.find((x) => x.session_id === sel.id);
      if (!g) return { eyebrow: "Negotiation", title: sel.label, rows: [], note: "No longer open." };
      return { eyebrow: "Negotiation · open", title: `${agent(g.starter).name} → ${agent(g.owner).name}`, chip: { text: words(g.status), tone: toneOf(g.status) },
        rows: [["Resource", words(g.resource_type)], ["Round", String(g.round)], ["Case", g.case_id.slice(0, 8)], ["Session", g.session_id.slice(0, 8)]] };
    }
    case "factory":
      return { eyebrow: "Factory site", title: "Factory", chip: { text: plural(live.lines.length, "line"), tone: "blue" }, rows: [],
        list: live.lines.map((l) => ({ left: `Line ${l.work_center}`, right: `${fmt(l.machine_hours_free)} h free · ${l.orders_today.length} today` })) };
  }
}
