# RESULT — coinlit: the instrument was the bug, the re-score is clean, and the candidate is HONESTLY FALSIFIED

Supersedes the VOID-INSTRUMENT line in RESULT-props1 §(b) / §320. **No re-capture was taken**:
the same 30 frames in `progress/records/props1run1/` are re-scored by a repaired reader. Zero
lock time spent.

## 1. What the NaN was, and why fixing it is not a new seal

`tools/png.mjs` `readPNG` returns `{ w, h, ch, data, bd, ct, interlace }`. `coinlit-score.mjs`
was written against `{ width, height }`, which that object does not carry. Every index became
`(y * undefined + x) * 4` = NaN, every sample `data[NaN]` = `undefined`, every mean NaN — while
`n` kept counting, because the loop bounds came from the ROI boxes and were real numbers. That is
exactly the reported signature (`dL NaN (off NaN -> NaN, n=5026)`).

**§141.1 statement, explicitly:** this fix touches only the READING code — the property names of
the decoder, plus clamping the loops to the decoded `w`/`h` and using the decoded `ch` as the
stride. **No threshold, no ROI rule, no statistic definition, no ship rule in PREREG-coinlit is
altered.** The bars scored below are the bars that were sealed before the run. This is a repair
of the instrument, not a new seal.

Two hardening additions, also non-bar: `dims()` refuses any decode without usable `w`/`h`/`ch`,
and `finite()` VOIDs on any non-finite statistic. The second matters more than it looks — **NaN
compares false against every threshold, so an unrepaired scorer would eventually have reported
`FAIL` on a candidate it never measured.** A NaN is not a FAIL; it is an unmeasured bar, and it
must exit as VOID.

## 2. The instrument is VALID

```
tree: ONE stamp across all 30 captures (9531d2506746b62b | 25f3868e29eb)
P1 VALIDITY (same-boot off vs back, §302):  0 px on ALL SIX shots
   courtyard 0 · hero 0 · night 0 · traversal 0 · dunes 0 · kaykit 0
P2 TREASURE HOLD:  dL 0.000 on every shot that stages a treasure — exactly zero, as designed
P3 NO BLOOM RE-FEED:  outside-ROI |dL| <= 0.053 everywhere; d(px >= 250) = 0.0000% everywhere
```

Both protections are perfect and the validity block is [0,0] twelve-for-twelve, claimed
SAME-BOOT ONLY. So this is a valid instrument returning a real negative, not a broken one.

## 3. VERDICT: FAIL on all three arms, at every qualifying staging — nothing ships

Bars: B1 dL >= +10.0, B2 dS >= +0.04, B3 hiFrac >= 0.05 AND above `off`.

| arm | coins dL (crt/hero/night/trav/kaykit) | rings dL (crt/hero/night/trav/dunes) | dS |
|---|---|---|---|
| `both` (metal 0.30 + dome normals) | +0.31 / +2.29 / +0.63 / **+9.95** / +4.42 | +1.00 / +0.56 / +0.71 / +1.69 / +0.13 | -0.016 … +0.010 |
| `mon` (metal 0.30 only) | +3.42 / +1.75 / +0.08 / +6.03 / +1.42 | +1.08 / +0.56 / +0.71 / +1.69 / +0.13 | -0.013 … +0.020 |
| `non` (dome normals only) | -2.48 / +0.66 / +0.49 / +4.17 / +2.76 | **0.00 / 0.00 / 0.00 / 0.00 / 0.00** | ~0 |

Not one row reaches +10.0. The best is `both` on `traversal` coins at **+9.95** — 0.05 short,
and it is recorded as a miss and not as a pass, which is the whole point of registering the
number first. B2 fails harder and more informatively than B1: **the mean saturation moves by
about zero and is NEGATIVE on five rows.** The candidate makes these objects very slightly
brighter without making them any more gold. "Reads as lit gold" is not achieved by either lever
at these doses.

`src/**` is unchanged. `PropKit.coin`, `Pickups._mat`, `Architecture` MATS and
`courtyardTraversal` are all exactly as they were.

## 4. Four findings the run bought, which are worth more than the number it was sent for

**4.1 The `non`/rings row is 0.00 on all five stagings — and that is the control working.** The
normals lever rewrites `pickup_coins` geometry only; the rings were never in its scope. An
exactly-null arm on a mesh the lever does not touch is the scoping proof, and it is why the
coin-side `non` numbers can be trusted as the coin lever alone. The two levers are also near
additive where both are live (traversal coins: 6.03 + 4.17 = 10.20 vs `both` 9.95).

**4.2 §296's mechanism is right about the cause and wrong about the cure, and this measures it.**
`diff *= mix(1.0, 0.20, slyMetal)` does remove 68% of gold's albedo at metal 0.85 — but restoring
it (metal 0.85 -> 0.30, i.e. giving back 2.5x of the diffuse term) buys a **ring** +0.5 to +1.7 L.
The reason is upstream of the metal factor: `diff` is multiplied by `key = ramp * sh`, and on a
backlit disc at these stagings that product is near zero. **Restoring 2.5x of albedo times zero
key is still zero.** So the coin/ring read cannot be recovered from the diffuse leg at all, and
the remaining candidates are the ones §264/§267 already named (`uSpecNormPow`, SHADING's, not
this lane's), a rim/emissive floor scoped to the pickup family, or the objects' ORIENTATION —
a coin whose face never turns toward the key cannot be lit by any material value.

**4.3 The registered ROI is subject-diluted, and for the rings it is centred on the HOLE.** The
sealed rule puts a box of half-size `max(5, 0.55 x apparentPx)` on each instance's projected
ORIGIN. For a torus that origin is the middle of the ring — sky. The `off` means show it plainly:
101.1 L on `courtyard` rings and 91.6 on `courtyard` coins, i.e. the boxes are mostly background,
against a subject the critic calls near-black. A +10 L bar on such a box implies a far larger
change on the object itself. **This is stated as a diagnosed weakness of the instrument for the
NEXT seal, NOT as a reason to reinterpret this one** — the rule was registered before the run and
the verdict stands on it. The successor should register a SUBJECT MASK (the pixels that change
between a subject-present and a subject-absent arm) instead of a box, which is the shape
PREREG-fxshape2 §4.2 already reached for.

**4.4 What did move is where the geometry is biggest.** The only rows above +4 L are `traversal`
and `kaykit` coins, the two stagings where the trail crosses open sky at 45-107 px. The levers
scale with how much subject is in the box, which is consistent with 4.3 and with the levers being
real but small.

## 5. Disposition

* coinlit: **FAIL, fail-closed. Nothing ships.** The candidate is falsified in a valid instrument
  rather than left unjudged; §320's VOID-INSTRUMENT classification is discharged.
* `coinlit-score.mjs` keeps the repair and the two guards, so the next PROPS seal inherits a
  scorer that exits VOID instead of returning number-shaped nothing.
* Routed onward: the pickup/ring read is NOT a diffuse-term problem. It belongs with §264's
  `uSpecNormPow` (SHADING) or with a pickup-scoped rim/emissive floor, and any successor needs a
  subject mask before it needs a new candidate.
