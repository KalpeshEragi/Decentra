"use client";
// The control panel: the MRPII City (FE-7..FE-53). It became the home page once the developer had tested it (FE-51);
// the classic panel moved to /classic and its 3D scene (components/scene/) stays until the developer approves removing it.

import { Suspense } from "react";
import { CityView } from "@/components/city/CityView";
import "@/components/city/city.css";

export default function Page() {
  return <Suspense fallback={null}><CityView /></Suspense>;
}
