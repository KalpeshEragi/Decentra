"use client";
// Model-pack models (ADR-004, FE-50): grab3d.com CC0 models, shrunk by `npm run models` (scripts/models.mjs) into
// public/models/ and listed with their licence in public/models/LICENSES.md. Each model is read once and shared: a
// drawn copy reuses its geometry and materials, so ten trucks cost ten draws per part, not ten downloads.
// A model that fails to load draws nothing (logged once); the business parts around it (labels, pins, loads) stay.

import { useGLTF } from "@react-three/drei";
import { Component, ReactNode, Suspense, useMemo } from "react";
import * as THREE from "three";
import { useLampGlow } from "./lighting";

export const MODELS = {
  forklift: "/models/vehicles/forklift.glb",
  truck: "/models/vehicles/delivery-truck.glb",
  pallet: "/models/props/wooden-pallet.glb",
  streetLight: "/models/props/street-light.glb",
  oakTree: "/models/nature/oak-tree.glb",
  bush: "/models/nature/bush.glb",
  hedge: "/models/nature/hedge.glb",
  flowers: "/models/nature/hydrangea.glb",
  grass: "/models/nature/grass-clump.glb",
} as const;
export type ModelName = keyof typeof MODELS;

/** One drawable part of a model: its geometry, material and placement inside the model. */
export type Part = { name: string; geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; matrix: THREE.Matrix4;
  /** a vehicle's head- or taillight part (from the model's own part names) */
  light: "head" | "tail" | null };

const partsCache = new Map<THREE.Object3D, Part[]>();

/** A model's parts, flattened to model space (read once per model, shared by every copy). Suspends while loading. */
export function useModelParts(name: ModelName): Part[] {
  const { scene } = useGLTF(MODELS[name]);
  return useMemo(() => {
    const hit = partsCache.get(scene);
    if (hit) return hit;
    scene.updateMatrixWorld(true);
    const parts: Part[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const material = m.material as THREE.MeshStandardMaterial, names = `${m.name} ${m.parent?.name ?? ""}`;
      const light = /headlight/i.test(names) ? "head" : /taillight/i.test(names) ? "tail" : null;
      parts.push({ name: m.name, geometry: m.geometry, material, matrix: m.matrixWorld.clone(), light });
    });
    partsCache.set(scene, parts);
    return parts;
  }, [scene]);
}

/** Draws one copy of a model; `tint` swaps every part's material for a tinted copy (made once per tint); `lit` gives
 *  a vehicle's head- and taillights their glowing copies (they glow while the street lamps are on, FE-53). */
export function ModelMesh({ name, scale = 1, position, rotationY = 0, tint, shadow = true, lit = false }: {
  name: ModelName; scale?: number | [number, number, number]; position?: [number, number, number]; rotationY?: number;
  tint?: string; shadow?: boolean; lit?: boolean;
}) {
  const parts = useModelParts(name);
  const mats = useMemo(() => parts.map((p) => (lit && p.light ? glowing(p.material, p.light) : tint ? tinted(p.material, tint) : p.material)),
    [parts, tint, lit]);
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={mats[i]} matrixAutoUpdate={false} matrix={p.matrix} castShadow={shadow} receiveShadow />
      ))}
    </group>
  );
}

const tintCache = new Map<string, THREE.MeshStandardMaterial>();
function tinted(mat: THREE.MeshStandardMaterial, tint: string) {
  const key = `${mat.uuid}|${tint}`;
  let m = tintCache.get(key);
  if (!m) { m = mat.clone(); m.color.set(tint); tintCache.set(key, m); }
  return m;
}

// ---- vehicle lights ------------------------------------------------------------------------------------------------

const LIGHT_COLOR = { head: "#fff1cc", tail: "#ff2a1a" } as const;
const glowCache = new Map<string, THREE.MeshStandardMaterial>();
/** The glowing copy of a light part's material (one per material and kind, shared by every lit vehicle). */
function glowing(mat: THREE.MeshStandardMaterial, kind: "head" | "tail") {
  const key = `${mat.uuid}|${kind}`;
  let m = glowCache.get(key);
  if (!m) { m = mat.clone(); m.emissive.set(LIGHT_COLOR[kind]); m.emissiveIntensity = 0; glowCache.set(key, m); }
  return m;
}

let beamMat: THREE.MeshBasicMaterial | null = null;
/** The soft light a vehicle's headlights throw on the ground ahead: unlit and added onto the ground. */
function beamMaterial() {
  if (beamMat) return beamMat;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "#fff"); grad.addColorStop(0.35, "#999"); grad.addColorStop(1, "#000");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  beamMat = new THREE.MeshBasicMaterial({ color: LIGHT_COLOR.head, map: new THREE.CanvasTexture(c), opacity: 0, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  return beamMat;
}

/** The pool of headlight on the ground in front of a lit vehicle (local +z ahead): centre `z`, `w` wide, `len` long. */
export function HeadlightBeam({ z, w, len }: { z: number; w: number; len: number }) {
  return (
    <mesh position={[0, 0.3, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[w, len, 1]} material={beamMaterial()} renderOrder={1}>
      <circleGeometry args={[0.5, 20]} />
    </mesh>
  );
}

/** Registers every vehicle light material and the beams with the lamp switch, once for the whole City. */
export function VehicleLights() {
  const truck = useModelParts("truck"), forklift = useModelParts("forklift");
  const mats = useMemo(() => [...truck, ...forklift].flatMap((p) => (p.light ? [glowing(p.material, p.light)] : [])), [truck, forklift]);
  return <>{[...new Set(mats)].map((m) => <LampGlow key={m.uuid} mat={m} full={m.emissive.getHexString() === "ff2a1a" ? 1.6 : 2.4} />)}<LampGlow mat={beamMaterial()} full={0.7} /></>;
}

function LampGlow({ mat, full }: { mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial; full: number }) {
  useLampGlow(mat, full);
  return null;
}

/** Loads the models in the background, then draws `children`; a model that fails draws nothing, the City runs on. */
export function ModelSlot({ children }: { children: ReactNode }) {
  return <ModelErrors><Suspense fallback={null}>{children}</Suspense></ModelErrors>;
}

const reported = new Set<string>();
class ModelErrors extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: Error) {
    if (!reported.has(e.message)) { reported.add(e.message); console.warn("City model not loaded:", e.message); }
  }
  render() { return this.state.failed ? null : this.props.children; }
}

if (typeof window !== "undefined") for (const url of Object.values(MODELS)) useGLTF.preload(url);
