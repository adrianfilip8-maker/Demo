# Sly Cooper cane — provenance

**Supplied by the project owner on 2026-08-09** as an upload, with the instruction: *"See if the
cane model and texture here would be an easy drop in for the project. **Do not alter the shape of
the model.**"*

**Licence: unknown.** The file's `asset.generator` is `Sketchfab-12.67.0`, so it was exported from
Sketchfab, but the upload carried no author, licence, or source URL and the `.glb` embeds none.
This is not "unstated in a repository I read" — it is genuinely unknown to me, which is a weaker
position than `assets/sly-anim/` (checked, none stated) and much weaker than `assets/kaykit/` and
`assets/tombchaser/` (explicit CC0). Recorded honestly rather than guessed. The owner's standing
instruction is that copyright is not an obstacle for this project for undisclosed reasons; that is
their call and it does not license me to invent a licence here.

## THE CONSTRAINT
**Do not alter the shape of the model.** Uniform scale, rotation and translation are rigid or
similarity transforms and preserve shape — they are permitted and are required for the frame to
match (see below). **Decimating, remeshing, re-topologising, welding, or non-uniform scaling are
not**, because a non-uniform scale distorts proportions and the rest genuinely change the geometry.

## What it is, measured

```
494 triangles, 576 vertices, 2 primitives, 2 materials, 6 textures
no skins, no animations, no glTF extensions
762 KB total (bin 758 KB)
world bbox after node transforms: 0.3412 x 1.5904 x 0.0791
```

One object (`Cane.002_meshId2_name.002`) split into two primitives by material, which is ordinary
glTF export. Attributes are `POSITION, NORMAL, TANGENT, TEXCOORD_0` — tangents are present, so a
normal map is usable without deriving them.

The shaft's middle carries no vertices (y −0.60…0.00 is empty). That is not a hole: it is a
low-poly tube with rings only at its ends, which is what 494 triangles buys.

## The textures, opened rather than trusted

| image | slot | size | measured |
|---|---|---|---|
| 0 | `shader.baseColor` | 1024² jpg, 12 KB | — |
| 1 | `shader.metalRough` | 1024² png, 0 KB | rough **1.00**, metal **0.00** — uniform |
| 2 | `shader.normal` | 1024² png, 257 KB | mean **(127.5, 127.5, 255)** — a FLAT no-op map |
| 3 | `Cane.baseColor` | 1024² jpg, 64 KB | — |
| 4 | `Cane.metalRough` | 1024² png, 86 KB | rough **≈0.25**, metal **≈0.80** |
| 5 | `Cane.normal` | 1024² png, 287 KB | mean (126.4, 128.3, 247.5) — real detail |

**`Cane` is authored as a glossy metal.** That is the single most valuable thing in this file: §262
and §263 both found that `sly cane gold` is not a material in this build and the whole character
ships at `metal 0`. Here is a cane with metalness 0.80 and roughness 0.25 already art-directed.

**`shader.normal` is 257 KB of nothing** — (128,128,255) is the identity normal. It should be
dropped rather than shipped.

## What a drop-in actually requires

Three of these are shape-preserving transforms and are simply the frame not matching. The fourth is
the real work.

1. **Scale.** 1.5904 units long against `Cane.js`'s **measured 1.5150 m** ⇒ uniform **×0.9526**.
   Uniform, so shape is preserved.
   **CORRECTED.** This file first said "~1.30 m ⇒ ×0.817", which would have shipped a cane **16%
   too short**. 1.30 was inferred from arithmetic inside a comment (`length * 0.455 = 0.5915`)
   rather than measured from the built cane. The CHARMAT agent measured it. Derive it yourself
   from `Cane.js` rather than trusting either number here.
2. **Origin.** The model is centred (y ±0.795). `Cane.js`'s frame is **grip at the origin**, so it
   needs a translation along the shaft.
3. **Orientation.** The hook curls in **±X** (lateral spread 0.28–0.35 in x against 0.04–0.10 in z
   over the top four height slabs). `Cane.js` specifies *"shaft along +Y, hook curling toward +Z
   (forward)"* ⇒ a **90° rotation about Y**. Confirm the sign from the geometry; do not assume.
4. **The material workflow does not transfer, and this is the obstacle.** §221: the cel shader
   **replaces three's light loop entirely**, so a metalness/roughness PBR path does not reach it.
   The `metalRough` maps cannot be plugged in. Their *values* can — 0.80/0.25 is exactly the
   art-direction input `uMetal`/`uGloss`/`uSpec` need for a gold cane, and that mapping is the
   integration work.

Also worth weighing before shipping the maps: a normal map on a flat-banded toon surface often
fights the ramp rather than helping it — the same caution recorded for `assets/tombchaser/`'s
normal and metallic maps, which were staged and deliberately not wired for that reason.

## Status: STAGED, NOT WIRED

Nothing loads this. `assertAccessorsResolved` passes — no dangling references and no sparse
accessors (§227, §245) — and the geometry parses in three with the image graph stripped. It has not
been rendered.
