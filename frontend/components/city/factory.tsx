"use client";
// The Factory Site (FE-47): an open production hall (back wall, columns, open roof beams, chimneys) so the lines can be
// seen from the high camera. One line per work center in the live data, its light green while an order there has
// started, amber when orders are planned today, grey when idle. HR's present workers stand at the line of their
// primary skill; absent workers stand faded at the HR office (FE-28). Pins: green present, red absent. (Blue "assigned
// today" needs HR's assignments in the live data: issue 05.)

import { useMemo } from "react";
import * as THREE from "three";
import type { Live } from "@/lib/api";
import { FACTORY_PLOT } from "@/lib/city/cityLayout";
import { fmt, workersAt } from "@/lib/city/detail";
import { officeAt } from "@/lib/city/sites";
import { lineLight } from "@/lib/city/siteRules";
import { lineZ as yardLineZ } from "@/lib/city/yard";
import { Block, Clickable, isClick, MapPin, PIN_COLORS, Tag, useCity } from "./kit";
import { Fence } from "./landscape";
import { ModelSlot } from "./models";
import { PERSON_H, PersonKind, StandingPerson } from "./people";

/** Man or woman, fixed per worker code (a display choice: HR's records hold no such field). */
const workerKind = (code: string): PersonKind => ([...code].reduce((n, c) => n + c.charCodeAt(0), 0) % 2 ? "woman" : "man");

/** An HR worker: the Casual Man or Woman model (grab3d has no worker) in a yellow hard hat; see-through when absent. */
function Worker({ at, kind, faded, onPick }: { at: [number, number, number]; kind: PersonKind; faded: boolean; onPick: () => void }) {
  const { hover } = useCity();
  const helmet = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f2c230", roughness: 0.5, transparent: faded, opacity: faded ? 0.35 : 1 }), [faded]);
  return (
    <group position={at} onClick={(e) => { e.stopPropagation(); if (isClick(e)) onPick(); }}
      onPointerOver={(e) => { e.stopPropagation(); hover(true); }} onPointerOut={() => hover(false)}>
      <ModelSlot><StandingPerson kind={kind} at={[0, 0, 0]} faded={faded} /></ModelSlot>
      <mesh position={[0, PERSON_H * 0.93, 0]} material={helmet} castShadow={!faded}><sphereGeometry args={[PERSON_H * 0.097, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
      <MapPin at={[0, PERSON_H - 0.8, 0]} color={faded ? PIN_COLORS.red : PIN_COLORS.green} />
    </group>
  );
}

export function FactorySite({ live }: { live: Live | null }) {
  const { kit, select } = useCity();
  const [x0, z0, x1, z1] = FACTORY_PLOT, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = x1 - x0 - 6, D = z1 - z0 - 6;
  const lines = live?.lines ?? [];
  const workers = live?.workers ?? [];
  const lineZ = (i: number) => yardLineZ(i, lines.length);  // the same spot the forklifts drive to (lib/city/yard.ts)
  const lights = useMemo(() => ({
    started: new THREE.MeshStandardMaterial({ color: "#1f9d55", emissive: new THREE.Color("#1f9d55"), emissiveIntensity: 1.2 }),
    planned: new THREE.MeshStandardMaterial({ color: "#e3a321", emissive: new THREE.Color("#e3a321"), emissiveIntensity: 1 }),
    idle: new THREE.MeshStandardMaterial({ color: "#9aa3b2" }),
  }), []);
  const [hx, , hz] = officeAt("HR");
  return (
    <group>
      <mesh position={[cx, 0.05, cz]} material={kit.plaza} receiveShadow><boxGeometry args={[x1 - x0, 0.08, z1 - z0]} /></mesh>
      <Fence rect={FACTORY_PLOT} style="site" gaps={[{ side: "S", from: cx - 6, to: cx + 6 }]} />
      <Clickable sel={{ kind: "factory", id: "FACTORY", at: [cx, 0, cz], label: "Factory" }}>
        <group>
          <Block x={cx} z={cz} w={W} d={D} h={0.3} mat={kit.wallShade} />
          <Block x={cx} z={z0 + 3.4} w={W} d={0.8} h={10} mat={kit.wall} />
          {[-1, -0.5, 0, 0.5, 1].map((t) => <Block key={t} x={cx + (t * (W - 1)) / 2} z={z1 - 3.4} w={0.7} d={0.7} h={10} mat={kit.trim} />)}
          {/* open roof: beams and a ring beam only, so the lines inside stay visible from the high camera */}
          {Array.from({ length: 7 }, (_, k) => <Block key={k} x={cx - W / 2 + (k * W) / 6} z={cz} w={0.6} d={D + 1} h={0.8} y={10} mat={kit.roof} />)}
          <Block x={cx} z={z0 + 3.4} w={W + 1} d={0.8} h={0.8} y={10} mat={kit.roof} />
          <Block x={cx} z={z1 - 3.2} w={W + 1.2} d={0.5} h={1.4} y={9.6} mat={kit.trim} />
          {[-0.35, -0.2].map((t) => (
            <group key={t}>
              <mesh position={[cx + t * W, 16, z0 + 6]} material={kit.wallShade} castShadow><cylinderGeometry args={[1.2, 1.5, 12, 14]} /></mesh>
              <mesh position={[cx + t * W, 22.2, z0 + 6]} material={kit.trim}><cylinderGeometry args={[1.25, 1.25, 0.6, 14]} /></mesh>
            </group>
          ))}
        </group>
      </Clickable>
      {lines.map((l, i) => {
        const z = lineZ(i);
        return (
          <group key={l.work_center}>
            <Clickable sel={{ kind: "line", id: l.work_center, at: [cx, 0, z], label: `Line ${l.work_center}` }}>
              <group>
                <Block x={cx} z={z} w={W - 10} d={1.8} h={1} y={0.3} mat={kit.dark} />
                {[0, 1, 2, 3].map((k) => <Block key={k} x={cx - (W - 10) / 2 + 6 + k * ((W - 22) / 3)} z={z} w={4} d={3.2} h={2.6} y={0.3} mat={kit.trim} />)}
                <mesh position={[cx + (W - 10) / 2 + 1.2, 3.2, z]} material={lights[lineLight(l)]}><sphereGeometry args={[0.6, 14, 10]} /></mesh>
                <Block x={cx + (W - 10) / 2 + 1.2} z={z} w={0.3} d={0.3} h={2.6} y={0.3} mat={kit.dark} />
              </group>
            </Clickable>
            <Tag at={[cx - (W - 10) / 2 - 3, 3.5, z]} text={l.work_center} sub={`${fmt(l.machine_hours_free)} h free`} maxDist={220} />
            {workersAt(l.work_center, workers).map((w, k) => (
              <Worker key={w.code} at={[cx - (W - 10) / 2 + 8 + k * 7, 0.3, z + 2.8]} kind={workerKind(w.code)} faded={false}
                onPick={() => select({ kind: "worker", id: w.code, at: [cx, 0, z], label: w.name })} />
            ))}
          </group>
        );
      })}
      {workers.filter((w) => w.absent).map((w, k) => (
        <Worker key={w.code} at={[hx + 8 + k * 2.5, 0, hz + 16]} kind={workerKind(w.code)} faded
          onPick={() => select({ kind: "worker", id: w.code, at: [hx, 0, hz], label: w.name })} />
      ))}
      <Tag at={[cx, 25, z0 + 6]} text="Factory" sub={`${lines.length} lines`} always />
    </group>
  );
}
