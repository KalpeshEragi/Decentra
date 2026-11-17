"use client";
// Brand, simulated day, the clock (Next day / Play / Pause), the AI switch, disruptions, scenarios and runs. Every button
// calls a simulation door; the panel itself decides nothing.

import Link from "next/link";
import type { Live } from "@/lib/api";
import { useSimDoors } from "@/lib/useSimDoors";

export function TopBar({ live, onChanged, onError, onDisruptions, onCustomers, onNewOrder, onReport }: {
  live: Live | null; onChanged: (reset?: boolean) => void; onError: (message: string) => void;
  onDisruptions: () => void; onCustomers: () => void; onNewOrder: () => void; onReport: (runId: number | null) => void;
}) {
  const doors = useSimDoors(live, { onChanged, onError, onReport });
  const { scenarios, chosen, setChosen, busy, playing } = doors;
  const waiting = live ? Object.values(live.clock.waiting).reduce((a, b) => a + b, 0) : 0;
  const reason = !playing && live?.clock.pause_reason;
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">◆</div>
        <div>Decentra<small>six agents run the factory</small></div>
      </div>
      <div className="spacer" />
      <span className="pill" title="Simulated day and time (working shift)">📅 {live?.clock.day ?? "…"}
        {live && <b className="clock-time">{clockText(live)}</b>}</span>
      <span className="pill" title={waiting ? `${waiting} work items in progress` : "All agents finished their work"}>
        <span className={`dot ${playing || waiting ? "live" : ""}`} /> {playing ? "Playing" : waiting ? "Working" : "Quiet"}
      </span>
      {reason && <span className="pill paused" title={reason}>⏸ {reason.split(":")[0]}</span>}
      <button className={`switch ${live?.ai_enabled ? "on" : ""}`} disabled={busy || !live}
              title="The shared language model helps agents word messages and rank repair options. Business numbers stay deterministic."
              onClick={doors.toggleAi}>
        <span className="knob" /> AI {live?.ai_enabled ? "on" : "off"}
      </button>
      <button className="btn" disabled={busy || playing} onClick={doors.nextHour}
              title="Work one hour of the shift; at the end of the shift the next day starts">Next hour ›</button>
      <button className="btn" disabled={busy || playing} onClick={doors.nextDay}
              title="Start the next day and work its whole shift">Next day »</button>
      {playing
        ? <button className="btn" disabled={busy} onClick={doors.pause}>❚❚ Pause</button>
        : <button className="btn primary" disabled={busy} onClick={doors.play}>▶ Play</button>}
      <select className="btn" value={chosen} onChange={(e) => setChosen(e.target.value)}
              title={scenarios.find((s) => s.name === chosen)?.description}>
        {scenarios.map((s) => <option key={s.name} value={s.name}>{s.name} — {s.description.split(":")[0]}</option>)}
      </select>
      <button className="btn" disabled={busy || playing}
              title="Clears every order, event and negotiation and starts again on day 1"
              onClick={doors.startScenario}>{live?.run ? "Restart" : "Start"} scenario</button>
      <button className="btn primary" disabled={!live} onClick={onNewOrder}
              title="Add one customer order by hand: product, quantity, deadline">＋ New order</button>
      <button className="btn" onClick={onCustomers} title="Simulated customers: how many, structured or chat">👥 Customers</button>
      <button className="btn" onClick={onDisruptions} title="Fire a simulator trigger">⚡ Disruption</button>
      <Link className="btn" href="/" title="The MRPII City, the main control panel">🏙 City</Link>
      <Link className="btn" href="/events" title="Event manager: every event, its publisher, subscribers and payload">📡 Events</Link>
      <Link className="btn" href="/rules" title="Rule editor: the factory's business rules, general and per agent">⚙ Rules</Link>
      {live?.run
        ? <button className="btn" disabled={busy} onClick={() => doors.finishRun(live.run!.id)}>Finish run {live.run.scenario}</button>
        : <button className="btn" onClick={() => onReport(null)}>📊 Reports</button>}
    </header>
  );
}

/** "10:00" during the shift, "shift over" after its end. */
export function clockText(live: Live): string {
  const [, end] = live.clock.shift ?? [8, 16];
  const hour = live.clock.hour ?? 8;
  return hour >= end ? " · shift over" : ` · ${String(hour).padStart(2, "0")}:00`;
}
