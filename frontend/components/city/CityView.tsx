"use client";
// The MRPII City control panel (FE-7..FE-47, ADR-004), rebuilt from the style prototype's variant A (FE-35).
// The 3D City drawn from the live data, with the screen layout of FE-38: top bar with the run controls (the same
// simulation doors as the classic panel), KPI strip, agent rail, live activity feed swapped for the selected element's
// detail, docks / lines / zones, order tracking, toasts with pulse rings (FE-39), and the classic panel's order, customer,
// disruption, report, conversation and story views, and the movement along the roads on real data (movers.tsx).
//
// URL params: ?site=WAREHOUSE (glide there), ?time=NIGHT (look), ?fps=1 (counter on), ?customers=N (N made-up houses to
// measure fps, FE-15; marked as previews), ?sel=warehouse|square|factory|office:PLANNING|house:0|stock:0|line:0
// (preselect an element, for screenshots).

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { AgentChat } from "@/components/AgentChat";
import { CustomersPanel } from "@/components/CustomersPanel";
import { Disruptions } from "@/components/Disruptions";
import { NewOrderPanel } from "@/components/NewOrderPanel";
import { RunReport } from "@/components/RunReport";
import { IncidentView } from "@/components/cockpit/IncidentView";
import { PlanCompare } from "@/components/cockpit/PlanCompare";
import { OrderStoryView } from "@/components/story/OrderStoryView";
import { agent } from "@/lib/agents";
import { Act, FeedFilter, feedOf, freshActs, MAX_TOASTS, toAct, toastMs } from "@/lib/city/activity";
import { makeLayout } from "@/lib/city/cityLayout";
import { connectionOf } from "@/lib/city/connection";
import { previewCustomers } from "@/lib/city/customerWalks";
import { detailFor, latestEvents, Selection } from "@/lib/city/detail";
import { officeAt, SiteKey, SITES } from "@/lib/city/sites";
import { parseTimeMode, TimeMode } from "@/lib/city/timeOfDay";
import { agentViews, incidents as findIncidents, planComparisons } from "@/lib/insight";
import { useLive } from "@/lib/useLive";
import { useSimDoors } from "@/lib/useSimDoors";
import { CameraRig, CamCmd, FpsProbe, VIEW_DOWN } from "./camera";
import { CityCanvas } from "./CityCanvas";
import { DetailCard } from "./DetailCard";
import { FactorySite } from "./factory";
import { AgentRail, CityTopBar, KpiStrip, Panel, Toast, Toasts } from "./hud";
import { CityContext, CityCtx, isClick, makeKit } from "./kit";
import { CityFence, Ground, Lamps, Plants, PlotFences, Roads } from "./landscape";
import { ModelSlot, VehicleLights } from "./models";
import { PeopleNightGlow, PeopleWarmup } from "./people";
import { TimeOfDay } from "./lighting";
import { ContactShadows } from "./contact";
import { DepotYards, Pulse, PULSE_MS, Pulses, SelectionMark } from "./marks";
import { LiveForklifts, Messengers, MovingTrucks, NegotiationArcs, useMotion, Visitors, Walkers } from "./movers";
import { Neighbourhood } from "./neighbourhood";
import { Offices } from "./offices";
import { ActivityFeed, OrderTrack, Resources } from "./sidebar";
import { TownSquare } from "./square";
import { WarehouseSite } from "./warehouse";

const MAX_PREVIEW = 2000;
const BOARD_EVENTS = 12;
const MAX_PULSES = 8;
const PULSE_GAP_MS = 350;  // the rings of one poll appear one after another
/** Where this browser remembers the view angle the user picked (camera.tsx VIEW_DOWN). */
const VIEW_KEY = "city-view-down";
type LiveSnapshot = NonNullable<ReturnType<typeof useLive>["live"]>;

/** ?sel=...: the element to preselect once the live data is there (screenshots and reviews). */
function preselect(q: string, live: LiveSnapshot): Selection | null {
  const [kind, arg = ""] = q.split(":");
  const i = Number(arg) || 0;
  if (kind === "warehouse") return { kind, id: "WH", at: [149, 0, 0], label: "Materials warehouse" };
  if (kind === "square") return { kind, id: "SQUARE", at: [0, 0, 0], label: "Town Square" };
  if (kind === "factory") return { kind, id: "FACTORY", at: [150, 0, -58], label: "Factory" };
  if (kind === "office") return { kind, id: arg.toUpperCase(), at: officeAt(arg.toUpperCase()), label: `${arg} office` };
  if (kind === "house" && live.customers[i]) return { kind, id: live.customers[i].id, at: [0, 0, 0], label: live.customers[i].label };
  if (kind === "stock" && live.stock[i]) return { kind, id: live.stock[i].item_id, at: [150, 0, 40], label: live.stock[i].sku };
  if (kind === "line" && live.lines[i]) return { kind, id: live.lines[i].work_center, at: [150, 0, -58], label: `Line ${live.lines[i].work_center}` };
  return null;
}

export function CityView() {
  const params = useSearchParams();
  const { live, items, error, updatedAt, caughtUp, refresh, reset } = useLive();
  const events = useMemo(() => latestEvents(items, BOARD_EVENTS), [items]);
  const [mode, setMode] = useState<TimeMode>(() => parseTimeMode(params.get("time")) ?? "AUTO");
  const [cmd, setCmd] = useState<CamCmd | null>(null);
  // the view angle the user picked (degrees below the horizon), remembered in this browser
  const [down, setDown] = useState(VIEW_DOWN.initial);
  const angle = useRef<HTMLButtonElement>(null);
  const [site, setSite] = useState<SiteKey>("CITY");
  const [sel, setSel] = useState<Selection | null>(null);
  const [showFps, setShowFps] = useState(params.get("fps") === "1");
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [report, setReport] = useState<{ runId: number | null } | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);   // order tracking's chosen order
  const [chatOrder, setChatOrder] = useState<string | null>(null);  // the conversation's order tab
  const [story, setStory] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const fps = useRef<HTMLDivElement>(null);
  const focus = useMemo(() => new THREE.Vector3(), []);
  const kit = useMemo(() => makeKit(), []);

  const send = useCallback((c: CamCmd) => {
    setCmd({ ...c });  // a fresh object, so pressing the same button again glides again
    if (c.kind === "site") setSite(c.site);
    if (c.kind === "home") setSite("CITY");
  }, []);
  useEffect(() => {
    const s = params.get("site")?.toUpperCase();
    if (!s || !SITES.some((x) => x.key === s)) return;
    const t = setTimeout(() => send({ kind: "site", site: s as SiteKey }), 300);
    return () => clearTimeout(t);
  }, [params, send]);

  // houses: one per live customer (FE-33); ?customers=N swaps in made-up preview houses to measure fps (FE-15)
  const preview = useMemo(() => {
    const n = Math.min(MAX_PREVIEW, Number(params.get("customers")) || 0);
    return n > 0 ? previewCustomers(n) : null;
  }, [params]);
  const residents = useMemo(() => preview ?? live?.customers ?? [], [preview, live]);
  const layout = useMemo(() => makeLayout(residents.length), [residents.length]);

  const hover = useCallback((on: boolean) => { document.body.style.cursor = on ? "pointer" : ""; }, []);
  // selecting an element also glides the camera to it (FE-11)
  const select = useCallback((s: Selection) => { setSel(s); send({ kind: "focus", at: s.at }); }, [send]);
  const tilt = useCallback((to: number) => {
    const next = THREE.MathUtils.clamp(Math.round(to), VIEW_DOWN.min, VIEW_DOWN.max);
    setDown(next);
    send({ kind: "tilt", down: next });
    try { localStorage.setItem(VIEW_KEY, String(next)); } catch { /* private mode: not remembered */ }
  }, [send]);
  useEffect(() => {
    let saved = NaN;
    try { saved = Number(localStorage.getItem(VIEW_KEY)); } catch { /* not available */ }
    if (saved >= VIEW_DOWN.min && saved <= VIEW_DOWN.max && saved !== VIEW_DOWN.initial) tilt(saved);
  }, [tilt]);
  /** Steps from the angle shown now (a right-drag may have changed it since the last pick). */
  const shownDown = () => parseInt(angle.current?.textContent ?? "", 10) || down;
  const ctx: CityCtx = useMemo(() => ({ kit, layout, select, selected: sel, hover }), [kit, layout, select, sel, hover]);
  const detail = sel ? detailFor(sel, live, events) : null;
  const wanted = useRef(params.get("sel"));  // applied once, so closing the detail keeps it closed
  useEffect(() => {
    if (!wanted.current || !live) return;
    const s = preselect(wanted.current, live);
    wanted.current = null;
    if (s) setSel(s);
  }, [live]);

  // -- read-only views over the live data (the same ones as the classic cockpit) --
  const names = useMemo(() => Object.fromEntries((live?.stock ?? []).map((s) => [s.item_id, s.sku])), [live]);
  const acts = useMemo(() => items.map((it) => toAct(it, names)).filter((a): a is Act => !!a), [items, names]);
  const feed = useMemo(() => feedOf(acts, filter), [acts, filter]);
  const views = useMemo(() => agentViews(live, items), [live, items]);
  const incidents = useMemo(() => findIncidents(items, live), [items, live]);
  const comparisons = useMemo(() => planComparisons(items, live), [items, live]);
  const motion = useMotion(live, residents, layout, names, !!preview);
  const { onFresh } = motion;

  // -- new actions → toasts and pulse rings (FE-39). The baseline is the backlog read when caughtUp turns true,
  //    so what was there at page load (or at a scenario restart) never notifies. --
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!caughtUp) return;
    const { seen: next, fresh } = freshActs(seen.current, acts);
    seen.current = next;
    if (!fresh.length) return;
    onFresh(fresh);  // messengers, forklift trips, dock trucks (FE-23, FE-52)
    const now = Date.now(), t = performance.now();
    setToasts((old) => [...fresh.slice(-MAX_TOASTS).reverse().map((a) => ({ ...a, until: now + toastMs(a) })), ...old]
      .filter((x, i, all) => all.findIndex((y) => y.key === x.key) === i).slice(0, MAX_TOASTS));
    setPulses((old) => [...old.filter((p) => t - p.t0 < PULSE_MS),
      ...fresh.slice(-MAX_PULSES).map((a, i) => ({ id: `${a.key}#${t}`, at: a.sel.at, color: agent(a.who).color, t0: t + i * PULSE_GAP_MS }))]);
  }, [acts, caughtUp, onFresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now(), t = performance.now();
      setToasts((old) => (old.some((x) => x.until <= now) ? old.filter((x) => x.until > now) : old));
      setPulses((old) => (old.some((p) => t - p.t0 > PULSE_MS) ? old.filter((p) => t - p.t0 <= PULSE_MS) : old));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // -- run controls: the same simulation doors as the classic top bar --
  const flash = useCallback((m: string) => { setActionError(m); setTimeout(() => setActionError(null), 6000); }, []);
  const doors = useSimDoors(live, {
    onError: flash,
    onReport: (runId) => setReport({ runId }),
    onChanged: (fresh) => {
      if (fresh) {  // a scenario (re)start: a new picture; its starting backlog is not news
        reset(); seen.current = null; motion.reset();
        setSel(null); setOrderId(null); setChatOrder(null); setStory(null); setToasts([]); setPulses([]);
      }
      refresh();
    },
  });
  // one card at a time: opening a panel, a view or the More menu closes whatever card is open
  const closeCards = () => { setPanel(null); setStory(null); };
  const toggle = (p: Panel) => { setStory(null); setPanel((old) => (old === p ? null : p)); };
  const show = (a: Act) => select(a.sel);
  const openStory = (id: string) => { setPanel(null); setStory(id); };

  // re-evaluate the banner every second while offline, so its "… ago" stays true
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!error) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [error]);
  const link = connectionOf(error, updatedAt, error ? now : Date.now());

  return (
    <div className="city">
      <CityCanvas onMissed={() => setSel(null)}>
        <CityContext.Provider value={ctx}>
          <TimeOfDay mode={mode} focus={focus} />
          <CameraRig cmd={cmd} focus={focus} bounds={layout.city} down={down} angleOut={angle} />
          {/* scenery: clicking it clears the selection like clicking empty sky (buildings stop the click first);
              the end of a drag (camera pan) is not a click */}
          <group onClick={(e) => { e.stopPropagation(); if (isClick(e)) setSel(null); }}>
            <Ground />
            <Roads />
            <Plants />
            <ContactShadows />
            <Lamps />
            <ModelSlot><PeopleNightGlow /><VehicleLights /><PeopleWarmup /></ModelSlot>
            <CityFence />
            <PlotFences />
          </group>
          <TownSquare events={events} ready={caughtUp} />
          <Offices />
          <WarehouseSite live={live} trucks={motion.yard.trucks} />
          <FactorySite live={live} />
          <Neighbourhood residents={residents} preview={!!preview} away={motion.away} />
          <NegotiationArcs live={live} />
          <Walkers walks={motion.walks} />
          <Messengers list={motion.messengers} />
          <Visitors list={motion.visits} />
          <MovingTrucks trucks={motion.yard.trucks} />
          <LiveForklifts yard={motion.yard} />
          <DepotYards suppliers={live?.suppliers.length ?? 0} />
          <Pulses pulses={pulses} />
          {sel && <SelectionMark sel={sel} />}
          {showFps && <FpsProbe out={fps} />}
        </CityContext.Provider>
      </CityCanvas>

      <CityTopBar live={live} link={link} site={site}
                  onSite={(s) => (s === "CITY" ? send({ kind: "home" }) : send({ kind: "site", site: s }))}
                  mode={mode} onMode={setMode} showFps={showFps} onFps={() => setShowFps(!showFps)}
                  doors={doors} onPanel={toggle} onMore={closeCards} onReport={() => setReport({ runId: null })} />
      <KpiStrip live={live} incidents={incidents} comparisons={comparisons} onFilter={(f) => { setSel(null); setFilter(f); }} />
      <AgentRail views={views} names={names}
                 onPick={(code) => select({ kind: "office", id: code, at: officeAt(code), label: `${agent(code).name} office` })} />

      {/* the camera strip with the toasts stacked under it, clear of the middle of the City */}
      <div className="city-dock">
        <div className="city-strip">
          <button title="Zoom in" onClick={() => send({ kind: "zoom", f: 0.7 })}>＋</button>
          <button title="Zoom out" onClick={() => send({ kind: "zoom", f: 1.4 })}>－</button>
          <button title="Rotate left" onClick={() => send({ kind: "rotate", deg: -45 })}>↺</button>
          <button title="Rotate right" onClick={() => send({ kind: "rotate", deg: 45 })}>↻</button>
          <button title="Look more from above" onClick={() => tilt(shownDown() + VIEW_DOWN.step)}>⤒</button>
          <button ref={angle} className="city-angle" title={`View angle: click for the default (${VIEW_DOWN.initial}°)`}
                  onClick={() => tilt(VIEW_DOWN.initial)}>{down}°</button>
          <button title="Look more from the side" onClick={() => tilt(shownDown() - VIEW_DOWN.step)}>⤓</button>
          <button title="Whole City" onClick={() => send({ kind: "home" })}>⌂</button>
        </div>
        <Toasts toasts={toasts} onShow={show} onClose={(k) => setToasts((old) => old.filter((x) => x.key !== k))} />
      </div>

      <aside className="city-col">
        {detail ? <DetailCard d={detail} onClose={() => setSel(null)} />
          : <ActivityFeed feed={feed} filter={filter} onFilter={setFilter} onShow={show} />}
        <Resources live={live} onSelect={select} />
      </aside>
      <OrderTrack live={live} chosen={orderId} onChoose={setOrderId} onStory={openStory}
                  onChat={(id) => { setChatOrder(id); setStory(null); setPanel("chat"); }} />

      {/* the classic panel's views, reused as they are, in a layer below the top bar */}
      <div className="city-layer">
        {panel === "order" && <NewOrderPanel live={live} onClose={() => setPanel(null)} onAdded={refresh} />}
        {panel === "customers" && <CustomersPanel onClose={() => setPanel(null)} onSaved={refresh} />}
        {panel === "disruptions" && <Disruptions live={live} onClose={() => setPanel(null)} onFired={refresh} />}
        {panel === "incidents" && <IncidentView incidents={incidents} names={names} onClose={() => setPanel(null)} onOpenStory={openStory} />}
        {panel === "plans" && <PlanCompare comparisons={comparisons} onClose={() => setPanel(null)} onOpenStory={openStory} />}
        {panel === "chat" && (
          <div className="city-chatbox">
            <AgentChat live={live} items={items} focusOrder={chatOrder} onFocusOrder={setChatOrder} onOpenStory={openStory}
                       names={names} onClose={closeCards} />
          </div>
        )}
        {story && <OrderStoryView demandId={story} live={live} items={items} onClose={() => setStory(null)} />}
      </div>
      {report && <RunReport runId={report.runId} onClose={() => setReport(null)} />}

      {link.kind !== "live" && <div className={`city-banner ${link.kind}`} role="status">{link.text}</div>}
      {actionError && <div className="city-banner offline city-action-error" role="alert">{actionError}</div>}
      {preview && <div className="city-preview">Preview: {preview.length} made-up houses (?customers), not real customers</div>}
      {showFps && <div className="city-fps" ref={fps}>… fps</div>}
    </div>
  );
}
