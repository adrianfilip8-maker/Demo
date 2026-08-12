# RESULT-caneswap — NOT-VERIFIED as registered: every substance bar passed; the one FAIL is a mask ceiling borrowed from the cane it replaced

Sealed `PREREG-caneswap.md` (b795b40), candidate 5ecc80b, ONE boot via `tools/caneswap.mjs`,
frames under `shots/caneswap/` (sly-closeup.png, sly-key.png, 1280x720 high, SwiftShader).

## Bars

```
I1   boot: __GAME.ready, ZERO console errors, no CaneAsset warnings          PASS
     (also the first witness for §295's zero-error manifest — confirmed: the favicon
     suppression held and no fetch this repo authors errored)
B1a  cane mesh geometry position.count 306 / index.count 774                 PASS
B1b  warn line: "staff submesh dropped (258 tris), sly-cane.glb (§294)
     socketed to handR (grip 22.2 mm, 258 tris)"                             PASS
B1c  live slydlrig:cane material carries map, image 1024x1024 — the
     in-browser createImageBitmap decode works                               PASS
B2   mask sly-key     37509 px in (200, 40000)                               PASS
B2   mask sly-closeup 40982 px — ABOVE the registered 40000 ceiling          FAIL
B2   restore diff 0 px on BOTH shots — the instrument is sound              PASS
B3   LOOK — scored moot by the runner under the registered logic; what the
     frames show is recorded below anyway, because they exist               (recorded)
B4   suite: 469/469 at the seal; 475/475 on the post-run tree               PASS

OUTCOME (per the seal's §3, pre-committed): NOT-VERIFIED
```

## The failing bar, analyzed

40982 px is 2.5% over a ceiling I **borrowed from canegold** instead of deriving: canegold's
(200, 40000) window was calibrated against the PROCEDURAL cane — a tight 192° round crook,
flat gold, 1356 tris. The asset's crook is a different silhouette: a taller swept hook with a
long descending tip, pale-gold against this framing's dark wall, with a visible warm bloom
fringe on its lit edge. Eyeballed on the frame, the mask arithmetic is credible as pure prop:
hook stroke ~12k px + shaft ~4k + double-sided ink perimeter ~10k + bloom fringe — the recolour
mechanism is definitional (restore 0 on both shots; only the tagged material's pixels can
differ), so this is the cane's true footprint, not canegold-run-1-style contamination (that
failure mode measured 66941 px on this same shot, 99.8% of it inside the body). The candidate
did nothing wrong that these pixels can see; the instrument constant did. **The registered bar
is the bar**, so the verdict stands NOT-VERIFIED, and the correction goes through a fresh seal
(`PREREG-caneswap2.md`, ceiling re-derived in the open) rather than a post-hoc reclassification
here.

## What the frames show (B3 wording, recorded)

Both frames: the shepherd's-crook **hook is present and open** — a C with daylight through it,
not a ring, not a knob — **curling forward** off his right hand (the measured +X→+Z rotation
sign is correct on screen). The prop is **textured**: dark shaft, pale-gold hook — the asset's
authored two-tone albedo, decisively not the flat single-hex gold it replaced. **One** ink
line, the character's weight; no double outline from the asset's baked hull (deliberately not
drawn). Tip reaches the tile by his left boot — planted. It reads as Sly's cane at both
framings. Honest caveats: the shaft is thin and low-contrast against the dark floor tiles
(the asset's authored proportions; the ink line keeps it legible), and the hook's lit edge
carries a warm bloom halo at closeup. Aesthetic ranking stays the critic's job.

## Boot-tree stamp (eeccb0a's "one boot is NOT one tree", honoured retroactively)

The boot ran at HEAD **22a35ca** with the torchlight candidate **uncommitted** in the working
tree (src/render/Lighting.js +31, ToonMaterial.js +13, shaders/toon.glsl.js +60 — committed
minutes later as f4056f4). That term is gated twice for these frames: `uLocalToon` ships 0 /
publishes only through LIGHTING, and the shader branch multiplies by zero for any light at
world y ≥ −0.5 — both shots are above-ground daylight with no underground light in radius, so
the cane pixels are arithmetically outside its reach. Every cane-side file (src/player/**,
src/assets/**, the bars' subject) was byte-identical to 5ecc80b in that tree. `caneswap2`'s
runner stamps the tree itself, before and after, so the next record does not need archaeology.

## Forecast, charged

PREREG §4 predicted **VERIFIED** and enumerated texture-decode, UV orientation and hook-sign
as the risks. All three held; the miss was the un-derived ceiling — the forecast was WRONG,
and wrong in the least interesting way available. Next seal: `PREREG-caneswap2.md`.
