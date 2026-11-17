"use client";
// The warehouse Site (FE-16, FE-21): the materials warehouse with its dock doors, the Warehouse office (glass block,
// west end) and the Inventory office (gable shed, east end), zone racks and stock pallets. Everything with business
// meaning is drawn from the live snapshot: a truck stands at a door while a delivery (today or tomorrow) or a shipment
// is pending, pallets follow stock on hand, racks fill with zone occupancy. Positions come from lib/city/yard.ts, the
// same ones the live forklifts and dock trucks drive to (movers.tsx); a door whose truck is driving shows no parked one.

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Live } from "@/lib/api";
import { AGENTS } from "@/lib/agents";
import { FACTORY_PLOT, Rect, WAREHOUSE_SITE } from "@/lib/city/cityLayout";
import { num, words } from "@/lib/city/detail";
import { officeAt } from "@/lib/city/sites";
import { busyDoors, TruckRun } from "@/lib/city/forklifts";
import { deliveryPin, dockSlots, rackSlots, stackLayers } from "@/lib/city/siteRules";
import { bayAt, DOCK_FRONT, doorX, FORKLIFTS, HALL, MAX_PALLETS, MAX_RACKS, NORTH_GAP, palletAt, rackAt, YARD_ROADS } from "@/lib/city/yard";
import { Block, Clickable, Facade, MapPin, Person, PIN_COLORS, Sign, Tag, useCity } from "./kit";
import { Fence } from "./landscape";
import { HeadlightBeam, ModelMesh, ModelSlot } from "./models";
import { OfficeShell } from "./offices";
import { Footprint } from "./contact";

const { x: HX, z: HZ, w: HW, d: HD, h: HH } = HALL;  // the hall: centre, width, depth, height
const FRONT = DOCK_FRONT;                            // the dock side, facing the yard
// the Site fence: a wide truck gate on the street side, the yard lane to the highway, a people gap by the Warehouse office
const SITE_GAPS = [{ side: "S" as const, from: 135, to: 165 }, { side: "N" as const, ...NORTH_GAP }, { side: "W" as const, from: 19, to: 24 }];

/** The delivery truck model is life-size (2.8 m wide); drawn a little larger, it fills a 3.8 m dock door. */
const TRUCK_SCALE = 1.3, TRUCK_REAR = 3.16 * TRUCK_SCALE;

/** A truck (grab3d.com CC0 model, ADR-004) with its rear at local z = 0 and the cab towards +z; `label` on its side;
 *  `lit` (a truck under way): head- and taillights and a beam ahead while the street lamps are on. */
export function Truck({ at, rot, label, lit = false }: { at: [number, number, number]; rot: number; label?: string; lit?: boolean }) {
  const { kit } = useCity();
  return (
    <group position={at} rotation={[0, rot, 0]}>
      <ModelSlot><ModelMesh name="truck" scale={TRUCK_SCALE} position={[0, 0, TRUCK_REAR]} lit={lit} /></ModelSlot>
      {lit && <HeadlightBeam z={TRUCK_REAR * 2 + 5} w={6} len={10} />}
      {label && <Sign text={label} color={kit.cab.color.getStyle()} pos={[1.86, 2.3, 2.6]} rot={Math.PI / 2} w={4.4} h={1.1} />}
    </group>
  );
}

/** The pallet model (life-size 1.2 × 0.8 m) stretched to the City's 3.4 m stock square; raw material on blue pallets. */
const PALLET_SCALE: [number, number, number] = [3.4 / 1.2, 0.35 / 0.144, 3.4 / 0.8];
export function Pallet({ raw = false, size = 1 }: { raw?: boolean; size?: number }) {
  const s = PALLET_SCALE.map((v) => v * size) as [number, number, number];
  return <ModelSlot><ModelMesh name="pallet" scale={s} tint={raw ? "#7f9be6" : undefined} /></ModelSlot>;
}

/** A pallet of boxes; its height follows stock on hand. An amber pin when everything on hand is reserved or held. */
function StockStack({ at, onHand, free, raw }: { at: [number, number]; onHand: number; free: number; raw: boolean }) {
  const { kit } = useCity();
  const layers = stackLayers(onHand);
  const mat = raw ? kit.crate : kit.box;
  return (
    <group position={[at[0], 0, at[1]]}>
      <Pallet raw={raw} />
      {Array.from({ length: layers }, (_, l) => [[-0.82, -0.82], [0.82, -0.82], [-0.82, 0.82], [0.82, 0.82]].map(([x, z], i) => (
        <Block key={`${l}-${i}`} x={x} z={z} w={1.55} d={1.55} h={1.05} y={0.36 + l * 1.08} mat={mat} />
      )))}
      {free <= 0 && onHand > 0 && <MapPin at={[0, 0.5 + layers * 1.08, 0]} color={PIN_COLORS.amber} />}
    </group>
  );
}

function ZoneRack({ at, slots }: { at: [number, number]; slots: number }) {
  const { kit } = useCity();
  return (
    <group position={[at[0], 0, at[1]]}>
      {[-4.6, -1.5, 1.5, 4.6].map((x) => [-1, 1].map((z) => <Block key={`${x}${z}`} x={x} z={z} w={0.25} d={0.25} h={7} mat={kit.trim} />))}
      {[0.4, 2.7, 5].map((y) => <Block key={y} x={0} z={0} w={9.6} d={2.4} h={0.2} y={y} mat={kit.forklift} shadow={false} />)}
      {Array.from({ length: slots }, (_, i) => {
        const bay = i % 3, lvl = Math.floor(i / 3) % 3, side = i >= 9 ? 1 : 0;
        return <Block key={i} x={-3.05 + bay * 3.05 + side * 0.4} z={0} w={2.3} d={1.9} h={1.6} y={0.6 + lvl * 2.3} mat={kit.box} />;
      })}
    </group>
  );
}

function Hall() {
  const { kit } = useCity();
  return (
    <Clickable sel={{ kind: "warehouse", id: "WH", at: [HX, 0, HZ], label: "Materials warehouse" }}>
      <group>
        <Block x={HX} z={HZ} w={HW} d={HD} h={HH} mat={kit.wall} />
        <Footprint x={HX} z={HZ} w={HW + 0.3} d={HD + 0.3} h={HH} y={0.14} />
        {/* the top band stops 2 cm under the wall top: level with it, the two tops would flicker along the roof edge */}
        <Block x={HX} z={HZ} w={HW + 0.4} d={HD + 0.4} h={1.38} y={HH - 1.4} mat={kit.trim} />
        <Block x={HX} z={HZ} w={HW + 0.3} d={HD + 0.3} h={0.8} mat={kit.trim} shadow={false} />
        {Array.from({ length: 36 }, (_, i) => (
          <mesh key={i} position={[HX - HW / 2 + 1 + (i * (HW - 2)) / 35, HH / 2, FRONT + 0.06]} material={kit.wallShade}>
            <boxGeometry args={[0.18, HH - 2.4, 0.1]} />
          </mesh>
        ))}
        <Block x={HX} z={HZ} w={HW - 1} d={HD - 1} h={0.4} y={HH} mat={kit.roof} />
        {Array.from({ length: 8 }, (_, i) => (
          <group key={i} position={[HX - 28 + (i % 4) * 9, HH + 0.4, HZ - 7 + Math.floor(i / 4) * 12]}>
            <Block x={0} z={0} w={4} d={3} h={1.4} mat={kit.wallShade} />
            <mesh position={[0, 1.45, 0]} rotation={[-Math.PI / 2, 0, 0]} material={kit.dark}><circleGeometry args={[1, 16]} /></mesh>
          </group>
        ))}
        {Array.from({ length: 4 }, (_, i) => <Block key={i} x={HX + 10 + i * 6} z={HZ + 2} w={3.5} d={12} h={0.3} y={HH + 0.4} mat={kit.glass} shadow={false} />)}
        <Sign text="WAREHOUSE" color={kit.trim.color.getStyle()} pos={[HX - 20, HH - 3.6, FRONT + 0.12]} w={14} h={2.4} />
      </group>
    </Clickable>
  );
}

function Docks({ live, trucks }: { live: Live | null; trucks: TruckRun[] }) {
  const { kit } = useCity();
  // a door whose truck is driving (in or out) shows no parked one meanwhile; checked every frame, no re-render
  const parked = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const busy = busyDoors(trucks, performance.now());
    parked.current.forEach((g, i) => { if (g) g.visible = !busy.has(i); });
  });
  const { doors, slots } = dockSlots(live?.docks ?? { inbound: [], outbound: [] });
  const yellow = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f2c230", roughness: 0.6 }), []);
  const today = live?.clock.day ?? "";
  return (
    <>
      {Array.from({ length: doors }, (_, i) => {
        const d = slots.find((s) => s.door === i);
        const x = doorX(i, doors);
        return (
          <group key={i}>
            <mesh position={[x - 2.6, 0.16, FRONT + 9]} material={yellow}><boxGeometry args={[0.25, 0.02, 16]} /></mesh>
            <mesh position={[x + 2.6, 0.16, FRONT + 9]} material={yellow}><boxGeometry args={[0.25, 0.02, 16]} /></mesh>
            <Clickable sel={d ? { kind: d.kind, id: d.id, at: [x, 0, FRONT + 8], label: d.label }
              : { kind: "dock", id: String(i + 1), at: [x, 0, FRONT], label: `Dock ${i + 1}` }}>
              <group>
                <Block x={x} z={FRONT + 0.3} w={4.6} d={0.6} h={5.4} mat={kit.trim} />
                <Block x={x} z={FRONT + 0.45} w={3.8} d={0.4} h={4.6} mat={d ? kit.dark : kit.wallShade} />
                <Block x={x} z={FRONT + 1.2} w={4.4} d={1.6} h={1.2} mat={kit.wallShade} />
                {d && <group ref={(g) => { parked.current[i] = g; }}><Truck at={[x, 0, FRONT + 2.2]} rot={0} label={d.kind === "inbound" ? "SUPPLY" : "SHIP"} /></group>}
                {d?.kind === "inbound" && <MapPin at={[x, 6, FRONT + 8]} color={PIN_COLORS[deliveryPin(d.status, d.day, today)]} />}
              </group>
            </Clickable>
          </group>
        );
      })}
    </>
  );
}

/** The yard roads the forklifts and trucks follow, painted on the pavement. Painted only inside the warehouse Site
 *  and the factory plot: outside the fence a lane joins the City's road and drives on it, unpainted. */
function YardLanes() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#c9d0db", roughness: 0.9 }), []);
  const painted = useMemo(() => YARD_ROADS.flatMap((r) => {
    const lane: Rect = [Math.min(r.x1, r.x2) - r.w / 2, Math.min(r.z1, r.z2) - r.w / 2, Math.max(r.x1, r.x2) + r.w / 2, Math.max(r.z1, r.z2) + r.w / 2];
    return [WAREHOUSE_SITE, FACTORY_PLOT].map((site): Rect => [Math.max(lane[0], site[0]), Math.max(lane[1], site[1]),
      Math.min(lane[2], site[2]), Math.min(lane[3], site[3])]).filter(([x0, z0, x1, z1]) => x1 > x0 && z1 > z0);
  }), []);
  return (
    <>
      {painted.map(([x0, z0, x1, z1], i) => (
        <mesh key={i} position={[(x0 + x1) / 2, 0.13, (z0 + z1) / 2]} material={mat} receiveShadow>
          <boxGeometry args={[x1 - x0, 0.02, z1 - z0]} />
        </mesh>
      ))}
    </>
  );
}

export function WarehouseSite({ live, trucks }: { live: Live | null; trucks: TruckRun[] }) {
  const { kit } = useCity();
  const stock = live?.stock ?? [];
  const zones = live?.zones ?? [];
  const [wx, , wz] = officeAt("WAREHOUSE"), [ix, , iz] = officeAt("INVENTORY");
  const yellow = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f2c230", roughness: 0.6 }), []);
  return (
    <group>
      <mesh position={[151.5, 0.06, 29]} material={kit.plaza} receiveShadow><boxGeometry args={[111, 0.1, 102]} /></mesh>
      <Fence rect={WAREHOUSE_SITE} style="site" gaps={SITE_GAPS} />
      <Hall />
      <Docks live={live} trucks={trucks} />
      <YardLanes />

      {/* Warehouse agent office: a glass curtain-wall block at the west end */}
      <OfficeShell code="WAREHOUSE" tagY={14}>
        <Block x={wx} z={wz} w={12} d={26} h={10} mat={kit.trim} />
        <Footprint x={wx} z={wz} w={12} d={26} h={10} y={0.14} />
        <Facade x={wx} z={wz + 13.06} w={11} h={9} y={0.5} rot={0} cols={3} rows={3} band />
        <Facade x={wx - 6.06} z={wz} w={25} h={9} y={0.5} rot={-Math.PI / 2} cols={7} rows={3} band />
        <Person at={[wx - 3, 0, wz + 16]} color={AGENTS.WAREHOUSE.color} seed={5} />
      </OfficeShell>
      {/* Inventory agent office: a gable shed at the east end */}
      <OfficeShell code="INVENTORY" tagY={13}>
        <Block x={ix} z={iz} w={12} d={20} h={7} mat={kit.trimDark} />
        <Footprint x={ix} z={iz} w={12} d={20} h={9} y={0.14} />
        <mesh position={[ix, 7, iz]} rotation={[Math.PI / 2, 0, 0]} castShadow material={kit.trim}>
          <cylinderGeometry args={[7, 7, 20, 3, 1, false]} />
        </mesh>
        <Facade x={ix} z={iz + 10.06} w={8} h={3} y={2} rot={0} cols={3} rows={1} />
        <Sign text="INVENTORY" color={AGENTS.INVENTORY.color} pos={[ix, 5.8, iz + 10.08]} w={8} h={1.4} />
        <Person at={[ix + 4, 0, iz + 14]} color={AGENTS.INVENTORY.color} seed={6} />
      </OfficeShell>

      {/* zone racks (west yard) and stock pallets (east yard) from the live data */}
      {zones.slice(0, MAX_RACKS).map((z, i) => {
        const at = rackAt(i);
        return (
          <Clickable key={z.zone} sel={{ kind: "zone", id: z.zone, at: [at[0], 0, at[1]], label: words(z.zone) }}>
            <ZoneRack at={at} slots={rackSlots(num(z.occupied_now), num(z.capacity_units))} />
            <Tag at={[at[0], 8.6, at[1]]} text={words(z.zone)} maxDist={170} />
          </Clickable>
        );
      })}
      {stock.slice(0, MAX_PALLETS).map((s, i) => {
        const at = palletAt(i);
        return (
          <Clickable key={s.item_id} sel={{ kind: "stock", id: s.item_id, at: [at[0], 0, at[1]], label: s.sku }}>
            <StockStack at={at} onHand={num(s.on_hand)} free={num(s.on_hand) - num(s.reserved) - num(s.held)} raw={!/FINISH|PRODUCT|FG/i.test(s.type)} />
          </Clickable>
        );
      })}
      {/* the forklifts' charging bay (the forklifts themselves are drawn by movers.tsx) */}
      <mesh position={[bayAt(1)[0], 0.16, bayAt(0)[1] + 2]} material={yellow}><boxGeometry args={[FORKLIFTS * 3.2 + 1, 0.02, 0.25]} /></mesh>
      <Tag at={[HX, HH + 6, HZ]} text="WH-01" sub="Warehouse Site" always />
    </group>
  );
}
