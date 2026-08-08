# PREREG-cel1 — does aliasing `Shading.make` put the character on the cel material?

**SEALED before capture.** Runs KNOWN_ISSUES §213 (the finding) as corrected by §216 (which model
actually ships).

## 0. The claim under test

`Shading.prototype` has no `make`. Five call sites do

```js
const mat = shading?.make ? shading.make({ bands, rim, sss, … })
                          : new THREE.MeshStandardMaterial({ … });
```

and all five take the fallback — including `SlyModelDLRig.js:352`, **the shipped character**, and
`KayKit.js:181`, all 36 props. The world (`Architecture`, `Terrain`, `Props`, `Guard`) calls the real
method, `toon()`, and is cel-shaded. Critic pass 7's #1 defect, "THERE IS NO TOON RAMP, ANYWHERE",
would then be a method name.

**Prediction: adding the alias moves the character and the KayKit props from smooth Lambert onto the
3-band ramp, and leaves the world bit-identical.**

## 1. The lever, and why it is a boot-time query rather than a runtime flag

`make` is consumed at material-construction time inside `init()`. There is no runtime toggle: by the
time a frame renders, the material is already built and cached. So the arms are **two boots**, using
the harness's own `query` option, whose comment states it exists "for choices that must be made
BEFORE any module loads".

The alias is installed conditionally at module scope:

```js
if (typeof location === 'undefined' || new URLSearchParams(location.search).get('cel') !== 'off') {
  Shading.prototype.make = function make(opts) { return this.toon(opts); };
}
```

**`?cel=off` reproduces the pre-fix build exactly** — with the property genuinely absent, every call
site takes its own native fallback branch, which is what ships today. This matters: a `make` that
existed and returned a stand-in `MeshStandardMaterial` could *not* make that guarantee, because each
of the five call sites constructs a different fallback (KayKit passes a `map`, SlyModel3 passes
`vertexColors`, and so on). Absence is the only faithful OFF.

Cross-boot comparison is weaker than one-boot and is unavoidable here. It is declared, not hidden:
the world control ROIs (§4, P3) are the cross-boot floor — they are on `toon()` in both arms and must
not move, so any drift they show bounds what the character ROIs are allowed to claim.

## 2. Arms

| boot | query | arm | poke |
|---|---|---|---|
| A | `cel=off` | `base` | none — today's shipped build |
| B | `cel=on` | `cand` | none — the alias in force |
| B | `cel=on` | **`KB`** | **`setRampTuning({ hi: 0.95 })` — CALIBRATION, must change** |
| B | `cel=on` | `restore` | `setRampTuning({ hi: 0.52 })`, must reproduce `cand` |

**`KB` is the whole run's integrity check and it is aimed at the specific claim, not at "something
must move".** Moving `termHi` to 0.95 collapses the lit band. If the character is genuinely on the
toon material in arm `cand`, its shading *must* change grossly. If the character does not move under
`KB`, then it is still on `MeshStandardMaterial`, the alias did not reach it, and **every number in
the run is void — including a `cand` that appears to confirm.** This is §210.2's lesson: a uniform
that never arrives produces a confident null indistinguishable from a real one.

## 3. Shots and ROIs

Registered at 1280×720, reusing the ink sub-agent's rects where they exist so results are comparable
to a measurement already on the books.

**CHARACTER — must change**
- `sly-startle` shoulder_L `[485,400,545,500]`
- `sly-startle` cheek_R `[712,235,772,295]`
- `interior` back_L `[582,428,642,482]`
- `temple` sly_L `[640,618,700,680]`

**KAYKIT PROPS — must change**
- `temple` barrel_R `[402,590,462,650]`
- `courtyard` crate_R `[352,560,412,660]`

**WORLD — must NOT change** (already on `toon()` in both arms; these are the cross-boot floor)
- `temple` column_near_R `[318,220,378,330]`
- `courtyard` obelisk_L `[552,100,612,250]`

## 4. Registered bands — stated BEFORE the run

Metric is the **critic's own** flat-area statistic: share of pixels whose 5×5 neighbourhood spans
≤ 2 luma, L = Rec.709 on sRGB bytes. Not a new statistic invented for this change.

| id | quantity | band |
|---|---|---|
| **KB** | character ROI mean luma, `KB` vs `cand` | **≥ 15 L on at least 3 of 4 character ROIs. If not → UNSCOREABLE, not negative** |
| **P1** | character ROI FLAT, `cand` − `base` | **≥ +10 pp, mean across the 4 character ROIs** = CONFIRMED |
| P2 | KayKit ROI FLAT, `cand` − `base` | ≥ +8 pp, mean across the 2 |
| **P3** | world ROI FLAT and mean luma, `cand` vs `base` | **|ΔFLAT| < 3 pp and |ΔL| < 4 L — the specificity check AND the cross-boot floor** |
| P4 | `restore` vs `cand`, all ROIs | |ΔL| < 1 L |

**Counter-risks, registered now because each is a plausible way for a real win to be a bad trade:**

- **C1 — the character goes dark.** `toon`'s ramp floors the shadow band at `termLo` 0.14 where
  Lambert falls off smoothly. Character ROI median luma may fall; a drop **> 25 L** is a regression
  to report, not a win to bank.
- **C2 — cost.** `drawCalls` and `programs` from `__GAME.stats`. Programs will rise (a new material
  variant compiles); a rise in **draw calls > 10%** is unexpected and means the cache misbehaved.
- **C3 — rim and SSS activate for the first time on the character.** Critic #12 already complains of
  "a full-strength fresnel drawing a cyan-white line on every polygon edge". Report character ROI
  max luma; flag if it exceeds 235.

## 5. Falsifiers — any one and I revert rather than defend

1. **`KB` fails to move the character** → the alias is not reaching it. Run void, `cand` included.
   Fix the wiring; do not interpret.
2. **P1 misses** → the alias is not the fix for critic #1, whatever else it does. Revert the alias
   and re-open, because the premise of §213 would then be wrong.
3. **P3 moves** → the alias changed geometry it has no business touching, or the cross-boot floor is
   too noisy to support any claim. Void; do not ship on a floor this wide.
4. **C1 breaches 25 L** → shipping this makes the character worse in the frame while making it more
   correct in the code. Hold the alias, fix the ramp floor for the character first.
5. **`restore` ≠ `cand`** → the boot drifted; nothing in boot B is interpretable.

## 6. What is NOT being tested here, so it cannot be claimed afterwards

- The queued `termHi` 0.52 → 0.62 move (task #25). One lever at a time; `termHi` stays shipped at
  0.52 in every arm except `KB`, which is a calibration and is not a candidate.
- The contact-shadow and ink seals — separate levers, separate runs.
- Whether `model3` or `dlrig` should ship. Settled by the owner today: **`dlrig` stays.** This run
  measures the shipped path only.
