"use client";
// Baked contact shadows (FE-24): the soft darkening where a building meets the ground, computed once instead of per
// frame. Each building declares its footprint next to the block it draws (`<Footprint>` or `useFootprints`); one
// merged mesh draws a soft fringe around every footprint: dark at the wall foot, fading out over a reach that grows
// with the building's height. One draw for the whole City, rebuilt only when a footprint is added or removed (a new
// house). The live sun shadows stay as they are; this adds the soft shade they cannot give.

import { useEffect, useMemo, useSyncExternalStore } from "react";
import * as THREE from "three";

/** A building's footprint: centre, size, height, the top of the ground it stands on (y), heading (radians). */
export type Foot = { x: number; z: number; w: number; d: number; h: number; y?: number; rot?: number };

const owners = new Map<symbol, Foot[]>();
const listeners = new Set<() => void>();
let version = 0;
const notify = () => { version++; listeners.forEach((l) => l()); };

/** Declares footprints for as long as the calling component is mounted. */
export function useFootprints(feet: Foot[]) {
  useEffect(() => {
    const id = Symbol("footprints");
    owners.set(id, feet);
    notify();
    return () => { owners.delete(id); notify(); };
  }, [feet]);
}

/** One footprint, as an element beside the block it shades. */
export function Footprint(props: Foot) {
  const { x, z, w, d, h, y, rot } = props;
  const feet = useMemo(() => [{ x, z, w, d, h, y, rot }], [x, z, w, d, h, y, rot]);
  useFootprints(feet);
  return null;
}

const DARK = 0.6;    // opacity at the wall foot
const LIFT = 0.012;  // above the ground's top, plus the depth offset below, so it never flickers with it

/** Opacity at `dist` metres from the walls: dark at the foot, a quick drop, then a long soft tail to nothing. */
const shade = (dist: number, reach: number) => {
  const t = Math.min(1, dist / reach);
  return DARK * Math.pow(1 - t, 1.3);
};

/** The fringe around one footprint: a 6 × 6 grid of points from `reach` outside the walls to the walls (the middle
 *  cell, under the building, left out); each point's opacity follows its distance to the walls, so corners round off. */
function fringe(f: Foot, pos: number[], rgba: number[]) {
  const reach = THREE.MathUtils.clamp(f.h * 0.5, 1.5, 7), y = (f.y ?? 0) + LIFT;
  const c = Math.cos(f.rot ?? 0), s = Math.sin(f.rot ?? 0), hw = f.w / 2, hd = f.d / 2;
  const xs = [-hw - reach, -hw - reach * 0.3, -hw, hw, hw + reach * 0.3, hw + reach];
  const zs = [-hd - reach, -hd - reach * 0.3, -hd, hd, hd + reach * 0.3, hd + reach];
  const point = (i: number, j: number) => {
    const lx = xs[i], lz = zs[j], dx = Math.max(0, Math.abs(lx) - hw), dz = Math.max(0, Math.abs(lz) - hd);
    pos.push(f.x + lx * c + lz * s, y, f.z - lx * s + lz * c);
    rgba.push(0.05, 0.06, 0.09, shade(Math.hypot(dx, dz), reach));
  };
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    if (i === 2 && j === 2) continue;  // under the building
    for (const [di, dj] of [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]]) point(i + di, j + dj);
  }
}

/** Draws every declared footprint's fringe in one mesh (mounted once in the City). */
export function ContactShadows() {
  const v = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version, () => 0);
  const geo = useMemo(() => {
    const pos: number[] = [], rgba: number[] = [];
    for (const feet of owners.values()) for (const f of feet) fringe(f, pos, rgba);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(rgba, 4));
    g.computeBoundingSphere();
    return g;
  }, [v]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geo.dispose(), [geo]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", vertexColors: true, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true }), []);
  return <mesh geometry={geo} material={mat} renderOrder={1} />;
}
