"use client";
// The Town Square (FE-22, FE-37): one free-standing event board, a four-sided screen cube on a single pylon like a
// stadium scoreboard, so it reads from every direction. Every face shows the same board: the newest event large
// (publishing agent, event name, plain-words line, who it is delivered to, time), then recent events as rows. NEW and a
// glowing frame show for a few seconds only when an event arrives while watching, not for events already there at load.
// A ticker runs around all four sides; red steps face the board. Clicking a row opens that event (FE-11).

import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { agent } from "@/lib/agents";
import { CityEvent, hhmm } from "@/lib/city/detail";
import { Block, Clickable, isClick, PALETTE, Tag, useCity, DECAL } from "./kit";
import { Footprint } from "./contact";

const W = 2048, H = 1152;          // board texture (16:9)
const FEATURE = { top: 130, bottom: 560 };
const ROW = { top: 600, h: 79, n: 7 };
const NEW_MS = 8000;               // how long NEW and the glowing frame stay after an event arrives
const FONT = `Inter, "Segoe UI", sans-serif`;

function fit(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 800) {
  let s = size;
  do { g.font = `${weight} ${s}px ${FONT}`; s -= 2; } while (g.measureText(text).width > maxW && s > 18);
}

function chips(g: CanvasRenderingContext2D, codes: string[], x: number, y: number, size: number, maxX: number) {
  for (const s of codes.length ? codes : ["—"]) {
    const a = agent(s); g.font = `700 ${size}px ${FONT}`;
    const w = g.measureText(a.name).width + size;
    if (x + w > maxX) break;
    g.fillStyle = s === "—" ? "#33415f" : a.color; g.beginPath(); g.roundRect(x, y - size * 1.05, w, size * 1.5, size * 0.75); g.fill();
    g.fillStyle = "#fff"; g.fillText(a.name, x + size / 2, y); x += w + 14;
  }
}

/** The whole board: header, the newest event large, then the recent events as rows. */
function drawBoard(g: CanvasRenderingContext2D, events: CityEvent[], fresh: boolean) {
  g.fillStyle = "#0b1631"; g.fillRect(0, 0, W, H);
  g.fillStyle = PALETTE.trim; g.fillRect(0, 0, W, 110);
  g.fillStyle = "#fff"; g.font = `800 66px ${FONT}`; g.fillText("TOWN SQUARE · LIVE EVENTS", 48, 78);
  g.font = `600 48px ${FONT}`; g.textAlign = "right";
  g.fillText(events.length ? "newest first" : "waiting for events", W - 48, 76); g.textAlign = "left";
  const e = events[0];
  const text = "#ffffff", soft = "#c9d6f2";
  if (!e) {
    g.fillStyle = soft; g.font = `700 90px ${FONT}`; g.fillText("No event published yet", 48, 380);
    return;
  }
  const pub = agent(e.publisher);
  g.fillStyle = pub.color; g.fillRect(0, FEATURE.top, 26, FEATURE.bottom - FEATURE.top);
  g.font = `800 64px ${FONT}`; g.fillText(pub.name.toUpperCase(), 64, FEATURE.top + 76);
  const nameW = g.measureText(pub.name.toUpperCase()).width;
  g.fillStyle = soft; g.font = `600 56px ${FONT}`; g.fillText(`published ${hhmm(e.time)}`, 64 + nameW + 28, FEATURE.top + 74);
  if (fresh) {
    g.fillStyle = "#ff3b3b"; g.beginPath(); g.roundRect(W - 230, FEATURE.top + 20, 180, 76, 38); g.fill();
    g.fillStyle = "#fff"; g.font = `800 52px ${FONT}`; g.fillText("NEW", W - 192, FEATURE.top + 76);
  }
  g.fillStyle = text; fit(g, e.type, W - 120, 170); g.fillText(e.type, 64, FEATURE.top + 250);
  g.fillStyle = soft; fit(g, e.text, W - 120, 70, 600); g.fillText(e.text, 64, FEATURE.top + 340);
  g.fillStyle = soft; g.font = `600 56px ${FONT}`; g.fillText("delivered to", 64, FEATURE.top + 410);
  chips(g, e.subscribers, 400, FEATURE.top + 410, 50, W - 48);
  for (let i = 0; i < ROW.n; i++) {
    const ev = events[i + 1], y = ROW.top + i * ROW.h;
    g.fillStyle = i % 2 ? "#0f1d3d" : "#12234a"; g.fillRect(0, y, W, ROW.h);
    if (!ev) continue;
    const a = agent(ev.publisher);
    g.fillStyle = soft; g.font = `600 46px Consolas, monospace`; g.fillText(hhmm(ev.time), 48, y + 56);
    g.fillStyle = a.color; g.beginPath(); g.roundRect(230, y + 14, 300, 52, 26); g.fill();
    g.fillStyle = "#fff"; fit(g, a.name, 270, 40, 700); g.fillText(a.name, 250, y + 53);
    g.fillStyle = text; fit(g, ev.type, 900, 54, 700); g.fillText(ev.type, 560, y + 58);
    let x = 1500;  // delivered-to dots
    for (const s of ev.subscribers.slice(0, 6)) {
      const sa = agent(s);
      g.fillStyle = sa.color; g.beginPath(); g.arc(x, y + 40, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff"; g.font = `800 26px ${FONT}`; g.textAlign = "center"; g.fillText(sa.initial, x, y + 49); g.textAlign = "left";
      x += 64;
    }
  }
}

/** True for NEW_MS after the newest event changes, but not for the backlog read at page load (`ready`: caught up). */
function useFreshNewest(events: CityEvent[], ready: boolean) {
  const newest = events[0]?.key ?? "";
  const first = useRef<string | null>(null);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (!ready) return;
    if (first.current === null) { first.current = newest; return; }  // the baseline: what was there once caught up
    if (!newest || newest === first.current) return;
    setFresh(true);
    const t = setTimeout(() => setFresh(false), NEW_MS);
    return () => clearTimeout(t);
  }, [newest, ready]);
  return fresh;
}

/** The four-sided screen cube on its pylon. */
function EventCube({ events, ready, y, size }: { events: CityEvent[]; ready: boolean; y: number; size: number }) {
  const { kit, select, hover } = useCity();
  const fresh = useFreshNewest(events, ready);
  const keys = events.map((e) => e.key).join(",");
  const canvas = useMemo(() => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; }, []);
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; return t;
  }, [canvas]);
  useEffect(() => {
    drawBoard(canvas.getContext("2d")!, events, fresh);
    tex.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, fresh, canvas, tex]);
  useEffect(() => () => tex.dispose(), [tex]);
  const w = size, h = (size * H) / W;
  const frame = useMemo(() => new THREE.MeshStandardMaterial({ color: "#1b2233", emissive: new THREE.Color("#ffc43d"), emissiveIntensity: 0 }), []);
  const since = useRef(0);
  useFrame((_, dt) => {
    since.current = fresh ? since.current + dt : 0;
    frame.emissiveIntensity = fresh ? (0.6 + 0.6 * Math.sin(since.current * 6)) * 2 * (1 - since.current / (NEW_MS / 1000)) : 0;
  });
  const pick = (ev: ThreeEvent<MouseEvent>) => {
    ev.stopPropagation();
    if (!isClick(ev)) return;
    const py = (1 - (ev.uv?.y ?? 1)) * H;
    const idx = py >= FEATURE.top && py < FEATURE.bottom ? 0 : py >= ROW.top ? 1 + Math.floor((py - ROW.top) / ROW.h) : -1;
    const e = idx >= 0 ? events[idx] : undefined;
    if (e) select({ kind: "billboard", id: e.key, at: [0, 0, 0], label: e.type });
  };
  return (
    <group>
      <Block x={0} z={0} w={3} d={3} h={y - h / 2 - 2.6} mat={kit.dark} />
      <Block x={0} z={0} w={8} d={8} h={0.8} mat={kit.wall} />
      <Footprint x={0} z={0} w={8} d={8} h={6} y={0.16} />
      <mesh position={[0, y, 0]} material={frame} castShadow><boxGeometry args={[w + 0.8, h + 0.8, w + 0.8]} /></mesh>
      <mesh position={[0, y + h / 2 + 1, 0]} material={kit.trim} castShadow><boxGeometry args={[w + 1.4, 1.2, w + 1.4]} /></mesh>
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((rot) => (
        <mesh key={rot} position={[Math.sin(rot) * (w / 2 + 0.45), y, Math.cos(rot) * (w / 2 + 0.45)]} rotation={[0, rot, 0]}
          onClick={pick} onPointerOver={(ev) => { ev.stopPropagation(); hover(true); }} onPointerOut={() => hover(false)}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={tex} toneMapped={false} {...DECAL} />
        </mesh>
      ))}
      <TickerBand events={events} w={w + 0.9} y={y - h / 2 - 1.6} />
    </group>
  );
}

/** A news strip running around all four sides under the cube (rolling content is allowed liveliness, FE-26). */
function TickerBand({ events, w, y }: { events: CityEvent[]; w: number; y: number }) {
  const keys = events.map((e) => e.key).join(",");
  const tex = useMemo(() => {
    const c = document.createElement("canvas"); c.width = 2048; c.height = 96;
    const g = c.getContext("2d")!;
    g.fillStyle = "#071022"; g.fillRect(0, 0, 2048, 96);
    g.font = `700 54px ${FONT}`; g.fillStyle = "#ffd84a";
    const text = events.length ? events.map((e) => `${e.type} · ${agent(e.publisher).name} ${hhmm(e.time)}`).join("   ◆   ") + "   ◆   "
      : "TOWN SQUARE · EVENTS APPEAR HERE   ◆   ";
    let x = 10; while (x < 2048) { g.fillText(text, x, 68); x += g.measureText(text).width; }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(0.7, 1);
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame((_, dt) => { tex.offset.x = (tex.offset.x + dt * 0.04) % 1; });
  return (
    <group position={[0, y, 0]}>
      <mesh><boxGeometry args={[w - 0.2, 2, w - 0.2]} /><meshStandardMaterial color="#111827" /></mesh>
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((rot) => (
        <mesh key={rot} position={[Math.sin(rot) * (w / 2 - 0.05), 0, Math.cos(rot) * (w / 2 - 0.05)]} rotation={[0, rot, 0]}>
          <planeGeometry args={[w - 0.3, 1.8]} />
          <meshBasicMaterial map={tex} toneMapped={false} {...DECAL} />
        </mesh>
      ))}
    </group>
  );
}

export function TownSquare({ events, ready }: { events: CityEvent[]; ready: boolean }) {
  const { kit } = useCity();
  const size = 26, cubeY = 24;
  return (
    <Clickable sel={{ kind: "square", id: "SQUARE", at: [0, 0, 0], label: "Town Square" }}>
      <group>
        <mesh position={[0, 0.08, 0]} material={kit.plaza} receiveShadow><boxGeometry args={[46, 0.16, 46]} /></mesh>
        <mesh position={[0, 0.19, 0]} rotation={[-Math.PI / 2, 0, 0]} material={kit.plazaTile}><ringGeometry args={[9, 10, 48]} /></mesh>
        <EventCube events={events} ready={ready} y={cubeY} size={size} />
        {/* red steps on two sides, facing the board (agents sit and read there) */}
        {[0, Math.PI].map((r) => (
          <group key={r} rotation={[0, r, 0]}>
            {[0, 1, 2, 3].map((i) => <Block key={i} x={0} z={13 + i * 1.3} w={14} d={1.3} h={0.45 + i * 0.45} mat={kit.steps} />)}
          </group>
        ))}
        {/* four planters; their bushes are planted with the rest (lib/city/planting.ts) */}
        {[[-18, 18], [18, 18], [-18, -18], [18, -18]].map(([x, z], i) => (
          <group key={i}><Block x={x} z={z} w={3.2} d={3.2} h={1} mat={kit.wall} /><Footprint x={x} z={z} w={3.2} d={3.2} h={3} y={0.16} /></group>
        ))}
        <Tag at={[0, cubeY + size * 0.28 + 4, 0]} text="Town Square" sub="events" always />
      </group>
    </Clickable>
  );
}
