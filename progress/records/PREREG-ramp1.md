# PREREG-ramp1 — is the smooth fill what is erasing the toon ramp?

**SEALED before any arm is captured.** Tests critic pass 7's defect 1, the one that subsumes most
of the others: *"there is no toon ramp anywhere"*, measured as 0.0–1.4 % flat-colour area in eleven
of thirteen frames and a terminator FLAT fraction of 12–51 % where a quantised ramp gives > 85 %.

## 0. The hypothesis, and the evidence AGAINST it that already exists

`slyRamp` quantises `N·L` into 3 bands and, read on its own, is correct. The final pixel is not the
ramp alone:

```
outgoingLight = diff + sss + spec + metalEnv + rim + emissiveTerm
fill          = mix( bounceLeg * uBounceGain, uSkyColor, hemi ) * uAmbIntensity
hemi          = smoothstep( -0.72, 0.55, Nw.y )
```

`hemi` is a **smoothstep of the world normal's Y**, so on a curved surface the fill varies
*continuously* — and if it is large relative to the banded key it fills the gaps between bands and
the terminator stops stepping. `ToonMaterial.js:145` already records the fill as big enough to
matter: with the shadow wash at zero *and* the whole shadow light at zero, `courtyard`'s obelisk
shadow face still sits at **47.8 % of its lit face**, and that note explicitly hands the remainder
to LIGHTING.

**But a prior sweep is evidence against the naive form of this.** `Lighting.js:118`'s enclosure
bracket cut hemi 10× (1.02 → 0.102) and ambient (0.586 → 0.059) on `interior`, and the frame moved
**14 %** while pool-to-floor contrast got slightly *worse* (2.99 → 2.92). That measured torch-pool
contrast in a sealed room, not terminator hardness on a sunlit curved surface — a different
question — but it is a real reason not to assume the fill dominates everywhere.

**So this seal does not assume. It brackets.** §11's standing lesson in this ledger is that every
mechanism proposed before the discriminating measurement was wrong; this is the discriminating
measurement.

## 1. The lever

`debug.fillScale`, read by `Lighting.js` in **both** places the fill leaves the module — the scene
lights and the `setKeyLight` payload SHADING actually consumes. Default 1 is bit-identical to
shipping. In-page only, no file written per arm.

| arm | fillScale | role |
|---|---|---|
| `preroll1..3` | 1.0 | discarded — compile + the §198.1 early-boot transition |
| `base` | 1.0 | shipping |
| `f35` | 0.35 | candidate |
| `f10` | 0.10 | strong candidate |
| `f00` | 0.00 | **known-bad calibration arm** — no fill at all |
| `restore` | 1.0 | determinism; must reproduce `base` |

`f00` is not a shipping candidate. It exists so that a metric which cannot separate "no fill at all"
from "shipping fill" is exposed as not measuring the lever (§13).

## 2. The instrument — the critic's, not a new one

Deliberately reusing critic pass 7's own definition so the result is comparable to the verdict it
is answering, and so I cannot quietly pick a statistic that flatters the change.

**FLAT fraction** = share of adjacent horizontal pixel pairs inside an ROI with |ΔL| < 1, where
L = Rec.709 luma on 0–255 bytes. A quantised 3-band ramp gives **> 85 %** with 2 spikes.

**ROIs, taken verbatim from the pass** (their derivation is the critic's, restated here so nothing
is re-derived after seeing an arm):

| id | shot | ROI | critic's baseline FLAT | verified by |
|---|---|---|---|---|
| R1 | `sly-startle` | Sly shirt, chest, row y = 430 | 28.9 % | mean RGB [17,73,175] blue |
| R2 | `temple` | column, row y = 430 | 12.4 % | mean RGB [75,85,93] stone |
| R3 | `interior` | pillar, row y = 250 | 32.2 % | mean RGB [45,54,80] stone |
| R4 | `courtyard` | step, row y = 520 | 28.0 % | mean RGB [55,69,90] stone |

Each arm re-verifies the mean RGB before quoting a FLAT fraction. **An ROI whose mean RGB has moved
off the stated colour is reporting a different surface and is VOID for that arm**, not silently
scored — the fill lever changes brightness, so this check has to tolerate a luma shift while still
catching a rect that has slid onto another object. Tolerance: hue within ±12°, and the R/G/B
*ordering* unchanged.

## 3. Registered bands, on `f10`

| id | quantity | band |
|---|---|---|
| **A1** | mean FLAT fraction across R1–R4 | **≥ 55 %** for the fill to be called the primary cause |
| A2 | FLAT fraction on R1 (the character, the shot that scored best) | ≥ 50 % |
| A3 | frame-wide flat-colour area on `sly-startle`, critic's 5×5 ≤ 2 luma definition | ≥ 6.0 % (from 1.2 %) |
| A4 | p99 luma on `sly-startle` | ≤ 200 — the cut must not simply crush the frame |

## 4. Falsifiers — revert, do not defend

- **P-F1** If A1 lands **below 25 %** on `f10` — i.e. an aggressive 90 % fill cut does not
  materially harden the terminator — then **the smooth fill is NOT the primary cause**, the
  hypothesis in §0 is recorded as wrong, and no fill change ships. The next suspect is the ramp's
  own band positions relative to the `N·L` range these surfaces actually span.
- **P-F2** If `f00` and `base` differ by **< 10 points** of FLAT on every ROI, the instrument cannot
  see the lever ⇒ **UNSCOREABLE**, no verdict either way.
- **P-F3** `restore` vs `base`, frame-wide differing px > 0 ⇒ **VOID**.
- **P-F4** any arm's `fillScale` not read back equal to its registered value ⇒ that arm VOID.
- **P-F5** scored arms not from one `bootId`, or any `src/` edit while the capture holds the lock
  ⇒ **VOID**.
- **P-F6** Monotonicity: FLAT must not *decrease* from `base` → `f35` → `f10` → `f00` on the mean.
  A non-monotonic response to a monotonic lever means something else is moving ⇒ **UNSCOREABLE**.

## 5. What a PASS does and does not license

A pass says the fill is the primary cause **of the terminator failure**, on these four surfaces. It
does **not** license shipping `fillScale 0.10` — cutting the world's ambient by 90 % will wreck
shadow-side colour, which is the whole subject of §115/§203's teal work, and the critic's own defect
8 (compressed tonal range, nothing black, nothing white) would get worse before it got better. The
shipping change is a **redesign**: flat or quantised ambient plus a re-balanced key, captured and
judged on its own. This seal exists to find out whether that redesign is worth doing at all.

## 6. Files

`PREREG-ramp1.md` (this file), `progress/records/ramp1.mjs`, `progress/records/ramp1-score.mjs` —
committed before the boot. Then `progress/records/ramp1/` frames + `readback.json` + `score.json`,
`logs/ramp1.log`, and `RESULT-ramp1.md` on scoring.
