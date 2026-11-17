"use client";
// Sun, sky and fog per time-of-day mode (FE-20, FE-24), fading over about 3 s. Windows and lamps glow by the current
// night amount through their emissive materials, not through hundreds of real lights; while the lamps are on, a soft
// bloom (FE-49) lets the brightest of them halo.

import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { BloomEffect, ToneMappingMode } from "postprocessing";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { PRESETS, resolveMode, TimeMode } from "@/lib/city/timeOfDay";

/** The current night amount (0 day … 1 night), read by glowing materials every frame. */
export const night = { v: 0 };
/** The street lamps: 0 off … 1 on, fading like the rest (on in Evening, Night and Midnight). */
const lampsOn = { v: 0 };
/** Glowing materials and how many components use each: a shared material (every agent wears the same one) keeps
 *  glowing until its last user is gone. */
const glowing = new Map<THREE.MeshStandardMaterial, number>();
const lamps = new Map<THREE.MeshStandardMaterial | THREE.MeshBasicMaterial, number>();

function useGlow<M extends THREE.Material>(users: Map<M, number>, mat: M, full: number) {
  useEffect(() => {
    mat.userData.glow = full;
    users.set(mat, (users.get(mat) ?? 0) + 1);
    return () => {
      const left = (users.get(mat) ?? 1) - 1;
      if (left > 0) users.set(mat, left); else users.delete(mat);
    };
  }, [users, mat, full]);
}

/** Register a material whose emissive glow follows the night (lit windows); `full` = intensity at full night. */
export const useNightGlow = (mat: THREE.MeshStandardMaterial, full = 1.4) => useGlow(glowing, mat, full);
/** Register a street-lamp material: fully lit while the lamps are on, dark otherwise. A lit material glows through its
 *  emissive strength; an unlit one (the light pools) through its opacity. */
export const useLampGlow = (mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial, full = 1.4) => useGlow(lamps, mat, full);

const SHADOW_SIZE = 280, SHADOW_MAP = 4096;
/** One shadow-map texel in world units: the shadow camera only ever moves by whole texels. */
const SHADOW_TEXEL = (2 * SHADOW_SIZE) / SHADOW_MAP;
const UP = new THREE.Vector3(0, 1, 0);

/** Resolves Auto against the viewer's clock, rechecked every minute. */
export function useResolvedMode(mode: TimeMode) {
  const [resolved, setResolved] = useState(() => resolveMode(mode));
  useEffect(() => {
    setResolved(resolveMode(mode));
    const t = setInterval(() => setResolved(resolveMode(mode)), 60_000);
    return () => clearInterval(t);
  }, [mode]);
  return resolved;
}

export function TimeOfDay({ mode, focus }: { mode: TimeMode; focus: THREE.Vector3 }) {
  const { scene } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const resolved = useResolvedMode(mode);
  const goal = useMemo(() => ({ ...PRESETS.AFTERNOON, c: {
    sun: new THREE.Color(), sky: new THREE.Color(), ground: new THREE.Color(), bg: new THREE.Color() } }), []);
  const now = useRef({ elev: 58, az: 140 });
  const dir = useMemo(() => new THREE.Vector3(), []);
  const [lx, ly, snapped] = useMemo(() => [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], []);

  // a layout effect: the sky must exist before the first frame is drawn
  useLayoutEffect(() => {
    const p = PRESETS[resolved];
    goal.c.sun.set(p.sun); goal.c.sky.set(p.sky); goal.c.ground.set(p.ground); goal.c.bg.set(p.bg);
    Object.assign(goal, { elev: p.elev, az: p.az, sunI: p.sunI, hemiI: p.hemiI, night: p.night, lamps: p.lamps });
    if (!scene.background) {  // first frame: jump to the look instead of fading into it
      scene.background = goal.c.bg.clone();
      scene.fog = new THREE.Fog(goal.c.bg.clone(), 650, 2100);
      night.v = p.night;
      lampsOn.v = p.lamps;
      now.current = { elev: p.elev, az: p.az };
    }
  }, [resolved, goal, scene]);
  useEffect(() => () => { scene.background = null; scene.fog = null; }, [scene]);

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt / 0.9);  // settles in about 3 s
    const bg = scene.background as THREE.Color | null;
    if (!bg || !(scene.fog instanceof THREE.Fog)) return;
    bg.lerp(goal.c.bg, k);
    scene.fog.color.copy(bg);
    sun.current.color.lerp(goal.c.sun, k);
    sun.current.intensity += (goal.sunI - sun.current.intensity) * k;
    hemi.current.color.lerp(goal.c.sky, k);
    hemi.current.groundColor.lerp(goal.c.ground, k);
    hemi.current.intensity += (goal.hemiI - hemi.current.intensity) * k;
    now.current.elev += (goal.elev - now.current.elev) * k;
    now.current.az += (goal.az - now.current.az) * k;
    night.v += (goal.night - night.v) * k;
    lampsOn.v += (goal.lamps - lampsOn.v) * k;
    for (const m of glowing.keys()) m.emissiveIntensity = (m.userData.glow ?? 1) * night.v;
    for (const m of lamps.keys()) {
      const v = (m.userData.glow ?? 1) * lampsOn.v;
      if (m instanceof THREE.MeshStandardMaterial) m.emissiveIntensity = v;
      else m.opacity = v;
    }
    const e = THREE.MathUtils.degToRad(now.current.elev), a = THREE.MathUtils.degToRad(now.current.az);
    dir.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
    // the shadow camera follows the view, so shadows stay sharp wherever the user looks; it moves in whole shadow-map
    // texels (seen from the sun), so shadow edges stay put instead of crawling while the camera pans or zooms
    lx.crossVectors(UP, dir).normalize();
    ly.crossVectors(dir, lx);
    const snap = (v: number) => Math.round(v / SHADOW_TEXEL) * SHADOW_TEXEL;
    snapped.copy(lx).multiplyScalar(snap(focus.dot(lx))).addScaledVector(ly, snap(focus.dot(ly))).addScaledVector(dir, focus.dot(dir));
    sun.current.position.copy(snapped).addScaledVector(dir, 500);
    sun.current.target.position.copy(snapped);
    sun.current.target.updateMatrixWorld();
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={["#ffffff", "#dfe5f4", 1.6]} />
      <directionalLight ref={sun} castShadow intensity={2.6} shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]} shadow-bias={-0.0004}
        shadow-normalBias={0.6} shadow-camera-left={-SHADOW_SIZE} shadow-camera-right={SHADOW_SIZE} shadow-camera-top={SHADOW_SIZE}
        shadow-camera-bottom={-SHADOW_SIZE} shadow-camera-near={10} shadow-camera-far={1200} />
      {PRESETS[resolved].lamps === 1 && <NightBloom />}
    </>
  );
}

const BLOOM = 0.9;  // bloom strength with the lamps fully on

/** The night bloom: only lights brighter than white (glowing windows, lamps, vehicle lights) halo. Mounted only while
 *  the lamps are on, so the day pays nothing for it; its strength follows the lamps' 3 s fade. The composer turns
 *  the renderer's own tone mapping off, so the same ACES tone mapping runs as its last step and colours stay the same. */
function NightBloom() {
  // made here, not with <Bloom ref>: this library version serialises an effect's props, and React 19 passes the ref
  // as a prop (a circular object), which crashes it
  const bloom = useMemo(() => new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1, luminanceSmoothing: 0.2, intensity: 0, radius: 0.7 }), []);
  useEffect(() => () => bloom.dispose(), [bloom]);
  useFrame(() => { bloom.intensity = BLOOM * lampsOn.v; });
  // no edge smoothing (MSAA) in the composer: it cost ~20 % fps at night (headless, Town Square: 49 → 39 fps with 4
  // samples), and the dark hides the slightly harder edges
  return (
    <EffectComposer multisampling={0}>
      <primitive object={bloom} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
