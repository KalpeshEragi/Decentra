"use client";
// The camera, moved like the reference video (FE-9, FE-31, FE-36): a high view about 42° down with a 40° lens,
// left-drag pans, right-drag rotates, wheel zooms; angle and distance are limited (never under the ground, never too
// far out); commands glide smoothly with ease in-out. The user may choose how steeply it looks down (`down`, kept in
// the browser); the Whole City view and Site jumps keep that choice. Also the fps counter (FE-15).

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Rect } from "@/lib/city/cityLayout";
import { SiteKey, siteOf } from "@/lib/city/sites";

export type CamCmd = { kind: "site"; site: SiteKey } | { kind: "zoom"; f: number } | { kind: "rotate"; deg: number } |
  { kind: "home" } | { kind: "focus"; at: [number, number, number]; dist?: number } | { kind: "tilt"; down: number };

/** How steeply the camera looks down (degrees below the horizon): the default view and the range the user may pick
 *  (the same limits as a right-drag rotation). */
export const VIEW_DOWN = { initial: 42, min: 28, max: 62, step: 7 };
const polarOf = (down: number) => THREE.MathUtils.degToRad(90 - down);

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const AZIMUTH = THREE.MathUtils.degToRad(-38);
const COUNTRYSIDE = 240;                        // how far past the City fence the user may explore
type Glide = { t0: number; dur: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3 };

/** `bounds`: the City fence; the camera target may go a band of countryside beyond it, and follows it as it grows.
 *  `down`: the chosen view angle (degrees below the horizon); `angleOut` shows the current one, rounded. */
export function CameraRig({ cmd, focus, bounds, down, angleOut }: { cmd: CamCmd | null; focus: THREE.Vector3; bounds: Rect; down: number;
  angleOut: React.RefObject<HTMLElement | null> }) {
  const controls = useRef<OrbitControlsImpl>(null!);
  const { camera } = useThree();
  const glide = useRef<Glide | null>(null);
  const home = siteOf("CITY");
  const POLAR = polarOf(down);
  const place = (target: THREE.Vector3, dist: number, polar = POLAR, az = AZIMUTH) =>
    new THREE.Vector3().setFromSphericalCoords(dist, polar, az).add(target);

  useEffect(() => {  // start at the whole-City view
    const t = new THREE.Vector3(...home.at);
    camera.position.copy(place(t, home.dist));
    controls.current.target.copy(t);
    controls.current.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = controls.current;
    if (!cmd || !c) return;
    const fromT = c.target.clone(), fromP = camera.position.clone();
    const off = fromP.clone().sub(fromT);
    const sph = new THREE.Spherical().setFromVector3(off);
    let toT = fromT.clone(), toP = fromP.clone(), dur = 1.6;
    if (cmd.kind === "site" || cmd.kind === "home") {
      const s = siteOf(cmd.kind === "home" ? "CITY" : cmd.site);
      toT = new THREE.Vector3(...s.at);
      const polar = s.polar !== undefined ? THREE.MathUtils.degToRad(s.polar) : POLAR;
      const az = s.az !== undefined ? THREE.MathUtils.degToRad(s.az) : cmd.kind === "home" ? AZIMUTH : sph.theta;
      toP = place(toT, s.dist, polar, az);
      dur = 2.0;
    } else if (cmd.kind === "focus") {
      toT = new THREE.Vector3(...cmd.at);
      toP = toT.clone().add(cmd.dist ? off.setLength(cmd.dist) : off);
      dur = 1.2;
    } else if (cmd.kind === "zoom") {
      toP = fromT.clone().add(off.multiplyScalar(cmd.f).clampLength(c.minDistance, c.maxDistance));
      dur = 0.7;
    } else if (cmd.kind === "tilt") {
      toP = new THREE.Vector3().setFromSphericalCoords(sph.radius, polarOf(cmd.down), sph.theta).add(fromT);
      dur = 0.8;
    } else if (cmd.kind === "rotate") {
      toP = new THREE.Vector3().setFromSphericalCoords(sph.radius, sph.phi, sph.theta + THREE.MathUtils.degToRad(cmd.deg)).add(fromT);
      dur = 1.1;
    }
    glide.current = { t0: performance.now(), dur: dur * 1000, fromT, toT, fromP, toP };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd]);

  const sa = useRef(new THREE.Spherical()), sb = useRef(new THREE.Spherical()), tmp = useRef(new THREE.Vector3());
  useFrame(() => {
    const g = glide.current, c = controls.current;
    if (g) {
      const t = Math.min(1, (performance.now() - g.t0) / g.dur), e = ease(t);
      c.target.lerpVectors(g.fromT, g.toT, e);
      if (g.fromP.distanceTo(g.toP) > 0.01) {
        // glide on the orbit sphere so a rotation keeps its distance; turn the short way round
        sa.current.setFromVector3(tmp.current.copy(g.fromP).sub(g.fromT));
        sb.current.setFromVector3(tmp.current.copy(g.toP).sub(g.toT));
        let dTheta = sb.current.theta - sa.current.theta;
        if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
        if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
        const r = sa.current.radius + (sb.current.radius - sa.current.radius) * e;
        const phi = sa.current.phi + (sb.current.phi - sa.current.phi) * e;
        camera.position.setFromSphericalCoords(r, phi, sa.current.theta + dTheta * e).add(c.target);
      }
      if (t >= 1) glide.current = null;
    }
    const [x0, z0, x1, z1] = bounds;
    c.target.x = THREE.MathUtils.clamp(c.target.x, x0 - COUNTRYSIDE, x1 + COUNTRYSIDE);
    c.target.z = THREE.MathUtils.clamp(c.target.z, z0 - COUNTRYSIDE, z1 + COUNTRYSIDE);
    c.target.y = THREE.MathUtils.clamp(c.target.y, 0, 30);  // a Site may aim above the ground (the event board)
    focus.copy(c.target);
    c.update();
    const shown = `${Math.round(90 - THREE.MathUtils.radToDeg(c.getPolarAngle()))}°`;
    if (angleOut.current && angleOut.current.textContent !== shown) angleOut.current.textContent = shown;
  });

  return (
    <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} screenSpacePanning={false}
      mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
      minPolarAngle={THREE.MathUtils.degToRad(28)} maxPolarAngle={THREE.MathUtils.degToRad(62)}
      minDistance={40} maxDistance={760} zoomSpeed={0.7} panSpeed={1.1} rotateSpeed={0.5}
      onStart={() => { glide.current = null; }} />
  );
}

/** Inside the Canvas: writes "60 fps · worst 21 ms · 312 draws · 840k tris" into `out` twice a second. Draws and
 *  triangles are the whole previous frame (scene, shadow map and, at night, the bloom passes): the renderer's own
 *  counter restarts at every render call, so it is summed here and restarted once per frame instead. */
export function FpsProbe({ out }: { out: React.RefObject<HTMLDivElement | null> }) {
  const { gl } = useThree();
  const acc = useRef({ n: 0, t: performance.now(), worst: 0, last: performance.now() });
  useEffect(() => {
    gl.info.autoReset = false;
    return () => { gl.info.autoReset = true; };
  }, [gl]);
  useFrame(() => {
    const now = performance.now(), a = acc.current, { calls, triangles } = gl.info.render;
    gl.info.reset();
    a.worst = Math.max(a.worst, now - a.last); a.last = now; a.n++;
    if (now - a.t >= 500) {
      const fps = (a.n * 1000) / (now - a.t);
      if (out.current) out.current.textContent =
        `${fps.toFixed(0)} fps · worst ${a.worst.toFixed(0)} ms · ${calls} draws · ${(triangles / 1000).toFixed(0)}k tris`;
      a.n = 0; a.t = now; a.worst = 0;
    }
  });
  return null;
}
