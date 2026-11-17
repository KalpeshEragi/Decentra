"use client";
// The land the City stands on, drawn from the computed layout (lib/city/cityLayout.ts, planting.ts).
// Inside the City fence: the paved main city, roads, lawns and campus planting (trees, hedges, bushes, flowers); the
// customer neighbourhood and the supplier depots stand apart across open grass (FE-40). All other ground, inside and
// outside the fence, is one meadow: grass texture, gentle colour variation and grass tufts loaded in tiles around the
// camera (FE-45); the tufts also grow on the park and office lawns. Fences have a gap for people and gates for
// vehicles (FE-41, FE-43).

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CORE, GATE, inRect, Layout, PARKS, PLAZA, PLOTS, Rect, SUPPLIER_PLOTS } from "@/lib/city/cityLayout";
import { campusPlants, grassGround, LampSpot, lampSpots, PARK_CIRCLE_R, PARK_CIRCLE_TOP, Plant, PlantKind, seeded } from "@/lib/city/planting";
import { Block, PALETTE, signTexture, useCity } from "./kit";
import { useLampGlow, useNightGlow } from "./lighting";
import { ModelName, ModelSlot, Part, useModelParts } from "./models";

// ---- ground ------------------------------------------------------------------------------------------------------

/** Close-up grass: thousands of thin blades in lush greens with yellow-green tips, tiling every 6 m. */
function grassTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 512;
  const g = c.getContext("2d")!, r = seeded(11);
  g.fillStyle = "#5f9e2f"; g.fillRect(0, 0, 512, 512);
  const blades = ["#4f8f26", "#6aac34", "#7dbb3c", "#8cc541", "#a3d14e", "#5a9a2c", "#b5d95a"];
  for (let i = 0; i < 9000; i++) {
    const x = r() * 512, y = r() * 512, len = 6 + r() * 14, lean = (r() - 0.5) * 6;
    g.strokeStyle = blades[Math.floor(r() * blades.length)]; g.lineWidth = 1 + r() * 1.4;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + lean, y - len); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** Smooth value noise for gentle colour variation across the meadow (no straight edges). */
function noise2(x: number, z: number) {
  const h = (i: number, j: number) => { const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return n - Math.floor(n); };
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
}

/** The meadow under everything: one big plane, colour variation baked into its vertices, uv in metres / 6. */
function meadowGeometry(size: number, seg: number) {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const deep = new THREE.Color("#8cc252"), light = new THREE.Color("#a8d35e");
  for (let k = 0; k < pos.count; k++) {
    const n = 0.6 * noise2(pos.getX(k) / 160, pos.getY(k) / 160) + 0.4 * noise2(pos.getX(k) / 50 + 9, pos.getY(k) / 50 + 3);
    c.copy(deep).lerp(light, n);
    col.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * size) / 6, (uv.getY(k) * size) / 6);
  return geo;
}

function lawnGeometry([x0, z0, x1, z1]: Rect) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0), uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * (x1 - x0)) / 6, (uv.getY(k) * (z1 - z0)) / 6);
  return g.rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0.04, (z0 + z1) / 2);
}

export function Ground() {
  const { kit, layout } = useCity();
  const grass = useMemo(() => {
    const tex = grassTexture();
    return {
      meadowGeo: meadowGeometry(6000, 180),
      meadow: new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 1 }),
      lawn: new THREE.MeshStandardMaterial({ map: tex, color: PALETTE.lawn, roughness: 1 }),
    };
  }, []);
  // all lawns (parks and office plots) merged into one mesh
  const lawns = useMemo(() => mergeGeometries([...PARKS, ...Object.values(PLOTS).map((p) => p.rect)].map(lawnGeometry))!, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} geometry={grass.meadowGeo} material={grass.meadow} receiveShadow />
      <mesh position={[(CORE[0] + CORE[2]) / 2, 0.01, (CORE[1] + CORE[3]) / 2]} material={kit.ground} receiveShadow>
        <boxGeometry args={[CORE[2] - CORE[0], 0.02, CORE[3] - CORE[1]]} />
      </mesh>
      <TuftField />
      <Hills />
      {/* paved yards of the supplier depots and the neighbourhood blocks */}
      {[...SUPPLIER_PLOTS, ...layout.blocks].map(([x0, z0, x1, z1], i) => (
        <mesh key={`p${i}`} position={[(x0 + x1) / 2, 0.02, (z0 + z1) / 2]} material={i < SUPPLIER_PLOTS.length ? kit.plaza : kit.roadEdge} receiveShadow>
          <boxGeometry args={[x1 - x0, 0.04, z1 - z0]} />
        </mesh>
      ))}
      <mesh geometry={lawns} material={grass.lawn} receiveShadow />
      {/* park cross paths with a low round lawn in the middle, where the agents stand to read the events */}
      {PARKS.map(([x0, z0, x1, z1], i) => {
        const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
        return (
          <group key={i}>
            <mesh position={[x, 0.08, z]} material={kit.plaza}><boxGeometry args={[x1 - x0, 0.03, 3]} /></mesh>
            <mesh position={[x, 0.08, z]} material={kit.plaza}><boxGeometry args={[3, 0.03, z1 - z0]} /></mesh>
            <mesh position={[x, 0.18, z]} material={kit.wall} receiveShadow><cylinderGeometry args={[PARK_CIRCLE_R - 0.3, PARK_CIRCLE_R, 0.36, 32]} /></mesh>
            <mesh position={[x, PARK_CIRCLE_TOP - 0.05, z]} material={grass.lawn} receiveShadow><cylinderGeometry args={[PARK_CIRCLE_R - 0.6, PARK_CIRCLE_R - 0.6, 0.1, 32]} /></mesh>
          </group>
        );
      })}
    </group>
  );
}

// ---- grass tufts: tiles around the camera --------------------------------------------------------------------------

const TILE = 260, TUFTS_PER_TILE = 7000;
/** Zoomed out further than this, a second ring of tiles fills the wider view, at a lower density (FAR_DENSITY): far
 *  tufts are a few pixels each, so fewer of them read the same and cost a fraction. */
const WIDE_VIEW = 380, FAR_DENSITY = 0.4;

function tuftGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (let b = 0; b < 7; b++) {
    const a = (b / 7) * Math.PI * 2, rr = 0.25 + (b % 3) * 0.12, h = 0.9 + (b % 4) * 0.25, lean = 0.25;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const blade = new THREE.BufferGeometry();
    blade.setAttribute("position", new THREE.Float32BufferAttribute([x - 0.07, 0, z, x + 0.07, 0, z, x + Math.cos(a) * lean, h, z + Math.sin(a) * lean], 3));
    blade.setAttribute("color", new THREE.Float32BufferAttribute([0.24, 0.45, 0.12, 0.24, 0.45, 0.12, 0.72, 0.85, 0.35], 3));
    blade.computeVertexNormals();
    parts.push(blade);
  }
  return mergeGeometries(parts)!;
}

/** Tiles of tufts centred on the tile under the camera target: 3×3 at full density, plus an outer ring at a lower
 *  density while zoomed out; a tile is built only when it comes into view. */
function TuftField() {
  const { layout } = useCity();
  const [view, setView] = useState({ i: 0, j: 0, wide: false });
  const shared = useMemo(() => ({ geo: tuftGeometry(), mat: new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }) }), []);
  useFrame(({ controls, camera }) => {
    const t = (controls as unknown as { target?: THREE.Vector3 } | null)?.target;
    if (!t) return;
    const i = Math.round(t.x / TILE), j = Math.round(t.z / TILE), wide = camera.position.distanceTo(t) > WIDE_VIEW;
    if (i !== view.i || j !== view.j || wide !== view.wide) setView({ i, j, wide });
  });
  const reach = view.wide ? 2 : 1, tiles: [number, number, number][] = [];
  for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++)
    tiles.push([view.i + i, view.j + j, Math.max(Math.abs(i), Math.abs(j)) > 1 ? FAR_DENSITY : 1]);
  return <>{tiles.map(([i, j, d]) => <TuftTile key={`${i},${j},${d}|${layout.customers}`} i={i} j={j} density={d} layout={layout} geo={shared.geo} mat={shared.mat} />)}</>;
}

function TuftTile({ i, j, density, layout, geo, mat }: { i: number; j: number; density: number; layout: Layout; geo: THREE.BufferGeometry; mat: THREE.Material }) {
  const spots = useMemo(() => {
    const r = seeded(1000 + i * 7919 + j * 104729), out: [number, number, number, number][] = [];
    for (let k = 0; k < TUFTS_PER_TILE * density; k++) {
      const x = (i - 0.5) * TILE + r() * TILE, z = (j - 0.5) * TILE + r() * TILE, s = 0.8 + r() * 1.1, a = r() * Math.PI * 2;
      if (grassGround(layout, x, z)) out.push([x, z, s, a]);
    }
    return out;
  }, [i, j, density, layout]);
  const inst = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3(), s3 = new THREE.Vector3();
    spots.forEach(([x, z, s, a], k) => {
      m.compose(p.set(x, 0, z), q.setFromAxisAngle(up, a), s3.set(s, s * (0.8 + (k % 5) * 0.12), s));
      inst.current.setMatrixAt(k, m);
      inst.current.setColorAt(k, c.setHSL(0.24 + (k % 7) * 0.007, 0.6, 0.45 + (k % 11) * 0.018));
    });
    inst.current.instanceMatrix.needsUpdate = true;
    if (inst.current.instanceColor) inst.current.instanceColor.needsUpdate = true;
  }, [spots]);
  return <instancedMesh key={spots.length} ref={inst} args={[geo, mat, spots.length]} receiveShadow frustumCulled={false} />;
}

/** Low rolling hills far away, the meadow's greens, softened by the fog. */
function Hills() {
  const hills = useMemo(() => {
    const r = seeded(21), out: { x: number; z: number; rx: number; rz: number; h: number }[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + r() * 0.3, d = 1500 + r() * 600;
      out.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, rx: 260 + r() * 240, rz: 180 + r() * 180, h: 30 + r() * 40 });
    }
    return out;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#98c957", roughness: 1 }), []);
  return (
    <group>
      {hills.map((h, i) => (
        <mesh key={i} position={[h.x, -2, h.z]} scale={[h.rx, h.h, h.rz]} material={mat} receiveShadow>
          <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      ))}
    </group>
  );
}

// ---- roads ---------------------------------------------------------------------------------------------------------

export function Roads() {
  const { kit, layout } = useCity();
  const dashes = useMemo(() => {
    const out: THREE.Matrix4[] = [], up = new THREE.Vector3(0, 1, 0);
    for (const r of layout.roads) {
      if (r.w < 10) continue;  // no centre line on the narrow neighbourhood lanes
      const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1), dx = (r.x2 - r.x1) / len, dz = (r.z2 - r.z1) / len;
      for (let s = 4; s < len - 4; s += 7) {
        const x = r.x1 + dx * s, z = r.z1 + dz * s;
        if (inRect(x, z, PLAZA)) continue;
        out.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.1, z),
          new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(dx, dz)), new THREE.Vector3(0.35, 0.02, 3)));
      }
    }
    return out;
  }, [layout]);
  // kerbs and asphalt merged into two meshes, rebuilt only when the road list changes
  const geo = useMemo(() => {
    const kerb: THREE.BufferGeometry[] = [], tar: THREE.BufferGeometry[] = [];
    for (const r of layout.roads) {
      const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1) + r.w, rot = Math.atan2(r.x2 - r.x1, r.z2 - r.z1);
      const cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
      kerb.push(new THREE.BoxGeometry(r.w + 2.4, 0.06, len + 2.4).rotateY(rot).translate(cx, 0.03, cz));
      tar.push(new THREE.BoxGeometry(r.w, 0.06, len).rotateY(rot).translate(cx, 0.05, cz));
    }
    return { kerb: mergeGeometries(kerb)!, tar: mergeGeometries(tar)! };
  }, [layout.roads]);
  const inst = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => { dashes.forEach((m, i) => inst.current.setMatrixAt(i, m)); inst.current.instanceMatrix.needsUpdate = true; }, [dashes]);
  return (
    <group>
      <mesh geometry={geo.kerb} material={kit.roadEdge} receiveShadow />
      <mesh geometry={geo.tar} material={kit.road} receiveShadow />
      <instancedMesh key={dashes.length} ref={inst} args={[undefined, undefined, dashes.length]} material={kit.lane}><boxGeometry /></instancedMesh>
    </group>
  );
}

// ---- plants and lamps ----------------------------------------------------------------------------------------------

/** Which model each plant uses. */
const MODEL: Record<PlantKind, ModelName> = { oak: "oakTree", bush: "bush", hedge: "hedge", flowers: "flowers", grass: "grass" };
/** Low plants cast no shadow (too small to read, and it saves the shadow pass). */
const NO_SHADOW = new Set<PlantKind>(["flowers", "grass"]);

/** Trees, hedges, bushes, flowers and grass clumps (grab3d.com CC0 nature models, ADR-004): planted by
 *  lib/city/planting.ts, drawn as one instanced mesh per model and shadow group, so hundreds cost a few draws. */
export function Plants() {
  return <ModelSlot><PlantModels /></ModelSlot>;
}

function PlantModels() {
  const { layout } = useCity();
  const groups = useMemo(() => {
    const out = new Map<string, { model: ModelName; shadow: boolean; plants: Plant[] }>();
    for (const p of campusPlants(layout)) {
      const model = MODEL[p.kind], shadow = !NO_SHADOW.has(p.kind), key = `${model}|${shadow}`;
      if (!out.has(key)) out.set(key, { model, shadow, plants: [] });
      out.get(key)!.plants.push(p);
    }
    return [...out.entries()];
  }, [layout]);
  return <>{groups.map(([key, g]) => <PlantGroup key={`${key}|${g.plants.length}`} {...g} />)}</>;
}

function PlantGroup({ model, shadow, plants }: { model: ModelName; shadow: boolean; plants: Plant[] }) {
  const parts = useModelParts(model);
  return <>{parts.map((part, i) => <PlantPart key={i} part={part} plants={plants} shadow={shadow} />)}</>;
}

function PlantPart({ part, plants, shadow }: { part: Part; plants: Plant[]; shadow: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    plants.forEach(({ x, z, s, rot, y = 0 }, i) => {
      ref.current.setMatrixAt(i, m.compose(p.set(x, y, z), q.setFromAxisAngle(up, rot), s3.set(s, s, s)).multiply(part.matrix));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [plants, part]);
  return <instancedMesh ref={ref} args={[part.geometry, part.material, plants.length]} castShadow={shadow} receiveShadow />;
}

/** Street lamps (grab3d.com CC0 street light, ADR-004), instanced: one draw per model part for every lamp. Each arm
 *  reaches over the nearest road; the LED panel glows at night through its emissive material, no real lights (FE-24). */
export function Lamps() {
  return <ModelSlot><LampModels /></ModelSlot>;
}

const LAMP_SCALE = 0.85;  // the model is 8.2 m tall; 7 m sits with the City's trees and buildings
const POOL_REACH = 0.8;   // the model's LED panel is 0.5–1.1 m out along the arm

function LampModels() {
  const { layout } = useCity();
  const spots = useMemo(() => lampSpots(layout), [layout]);
  const parts = useModelParts("streetLight");
  // the LED panel gets its own warm glowing copy, so night only lights the lamps
  const mats = useMemo(() => parts.map((p) => {
    if (!p.material.emissiveMap) return p.material;
    const m = p.material.clone();
    m.emissive.set("#ffd27a");
    return m;
  }), [parts]);
  const led = mats.find((m) => m.emissiveMap) ?? null;
  return (
    <group key={spots.length}>
      {led && <NightGlow mat={led} />}
      {parts.map((p, i) => <LampPart key={i} part={p} material={mats[i]} spots={spots} shadow={!p.material.emissiveMap} />)}
      <LightPools spots={spots} />
    </group>
  );
}

/** The LED faces down, so from above a lamp shows at night as the soft pool of light it casts on the road: one
 *  instanced glowing disc per lamp, added onto the ground (opacity 0, so invisible, while the lamps are off). */
function LightPools({ spots }: { spots: LampSpot[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const mat = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "#fff"); grad.addColorStop(0.25, "#bbb"); grad.addColorStop(0.6, "#333"); grad.addColorStop(1, "#000");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    // unlit and added onto the ground: with the lamps off its opacity is 0, so daylight shows nothing
    return new THREE.MeshBasicMaterial({ color: "#ffc76b", map: tex, opacity: 0, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  }, []);
  useLampGlow(mat, 0.55);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const p = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1);
    spots.forEach(([x, z, heading], i) => {
      const reach = POOL_REACH * LAMP_SCALE;  // under the LED, at the end of the arm
      ref.current.setMatrixAt(i, m.compose(p.set(x + Math.sin(heading) * reach, 0.3, z + Math.cos(heading) * reach), q, s3));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[undefined, mat, spots.length]} renderOrder={1}>
      <circleGeometry args={[6, 24]} />
    </instancedMesh>
  );
}

function NightGlow({ mat }: { mat: THREE.MeshStandardMaterial }) {
  useLampGlow(mat, 2.2);
  return null;
}

function LampPart({ part, material, spots, shadow }: { part: Part; material: THREE.Material; spots: LampSpot[]; shadow: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s3 = new THREE.Vector3(LAMP_SCALE, LAMP_SCALE, LAMP_SCALE), up = new THREE.Vector3(0, 1, 0);
    spots.forEach(([x, z, heading], i) => {
      m.compose(p.set(x, 0, z), q.setFromAxisAngle(up, heading), s3).multiply(part.matrix);
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [spots, part]);
  return <instancedMesh ref={ref} args={[part.geometry, material, spots.length]} castShadow={shadow} />;
}

// ---- fences --------------------------------------------------------------------------------------------------------

export type Gap = { side: "N" | "S" | "E" | "W"; from: number; to: number };  // N = z0 side, S = z1 side (towards the camera)
const FRAME_COLOR = { city: "#5d6678", site: "#8792a6", low: "#ffffff" } as const;

/**
 * A fence around a rectangle, merged into two meshes (frame + mesh panels), with gaps for gates or people.
 * `style`: "city" tall metal fence with stone pillars at its gates; "low" waist-high garden fence; "site" chain-link.
 */
export function Fence({ rect, gaps = [], style }: { rect: Rect; gaps?: Gap[]; style: "city" | "low" | "site" }) {
  const { kit } = useCity();
  const h = style === "city" ? 2.8 : style === "site" ? 2.3 : 1.1, step = style === "low" ? 2.5 : 4;
  const key = `${rect.join(",")}|${gaps.map((g) => `${g.side}${g.from}:${g.to}`).join(";")}|${style}`;
  const geo = useMemo(() => {
    const [x0, z0, x1, z1] = rect;
    const frame: THREE.BufferGeometry[] = [], panel: THREE.BufferGeometry[] = [];
    const sides: { side: Gap["side"]; a: [number, number]; b: [number, number] }[] = [
      { side: "N", a: [x0, z0], b: [x1, z0] }, { side: "S", a: [x0, z1], b: [x1, z1] },
      { side: "W", a: [x0, z0], b: [x0, z1] }, { side: "E", a: [x1, z0], b: [x1, z1] },
    ];
    const box = (w: number, hh: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, hh, d).translate(x, y, z);
    for (const s of sides) {
      const horiz = s.a[1] === s.b[1], lo = horiz ? s.a[0] : s.a[1], hi = horiz ? s.b[0] : s.b[1];
      const myGaps = gaps.filter((g) => g.side === s.side).sort((p, q) => p.from - q.from);
      const runs: [number, number][] = []; let cur = lo;
      for (const g of myGaps) { if (g.from > cur) runs.push([cur, g.from]); cur = Math.max(cur, g.to); }
      if (cur < hi) runs.push([cur, hi]);
      const at = (t: number): [number, number] => (horiz ? [t, s.a[1]] : [s.a[0], t]);
      for (const [p, q] of runs) {
        const len = q - p, n = Math.max(1, Math.round(len / step));
        for (let k = 0; k <= n; k++) { const [x, z] = at(p + (k * len) / n); frame.push(box(0.16, h, 0.16, x, h / 2, z)); }
        const [mx, mz] = at((p + q) / 2);
        for (const y of style === "low" ? [0.45, 0.95] : [0.3, h - 0.1])
          frame.push(box(horiz ? len : 0.1, 0.1, horiz ? 0.1 : len, mx, y, mz));
        if (style !== "low") panel.push(box(horiz ? len : 0.04, h - 0.4, horiz ? 0.04 : len, mx, h / 2 + 0.1, mz));
      }
      if (style === "city") for (const g of myGaps) for (const t of [g.from, g.to]) {
        const [x, z] = at(t); frame.push(box(1.4, h + 1.4, 1.4, x, (h + 1.4) / 2, z));
      }
    }
    return { frame: mergeGeometries(frame)!, panel: panel.length ? mergeGeometries(panel) : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, h, step]);
  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({ color: FRAME_COLOR[style], roughness: 0.6 }), [style]);
  return (
    <group>
      <mesh geometry={geo.frame} material={frameMat} castShadow receiveShadow />
      {geo.panel && <mesh geometry={geo.panel} material={kit.fence} />}
    </group>
  );
}

/** The City fence (grows with the neighbourhood, FE-46) with the supplier entry gate in the east (FE-43). */
export function CityFence() {
  const { layout } = useCity();
  return (
    <>
      <Fence rect={layout.city} gaps={[{ side: "E", from: GATE.z0, to: GATE.z1 }]} style="city" />
      <SupplierGate />
    </>
  );
}

function stripeTexture() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 16;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#ffffff" : "#e0433f"; g.fillRect(i * 32, 0, 32, 16); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * Where the highway ends at the fence: stone pillars with a sign beam, a guard house on the island between the in and
 * out lanes, red-and-white barrier arms (closed; trucks are drawn from live data in a later slice), a speed bump and
 * two floodlights.
 */
function SupplierGate() {
  const { kit } = useCity();
  const x = GATE.x, zc = (GATE.z0 + GATE.z1) / 2, span = GATE.z1 - GATE.z0;
  const tex = useMemo(() => ({ stripes: stripeTexture(), sign: signTexture("SUPPLIER ENTRY", PALETTE.trim, 1024) }), []);
  useNightGlow(kit.glassNight, 1.1);
  useLampGlow(kit.lamp, 2.2);  // the two floodlights
  return (
    <group>
      {[GATE.z0 - 1, GATE.z1 + 1].map((z) => <Block key={z} x={x} z={z} w={2.2} d={2.2} h={8} mat={kit.wallShade} />)}
      <Block x={x} z={zc} w={1.6} d={span + 4} h={2} y={8} mat={kit.trim} />
      <mesh position={[x - 0.85, 9, zc]} rotation={[0, -Math.PI / 2, 0]}><planeGeometry args={[span + 2, 1.6]} /><meshBasicMaterial map={tex.sign} toneMapped={false} /></mesh>
      <Block x={x - 9} z={zc} w={10} d={2.4} h={0.25} mat={kit.wall} />
      <Block x={x - 9} z={zc} w={3.6} d={2.2} h={2.8} y={0.25} mat={kit.wall} />
      <Block x={x - 9} z={zc} w={3.7} d={2.3} h={1} y={1.25} mat={kit.glassNight} shadow={false} />
      <Block x={x - 9} z={zc} w={4.6} d={3.2} h={0.35} y={3.05} mat={kit.trim} />
      {[{ z: zc - 4.2, post: zc - 1.4 }, { z: zc + 4.2, post: zc + 1.4 }].map(({ z, post }, k) => (
        <group key={k}>
          <Block x={x - 6} z={post} w={0.6} d={0.6} h={1.1} mat={kit.dark} />
          <mesh position={[x - 6, 1.05, z]} rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[5.6, 0.18, 0.12]} /><meshStandardMaterial map={tex.stripes} /></mesh>
        </group>
      ))}
      <mesh position={[x - 16, 0.12, zc]}><boxGeometry args={[0.8, 0.14, span - 2]} /><meshStandardMaterial color={PALETTE.forklift} /></mesh>
      {[GATE.z0 - 4, GATE.z1 + 4].map((z) => (
        <group key={z}>
          <Block x={x - 3} z={z} w={0.3} d={0.3} h={9} mat={kit.dark} />
          <mesh position={[x - 3.6, 9, z]} material={kit.lamp}><boxGeometry args={[1, 0.4, 1.4]} /></mesh>
        </group>
      ))}
    </group>
  );
}

/** Garden fences around the agent offices (one people gap each), the neighbourhood fence, the depot yards. */
export function PlotFences() {
  const { layout } = useCity();
  return (
    <>
      {Object.values(PLOTS).map((p, i) => (
        <Fence key={i} rect={p.rect} style="low" gaps={[{ side: "S", from: p.gateX - 2.5, to: p.gateX + 2.5 }]} />
      ))}
      {/* grows with the neighbourhood; the customer avenue enters from the city side */}
      <Fence rect={layout.hood} style="low" gaps={[{ side: "E", from: -7, to: 7 }]} />
      {SUPPLIER_PLOTS.map((p, i) => (
        <Fence key={`s${i}`} rect={p} style="site" gaps={[{ side: i === 0 ? "S" : "N", from: 288, to: 312 }]} />
      ))}
    </>
  );
}
