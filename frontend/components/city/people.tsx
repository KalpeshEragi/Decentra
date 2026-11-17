"use client";
// People (grab3d.com CC0 rigged models, ADR-004, FE-50): the Businessman for the agents and their messengers, the
// Casual Man and Woman for customers and factory workers. Walkers and messengers play the model's walk clip; people
// who stand (agents at their offices, workers, house owners) use one standing pose baked once into plain geometry, so
// they can be drawn many at a time. Up to 500 house owners use the light "-far" copy, all of them in one draw.
// Standing is the model's rest pose with the arms lowered (`standUp`).

import { useGLTF } from "@react-three/drei";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useLampGlow } from "./lighting";

export type PersonKind = "businessman" | "man" | "woman";
/** How tall a person is drawn (the City is a little larger than life). */
export const PERSON_H = 3.4;

const url = (kind: PersonKind, far = false) => `/models/people/${kind}${far ? "-far" : ""}.glb`;

/** A model's standing pose as plain geometry (feet at y 0, centred, facing +z, PERSON_H tall), its material, and the
 *  scale and offset that put the walking copy in the same place. */
type Baked = { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; scale: number; offset: THREE.Vector3 };
const bakedCache = new Map<THREE.Object3D, Baked>();

function walkClip(animations: THREE.AnimationClip[]) {
  return animations.find((a) => /walk/i.test(a.name)) ?? animations[0];
}

/** Stands a person upright: every bone back to the model's own rest pose (straight legs, arms out in an A), copied
 *  from `source` (the loaded model), then both upper arms turned down along the body. The walk clip has no standing
 *  moment: every frame of it leans into a step. (three.js's `skeleton.pose()` is not used: it puts the top bone in
 *  world space under its scaled armature, so the figure shrinks about 100x and grows back once the walk plays.) */
function standUp(root: THREE.Object3D, source: THREE.Object3D) {
  const rest = new Map<string, THREE.Object3D>();
  source.traverse((o) => { if ((o as THREE.Bone).isBone) rest.set(o.name, o); });
  let skinned: THREE.SkinnedMesh | undefined;
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && !skinned) skinned = o as THREE.SkinnedMesh;
    const r = (o as THREE.Bone).isBone ? rest.get(o.name) : undefined;
    if (r) { o.position.copy(r.position); o.quaternion.copy(r.quaternion); o.scale.copy(r.scale); }
  });
  if (!skinned) return;
  root.updateMatrixWorld(true);
  // worked out in the figure's own frame, so it is right wherever the figure stands or faces
  const a = new THREE.Vector3(), b = new THREE.Vector3(), turn = new THREE.Quaternion(), world = new THREE.Quaternion(), parent = new THREE.Quaternion();
  for (const side of ["Left", "Right"]) {
    const arm = skinned.skeleton.getBoneByName(`${side}Arm`), fore = skinned.skeleton.getBoneByName(`${side}ForeArm`);
    if (!arm || !fore || !arm.parent) continue;
    const local = root.worldToLocal(fore.getWorldPosition(b)).sub(root.worldToLocal(arm.getWorldPosition(a))).normalize();
    const from = fore.getWorldPosition(b).sub(arm.getWorldPosition(a)).normalize();
    const to = new THREE.Vector3(Math.sign(local.x) * 0.18, -1, 0.04).transformDirection(root.matrixWorld);  // down, a hand's width off the hip
    turn.setFromUnitVectors(from, to);
    arm.getWorldQuaternion(world).premultiply(turn);
    arm.quaternion.copy(arm.parent.getWorldQuaternion(parent).invert().multiply(world));
    root.updateMatrixWorld(true);
  }
}

/** Skins every vertex (and normal) at the pose once, in world space, then fits the figure to PERSON_H. */
function bake(scene: THREE.Object3D): Baked {
  const root = cloneSkinned(scene);
  standUp(root, scene);
  let mesh: THREE.SkinnedMesh | undefined;
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh && !mesh) mesh = o as THREE.SkinnedMesh; });
  if (!mesh) throw new Error("person model has no skinned mesh");
  mesh.skeleton.update();
  const src = mesh.geometry, n = src.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const v = new THREE.Vector3(), nv = new THREE.Vector3(), skin = new THREE.Matrix4(), bone = new THREE.Matrix4();
  const skinIndex = src.attributes.skinIndex, skinWeight = src.attributes.skinWeight, normal = src.attributes.normal;
  const toWorld = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld), skin3 = new THREE.Matrix3();
  for (let i = 0; i < n; i++) {
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
    pos.set([v.x, v.y, v.z], i * 3);
    // the normal follows the same weighted bone matrices (bind → bones → back), then the mesh's own placement
    skin.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = skinWeight.getComponent(i, k);
      if (!w) continue;
      const j = skinIndex.getComponent(i, k);
      bone.multiplyMatrices(mesh.skeleton.bones[j].matrixWorld, mesh.skeleton.boneInverses[j]);
      for (let e = 0; e < 16; e++) skin.elements[e] += bone.elements[e] * w;
    }
    skin.premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix);
    nv.fromBufferAttribute(normal, i).applyMatrix3(skin3.setFromMatrix4(skin)).applyMatrix3(toWorld).normalize();
    nor.set([nv.x, nv.y, nv.z], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute("uv", src.attributes.uv);
  geometry.setIndex(src.index);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!, scale = PERSON_H / (box.max.y - box.min.y);
  const offset = new THREE.Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geometry.translate(offset.x, offset.y, offset.z).scale(scale, scale, scale);
  geometry.computeBoundingSphere();
  return { geometry, material: mesh.material as THREE.MeshStandardMaterial, scale, offset };
}

/** The standing pose of a person model (baked once per file, shared). Suspends while loading. */
export function useStanding(kind: PersonKind, far = false): Baked {
  const { scene } = useGLTF(url(kind, far));
  return useMemo(() => {
    let hit = bakedCache.get(scene);
    if (!hit) { hit = bake(scene); bakedCache.set(scene, hit); }
    return hit;
  }, [scene]);
}

/** Everyone (agents, customers, workers) lights up a little while the street lamps are on (FE-53): dark clothes vanish
 *  at night. Their own texture is their glow, so they keep their colours. Mounted once for the whole City; every copy
 *  of a model (standing, walking, crowds) shares its material. */
export function PeopleNightGlow() {
  return (
    <>
      {(["businessman", "man", "woman"] as const).map((k) => <GlowOf key={k} kind={k} />)}
      {(["man", "woman"] as const).map((k) => <GlowOf key={`${k}-far`} kind={k} far />)}
    </>
  );
}

function GlowOf({ kind, far = false }: { kind: PersonKind; far?: boolean }) {
  const { material } = useStanding(kind, far);
  useLayoutEffect(() => {
    if (material.emissiveMap) return;
    material.emissive.set("#ffffff");
    material.emissiveMap = material.map;
    material.emissiveIntensity = 0;
    material.needsUpdate = true;
  }, [material]);
  useLampGlow(material, 0.8);
  return null;
}

/** One standing person; `faded` draws it see-through (an absent worker). */
export function StandingPerson({ kind, at, rot = 0, faded = false }: { kind: PersonKind; at: [number, number, number]; rot?: number; faded?: boolean }) {
  const { geometry, material } = useStanding(kind);
  const mat = useMemo(() => (faded ? fadedCopy(material) : material), [material, faded]);
  return <mesh geometry={geometry} material={mat} position={at} rotation={[0, rot, 0]} castShadow={!faded} receiveShadow />;
}

const fadedCache = new Map<THREE.Material, THREE.MeshStandardMaterial>();
function fadedCopy(m: THREE.MeshStandardMaterial) {
  let f = fadedCache.get(m);
  // an absent worker stays dim at night too (the copy is not in the glow registry)
  if (!f) { f = m.clone(); f.transparent = true; f.opacity = 0.35; f.depthWrite = false; f.emissiveIntensity = 0; f.emissiveMap = null; fadedCache.set(m, f); }
  return f;
}

/** Many standing people in one draw (house owners; the light copy casts no shadow: up to 500 of them, each only a few
 *  pixels tall): `place` writes each one's matrix; `onPick` / `onHover` get the
 *  index of the person under the pointer. */
export function StandingCrowd({ kind, far, count, place, onPick, onHover }: {
  kind: PersonKind; far?: boolean; count: number; place: (i: number, m: THREE.Matrix4) => void;
  onPick?: (i: number, e: ThreeEvent<MouseEvent>) => void; onHover?: (i: number | null) => void;
}) {
  const { geometry, material } = useStanding(kind, far);
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) { place(i, m); ref.current.setMatrixAt(i, m); }
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [count, place]);
  return (
    <instancedMesh key={count} ref={ref} args={[geometry, material, count]} castShadow={!far} receiveShadow
      onClick={(e: ThreeEvent<MouseEvent>) => { if (e.instanceId !== undefined && onPick) { e.stopPropagation(); onPick(e.instanceId, e); } }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => { if (e.instanceId !== undefined) onHover?.(e.instanceId); }}
      onPointerOut={() => onHover?.(null)} />
  );
}

/** A person walking with the model's walk clip while `motion.moving`, standing upright otherwise. The parent
 *  moves and turns the group; the figure faces +z. */
export function WalkingPerson({ kind, motion }: { kind: PersonKind; motion: { moving: boolean } }) {
  const { scene, animations } = useGLTF(url(kind));
  const { scale, offset } = useStanding(kind);
  const root = useMemo(() => {
    const root = cloneSkinned(scene);
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    standUp(root, scene);
    return root;
  }, [scene]);
  // the animation is made on mount and freed on unmount, so a remount (React's dev double mount, or a re-key) always
  // gets a fresh one: reusing one whose bindings were freed throws inside three.js
  const anim = useRef<{ mixer: THREE.AnimationMixer; walk: THREE.AnimationAction } | null>(null);
  useEffect(() => {
    const clip = walkClip(animations);
    if (!clip) return;
    const mixer = new THREE.AnimationMixer(root);
    anim.current = { mixer, walk: mixer.clipAction(clip) };
    return () => { anim.current = null; mixer.stopAllAction(); mixer.uncacheRoot(root); standUp(root, scene); };
  }, [root, animations, scene]);
  useFrame((_, dt) => {
    const a = anim.current;
    if (!a) return;
    if (motion.moving) {
      if (!a.walk.isRunning()) a.walk.reset().play();
      a.mixer.update(dt);
    } else if (a.walk.isRunning()) { a.walk.stop(); standUp(root, scene); }
  });
  return (
    <group scale={scale}>
      <primitive object={root} position={offset} />
    </group>
  );
}

/** Prepares the walking figures once at load, out of sight under the ground for a moment, so the first real walker
 *  does not stall the view while the graphics card builds its skinning program. */
export function PeopleWarmup() {
  const [done, setDone] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDone(true), 3000); return () => clearTimeout(t); }, []);
  if (done) return null;
  return (
    <group position={[0, -400, 0]}>
      {(["businessman", "man", "woman"] as const).map((k) => <WalkingPerson key={k} kind={k} motion={WARM} />)}
    </group>
  );
}
const WARM = { moving: true };

if (typeof window !== "undefined") {
  for (const k of ["businessman", "man", "woman"] as const) useGLTF.preload(url(k));
  for (const k of ["man", "woman"] as const) useGLTF.preload(url(k, true));  // the light copies exist for owners only
}
