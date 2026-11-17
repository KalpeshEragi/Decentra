"use client";
// Everything that moves with business meaning, and only on real data (FE-12, FE-26): customer owners walking to Sales on
// a real inquiry (FE-32), agents carrying a negotiation message to the other office plus the dashed arc of every open
// negotiation (FE-23), subscribers reading a delivered event in a park and visiting its publisher (eventVisits), live
// forklifts on real Warehouse events and the dock trucks they load and unload (FE-52). All timing and routes come from
// the pure logic in lib/city (customerWalks, messengers, eventVisits, forklifts); this file only draws
// it and keeps the state. The resting picture is always the live snapshot, so a reload or missed poll stays true.

import { Html, QuadraticBezierLine } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Live } from "@/lib/api";
import { agent } from "@/lib/agents";
import type { Act } from "@/lib/city/activity";
import type { Layout } from "@/lib/city/cityLayout";
import { addWalks, Customer, dropEnded, inquiryWords, newInquiries, Walk, walkState } from "@/lib/city/customerWalks";
import { EMPTY_YARD, forkliftAt, planYard, Trip, tripOf, truckAt, TruckRun, Yard } from "@/lib/city/forklifts";
import { addVisits, Delivery, Visit, visitAt } from "@/lib/city/eventVisits";
import { addMessengers, Messenger, messengerAt } from "@/lib/city/messengers";
import { DockSlot, dockSlots } from "@/lib/city/siteRules";
import { officeAt } from "@/lib/city/sites";
import { FORKLIFTS, YARD_ROADS } from "@/lib/city/yard";
import { Forklift } from "./forklift";
import { AgentDisc, Block, isClick, useCity } from "./kit";
import { ModelSlot } from "./models";
import { OWNER_COLORS } from "./neighbourhood";
import { WalkingPerson } from "./people";
import { Pallet, Truck } from "./warehouse";

// ---- state ----------------------------------------------------------------------------------------------------------

/** The moving things' state. `onFresh` takes the new feed lines of one poll (already past the page-load baseline). */
export function useMotion(live: Live | null, residents: Customer[], layout: Layout, names: Record<string, string>, preview: boolean) {
  const [walks, setWalks] = useState<Walk[]>([]);
  const [messengers, setMessengers] = useState<Messenger[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [yard, setYard] = useState<Yard>(EMPTY_YARD);
  const [away, setAway] = useState<Set<number>>(() => new Set());
  const roads = useMemo(() => [...layout.roads, ...YARD_ROADS], [layout.roads]);

  // dock doors seen lately: a dispatched shipment has already left the snapshot that reports it
  const doorsSeen = useRef(new Map<string, DockSlot>());
  useEffect(() => {
    if (!live) return;
    for (const s of dockSlots(live.docks).slots) doorsSeen.current.set(`${s.kind}:${s.id}`, s);
    while (doorsSeen.current.size > 60) doorsSeen.current.delete(doorsSeen.current.keys().next().value!);
  }, [live]);

  // a real inquiry (a rise of the customer's count): the owner walks to Sales; the first snapshot is the baseline
  const inquiries = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    if (!live || preview) return;
    const { next, arrivals } = newInquiries(inquiries.current, residents);
    inquiries.current = next;
    if (arrivals.length) setWalks((old) => addWalks(old, arrivals, layout.houses, performance.now()));
  }, [live, residents, layout.houses, preview]);

  const onFresh = useCallback((fresh: Act[]) => {
    if (!live || !fresh.length) return;
    const now = performance.now();
    const talks = fresh.filter((a) => a.kind === "talk" && a.to)
      .map((a) => ({ key: a.key, from: a.who, to: a.to!, label: a.bubble ?? "message" }));
    if (talks.length) setMessengers((old) => addMessengers(old, talks, roads, now));
    const deliveries: Delivery[] = fresh.filter((a) => a.kind === "event" && a.tone !== "grey")
      .flatMap((a) => (a.item.subscribers ?? []).map((who) => ({ key: a.key, who, event: a.item.type ?? "event", publisher: a.who })));
    if (deliveries.length) setVisits((old) => addVisits(old, deliveries, roads, now));
    const current = dockSlots(live.docks).slots;
    const slots = [...current, ...[...doorsSeen.current.values()].filter((s) => !current.some((c) => c.kind === s.kind && c.id === s.id))];
    const trips = fresh.map((a) => tripOf(a.item, { live, names, slots })).filter((t): t is Trip => !!t);
    if (trips.length) setYard((old) => planYard(old, trips, roads, dockSlots(live.docks).doors, now));
  }, [live, names, roads]);

  // once a second: drop what ended, and which owners are out (their house shows no owner meanwhile)
  const walking = useRef(walks);
  walking.current = walks;
  useEffect(() => {
    const t = setInterval(() => {
      const now = performance.now();
      setWalks((old) => dropEnded(old, now));
      setMessengers((old) => (old.some((m) => m.t0 + m.ms <= now) ? old.filter((m) => m.t0 + m.ms > now) : old));
      setVisits((old) => (old.some((v) => v.end <= now) ? old.filter((v) => v.end > now) : old));
      const out = new Set(walking.current.filter((w) => walkState(w, now)).map((w) => w.idx));
      setAway((prev) => ([...out].sort().join() === [...prev].sort().join() ? prev : out));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  /** A scenario restart: nothing of the old run keeps moving, and the new run's backlog sets new baselines. */
  const reset = useCallback(() => {
    setWalks([]); setMessengers([]); setVisits([]); setYard(EMPTY_YARD); setAway(new Set());
    inquiries.current = null; doorsSeen.current.clear();
  }, []);

  return { walks, messengers, visits, yard, away, onFresh, reset };
}

// ---- drawing --------------------------------------------------------------------------------------------------------

/** A label riding on something that moves; hidden when the camera is farther than `maxDist`. */
function RideTag({ y, children, color, maxDist = 360 }: { y: number; children: ReactNode; color?: string; maxDist?: number }) {
  const ref = useRef<HTMLDivElement>(null), anchor = useRef<THREE.Group>(null!);
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.style.opacity = camera.position.distanceTo(anchor.current.getWorldPosition(p)) < maxDist ? "1" : "0";
  });
  return (
    <group ref={anchor} position={[0, y, 0]}>
      <Html center zIndexRange={[9, 0]} style={{ pointerEvents: "none" }}>
        <div ref={ref} className="city-bubble" style={color ? { borderColor: color } : undefined}>{children}</div>
      </Html>
    </group>
  );
}

/** Customer owners on their way to Sales and back (FE-32); the bubble says how many inquiries they carry. */
export function Walkers({ walks }: { walks: Walk[] }) {
  return <>{walks.map((w) => <Walker key={w.id} w={w} />)}</>;
}
function Walker({ w }: { w: Walk }) {
  const g = useRef<THREE.Group>(null!), bubble = useRef<THREE.Group>(null!);
  const motion = useMemo(() => ({ moving: false }), []);
  const [out, setOut] = useState(false);
  useFrame(() => {
    const now = performance.now(), s = walkState(w, now);
    g.current.visible = !!s;
    motion.moving = !!s?.moving;
    if (!!s !== out) setOut(!!s);
    if (!s) return;
    g.current.position.set(s.x, 0, s.z);
    g.current.rotation.y = s.heading;
    bubble.current.visible = s.phase !== "home";
  });
  const color = OWNER_COLORS[w.idx % OWNER_COLORS.length];
  return (
    <group ref={g} visible={false}>
      {/* the same person as at the house door: man for even houses, woman for odd; built only while out */}
      {out && <ModelSlot><WalkingPerson kind={w.idx % 2 ? "woman" : "man"} motion={motion} /></ModelSlot>}
      <group ref={bubble}><RideTag y={6 + w.slot * 1.5} color={color}>{w.label} · {inquiryWords(w.count)}</RideTag></group>
    </group>
  );
}

/** Agents carrying a negotiation message along the roads, with a glowing envelope and a short bubble (FE-23). */
const WALKING = { moving: true };

export function Messengers({ list }: { list: Messenger[] }) {
  const envelope = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: new THREE.Color("#ffd27a"), emissiveIntensity: 1.6 }), []);
  return <>{list.map((m) => <Carrier key={m.key + m.t0} m={m} envelope={envelope} />)}</>;
}
function Carrier({ m, envelope }: { m: Messenger; envelope: THREE.Material }) {
  const g = useRef<THREE.Group>(null!);
  // a poll's messages walk one after another: the figure is built only while this one walks, not for the whole queue
  const [on, setOn] = useState(false);
  useFrame(() => {
    const now = performance.now(), s = messengerAt(m, now);
    g.current.visible = !!s;
    if (!!s !== on) setOn(!!s);
    if (!s) return;
    g.current.position.set(s.x, 0, s.z);
    g.current.rotation.y = s.heading;
  });
  const color = agent(m.from).color;
  return (
    <group ref={g} visible={false}>
      {on && <>
        <AgentDisc color={color} />
        <ModelSlot><WalkingPerson kind="businessman" motion={WALKING} /></ModelSlot>
        <mesh position={[0, 4.6, 0]} material={envelope}><boxGeometry args={[1.6, 1, 0.2]} /></mesh>
        <RideTag y={6.5} color={color}>{m.label}</RideTag>
      </>}
    </group>
  );
}

/** Subscribers reading a delivered event: out to the nearest park's round lawn, facing the Town Square board while
 *  reading, then to the publisher's office and home. No envelope: this is not a negotiation. */
export function Visitors({ list }: { list: Visit[] }) {
  return <>{list.map((v) => <Visitor key={`${v.who}|${v.t0}`} v={v} />)}</>;
}
function Visitor({ v }: { v: Visit }) {
  const g = useRef<THREE.Group>(null!), tag = useRef<THREE.Group>(null!);
  const motion = useMemo(() => ({ moving: false }), []);
  const [on, setOn] = useState(false);
  const [phase, setPhase] = useState("toPark");
  useFrame(() => {
    const s = visitAt(v, performance.now());
    g.current.visible = !!s;
    if (!!s !== on) setOn(!!s);
    if (!s) return;
    g.current.position.set(s.x, s.y, s.z);
    g.current.rotation.y = s.heading;
    motion.moving = s.moving;
    tag.current.visible = s.phase !== "home";
    if (s.phase !== phase) setPhase(s.phase);
  });
  const color = agent(v.who).color, event = v.more ? `${v.event} +${v.more}` : v.event;
  const text = phase === "toPark" ? `to read ${event}` : phase === "reading" ? `reading ${event}`
    : phase === "toPublisher" ? `to ${agent(v.publisher).name} · ${v.event}` : `at ${agent(v.publisher).name} · ${v.event}`;
  return (
    <group ref={g} visible={false}>
      {on && <>
        <AgentDisc color={color} />
        <ModelSlot><WalkingPerson kind="businessman" motion={motion} /></ModelSlot>
        <group ref={tag}><RideTag y={5.5} color={color}>{text}</RideTag></group>
      </>}
    </group>
  );
}

/** A dashed glowing arc between the two offices of each open negotiation; clicking it opens the thread (FE-23). */
export function NegotiationArcs({ live }: { live: Live | null }) {
  const { select, hover } = useCity();
  return (
    <group>
      {(live?.negotiations_open ?? []).map((n) => {
        const a = officeAt(n.starter), b = officeAt(n.owner);
        const mid: [number, number, number] = [(a[0] + b[0]) / 2, 32 + Math.hypot(a[0] - b[0], a[2] - b[2]) * 0.12, (a[2] + b[2]) / 2];
        // blue while open (an agreement only proposed is still open), green agreed, red rejected or expired (FE-23)
        const color = /^(AGREED|ACCEPTED)$/.test(n.status) ? "#1f9d55" : /REJECT|EXPIRE/.test(n.status) ? "#e04343" : "#2f6fed";
        return (
          <QuadraticBezierLine key={n.session_id} start={[a[0], 12, a[2]]} end={[b[0], 12, b[2]]} mid={mid} color={color}
            lineWidth={3} dashed dashSize={3} gapSize={2}
            onClick={(e) => { e.stopPropagation(); if (isClick(e)) select({ kind: "negotiation", id: n.session_id, at: [mid[0], 0, mid[2]],
              label: `${agent(n.starter).name} → ${agent(n.owner).name}` }); }}
            onPointerOver={(e) => { e.stopPropagation(); hover(true); }} onPointerOut={() => hover(false)} />
        );
      })}
    </group>
  );
}

/** Supplier trucks driving in to their door, shipment trucks waiting to be loaded and leaving (FE-52). */
export function MovingTrucks({ trucks }: { trucks: TruckRun[] }) {
  return <>{trucks.map((t) => <MovingTruck key={`${t.key}|${t.dir}`} run={t} />)}</>;
}
function MovingTruck({ run }: { run: TruckRun }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(() => {
    const s = truckAt(run, performance.now());
    g.current.visible = !!s;
    if (!s) return;
    g.current.position.set(s.x, 0, s.z);
    g.current.rotation.y = s.heading;
  });
  return <group ref={g} visible={false}><Truck at={[0, 0, 0]} rot={0} label={run.label} lit /></group>;
}

/** The three forklifts: driving their trips with the real goods on the forks, otherwise at the charging bay (FE-52). */
export function LiveForklifts({ yard }: { yard: Yard }) {
  return <>{Array.from({ length: FORKLIFTS }, (_, f) => <LiveForklift key={f} f={f} legs={yard.fleet[f] ?? []} />)}</>;
}
function LiveForklift({ f, legs }: { f: number; legs: Yard["fleet"][number] }) {
  const { kit, select, hover } = useCity();
  const g = useRef<THREE.Group>(null!);
  const [load, setLoad] = useState<string | null>(null);
  const [driving, setDriving] = useState(false);  // lights on while it moves (FE-53 look), off when parked
  useFrame(() => {
    const s = forkliftAt(legs, f, performance.now());
    const moved = Math.abs(s.x - g.current.position.x) + Math.abs(s.z - g.current.position.z) > 0.001;
    g.current.position.set(s.x, 0, s.z);
    g.current.rotation.y = s.heading;
    if (s.load !== load) setLoad(s.load);
    if (moved !== driving) setDriving(moved);
  });
  const label = `FL-0${f + 1}`;
  return (
    <group onClick={(e) => { e.stopPropagation(); if (isClick(e)) select({ kind: "forklift", id: label, at: [g.current.position.x, 0, g.current.position.z], label }); }}
      onPointerOver={(e) => { e.stopPropagation(); hover(true); }} onPointerOut={() => hover(false)}>
      <Forklift ref={g} lit={driving}>
        {load && <>
          <Pallet size={0.55} />
          <Block x={0} z={0} w={1.7} d={1.7} h={1.3} y={0.2} mat={kit.box} />
          <RideTag y={3.2} maxDist={300}>{load}</RideTag>
        </>}
      </Forklift>
    </group>
  );
}
