# PREREG-specnorm2 — sweeping 0.5 → 1.0, with a class-attribution guard that can actually return VOID

Registered **before** any candidate arm exists (§141.1). Successor to PREREG-specnorm / §263.
**Status: REGISTERED, NOT YET RUN.** The scaffolding it needs (`debugTerm(8)`) is landed and
inert; the capture has not been taken. Nothing in this file may be re-derived after a frame
exists.

---

## 1. What §263 settled, and the one thing it could not

Settled, and **not re-litigated here**: the stepped lobe conserved no energy; normalising it by
`(glossP+8)^p / 8^p` produces a highlight; at `p = 1` `courtyard` reaches **0.4835 %** above
L 230 against T2's 0.20 % bar, `hero` 4 → 370 px, `sly-closeup` 42 → 217 px; exactly 8 px in the
whole run exceed L 250 and **none of them are gated**, i.e. the lobe never blows out and those 8
are bloom.

Not settled: **the largest `p` that does not make the character read wet.** §263's G4 was VOID
for three independent reasons, all mine:

1. **I5 keyed on `slyMetal`**, which is `uMetal * texture2D( metalnessMap, … ).b` — a per-texel
   read, not a class key. 2 350 buckets, 802 matching.
2. **I5 demanded every bucket match**, which ~1 % AA-edge contamination makes impossible.
3. **The mode-4 mask does not contain the character** (§263.2): over Sly, mode 4 arrives as the
   calibration triple *plus* an offset, so an exact-match denominator drops the subject. 23 px on
   `sly-closeup` against 4 706 on `hero`.

`n050` reaches H1 on 1 of 4 and `n100` on 3 of 4, so **the whole decision lives in 0.5 → 1.0**,
and §263's registered candidate set cannot be widened after the fact. Hence a new seal.

## 2. Instrument fixes — derived, each with the measurement it comes from

### 2.1 `debugTerm(8)` — the class map with a skin bit

```glsl
dbgT = vec3( uSpec, glossP / 128.0, vSlySkin );
```

`vSlySkin` is 1.0 on a SkinnedMesh and 0.0 otherwise, so it quantises to **255 or 0** and a small
additive offset cannot move it across a 0.5 threshold — unlike mode 4's exact triple, which
§263.2 measured being moved. **Mode 7 is left exactly as published in §263**; re-defining a
documented channel would make the existing frames unreadable.

### 2.2 The class key is the R byte alone, with ±1 tolerance and no silent tie-breaking

Measured in §263: R arrives as `round( uSpec × 255 )` **exactly** on every material owning more
than 1 500 px. The seventeen census bytes are

```
10, 13, 15, 20, 26, 36, 38, 41, 51, 64, 82, 107, 140, 153, 158, 230, 242
```

±1 is required, not optional: `paving`'s `uSpec` 0.10 is byte **26** by `Math.round` in JS and
arrives as **25**, and an exact table threw `hero`'s 69 695 paving pixels — the largest material
in the frame — into UNRESOLVED, reporting 11.28 % unresolved instead of 0.89 %.

±1 makes bytes **14** (between 13 and 15) and **37** (between 36 and 38) ambiguous. They are
counted **UNRESOLVED**, never assigned to the nearer value.

**Stated limit, because it is one and it is the one that matters:** `uSpec` + `glossP` still
cannot separate `slydlrig:mesh` from `kaykit:props` — both are `uSpec 0.25 / gloss 32 /
rough 0.62`, so both land on byte 64 at `glossP` 20.1. **That is what `vSlySkin` is for**, and it
is the only thing that separates them.

### 2.3 Minimum population before a class is scoreable — derived from the measured spread

The guard reads a **median** rise. The median of *n* samples has standard error ≈ `1.253 σ/√n`.
Across every class in §263's run with ≥ 40 lobe-saturated pixels, the largest spread is
`hieroglyph_gilded` on `hero`: p50 +53.6, p90 +70.3, so **σ ≈ (70.3 − 53.6)/1.2816 = 13.0 L**.

Requiring `SE ≤ 2.0 L` at that worst-case σ:

```
n >= ( 1.253 × 13.0 / 2.0 )^2 = 66.3   ->   floor = 70 lobe-saturated pixels
```

Checked against §263's own buckets, this floor voids exactly the rows I had to hand-flag as
noise and keeps every row I quoted: it **VOIDs** `courtyard`'s `bronze_dark` (**1 px**, the
spurious −7.8 L), `courtyard`'s `uSpec 0.25` (3 px), and `gold_leaf` on both shots (4 and 16 px);
it **keeps** `hero` 0.25 (208), `hero` gilded (284 / 139), `courtyard` granite (4 489),
`courtyard` `ceiling_stars` (117), `temple` 0.161 (72). A floor that reproduces the judgements I
previously had to make by eye is the right floor.

### 2.4 VOID is returned, not defaulted

Every per-class result is `PASS` / `FAIL` / `VOID` through `tools/gate.mjs`, whose only PASS
input is the boolean `true` (§263.1: `G4 !== false` printed SHIP on a null). A class below the
floor returns **VOID for that class**, and a guard defined over a void class is **VOID**.

## 3. Arms and shots

| arm | `uSpecNormPow` | role |
|---|---|---|
| `base` | 0 | shipped |
| `off` | 0, `uSpecGain 0` | positive control |
| `p060` `p070` `p080` `p090` | 0.60 / 0.70 / 0.80 / 0.90 | candidates |
| `p100` | 1.00 | in-boot anchor — §263's `n100` **cannot** be reused, cross-boot frames differ on 5–16 % of pixels (§263.3) |
| `base2` | 0 | null arm, last |

Sweep resolution derived from where the two constraints cross (§7): G4's bar is expected near
`p ≈ 0.84` and H1's near `p ≈ 0.95`, so 0.1 steps bracket both. All five shots — H1 is defined
over the four outdoor shots and `interior` is G5.

## 4. Thresholds

**Inherited verbatim from PREREG-specnorm and PREREG-hilite1, so they cannot be moved:** T1
(p99 ≥ 200 on ≥ 3 of 4 outdoor), T2 (>230 ≥ 0.20 % on ≥ 3 of 4), H1 (>230 ≥ 0.02 % on ≥ 3 of 4
where base ≤ 0.005 %), G1 (>250 ≤ 0.50 % and rise ≤ 0.40 pp), G2 (p50 rise ≤ 4 L and ≤ 130),
G3 (p1 ≤ 45 and |Δ| ≤ 2), G5 (`interior` byte-identical).

**G4, re-derived because §263's version was not scoreable — the bar is unchanged at 20 L:**

> **G4′** — on `sly-closeup`, over pixels that are *all three* of: `debugTerm(8)` **B ≥ 128**
> (SkinnedMesh — **not** the mode-4 mask, per §263.2), `debugTerm(8)` **R within ±1 of byte 64**,
> and `debugTerm(6)` **R ≥ 252 ∧ B ≥ 250** (lobe-saturated) — the **median** display-L rise over
> `base` is **≤ 20 L**. If that population is **< 70 px**, G4′ is **VOID** and nothing ships.

The 20 L bar is unchanged from PREREG-specnorm §8 and is not re-derived: it was set from the
model's +38.9 L at `p=1` and +18.3 L at `p=0.5`, before any frame existed.

### Instrument checks

- **I1** null arm 0 px, all five shots. **I2** `off` vs `base` > 0 px on all four outdoor.
- **I3** applied state read back, all seven distinct. **I4** mode-4 triple > 5 % of frame.
- **I5′ (replaces the mis-specified I5)** — **share-based, not per-bucket**: over the four
  outdoor shots, `debugTerm(8)`'s R must resolve to a census byte (±1) on **≥ 98 %** of the
  mode-4 toon population. Derived from §263's measured unresolved shares of **0.57–2.34 %**;
  the bar is the round number just above the worst. Below it, per-class attribution is VOID.
- **I6 (new, and it measures §263.2 directly)** — on `sly-closeup`, the population with
  `debugTerm(8)` B ≥ 128 must be **> 5 %** of the frame, and it must **exceed the count of
  mode-4-masked pixels that also have B ≥ 128** by more than 10×. That is the character being
  visible to the new denominator and invisible to the old one, stated as a number. If I6 does
  not fire, `vSlySkin` is not doing what §2.1 claims and G4′ is VOID.

## 5. Ship rule

> Ship the **largest** `uSpecNormPow` in {0.60, 0.70, 0.80, 0.90, 1.00} for which **every one of
> G1, G2, G3, G4′, G5 returns PASS** — not "not FAIL" — with I1–I4 and I5′ and I6 fired, **and**
> H1 ≥ 3 of 4. If no swept value satisfies both, `TUNE.specNormPow` stays **0**.

Evaluated through `tools/gate.mjs`; `tests/voidgate.test.mjs` pins the semantics.

## 6. Explicitly out of scope

Sly's material is at the TUNE defaults (`uSpec 0.25`, `gloss 32`, **metal 0**) and `sly cane
gold` is not a material in this build. That is CHARACTER's, it is recorded twice (§262, §263),
and **this seal does not compensate for it** — G4′ measures the consequence and reports it.

## 7. Forecast — and the sharp one

1. **T1 fails at every swept value** (p99 was 186/181/194/189 at `p=1`).
2. **T2 passes on `courtyard` only**, 1 of 4, at `p ≥ 0.9`.
3. **G1, G2, G3, G5 pass at every swept value.** At `p=1` the worst was >250 at 0.00087 %, p50
   +2 L, p1 +1 L, and `interior` exact zero.
4. **H1 reaches 3 of 4 only at `p ≳ 0.95`.** Log-interpolating §263's measured >230 counts:
   `hero` crosses the 185 px bar at `p ≈ 0.89`, `sly-closeup` at `p ≈ 0.95`, `courtyard` is
   already past it at `p = 0.5`, `temple` never.
5. **G4′ fails above `p ≈ 0.84.`** Linear interpolation on the measured `uSpec 0.25` rise —
   +10.6 L at `p = 0.5`, +24.5 L at `p = 1.0` — crosses 20 L at `p = 0.838`.
6. **THE SHARP ONE: (4) and (5) have no common solution, so the registered ship rule returns DO
   NOT SHIP at every swept value.** If that holds, the result is not "the normalisation does not
   work" — §263 already showed it does — but a *quantified* statement that **energy conservation
   and Sly's un-art-directed `uSpec 0.25` are in direct conflict, with the conflict located
   between `p = 0.84` and `p = 0.95`.** That is the number to hand CHARACTER.
7. Falsifier for (6), stated so it can happen: if `sly-closeup`'s H1 population turns out to be
   architecture rather than the character — plausible, since §263.2 found the character was not
   even in the old denominator — then H1 could cross earlier than `p = 0.95` while G4′ still
   holds, and a value near 0.80–0.85 ships.

## 8. How to run it

```
bash tools/launch.sh progress/records/specnorm2.mjs <ABS log> <ABS pidfile>
```

**The runner does not exist yet.** It is `specnorm.mjs` with the arm table of §3, `debugTerm(8)`
added to the diagnostics, the class bucketing of §2.2 with the floor of §2.3, and the ship
decision routed through `tools/gate.mjs`. Budget from §263's run: ~55 min for 5 shots × 10 grabs
under SwiftShader, ~7 min of which is cold boot.
