"use client";
// Small markers on the City: the selection ring (FE-11) and the names of the supplier depot yards. (One depot per
// supplier, with trucks and pins, is issue 03.)

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { SUPPLIER_PLOTS } from "@/lib/city/cityLayout";
import type { Selection } from "@/lib/city/detail";
import { PALETTE, Tag } from "./kit";

const BIG = new Set<Selection["kind"]>(["warehouse", "square", "office", "factory"]);

/** A softly pulsing ring on the ground under the selected element. */
export function SelectionMark({ sel }: { sel: Selection }) {
  const ring = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => { const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.08; ring.current.scale.set(s, s, 1); });
  const big = BIG.has(sel.kind);
  return (
    <mesh ref={ring} position={[sel.at[0], 0.25, sel.at[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[big ? 20 : 4, big ? 21.4 : 4.8, 64]} />
      <meshBasicMaterial color={PALETTE.trim} transparent opacity={0.85} toneMapped={false} />
    </mesh>
  );
}

/** A brief ring growing on the ground where a new action happened (FE-39). `t0` is a performance.now() time; a ring
 *  waits until then (so a batch pulses one after another) and is gone after PULSE_MS. */
export type Pulse = { id: string; at: [number, number, number]; color: string; t0: number };
export const PULSE_MS = 2600;

function PulseRing({ p }: { p: Pulse }) {
  const ring = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(() => {
    const k = (performance.now() - p.t0) / PULSE_MS;
    ring.current.visible = k >= 0 && k <= 1;
    if (!ring.current.visible) return;
    const s = 1 + k * 5;
    ring.current.scale.set(s, s, 1);
    mat.current.opacity = 0.9 * (1 - k);
  });
  return (
    <mesh ref={ring} position={[p.at[0], 0.35, p.at[2]]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[5, 6.2, 48]} />
      <meshBasicMaterial ref={mat} color={p.color} transparent opacity={0} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

export function Pulses({ pulses }: { pulses: Pulse[] }) {
  return <>{pulses.map((p) => <PulseRing key={p.id} p={p} />)}</>;
}

export function DepotYards({ suppliers }: { suppliers: number }) {
  return (
    <>
      {SUPPLIER_PLOTS.map(([x0, z0, x1, z1], i) => (
        <Tag key={i} at={[(x0 + x1) / 2, 2, (z0 + z1) / 2]} text="Supplier depots" sub={i === 0 ? `${suppliers} suppliers` : undefined} always />
      ))}
    </>
  );
}
