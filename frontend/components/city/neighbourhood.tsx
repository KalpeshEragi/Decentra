"use client";
// The customer neighbourhood (FE-32, FE-46): one house per customer in creation order, lit while the customer has an
// open order, its owner (the customer's character) at the front door. Eight designs varied by colour and roof, picked
// from the house index; each design is one shared instanced copy, so 500 houses cost a few dozen draw calls. Owners
// are the grab3d Casual Man / Woman: the full model near the camera, a light copy elsewhere.
// Labels by zoom (FE-32): see `labelledHouses`. `away`: owners currently out walking (drawn by the walkers instead).

import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { House } from "@/lib/city/cityLayout";
import type { Customer } from "@/lib/city/customerWalks";
import { labelledHouses } from "@/lib/city/siteRules";
import { isClick, Tag, useCity } from "./kit";
import { useNightGlow } from "./lighting";
import { ModelSlot } from "./models";
import { StandingCrowd } from "./people";
import { useFootprints } from "./contact";

const DESIGNS = [
  { body: "#f6efe4", roof: "#2457d6", gable: true, w: 8 }, { body: "#e7f0fb", roof: "#d65a4a", gable: true, w: 7.5 },
  { body: "#fdf3d9", roof: "#5b6b8c", gable: false, w: 8.5 }, { body: "#eef6ea", roof: "#3f8f5b", gable: true, w: 7 },
  { body: "#f9e7e7", roof: "#8f4fe0", gable: true, w: 8 }, { body: "#ffffff", roof: "#e9822e", gable: false, w: 9 },
  { body: "#efeaf8", roof: "#1b3fa8", gable: true, w: 7.5 }, { body: "#f3f5f9", roof: "#c0392b", gable: false, w: 8 },
];
/** Owners wear everyday clothes, never an agent colour (FE-28). */
export const OWNER_COLORS = ["#ffb347", "#77c3ec", "#f28b82", "#a7d676", "#c39bd3", "#f7dc6f", "#85c1e9", "#f0a3c5"];

type Part = { geo: THREE.BufferGeometry; color: (h: House) => string; place: (h: House, m: THREE.Matrix4) => void; mat?: THREE.Material };

const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
/** A point in the house's own frame (dx across, dz towards the street), in world space. */
const at = (h: House, dx: number, y: number, dz: number) => {
  const c = Math.cos(h.rot), s = Math.sin(h.rot);
  return new THREE.Vector3(h.x + dx * c + dz * s, y, h.z - dx * s + dz * c);
};
const placeAt = (dx: number, y: number, dz: number, scale = one, turn = true) => (h: House, m: THREE.Matrix4) =>
  m.compose(at(h, dx, y, dz), turn ? q.setFromAxisAngle(up, h.rot) : q.identity(), scale);
const lit = new THREE.MeshBasicMaterial({ toneMapped: false });

function Instanced({ houses, part, onPick, onHover }: { houses: House[]; part: Part; onPick: (h: House) => void; onHover: (idx: number | null) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const mat = useMemo(() => part.mat ?? new THREE.MeshStandardMaterial({ roughness: 0.7 }), [part]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), c = new THREE.Color();
    houses.forEach((h, i) => { part.place(h, m); ref.current.setMatrixAt(i, m); ref.current.setColorAt(i, c.set(part.color(h))); });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [houses, part]);
  return (
    <instancedMesh key={houses.length} ref={ref} args={[part.geo, mat, houses.length]} castShadow={!part.mat} receiveShadow={!part.mat}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.instanceId !== undefined && isClick(e)) onPick(houses[e.instanceId]); }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => { if (e.instanceId !== undefined) onHover(houses[e.instanceId].idx); }}
      onPointerOut={() => onHover(null)} />
  );
}

export function Neighbourhood({ residents, preview, away = new Set<number>() }: { residents: Customer[]; preview: boolean; away?: Set<number> }) {
  const { layout, select, selected, hover } = useCity();
  const byDesign = useMemo(() => DESIGNS.map((_, d) => layout.houses.filter((h) => h.design === d)), [layout]);
  useFootprints(useMemo(() => layout.houses.map((h) => ({ x: h.x, z: h.z, w: DESIGNS[h.design].w, d: 6.5, h: 5.5, y: 0.04 })), [layout]));
  // every house window glows softly at night; an open order's bright pane and roof lamp still stand out (FE-32)
  const windowMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.3, emissive: new THREE.Color("#ffcf7d"), emissiveIntensity: 0 }), []);
  useNightGlow(windowMat, 0.55);
  const parts = useMemo(() => DESIGNS.map((d): Part[] => [
    { geo: new THREE.BoxGeometry(d.w, 4.2, 6.5), color: () => d.body, place: placeAt(0, 2.1, 0) },
    d.gable
      ? { geo: new THREE.CylinderGeometry(4.3, 4.3, d.w + 0.6, 3, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 6), color: () => d.roof,
        place: placeAt(0, 5.4, 0, new THREE.Vector3(1, 0.55, 0.85)) }
      : { geo: new THREE.BoxGeometry(d.w + 0.8, 0.6, 7.3), color: () => d.roof, place: placeAt(0, 4.5, 0) },
    { geo: new THREE.BoxGeometry(1.4, 2.4, 0.2), color: () => d.roof, place: placeAt(-d.w / 4, 1.2, 3.3) },
    { geo: new THREE.BoxGeometry(2.6, 1.4, 0.2), color: () => "#9db9ee", mat: windowMat, place: placeAt(d.w / 5, 2.4, 3.3) },
  ]), []);
  // lit while the customer has an open order (FE-32): a glowing pane over the window and a roof lamp
  const openKey = residents.flatMap((c, i) => (c.has_open_order ? [i] : [])).join(",");
  const open = useMemo(() => new Set(openKey ? openKey.split(",").map(Number) : []), [openKey]);
  const litHouses = useMemo(() => layout.houses.filter((h) => open.has(h.idx)), [layout, open]);
  const glow = useMemo(() => ({
    pane: { geo: new THREE.BoxGeometry(2.9, 1.7, 0.24), color: () => "#ffd257", mat: lit, place: (h: House, m: THREE.Matrix4) => placeAt(DESIGNS[h.design].w / 5, 2.4, 3.32)(h, m) } as Part,
    lamp: { geo: new THREE.SphereGeometry(0.9, 12, 10), color: () => "#ffc93c", mat: lit, place: placeAt(0, 7.2, 0, one, false) } as Part,
  }), []);
  // owners at their front doors, except those out walking
  const awayKey = [...away].sort((a, b) => a - b).join(",");
  const home = useMemo(() => layout.houses.filter((h) => !away.has(h.idx)), [layout, awayKey]);  // eslint-disable-line react-hooks/exhaustive-deps

  const [hovered, setHovered] = useState<number | null>(null);
  const labelOf = (h: House) => residents[h.idx]?.label ?? `Customer ${h.idx + 1}`;
  const pick = (h: House) => select({ kind: "house", id: residents[h.idx]?.id ?? `preview-${h.idx}`, at: [h.x, 0, h.z], label: labelOf(h) });
  const handlers = { onPick: pick, onHover: setHovered };
  const selectedIdx = selected?.kind === "house" ? residents.findIndex((c) => c.id === selected.id) : -1;
  const [hx0, , hx1, hz1] = layout.hood;
  return (
    <group onPointerOver={(e) => { e.stopPropagation(); hover(true); }} onPointerOut={() => hover(false)}>
      {byDesign.map((hs, d) => hs.length > 0 && parts[d].map((p, k) => <Instanced key={`${d}-${k}`} houses={hs} part={p} {...handlers} />))}
      {litHouses.length > 0 && <Instanced houses={litHouses} part={glow.pane} {...handlers} />}
      {litHouses.length > 0 && <Instanced houses={litHouses} part={glow.lamp} {...handlers} />}
      <ModelSlot><Owners home={home} onPick={pick} onHover={setHovered} /></ModelSlot>
      <HouseLabels labelOf={labelOf} open={open} hovered={hovered} selected={selectedIdx} />
      <Tag at={[(hx0 + hx1) / 2, 3, hz1 - 2]} text="Customers"
        sub={preview ? `${layout.houses.length} houses · preview` : `${layout.houses.length} houses · ${litHouses.length} with an open order`} always />
    </group>
  );
}

/** Owners within this distance of the camera use the full model; the rest the light copy (whose texture smears up close). */
const NEAR_OWNER = 110;

/** The owners at their front doors: man / woman by house (a display choice), facing the street. Near the camera the
 *  full model, elsewhere the light copy, all in at most four draws; which is which is rechecked about three times a
 *  second, like the labels. */
function Owners({ home, onPick, onHover }: { home: House[]; onPick: (h: House) => void; onHover: (idx: number | null) => void }) {
  const [nearKey, setNearKey] = useState("");
  const last = useRef(0);
  useFrame(({ camera }) => {
    const now = performance.now();
    if (now - last.current < 300) return;
    last.current = now;
    const { x, y, z } = camera.position;
    const next = home.filter((h) => Math.hypot(h.x - x, y, h.z - z) < NEAR_OWNER).map((h) => h.idx).join(",");
    if (next !== nearKey) setNearKey(next);
  });
  const groups = useMemo(() => {
    const near = new Set(nearKey ? nearKey.split(",").map(Number) : []);
    return ([0, 1] as const).flatMap((g) => [true, false].map((far) => {
      const hs = home.filter((h) => h.idx % 2 === g && near.has(h.idx) !== far);
      return { key: `${g}${far}`, kind: g ? "woman" as const : "man" as const, far, hs,
        place: (i: number, m: THREE.Matrix4) => placeAt(-1, 0, 5.2)(hs[i], m) };
    }));
  }, [home, nearKey]);
  return (
    <>
      {groups.map((o) => o.hs.length > 0 && (
        <StandingCrowd key={o.key} kind={o.kind} far={o.far} count={o.hs.length} place={o.place}
          onPick={(i, e) => { if (isClick(e)) onPick(o.hs[i]); }} onHover={(i) => onHover(i === null ? null : o.hs[i].idx)} />
      ))}
    </>
  );
}

/** Only the labelled few exist as page elements, so 500 houses stay cheap. Rechecked about three times a second. */
function HouseLabels({ labelOf, open, hovered, selected }: { labelOf: (h: House) => string; open: Set<number>; hovered: number | null; selected: number }) {
  const { layout } = useCity();
  const [near, setNear] = useState<number[]>([]);
  const last = useRef(0);
  useFrame(({ camera }) => {
    const now = performance.now();
    if (now - last.current < 300) return;
    last.current = now;
    const next = labelledHouses(layout.houses, open, [camera.position.x, camera.position.y, camera.position.z], hovered, selected);
    if (next.join(",") !== near.join(",")) setNear(next);
  });
  return <>{near.map((i) => layout.houses[i] && <Tag key={i} at={[layout.houses[i].x, 9.5, layout.houses[i].z]} text={labelOf(layout.houses[i])} always />)}</>;
}
