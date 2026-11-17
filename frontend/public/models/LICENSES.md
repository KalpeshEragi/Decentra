# City models: sources and licences

Every model here comes from [grab3d.com](https://grab3d.com) under **CC0 1.0** (public domain): free for any use,
no attribution required (ADR-004, FE-50). Each one's `LICENSE.txt` was checked before use: it states CC0 1.0
and how the model was made (see the AI disclosure below for the people).

The files are shrunk copies made by `npm run models` (`scripts/models.mjs`). The script records each source and the
shrink settings: vehicles and props simplified within 0.1 % of model size (people: below), WebP textures, meshopt
compression. The originals stay
outside the repo.

| File | Source | Licence checked | Original → shipped |
| --- | --- | --- | --- |
| `vehicles/forklift.glb` | [Forklift](https://grab3d.com/models/vehicles/forklift/) (Light version) | 2026-11-11, CC0 1.0 | 803 KB → 229 KB |
| `vehicles/delivery-truck.glb` | [Delivery Truck](https://grab3d.com/models/vehicles/delivery-truck/) | 2026-11-11, CC0 1.0 | 1228 KB → 133 KB |
| `props/wooden-pallet.glb` | [Wooden Pallet](https://grab3d.com/models/city/wooden-pallet/) | 2026-11-11, CC0 1.0 | 1169 KB → 93 KB |
| `props/street-light.glb` | [Street Light](https://grab3d.com/models/city/street-light/) | 2026-11-11, CC0 1.0 | 686 KB → 70 KB |
| `people/businessman.glb` | [Businessman](https://grab3d.com/models/characters/businessman/) (rigged) | 2026-11-11, CC0 1.0 | 12206 KB → 268 KB |
| `people/man.glb`, `people/man-far.glb` | [Casual Man](https://grab3d.com/models/characters/man/) (rigged) | 2026-11-11, CC0 1.0 | 12745 KB → 327 / 147 KB |
| `people/woman.glb`, `people/woman-far.glb` | [Casual Woman](https://grab3d.com/models/characters/woman/) (rigged) | 2026-11-11, CC0 1.0 | 12709 KB → 347 / 156 KB |
| `nature/oak-tree.glb` | [Oak Tree](https://grab3d.com/models/nature/oak-tree/) (Light version) | 2026-11-13, CC0 1.0 | 780 KB → 165 KB |
| `nature/bush.glb` | [Bush](https://grab3d.com/models/nature/bush/) | 2026-11-13, CC0 1.0 | 1378 KB → 55 KB |
| `nature/hedge.glb` | [Hedge](https://grab3d.com/models/nature/hedge/) | 2026-11-13, CC0 1.0 | 1527 KB → 60 KB |
| `nature/hydrangea.glb` | [Hydrangea](https://grab3d.com/models/nature/hydrangea/) | 2026-11-13, CC0 1.0 | 1571 KB → 40 KB |
| `nature/grass-clump.glb` | [Grass Clump](https://grab3d.com/models/nature/grass-clump/) | 2026-11-13, CC0 1.0 | 1776 KB → 67 KB |

**AI disclosure (people only).** The people's `LICENSE.txt` says "AI-assisted (contains AI-generated content)": the
base mesh and textures come from an AI image-to-3D tool (Meshy), then were cleaned up in Blender. The skeleton and
the walk clip come from Meshy Auto-Rig. The licence is still CC0 with no duties; this is recorded in case a platform
asks. The vehicles, props and nature models are procedural (Blender scripts), with no AI-generated geometry or
textures.

People are simplified across texture seams (meshoptimizer Permissive mode) to about 4 % of the original triangles,
and to about 0.4 % for the `-far` copies that house owners use away from the camera. Nature models are drawn by
the hundred, so the same method keeps about 18 % of the oak (~1.9k triangles) and 1–3 % of a plant
(40–400 triangles). The maple and the light oak and pine copies were dropped on 2026-11-15 (the developer did not
like how they looked).
