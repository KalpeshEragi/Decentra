"use client";
// The City's shared kit: the video-daylight palette (FE-7, FE-35 variant A), its materials, the City context that every
// Site reads, and small primitives (blocks, window facades, click targets, tags, signs, pins, people).

import { Html } from "@react-three/drei";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { createContext, ReactNode, useContext, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Layout } from "@/lib/city/cityLayout";
import type { Selection } from "@/lib/city/detail";
import { seeded } from "@/lib/city/planting";
import { useLampGlow, useNightGlow } from "./lighting";
import { ModelSlot } from "./models";
import { StandingPerson } from "./people";

export const PALETTE = {
  ground: "#eceff6", road: "#dde2ee", roadEdge: "#f8f9fc", lane: "#ffffff", plaza: "#f4f6fa", plazaTile: "#e3e7f0",
  wall: "#f3f5f9", wallShade: "#e2e7f1", trim: "#2457d6", trimDark: "#1b3fa8", glass: "#9db9ee", roof: "#e9edf4",
  tree: ["#6cc48a", "#58b57a", "#7ed39b"], cab: "#2457d6", box: "#d9a86c",
  crate: "#2f63e0", forklift: "#f2c230", fence: "#c9d1e0", steps: "#e0433f", lawn: "#d8f0b8",
};

export type Kit = Record<"ground" | "road" | "roadEdge" | "lane" | "plaza" | "plazaTile" | "wall" | "wallShade" | "trim" |
  "trimDark" | "glass" | "roof" | "cab" | "box" | "crate" | "forklift" | "fence" | "steps" |
  "dark" | "wood" | "lamp" | "white" | "glassNight", THREE.MeshStandardMaterial>;

/** For a surface lying on (or just in front of) another: drawn in front, so the two never flicker (z-fighting). */
export const DECAL = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } as const;

/** One material per surface type, shared by every mesh that uses it (fewer GPU state changes). */
export function makeKit(): Kit {
  const m = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });
  const P = PALETTE;
  return {
    ground: m(P.ground), road: m(P.road), roadEdge: m(P.roadEdge), lane: m(P.lane, DECAL), plaza: m(P.plaza), plazaTile: m(P.plazaTile),
    wall: m(P.wall), wallShade: m(P.wallShade), trim: m(P.trim), trimDark: m(P.trimDark),
    glass: m(P.glass, { roughness: 0.15, metalness: 0.3 }), roof: m(P.roof), cab: m(P.cab),
    box: m(P.box), crate: m(P.crate), forklift: m(P.forklift),
    fence: m(P.fence, { transparent: true, opacity: 0.55 }), steps: m(P.steps), dark: m("#2a3142"), wood: m("#c89b62"),
    white: m("#ffffff"),
    lamp: m("#fff4d6", { emissive: new THREE.Color("#ffd27a"), emissiveIntensity: 0 }),
    glassNight: m(P.glass, { roughness: 0.15, metalness: 0.3, emissive: new THREE.Color("#ffcf7d"), emissiveIntensity: 0 }),
  };
}

/** What every part of the City reads: materials, the current layout, and selection / hover callbacks. */
export type CityCtx = { kit: Kit; layout: Layout; select: (s: Selection) => void; selected: Selection | null; hover: (on: boolean) => void };
export const CityContext = createContext<CityCtx | null>(null);
export function useCity(): CityCtx {
  const c = useContext(CityContext);
  if (!c) throw new Error("useCity outside the City scene");
  return c;
}

/** A box standing on y (its bottom), centred on x/z. */
export function Block({ x, z, w, d, h, y = 0, mat, rot = 0, shadow = true }: {
  x: number; z: number; w: number; d: number; h: number; y?: number; mat: THREE.Material; rot?: number; shadow?: boolean;
}) {
  return (
    <mesh position={[x, y + h / 2, z]} rotation={[0, rot, 0]} material={mat} castShadow={shadow} receiveShadow>
      <boxGeometry args={[w, h, d]} />
    </mesh>
  );
}

// ---- facades -------------------------------------------------------------------------------------------------------

const facadeCache = new Map<string, { map: THREE.CanvasTexture; glow: THREE.CanvasTexture }>();

/** A window-grid texture and its "lit at night" twin, seeded so the same facade always looks the same; cached. */
function facadeTex(cols: number, rows: number, band: boolean) {
  const key = `${cols}x${rows}|${band}`;
  const hit = facadeCache.get(key);
  if (hit) return hit;
  const cw = 32, ch = 40, W = cols * cw, H = rows * ch;
  const a = document.createElement("canvas"), b = document.createElement("canvas");
  a.width = b.width = W; a.height = b.height = H;
  const g = a.getContext("2d")!, k = b.getContext("2d")!;
  g.fillStyle = PALETTE.wall; g.fillRect(0, 0, W, H);
  k.fillStyle = "#000"; k.fillRect(0, 0, W, H);
  const rnd = seeded(cols * 31 + rows * 17);
  for (let r = 0; r < rows; r++) {
    if (band) { g.fillStyle = PALETTE.glass; g.fillRect(0, r * ch + 8, W, ch - 16); }
    for (let c = 0; c < cols; c++) {
      const x = c * cw + 5, y = r * ch + 8, w = cw - 10, h = ch - 16;
      if (!band) { g.fillStyle = PALETTE.glass; g.fillRect(x, y, w, h); g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(x, y, w, 3); }
      // every window is lit at night, in two warm tones so the facade does not look flat
      k.fillStyle = rnd() > 0.5 ? "#ffd690" : "#ffe9bf"; k.fillRect(band ? c * cw : x, y, band ? cw - 2 : w, h);
    }
  }
  const map = new THREE.CanvasTexture(a), glow = new THREE.CanvasTexture(b);
  map.colorSpace = glow.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = glow.anisotropy = 4;
  const out = { map, glow };
  facadeCache.set(key, out);
  return out;
}

/** A window facade on one face of a block; all its windows glow at night. */
export function Facade({ x, z, y = 0, w, h, rot, cols, rows, band = false }: {
  x: number; z: number; y?: number; w: number; h: number; rot: number; cols: number; rows: number; band?: boolean;
}) {
  const mat = useMemo(() => {
    const t = facadeTex(cols, rows, band);
    return new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.glow, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0, roughness: 0.5, ...DECAL });
  }, [cols, rows, band]);
  useNightGlow(mat, 1.1);
  return (
    <mesh position={[x, y + h / 2, z]} rotation={[0, rot, 0]} material={mat} receiveShadow>
      <planeGeometry args={[w, h]} />
    </mesh>
  );
}

// ---- interaction and labels ----------------------------------------------------------------------------------------

const CLICK_SLOP = 4;  // pixels the pointer may travel between press and release and still count as a click
/** A real click, not the end of a camera drag (browsers fire a click after a drag too). */
export const isClick = (e: ThreeEvent<MouseEvent>) => e.delta <= CLICK_SLOP;

/** Everything inside selects `sel` on click (FE-11) and shows a pointer on hover. */
export function Clickable({ sel, children }: { sel: Selection; children: ReactNode }) {
  const { select, hover } = useCity();
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (isClick(e)) select(sel); }}
      onPointerOver={(e) => { e.stopPropagation(); hover(true); }}
      onPointerOut={() => hover(false)}>
      {children}
    </group>
  );
}

/** A pill label like the video's "WH-01 · Riverside Hub"; hidden when the camera is farther than `maxDist`. */
export function Tag({ at, text, sub, color, maxDist = 520, always = false }: {
  at: [number, number, number]; text: string; sub?: string; color?: string; maxDist?: number; always?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const p = useMemo(() => new THREE.Vector3(...at), [at]);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.style.opacity = always || camera.position.distanceTo(p) < maxDist ? "1" : "0";
  });
  return (
    <Html position={at} center zIndexRange={[9, 0]} style={{ pointerEvents: "none" }}>
      <div ref={ref} className="city-tag">
        {color && <i style={{ background: color }} />}<b>{text}</b>{sub && <span>{sub}</span>}
      </div>
    </Html>
  );
}

export function signTexture(text: string, color: string, w = 512) {
  const c = document.createElement("canvas"); c.width = w; c.height = 128;
  const g = c.getContext("2d")!; g.fillStyle = color; g.fillRect(0, 0, w, 128);
  g.fillStyle = "#fff"; g.font = "800 72px Inter, Segoe UI, sans-serif"; g.textAlign = "center"; g.fillText(text, w / 2, 92);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** A flat coloured sign with white capitals (building names). */
export function Sign({ text, color, pos, rot = 0, w = 10, h = 2.5 }: { text: string; color: string; pos: [number, number, number]; rot?: number; w?: number; h?: number }) {
  const tex = useMemo(() => signTexture(text, color), [text, color]);
  return <mesh position={pos} rotation={[0, rot, 0]}><planeGeometry args={[w, h]} /><meshBasicMaterial map={tex} toneMapped={false} {...DECAL} /></mesh>;
}

export const PIN_COLORS = { blue: PALETTE.trim, amber: "#e3a321", red: "#d64545", green: "#1f9d55" } as const;

/** A bobbing map pin (a state marker on a truck, worker or stack). */
export function MapPin({ at, color }: { at: [number, number, number]; color: string }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => { g.current.position.y = at[1] + 2.4 + Math.sin(clock.elapsedTime * 2) * 0.25; });
  return (
    <group ref={g} position={at}>
      <mesh position={[0, 0.9, 0]}><sphereGeometry args={[0.9, 16, 12]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, -0.2, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.7, 1.6, 16]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, 0.9, 0.55]}><sphereGeometry args={[0.35, 10, 8]} /><meshStandardMaterial color="#fff" /></mesh>
    </group>
  );
}

/** An agent's character at its office (the Businessman model) on a disc of the agent's colour: idle breathing only
 *  (FE-16, FE-26). */
export function Person({ at, color, seed = 0 }: { at: [number, number, number]; color: string; seed?: number }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => { g.current.scale.y = 1 + Math.sin(clock.elapsedTime * 2 + seed) * 0.015; });
  return (
    <group position={at}>
      <AgentDisc color={color} />
      <group ref={g}><ModelSlot><StandingPerson kind="businessman" at={[0, 0, 0]} /></ModelSlot></group>
    </group>
  );
}

/** The flat disc of an agent's colour under its character and its messengers; it glows while the lamps are on. */
export function AgentDisc({ color }: { color: string }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: new THREE.Color(color), emissiveIntensity: 0 }), [color]);
  useLampGlow(mat, 1.2);
  return (
    <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat} receiveShadow>
      <circleGeometry args={[1.3, 24]} />
    </mesh>
  );
}
