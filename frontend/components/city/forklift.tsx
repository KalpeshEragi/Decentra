"use client";
// One forklift (grab3d.com CC0 model, ADR-004 / FE-50) with a load slot on its forks. Everything that drives a
// forklift (lib/city/forklifts.ts) only sets this group's position and heading and passes the load, so the body can
// change here without touching the trips. Forks point to local +z (the way it drives), as in the model.

import { forwardRef, ReactNode } from "react";
import * as THREE from "three";
import { HeadlightBeam, ModelMesh, ModelSlot } from "./models";

/** The model is life-size (3.9 m long); the City is drawn a little larger than life (pallets 3.4 m). */
const SCALE = 1.25;
/** Height of the fork tines: a load put in the slot stands on them. */
export const FORK_Y = 0.12;
/** Middle of the tines along +z (the model's carriage runs from 0.68 to 1.93 m, scaled). */
const FORK_Z = 1.3 * SCALE;

/** `lit`: head- and taillights on and a beam ahead, while the street lamps are on (it is driving). */
export const Forklift = forwardRef<THREE.Group, { children?: ReactNode; lit?: boolean }>(function Forklift({ children, lit = false }, ref) {
  return (
    <group ref={ref}>
      <ModelSlot><ModelMesh name="forklift" scale={SCALE} lit={lit} /></ModelSlot>
      {lit && <HeadlightBeam z={5.5} w={4} len={6} />}
      {/* the load slot, centred on the forks */}
      <group position={[0, FORK_Y, FORK_Z]}>{children}</group>
    </group>
  );
});
