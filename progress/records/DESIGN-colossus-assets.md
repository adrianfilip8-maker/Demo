# DESIGN-colossus-assets — can a free asset replace the failed colossus? Survey, measured

Follow-up to §320/§321 (the colossus sculpt passed 7/7 numeric bars and **failed its LOOK gate**
— still reads as stepped architecture, not a seated figure). Question asked: are there free
downloadable assets usable in its place? Answer below is measured and looked at, not inferred
from listings.

## 1. There is already a CC0 Egyptian pack in this repo, staged and never wired in

`staging/assets/tombchaser/` — **Tomb Chaser 1**, Polygonal Mind Open Source Initiative, via
`github.com/ToxSam/cc0-models-Polygonal-Mind`, retrieved 2026-08-08.
**Licence: CC0 1.0 Universal**, and `LICENSE.txt` is the verbatim CC0 legal code — read, not
inferred from a badge. This is the cleanest licence status of any third-party content here.
32 GLBs, **14,329 triangles across the whole pack** (~450 each), textures embedded, no runtime
fetch. Full provenance and verification: `staging/assets/tombchaser/PROVENANCE.md`.

## 2. Its three "god" models are NOT colossi — measured, and looked at

| model | triangles | W x H x D (m) | what it actually is |
|---|---|---|---|
| `GodAnubis_Art` | 1,468 | 1.28 x 2.28 x 1.80 | a monumental **jackal HEAD** (bust), matte black, green eyes |
| `GodBastet_Art` | 1,222 | 0.81 x 1.75 x 1.44 | a monumental **cat HEAD** with collar and earring |
| `GodRa_Art`     | 1,650 | 1.14 x 2.68 x 1.55 | a **chibi seated falcon idol** with sun disc — cute, not colossal |

Verified by parsing each GLB's accessors for triangle counts and POSITION min/max, then viewing
the upstream `*_thumbnail.png` renders. **None is a seated pharaonic colossus**, so none is a
drop-in for the courtyard pair.

`tomb-chaser-2` (same CC0 source, not vendored) was also checked: architectural components,
props and decoration only — **no statues, sphinxes or monuments**. The 23 Tomb Chaser 1 models
left upstream are terrain, level blockouts, logo and thumbnails (PROVENANCE §"What is in it") —
no colossus there either.

## 3. Network reality in this container — this constrains the whole question

Reachability tested directly: **only `github.com` / `raw.githubusercontent.com` respond.**
`sketchfab.com`, `si.edu` + `3d.si.edu` (Smithsonian CC0), `kenney.nl`, `polyhaven.com`,
`itch.io`, `opengameart.org`, `quaternius.com` are **all blocked by the egress proxy**.
So a new asset can only arrive two ways: (a) from a **GitHub-hosted** CC0 collection, or (b)
**owner-supplied** into `staging/assets/`, exactly the route `sly-cane.glb` took (§294).

## 4. The catch that makes this not purely an art decision

The courtyard colossi carry a **gameplay affordance**: landable knee ledges at y ≈ 4.5, whose
collider the PROPS lane just corrected to derive from `bag.knee` (the old hand-typed box would
have registered a landing over the statue's hands). **Heads have no knees.** Swapping figures
for busts removes a traversal surface, which is a design change, not a re-skin.

## 5. Recommendation

1. **Best value, low risk:** use `GodAnubis_Art` / `GodBastet_Art` as *new monumental heads*
   elsewhere — flanking the temple door, or half-buried in the dunes — where they instantly read
   as carved Egyptian sculpture and cost ~1.5 k triangles against a budget sitting at 54% (§313).
   This buys "reads as sculpture, not crates" in several frames without touching traversal.
2. **The courtyard colossi stay a modelling job**, re-sealed per §321's steer: add the missing
   MASSES (thigh/lap volume, an arm that leaves the body, a crown with real recesses) and gate on
   a statistic of the *rendered* figure, not its outer profile.
3. **If a true seated colossus is wanted as an asset**, the owner must supply it (Sketchfab and
   the museum programmes are unreachable here). Requirements to match: glTF/GLB, seated
   pharaonic figure, a horizontal knee surface near 4.5 m at final scale, ideally under ~20 k
   triangles, and **a licence whose text can be read and recorded** — the standard this project
   holds (`PROVENANCE.md` per pack, licence status recorded accurately even when permissive).

No asset was wired in and nothing shipped under this note; it is a survey.
