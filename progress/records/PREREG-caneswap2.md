# PREREG-caneswap2 — the caneswap mask ceiling, re-derived; one shot, one corrected constant

Sealed **before** its capture. `shots/caneswap2/` does not exist at the time of writing.
Successor to `PREREG-caneswap.md` / `RESULT-caneswap.md` (NOT-VERIFIED): every substance bar
passed; the single FAIL was `B2_mask_sly-closeup` at **40982 px against a 40000 ceiling
borrowed from canegold** — a constant calibrated on the procedural cane this swap retired.
This seal corrects exactly that one constant, with the derivation in the open, and re-runs
exactly the shot that failed. Nothing about the candidate changes: the cane code and asset
are byte-identical to 5ecc80b (any drift in them voids the run — B1 pins it).

## 1. The ceiling, derived instead of borrowed

The ceiling exists to catch a **contaminated mask** — canegold run 1's failure, where a
hiding-based mask on this same shot measured **66941 px**, 99.8% of it inside the body
footprint. The floor (200) catches a mask too small to be the prop. Between them must sit the
**true footprint regime**, now measured rather than guessed:

```
procedural cane, recolour mask, sly-closeup (canegold run 2)      < 40000  (passed that window)
ASSET cane,      recolour mask, sly-closeup (caneswap run 1)        40982
ASSET cane,      recolour mask, sly-key     (caneswap run 1)        37509
contamination case (hiding mask, canegold run 1, same shot)         66941
cross-boot pixel drift (§269, dunes)                                ~2.7%
```

**Ceiling: 55000.** That is ≥1.34× the measured asset-cane footprint (headroom for cross-boot
drift and settle differences, an order of magnitude beyond §269's 2.7%) and ≤0.82× the
measured contamination case, so the window still separates the two regimes it was always for.
Floor stays 200. Restore must still be exactly 0 — that, not the ceiling, is the load-bearing
proof that the mask is definitional.

## 2. The run

ONE boot (`tools/caneswap2.mjs`), ONE shot — **sly-closeup**, the one that failed; sly-key
passed inside the original, stricter window and is not re-run. Same snap discipline
(`setShot(..., { dt: 0 })`), frame written to `shots/caneswap2/sly-closeup.png`.
The runner **stamps the tree** (git HEAD + dirty files) before boot and after teardown, per
eeccb0a's "one boot is NOT one tree"; both stamps are quoted in the RESULT.

## 3. Bars

- **I1 (instrument, VOID if failed):** `__GAME.ready`; no `pageerror`; no `CaneAsset:`
  warning; restore diff exactly 0. A cane-side tree drift between the two stamps
  (src/player/** or src/assets/sly-cane/**) also VOIDS — the run must measure 5ecc80b's cane.
- **B1 (unchanged from caneswap):** mesh `cane` at 306 verts / 774 indices; warn line
  `sly-cane.glb (§294) socketed to handR`; live `slydlrig:cane` map at 1024.
- **B2′ (the corrected bar):** recolour mask on sly-closeup **> 200 and < 55000** px.
- **B3 (LOOK, prose, binding):** the fresh frame re-affirms caneswap's recorded look — open
  forward-curling crook, textured two-tone prop, one ink line, reads as Sly's cane.
- **B4 (suite):** green at this seal (475/475 on the current shared tree).

## 4. Outcomes

**VERIFIED** = I1 + B1 + B2′ + B3 → the §294 swap is verified on pixels; RESULT-caneswap2
closes the chain. **NOT-VERIFIED** = any B-bar fails with the instrument sound — that would
mean a real cross-boot regression, not a threshold artefact, and the RESULT must say what
changed. **VOID** = I1 fails.

## 5. Expected outcome, in advance

**VERIFIED.** The mask should land near 41k ± drift, comfortably inside (200, 55000); B1 is
deterministic on an unchanged build; B3 re-reads a frame two of which already passed the same
wording. Residual risks: another lane's un-gated render change landing between stamps (caught
by the stamps and reported), and ordinary queue/restart attrition (a killed run is no
evidence either way — relaunch, don't reinterpret). The previous forecast missed on the
un-derived constant; this one has no un-derived constants left to miss on.
