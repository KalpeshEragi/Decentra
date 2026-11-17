"use client";
// The City's screen chrome (FE-38, FE-39): top bar with the run controls, KPI strip, agent rail and toasts. The run
// controls call the simulation doors through the same hook as the classic top bar (lib/useSimDoors); nothing here
// decides anything. Every figure is read from the observer.

import Link from "next/link";
import { useState } from "react";
import type { Live } from "@/lib/api";
import { agent } from "@/lib/agents";
import { Act, FeedFilter, toAct } from "@/lib/city/activity";
import { words } from "@/lib/city/detail";
import { SiteKey, SITES, siteOf } from "@/lib/city/sites";
import { TIME_MODES, TimeMode } from "@/lib/city/timeOfDay";
import { AgentCode, AgentView, Incident, OrderComparison, STATUS_HELP } from "@/lib/insight";
import { useSimDoors } from "@/lib/useSimDoors";
import type { Connection } from "@/lib/city/connection";

export type Panel = "order" | "customers" | "disruptions" | "incidents" | "plans" | "chat";

export function CityTopBar({ live, link, site, onSite, mode, onMode, showFps, onFps, doors, onPanel, onMore, onReport }: {
  live: Live | null; link: Connection; site: SiteKey; onSite: (s: SiteKey) => void;
  mode: TimeMode; onMode: (m: TimeMode) => void; showFps: boolean; onFps: () => void;
  doors: ReturnType<typeof useSimDoors>; onPanel: (p: Panel) => void;
  onMore: () => void;  // the More menu is opening: the host closes any open card
  onReport: () => void;
}) {
  const [more, setMore] = useState(false);
  const current = siteOf(site);
  const { busy, playing, scenarios, chosen, setChosen } = doors;
  const waiting = live ? Object.values(live.clock.waiting).reduce((a, b) => a + b, 0) : 0;
  const state = link.kind !== "live" ? (link.kind === "connecting" ? "Connecting…" : "Offline")
    : playing ? "Running" : waiting ? "Agents working" : "Paused";
  const reason = !playing && live?.clock.pause_reason;
  const pick = (p: Panel) => { setMore(false); onPanel(p); };
  const off = busy || !live;

  return (
    <header className="city-top">
      <div className="city-logo"><span className="city-cube" />Decentra<small>City</small></div>
      <label className="city-site" title="Fly to a Site">
        <span className="city-code">{site === "CITY" ? "ALL" : current.label.slice(0, 2).toUpperCase()}</span>
        <b>{current.label}</b>
        <select value={site} onChange={(e) => onSite(e.target.value as SiteKey)}>
          {SITES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </label>

      <div className="city-clock">
        <span className={`city-state ${link.kind} ${playing ? "run" : waiting ? "busy" : ""}`}
              title={waiting ? `${waiting} work items in progress` : undefined}>{state}</span>
        {reason && <span className="city-paused" title={reason}>⏸ {reason.split(":")[0]}</span>}
        {playing
          ? <button disabled={busy} onClick={doors.pause} title="Pause the simulated clock">❚❚</button>
          : <button disabled={off} onClick={doors.play} title="Play the simulated clock">▶</button>}
        <button disabled={off || playing} onClick={doors.nextHour}
                title="Work one hour of the shift; at the end of the shift the next day starts">+1h</button>
        <button disabled={off || playing} onClick={doors.nextDay} title="Start the next day and work its whole shift">+1d</button>
      </div>
      <SimClock live={live} playing={playing} busy={busy} />

      <div className="city-spacer" />
      <button className={`city-ai ${live?.ai_enabled ? "on" : ""}`} disabled={off} onClick={doors.toggleAi} role="switch"
              aria-checked={!!live?.ai_enabled}
              title={`The shared language model helps agents word messages and rank repair options. Business numbers stay deterministic. ${live?.kpis.ai_calls ?? 0} AI calls so far.`}>
        <span className="knob" /> AI {live?.ai_enabled ? "on" : "off"}
      </button>
      <button className="city-btn primary" disabled={!live} onClick={() => { setMore(false); onPanel("order"); }}
              title="Add one customer order by hand: product, quantity, deadline">＋ New order</button>
      <div className="city-more">
        <button className={`city-btn ${more ? "on" : ""}`} onClick={() => { if (!more) onMore(); setMore(!more); }}
                aria-expanded={more}>More ▾</button>
        {more && (
          <div className="city-menu" role="menu">
            <div className="city-menu-scn">
              <select value={chosen} onChange={(e) => setChosen(e.target.value)}
                      title={scenarios.find((s) => s.name === chosen)?.description}>
                {scenarios.map((s) => <option key={s.name} value={s.name}>{s.name} — {s.description.split(":")[0]}</option>)}
              </select>
              <button disabled={busy || playing} title="Clears every order, event and negotiation and starts again on day 1"
                      onClick={() => { setMore(false); doors.startScenario(); }}>{live?.run ? "Restart" : "Start"}</button>
            </div>
            <button onClick={() => pick("customers")}>👥 Customers</button>
            <button onClick={() => pick("disruptions")}>⚡ Disruption</button>
            <hr />
            <button onClick={() => pick("chat")}>💬 Agent conversation</button>
            <button onClick={() => pick("incidents")}>🚨 Disruption stories</button>
            <button onClick={() => pick("plans")}>📋 Plan changes</button>
            <hr />
            <Link href="/events">📡 Events</Link>
            <Link href="/rules">⚙ Rules</Link>
            {live?.run
              ? <button disabled={busy} onClick={() => { setMore(false); doors.finishRun(live.run!.id); }}>🏁 Finish run {live.run.scenario}</button>
              : <button onClick={() => { setMore(false); onReport(); }}>📊 Reports</button>}
          </div>
        )}
      </div>
      <select className="city-time" value={mode} onChange={(e) => onMode(e.target.value as TimeMode)} title="Time of day (a look only)">
        {TIME_MODES.map((m) => <option key={m} value={m}>{m === "AUTO" ? "◐ Auto" : words(m)}</option>)}
      </select>
      <button className={`city-btn ${showFps ? "on" : ""}`} onClick={onFps} title="fps counter (FE-15)">fps</button>
      <Link className="city-btn" href="/classic" title="The classic control panel">Classic</Link>
    </header>
  );
}

/** The simulated clock, live (SIM-1): weekday and date, the hour, the shift as a bar of its working hours, and one
 *  line on what is happening now. Read from the live snapshot only; it moves when the backend's clock moves. */
function SimClock({ live, playing, busy }: { live: Live | null; playing: boolean; busy: boolean }) {
  if (!live) return <div className="city-simclock"><b className="t">--:--</b></div>;
  const { day, hour, shift: [start, end], waiting } = live.clock;
  const jobs = Object.values(waiting).reduce((a, b) => a + b, 0);
  const over = hour >= end;
  const date = new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const now = jobs ? `Agents working · ${jobs} ${jobs === 1 ? "job" : "jobs"}`
    : playing ? `Playing · next ${over ? "a new day" : `${hh(hour)}–${hh(hour + 1)}`}`
    : busy ? "Moving the clock…"
    : over ? "Shift over · next step starts a new day"
    : hour === start ? `Day start · next ${hh(hour)}–${hh(hour + 1)}`
    : `Paused · next ${hh(hour)}–${hh(hour + 1)}`;
  const queues = Object.entries(waiting).filter(([, n]) => n > 0).map(([q, n]) => `${q}: ${n}`).join("\n");
  return (
    <div className={`city-simclock ${jobs || playing || busy ? "active" : ""}`}
         title={`Simulated time. The working shift runs ${hh(start)}–${hh(end)}.${queues ? `\nWork waiting:\n${queues}` : ""}`}>
      <div className="d">{date}</div>
      <b key={`${day}${hour}`} className="t">{over ? hh(end) : hh(hour)}</b>
      <div className="col">
        <div className="shift" aria-label={`hour ${hour - start} of ${end - start} of the shift`}>
          {Array.from({ length: end - start }, (_, i) => (
            <i key={i} className={start + i < hour ? "done" : start + i === hour && (playing || busy) ? "now" : ""} />
          ))}
        </div>
        <span className="what">{now}</span>
      </div>
    </div>
  );
}

/** The KPI strip (FE-38). "At risk" and "Plan changes" are counted per order, as in the classic cockpit: an order
 *  whose latest plan event is PlanAtRisk, and orders whose committed plan changed. Clicking one filters the feed. */
export function KpiStrip({ live, incidents, comparisons, onFilter }: {
  live: Live | null; incidents: Incident[]; comparisons: OrderComparison[]; onFilter: (f: FeedFilter) => void;
}) {
  const k = live?.kpis;
  const atRisk = comparisons.filter((c) => c.verdict === "AT_RISK").length;
  const changed = comparisons.filter((c) => c.changes.length > 0).length;
  const talks = live?.negotiations_open.length ?? 0;
  return (
    <div className="city-kpis">
      <Kpi label="Active orders" value={k?.orders_open} help="Committed or being planned" />
      <Kpi label="At risk" value={live ? atRisk : undefined} tone={atRisk ? "red" : undefined}
           help="Orders whose latest plan event is PlanAtRisk" onClick={() => onFilter("disruption")} />
      <Kpi label="Completed" value={k?.orders_completed} help="Shipped orders"
           sub={k?.on_time_percent == null ? "on time —" : `${k.on_time_percent.toFixed(0)}% on time`} />
      <Kpi label="Stock on hand" value={k ? Number(k.stock_on_hand).toLocaleString("en") : undefined} help="Units of all items" />
      <Kpi label="Negotiating" value={live ? talks : undefined} tone={talks ? "blue" : undefined}
           help="Open negotiations" onClick={() => onFilter("talk")} />
      <Kpi label="Disruptions" value={live ? incidents.length : undefined} tone={incidents.length ? "amber" : undefined}
           help="Disruption events so far" onClick={() => onFilter("disruption")} />
      <Kpi label="Plan changes" value={live ? changed : undefined} help="Orders whose committed plan changed"
           onClick={() => onFilter("event")} />
    </div>
  );
}

function Kpi({ label, value, sub, tone, help, onClick }: {
  label: string; value: string | number | undefined; sub?: string; tone?: string; help: string; onClick?: () => void;
}) {
  return (
    <button className={`city-kpi ${tone ? `k-${tone}` : ""}`} onClick={onClick} disabled={!onClick}
            title={onClick ? `${help} · click to filter the feed` : help}>
      <small>{label}</small><b>{value ?? "—"}</b>{sub && <em>{sub}</em>}
    </button>
  );
}

/** Six avatars with status dots; hover shows status, whom it waits for and its latest action; click flies to its office. */
export function AgentRail({ views, names, onPick }: { views: AgentView[]; names: Record<string, string>; onPick: (c: AgentCode) => void }) {
  return (
    <nav className="city-agents" aria-label="Agents">
      {views.map((a) => {
        const ag = agent(a.code);
        const latest = a.latest ? toAct(a.latest, names) : null;
        return (
          <button key={a.code} className={`city-agent s-${a.status}`} title={STATUS_HELP[a.status]} onClick={() => onPick(a.code)}>
            <i style={{ background: ag.color }}>{ag.initial}<u /></i>
            <span>
              <b>{ag.name}</b>
              <em>{words(a.status)}{a.waitingFor.length ? ` · waits for ${a.waitingFor.map((w) => agent(w).name).join(", ")}` : ""}</em>
              <small>{a.alert ?? latest?.title ?? "Nothing yet"}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export type Toast = Act & { until: number };

export function Toasts({ toasts, onShow, onClose }: { toasts: Toast[]; onShow: (a: Act) => void; onClose: (key: string) => void }) {
  return (
    <div className="city-toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.key} className={`city-toast t-${t.tone}`}>
          <i style={{ background: agent(t.who).color }} />
          <div><b>{t.title}</b><span>{t.text}</span></div>
          <button onClick={() => onShow(t)}>Show ›</button>
          <button className="x" aria-label="Dismiss" onClick={() => onClose(t.key)}>×</button>
        </div>
      ))}
    </div>
  );
}
