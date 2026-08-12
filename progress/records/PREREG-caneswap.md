# PREREG-caneswap — verify the §294 cane swap on real pixels

Sealed **before** the capture exists. `shots/caneswap/` does not exist at the time of writing.
Candidate: commit `5ecc80b` — the owner-supplied `src/assets/sly-cane/sly-cane.glb` adopted as
the shipped character's cane (geometry + albedo), procedural `Cane.js` demoted to frame +
fallback. Offline the swap is already pinned (`tests/dlrig.test.mjs` §294 test: 306 verts /
774 indices on the cane mesh, bbox conformed to −0.8140 / +0.7010, hook to +Z, suite 469/469
at the seal). What offline CANNOT reach and this one boot must: the Vite-bundled fetch, the
in-browser albedo decode (`createImageBitmap` — no decoder exists in Node, tests degrade to
map-null), and whether the thing actually reads as Sly's cane in a frame.

## 1. The run

ONE boot (`tools/caneswap.mjs`, via `withGame`, 1280x720, quality high), shots **sly-closeup**
and **sly-key**, every snap `setShot(name, { dt: 0 })` (§251). Frames written to
`shots/caneswap/<shot>.png`. No source edits between arms; the only in-page pokes are the
registered mask arm below and its restore.

## 2. Bars

**I1 (instrument, VOID if failed):** `__GAME.ready` true; no `pageerror`; the fetch of the
bundled `sly-cane-*.glb` must not error (a cane-asset 404 = the wiring is wrong, run void, fix
before rerun). Console errors unrelated to the cane are recorded and reported, not void — but
note §295 predicts a zero-error manifest, and this boot is its first witness either way.

**B1 (GPU geometry, mechanical, all must hold):**
  - a. a scene mesh named `cane` exists whose geometry has `position.count == 306` and
    `index.count == 774` — the asset's `Cane` primitive exactly; the procedural build is 1356
    unindexed triangles, so the two states cannot be confused;
  - b. the boot warnings contain `sly-cane.glb (§294) socketed to handR`;
  - c. the live `slydlrig:cane` material carries a **non-null `map`** whose image has
    width 1024 — the authored albedo, decoded in the browser (the branch Node cannot test).

**B2 (footprint — "visible in GPU geometry", the canegold I3 pattern, per shot):** tag the
`slydlrig:cane` material `0xff00ff`, re-snap, count differing pixels against the base frame:
must be **> 200 and < 40000** on sly-closeup AND on sly-key (two-sided: a mask that cannot be
too big proves nothing — canegold run 1's lesson). Restore the colour, re-snap: **0 differing
pixels** (I4-style; non-zero restore = instrument broken = VOID).

**B3 (LOOK, prose, binding):** on both saved frames, eyeballed and recorded in the RESULT:
the shepherd's-crook **hook is present and open** (a C with daylight through it, not a closed
ring, not a knob), it **curls forward off his right hand** (not sideways/backwards — the
rotation sign was measured, this is its check), the shaft carries the asset's **textured
albedo** (tonal variation along the prop, not flat single-hex gold), **one** ink line (no
double outline from the asset's baked hull, which is deliberately not drawn), and the whole
prop **reads as Sly's cane** at both framings. Honest caveats recorded; aesthetic scoring
stays the critic's job.

**B4 (suite):** 469/469 at the seal commit; unchanged by the run (the runner edits no source).

## 3. Outcomes

**VERIFIED** = I1 + B1 + B2 + B3 all hold → RESULT-caneswap records it, integration stands.
**NOT-VERIFIED** = any B-bar fails with the instrument sound → the integration is wrong in a
way the offline pins missed; RESULT records exactly which bar and what the frame shows; the
procedural fallback and the revert path (`Cane.js` untouched as frame) stay available.
**VOID** = I1 fails or the restore is non-zero → fix the instrument, reseal nothing, rerun.

## 4. Expected outcome, in advance

**VERIFIED.** The geometry path is the same code the offline pins already pass; the untested
residue is (1) the bundled-URL fetch under Vite dev — proven equivalent in `dist/` at the seal
(byte-identical hashed emit) but not yet fetched by a page; (2) the JPEG→`createImageBitmap`
decode with `flipY:false` — a wrong orientation would show as scrambled/misplaced texture
bands, which B3 is worded to catch; (3) the measured hook-bend sign — a wrong sign is a cane
curling backwards, also B3. Risk (2) is the likeliest failure and it fails soft (grey-white
cane at worst, still B3-visible). If B2's mask lands outside its window on sly-key but inside
on sly-closeup, that is NOT-VERIFIED, not VOID — the window was registered for both.
