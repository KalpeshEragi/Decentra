// Builds the City's model files (ADR-004, FE-50) from the grab3d.com originals: `npm run models`.
// Each original is downloaded once into the raw folder (outside the repo, MODELS_RAW or ~/assets/grab3d/raw), then
// shrunk with glTF-Transform into public/models/<group>/<name>.glb: geometry simplified only within a tiny error
// (a fraction of the model's size, invisible at City zoom), textures resized and stored as WebP, meshes compressed
// (meshopt, decoded by drei's useGLTF). Every model here is CC0; record each one in public/models/LICENSES.md.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { compactPrimitive, prune, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

const RAW = process.env.MODELS_RAW ?? join(homedir(), "assets", "grab3d", "raw");
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "models");
const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "@gltf-transform", "cli", "bin", "cli.js");

/** slug = grab3d download folder, file = its download, group/name = where it lands, tex = max texture size,
 *  error = simplify tolerance, seams = share of triangles to keep, simplifying across texture seams (people only). */
const MODELS = [
  // vehicles keep their light materials apart (no palette merge), so head- and taillights can glow at night
  { slug: "forklift", file: "forklift-light.glb", group: "vehicles", name: "forklift", tex: 1024, error: 0.001, keepMaterials: true },
  { slug: "delivery-truck", file: "delivery-truck.glb", group: "vehicles", name: "delivery-truck", tex: 1024, error: 0.001, keepMaterials: true },
  { slug: "wooden-pallet", file: "wooden-pallet.glb", group: "props", name: "wooden-pallet", tex: 512, error: 0.001 },
  { slug: "street-light", file: "street-light.glb", group: "props", name: "street-light", tex: 512, error: 0.001 },
  // people (rigged, walk clip): the originals are 244k+ triangles, far beyond what a 2–3 m figure on screen can show.
  // Their texture is cut into many small pieces, and the standard simplifier never crosses the seams between them
  // (it stops near 39k triangles), so `seams` keeps `ratio` of the triangles with meshoptimizer's Permissive mode,
  // which may cross a seam where the texture stays in place. "-far": the light copy for up to 500 house owners.
  ...["businessman", "man", "woman"].map((p) =>
    ({ slug: `${p}-rigged`, file: `${p}-rigged.glb`, group: "people", name: p, tex: 512, error: 0.01, seams: 0.04 })),
  ...["man", "woman"].map((p) =>
    ({ slug: `${p}-rigged`, file: `${p}-rigged.glb`, group: "people", name: `${p}-far`, tex: 256, error: 0.05, seams: 0.004 })),
  // nature (slice 6c): procedural trees and plants, instanced by the hundred, so each keeps only a few thousand
  // triangles (the oak) or a few hundred (plants)
  { slug: "oak-tree", file: "oak-tree-light.glb", group: "nature", name: "oak-tree", tex: 512, error: 0.05, seams: 0.18 },
  ...[["bush", "bush.glb", 0.03, 0.1], ["hedge", "hedge.glb", 0.015, 0.1], ["hydrangea", "hydrangea.glb", 0.02, 0.1], ["grass-clump", "grass-clump.glb", 0.01, 0.3]]
    .map(([slug, file, seams, error]) => ({ slug, file, group: "nature", name: slug, tex: 256, error, seams })),
];

async function fetchTo(url, path) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}

const kb = (p) => `${(statSync(p).size / 1024).toFixed(0)} KB`;

/** Simplifies every primitive to `share` of its triangles across texture seams (normals and UVs weighted, so the
 *  texture stays in place), writes the result next to the original and returns its path. */
async function simplifyAcrossSeams(raw, out, share, error) {
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(raw);
  await doc.transform(weld());
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION"), nor = prim.getAttribute("NORMAL"), uv = prim.getAttribute("TEXCOORD_0");
    const n = pos.getCount(), attrs = new Float32Array(n * 5), v3 = [0, 0, 0], v2 = [0, 0];
    for (let i = 0; i < n; i++) {
      attrs.set(nor.getElement(i, v3), i * 5);
      attrs.set(uv.getElement(i, v2), i * 5 + 3);
    }
    const indices = new Uint32Array(prim.getIndices().getArray());
    const [kept] = MeshoptSimplifier.simplifyWithAttributes(indices, new Float32Array(pos.getArray()), 3, attrs, 5,
      [0.5, 0.5, 0.5, 2, 2], null, Math.floor((indices.length * share) / 3) * 3, error, ["Permissive"]);
    prim.getIndices().setArray(kept);
    compactPrimitive(prim);
  }
  await doc.transform(prune());
  await io.write(out, doc);
  return out;
}
const only = process.argv[2];  // optional: one group or one name

for (const m of MODELS.filter((m) => !only || m.group === only || m.name === only)) {
  const raw = join(RAW, m.slug, m.file), licence = join(RAW, m.slug, "LICENSE.txt");
  if (!existsSync(raw)) await fetchTo(`https://grab3d.com/dl/${m.slug}/${m.file}`, raw);
  if (!existsSync(licence)) await fetchTo(`https://grab3d.com/dl/${m.slug}/LICENSE.txt`, licence);
  const out = join(OUT, m.group, `${m.name}.glb`);
  mkdirSync(dirname(out), { recursive: true });
  const src = m.seams ? await simplifyAcrossSeams(raw, join(RAW, m.slug, `${m.name}.simplified.glb`), m.seams, m.error) : raw;
  execFileSync(process.execPath, [CLI, "optimize", src, out,
    "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", String(m.tex),
    "--simplify", String(!m.seams), "--simplify-error", String(m.error), "--flatten", "false",
    ...(m.keepMaterials ? ["--palette", "false"] : [])], { stdio: "pipe" });
  console.log(`${m.group}/${m.name}.glb  ${kb(raw)} -> ${kb(out)}`);
}
