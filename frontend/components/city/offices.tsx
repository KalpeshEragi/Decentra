"use client";
// The four agent offices around the Town Square, each its own building structure in its agent's colour (FE-14, FE-16),
// with the agent's character at the door (idle only, FE-26). Inventory's and Warehouse's offices are part of the
// warehouse Site (warehouse.tsx). Clicking an office shows its open negotiations and latest events (FE-30).

import { ReactNode, useMemo } from "react";
import * as THREE from "three";
import { AGENTS } from "@/lib/agents";
import { officeAt } from "@/lib/city/sites";
import { Block, Clickable, Facade, PALETTE, Person, Sign, Tag, useCity } from "./kit";
import { useNightGlow } from "./lighting";
import { Footprint } from "./contact";

export function OfficeShell({ code, children, tagY }: { code: string; children: ReactNode; tagY: number }) {
  const a = AGENTS[code];
  const [x, , z] = officeAt(code);
  return (
    <Clickable sel={{ kind: "office", id: code, at: [x, 0, z], label: `${a.name} office` }}>
      <group>
        {children}
        <Tag at={[x, tagY, z]} text={a.name} sub="agent office" color={a.color} maxDist={600} />
      </group>
    </Clickable>
  );
}

const useAccent = (color: string, roughness = 0.6) => useMemo(() => new THREE.MeshStandardMaterial({ color, roughness }), [color, roughness]);

/** Sales: a two-storey shop with a full-glass storefront, a striped awning and a rooftop sign. */
function SalesOffice() {
  const { kit } = useCity(); const c = AGENTS.SALES.color; const [X, , Z] = officeAt("SALES");
  const accent = useAccent(c);
  return (
    <OfficeShell code="SALES" tagY={18}>
      <Block x={X} z={Z} w={30} d={18} h={11} mat={kit.wall} />
      <Footprint x={X} z={Z} w={30} d={18} h={11} y={0.04} />
      <Block x={X} z={Z + 9.05} w={27} d={0.2} h={4.6} y={0.3} mat={kit.glassNight} shadow={false} />
      <Facade x={X} z={Z + 9.06} y={6} w={27} h={4} rot={0} cols={9} rows={1} />
      <Facade x={X - 15.06} z={Z} y={1} w={16} h={9} rot={-Math.PI / 2} cols={5} rows={2} />
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[X - 12 + i * 3, 5.3, Z + 10.4]} rotation={[0.45, 0, 0]} material={i % 2 ? kit.white : accent} castShadow>
          <boxGeometry args={[3, 0.15, 3]} />
        </mesh>
      ))}
      <Block x={X} z={Z} w={31} d={19} h={0.8} y={11} mat={accent} />
      <Sign text="SALES" color={c} pos={[X, 13.6, Z + 3]} w={12} h={3} />
      {[[-12, 13], [12, 13]].map(([dx, dz], i) => <Block key={i} x={X + dx} z={Z + dz} w={3} d={3} h={1.2} mat={kit.wallShade} />)}
      <Person at={[X + 4, 0, Z + 13]} color={c} seed={1} />
    </OfficeShell>
  );
}

/** Planning: a stepped tower with blue glass bands, a crown ring and an antenna (the City's tallest office). */
function PlanningOffice() {
  const { kit } = useCity(); const c = AGENTS.PLANNING.color; const [X, , Z] = officeAt("PLANNING");
  const crown = useMemo(() => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, emissive: new THREE.Color(c), emissiveIntensity: 0 }), [c]);
  useNightGlow(crown, 0.8);
  return (
    <OfficeShell code="PLANNING" tagY={54}>
      <Block x={X} z={Z} w={26} d={24} h={8} mat={kit.wall} />
      <Footprint x={X} z={Z} w={26} d={24} h={14} y={0.04} />
      <Facade x={X} z={Z + 12.05} w={24} h={7} y={0.5} rot={0} cols={8} rows={2} />
      <Block x={X} z={Z} w={17} d={17} h={24} y={8} mat={kit.wallShade} />
      <Facade x={X} z={Z + 8.55} w={17} h={23} y={8.5} rot={0} cols={6} rows={9} band />
      <Facade x={X - 8.55} z={Z} w={17} h={23} y={8.5} rot={-Math.PI / 2} cols={6} rows={9} band />
      <Block x={X} z={Z} w={12} d={12} h={11} y={32} mat={kit.wall} />
      <Facade x={X} z={Z + 6.05} w={12} h={10} y={32.5} rot={0} cols={4} rows={4} band />
      <Facade x={X - 6.05} z={Z} w={12} h={10} y={32.5} rot={-Math.PI / 2} cols={4} rows={4} band />
      <mesh position={[X, 44, Z]} material={crown} castShadow><torusGeometry args={[5, 0.5, 8, 32]} /></mesh>
      <mesh position={[X, 49, Z]} material={kit.dark}><cylinderGeometry args={[0.15, 0.3, 10, 6]} /></mesh>
      <Sign text="PLANNING" color={c} pos={[X, 5, Z + 12.1]} w={12} h={2.4} />
      <Person at={[X - 6, 0, Z + 16]} color={c} seed={2} />
    </OfficeShell>
  );
}

/** Purchasing: a trade hall with a sawtooth roof and a side canopy over crates (supplier talks show here, FE-27). */
function PurchasingOffice() {
  const { kit } = useCity(); const c = AGENTS.PURCHASING.color; const [X, , Z] = officeAt("PURCHASING");
  const accent = useAccent(c);
  return (
    <OfficeShell code="PURCHASING" tagY={18}>
      <Block x={X} z={Z} w={30} d={20} h={8} mat={kit.wall} />
      <Footprint x={X} z={Z} w={30} d={20} h={8} y={0.04} />
      <Facade x={X} z={Z + 10.05} w={28} h={5} y={1.5} rot={0} cols={10} rows={1} />
      {[0, 1, 2, 3].map((i) => (
        <group key={i} position={[X - 11.25 + i * 7.5, 8, Z]}>
          {/* one sawtooth: a sloped roof slab and a vertical glazed face */}
          <mesh position={[0, 2, 0]} rotation={[0, 0, Math.atan2(4, 7.5)]} material={i % 2 ? kit.roof : accent} castShadow>
            <boxGeometry args={[Math.hypot(7.5, 4), 0.35, 20]} />
          </mesh>
          <mesh position={[3.7, 2, 0]} material={kit.glassNight}><boxGeometry args={[0.2, 4, 19.6]} /></mesh>
        </group>
      ))}
      <Block x={X + 19} z={Z + 2} w={8} d={14} h={0.5} y={5.5} mat={accent} />
      {[[-3, -6], [3, -6], [-3, 8], [3, 8]].map(([dx, dz], i) => <Block key={i} x={X + 19 + dx} z={Z + 2 + dz * 0.9} w={0.4} d={0.4} h={5.5} mat={kit.dark} />)}
      {[[-2, -2], [1.5, 1], [-1, 3.5]].map(([dx, dz], i) => <Block key={i} x={X + 19 + dx} z={Z + 2 + dz} w={2.2} d={2.2} h={1.8 + (i % 2)} mat={kit.box} />)}
      <Sign text="PURCHASING" color={c} pos={[X, 7, Z + 10.1]} w={14} h={2} />
      <Person at={[X + 5, 0, Z + 14]} color={c} seed={3} />
    </OfficeShell>
  );
}

/** HR: a low L-shaped building around a garden courtyard with a green roof patch. */
function HrOffice() {
  const { kit } = useCity(); const c = AGENTS.HR.color; const [X, , Z] = officeAt("HR");
  const accent = useAccent(c);
  const green = useAccent(PALETTE.tree[1], 0.9);
  return (
    <OfficeShell code="HR" tagY={14}>
      <Block x={X} z={Z - 6} w={32} d={12} h={7} mat={kit.wall} />
      <Block x={X - 10} z={Z + 6} w={12} d={14} h={7} mat={kit.wall} />
      <Footprint x={X} z={Z - 6} w={32} d={12} h={7} y={0.04} />
      <Footprint x={X - 10} z={Z + 6.5} w={12} d={13} h={7} y={0.04} />
      <Facade x={X + 6} z={Z} w={20} h={4.5} y={1.3} rot={0} cols={7} rows={1} />
      <Facade x={X - 3.95} z={Z + 6} w={13} h={4.5} y={1.3} rot={Math.PI / 2} cols={4} rows={1} />
      <Facade x={X - 10} z={Z + 13.05} w={11} h={4.5} y={1.3} rot={0} cols={4} rows={1} />
      <Block x={X + 4} z={Z - 6} w={20} d={10} h={0.4} y={7} mat={green} />
      <Block x={X - 10} z={Z + 13.2} w={4} d={0.3} h={4} mat={accent} />
      <Block x={X + 6} z={Z + 8} w={6} d={1.2} h={0.8} mat={kit.wood} />
      <Sign text="HR" color={c} pos={[X + 10, 5.6, Z + 0.05]} w={5} h={2} />
      <Person at={[X + 2, 0, Z + 6]} color={c} seed={4} />
    </OfficeShell>
  );
}

export function Offices() {
  return (
    <>
      <SalesOffice />
      <PlanningOffice />
      <PurchasingOffice />
      <HrOffice />
    </>
  );
}
