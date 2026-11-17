"use client";
// The City's cards (FE-38): the live activity feed (swapped for the selected element's detail), docks / lines / zones
// under it, and order tracking bottom-left. Read only: every row comes from the live snapshot or the timeline.

import { useState } from "react";
import type { Live } from "@/lib/api";
import { agent } from "@/lib/agents";
import { Act, FeedFilter, STAGES, stageOf, STOPPED } from "@/lib/city/activity";
import { fmt, hhmm, Selection, words } from "@/lib/city/detail";

const FILTERS: Record<FeedFilter, string> = { all: "All", event: "Events", talk: "Negotiations", disruption: "Problems" };
const WAREHOUSE_AT: [number, number, number] = [149, 0, 0];
const FACTORY_AT: [number, number, number] = [150, 0, -58];
const ZONES_AT: [number, number, number] = [150, 0, 40];

export function ActivityFeed({ feed, filter, onFilter, onShow }: {
  feed: Act[]; filter: FeedFilter; onFilter: (f: FeedFilter) => void; onShow: (a: Act) => void;
}) {
  return (
    <section className="city-card city-feed">
      <div className="city-feedhead"><b>Live activity</b><span className="city-dot" /></div>
      <div className="city-tabs">
        {(Object.keys(FILTERS) as FeedFilter[]).map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => onFilter(f)}>{FILTERS[f]}</button>
        ))}
      </div>
      <div className="city-list">
        {feed.map((a) => (
          <button key={a.key} className={`city-act t-${a.tone}`} onClick={() => onShow(a)} title="Show it in the City">
            <i style={{ background: agent(a.who).color }} />
            <span><b>{a.title}</b><small>{a.text}</small></span>
            <em>{hhmm(a.time)}</em>
          </button>
        ))}
        {!feed.length && <div className="city-empty">Nothing here yet</div>}
      </div>
    </section>
  );
}

type Res = "docks" | "lines" | "zones";
type Row = { a: string; b: string; c: string; tone: string; bar?: number; sel: Selection };

function rowsOf(live: Live | null, tab: Res): Row[] {
  if (!live) return [];
  if (tab === "docks") return [
    ...live.docks.inbound.map((d) => ({ a: `In · ${d.sku ?? "delivery"}`, b: `${fmt(d.quantity)} · ${d.arrival_day}`, c: words(d.status),
      tone: d.status === "RECEIVED" ? "green" : /DELAY/.test(d.status) ? "red" : "blue",
      sel: { kind: "inbound" as const, id: d.commitment_id, at: WAREHOUSE_AT, label: d.sku ?? "Delivery" } })),
    ...live.docks.outbound.map((d) => ({ a: `Out · ${d.order_ref}`, b: `${fmt(d.quantity)} ${d.sku ?? ""} · ${d.delivery_day}`, c: "due",
      tone: "amber", sel: { kind: "outbound" as const, id: d.order_ref, at: WAREHOUSE_AT, label: d.order_ref } })),
  ];
  if (tab === "lines") return live.lines.map((l) => ({
    a: l.work_center, b: `${fmt(l.machine_hours_free)} h free`,
    c: l.orders_today.some((o) => o.status === "STARTED") ? "running" : l.orders_today.length ? `${l.orders_today.length} today` : "idle",
    tone: l.orders_today.some((o) => o.status === "STARTED") ? "green" : l.orders_today.length ? "amber" : "grey",
    sel: { kind: "line" as const, id: l.work_center, at: FACTORY_AT, label: `Line ${l.work_center}` } }));
  return live.zones.map((z) => {
    const p = Number(z.occupied_now) / Math.max(1, Number(z.capacity_units));
    return { a: words(z.zone), b: `${fmt(z.occupied_now)} / ${fmt(z.capacity_units)}`, c: `${Math.round(p * 100)}%`,
      tone: p > 0.85 ? "amber" : "green", bar: p, sel: { kind: "zone" as const, id: z.zone, at: ZONES_AT, label: words(z.zone) } };
  });
}

export function Resources({ live, onSelect }: { live: Live | null; onSelect: (s: Selection) => void }) {
  const [tab, setTab] = useState<Res>("docks");
  const rows = rowsOf(live, tab);
  const docks = (live?.docks.inbound.length ?? 0) + (live?.docks.outbound.length ?? 0);
  return (
    <section className="city-card city-res">
      <div className="city-tabs">
        <button className={tab === "docks" ? "on" : ""} onClick={() => setTab("docks")}>Docks {docks}</button>
        <button className={tab === "lines" ? "on" : ""} onClick={() => setTab("lines")}>Lines {live?.lines.length ?? 0}</button>
        <button className={tab === "zones" ? "on" : ""} onClick={() => setTab("zones")}>Zones {live?.zones.length ?? 0}</button>
      </div>
      <div className="city-rows">
        {rows.map((r) => (
          <button key={`${r.sel.kind}:${r.sel.id}`} className="city-row" onClick={() => onSelect(r.sel)}>
            <b>{r.a}</b><span>{r.b}</span><em className={r.tone}>{r.c}</em>
            {r.bar !== undefined && <i><u style={{ width: `${Math.min(100, r.bar * 100)}%` }} /></i>}
          </button>
        ))}
        {!rows.length && <div className="city-empty">{tab === "docks" ? "No trucks today or tomorrow" : "Nothing in the live data"}</div>}
      </div>
    </section>
  );
}

/** One order's stage (Request → Shipped). An order that left the flow shows as stopped, never as progress. */
export function OrderTrack({ live, chosen, onChoose, onStory, onChat }: {
  live: Live | null; chosen: string | null; onChoose: (id: string) => void; onStory: (id: string) => void; onChat: (id: string) => void;
}) {
  const orders = live?.orders ?? [];
  const order = orders.find((o) => o.demand_id === chosen) ?? orders[0];
  const at = order ? stageOf(order.status) : 0;
  const stopped = at === STOPPED;
  const last = STAGES.length - 1;
  return (
    <section className="city-card city-track">
      <div className="city-cardhead">
        <b>Order tracking</b>
        {orders.length ? (
          <select value={order?.demand_id} onChange={(e) => onChoose(e.target.value)}>
            {orders.map((o) => <option key={o.demand_id} value={o.demand_id}>
              {o.order_number ?? o.demand_id.slice(0, 8)} · {fmt(o.quantity)} {o.sku ?? ""} · {words(o.status)}</option>)}
          </select>
        ) : <span>no orders yet</span>}
      </div>
      {order && (
        <>
          <div className={`city-steps ${stopped ? "stopped" : ""}`}>
            {STAGES.map((s, i) => {
              const done = !stopped && (i < at || at === last);
              const now = !stopped && i === at && at !== last;
              return (
                <div key={s} className={`city-step ${done ? "done" : now ? "now" : ""}`}>
                  <i>{done ? "✓" : i + 1}</i><b>{s}</b><small>{now ? words(order.status) : ""}</small>
                </div>
              );
            })}
          </div>
          {stopped && <span className="city-chip red">Stopped: {words(order.status)}</span>}
          <div className="city-dates">
            <span>Requested {order.requested_day} · Promised {order.committed_day ?? "—"}</span>
            <button onClick={() => onStory(order.demand_id)} title="The whole story of this order">📖 Story</button>
            <button onClick={() => onChat(order.demand_id)} title="This order's customer chat and negotiation channel">💬 Chat</button>
          </div>
        </>
      )}
    </section>
  );
}
