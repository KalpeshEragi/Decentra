---
status: accepted
date: 2026-10-27
---

# City models: code-built style kits for buildings, model packs for the rest

The control panel is redesigned as a city in the exact style of the reference video (FE-7), with models of the video's quality or better and detail everywhere. FE-2 ("models built in code from simple shapes; no downloaded model packs") cannot reach that for vehicles, people and trees.

We decided:
- **Buildings are built in code** from blocks, with one **style kit per building type** (warehouse, factory, agent office, Town Square, houses, supplier depot), shaped after the video's buildings. Code keeps live-data parts (dock doors, stock, line lights) easy to drive, one consistent style, a tiny download and reviewable diffs.
- **Vehicles (trucks, forklifts and any other type needed), fences around buildings, people, roads with proper marking (if needed, or else do by code), building areas with proper markings if needed, (if needed, or else do by code), stock and its storage trays, trees and street props come from free CC0 model packs** (no licence or attribution duties), recoloured to the video's palette.

Supersedes FE-2.

## Considered options

- **Everything in code:** cannot match the video's trucks, forklifts, people and trees.
- **Custom models for every building (Blender or a 3D artist):** closest to the video, but needs modelling skill or money, slows every change, needs a naming contract for live-data parts and adds large binary files. Kept as a later upgrade: a building can be swapped for a custom model without touching the rest, if the first finished district still looks clearly below the video.
- **AI-generated models:** fast, but inconsistent style and heavy, messy meshes.

## Update 2026-11-11: AI-assisted people kept

grab3d.com's people (Businessman, Casual Man, Casual Woman) are CC0 but "AI-assisted": made with an image-to-3D tool
(Meshy) and its auto-rig, then cleaned up in Blender. The rejection above was about generating our own models. These
are finished, cleaned-up models with a consistent style, so the developer decided to keep them. Their heavy meshes
(244k triangles) are simplified by `npm run models` to about 9.7k (full) and about 1.1k (light copy for distant house
owners). Recorded in `frontend/public/models/LICENSES.md`.
