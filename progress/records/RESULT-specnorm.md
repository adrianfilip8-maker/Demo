# RESULT — specnorm: the normalised lobe DOES make a highlight, and the thing that stops it shipping is my own calibration

Registered in `PREREG-specnorm.md` before any candidate arm existed, committed at `5ff63aa`
with the derivation model, before the scaffolding at `d841058` and the runner at `db0b23e`.
Scored against those thresholds and no others.

**Verdict by the registered ship rule: DO NOT SHIP.** `TUNE.specNormPow` stays **0** and the
shipped build is bit-identical. **The blocking failure is instrument I5, which I mis-specified,
and which voids the guard G4 that the ship rule requires.** The candidate's own numbers are
good and are reported below; they do not ship, because the rule that would have let them ship
depends on a channel calibration that failed.

> **The runner printed `==> SHIP uSpecNormPow 1`. That output is wrong and it is kept in
> `specnorm/capture.txt`.** My gate expression read `G4 !== false`, so a guard that came back
> **null — unscoreable** — counted as satisfied. The registered rule says "satisfies G1–G5",
> and I5's registered consequence is that a blind class map makes *all* per-class attribution
> VOID. G4 is per-class attribution. A guard that could not be evaluated did not pass. The
> scorer now fails closed; the printed line stands in the record as what a permissive default
> does. Substantively it points the same way: on the one shot where the class is measurable at
> all, it **exceeds** G4's bar (+24.5 L against 20).

Record: `shots/specnorm/` (`arms.json`, `score.json`). Runner `specnorm.mjs`; analysers
`specnorm-where.mjs`, `specnorm-class.mjs`, `specnorm-inert.mjs`; model `normmodel.mjs`.

---

## 1. What was changed

```glsl
float specNorm = uSpecNormPow > 0.0 ? pow( ( glossP + 8.0 ) * 0.125, uSpecNormPow ) : 1.0;
vec3 spec = specTint * mix( vec3( 1.0 ), keyRad, uSpecKey )
          * ( specAmt * specStep * specNorm * sh * step( 0.02, ndl ) * uSpecGain );
```

Four functional lines in total (uniform, `specNorm`, the multiply, and splitting `debugTerm`'s
mode 6 from the new mode 7). `uSpecNormPow = 0` takes the literal-`1.0` branch and evaluates no
arithmetic, so the shipped default cannot depend on how a driver spells `pow( x, 0 )`.

## 2. The instrument

| criterion | result |
|---|---|
| **I1 NULL ARM** — `base2` vs `base`, captured last | **0 px on all five shots. FIRED** |
| **I2 POSITIVE CONTROL** — `off` (`uSpecGain 0`) vs `base` | 36 589 / 8 155 / 74 428 / 59 963 px = 3.97 / 0.89 / 8.08 / 6.51 % on the four outdoor shots. **FIRED on all four** |
| **I3 APPLIED STATE** | seven distinct `(pow, key, gain)` states per shot, read back off the live uniform |
| **I4 MODE-4 CALIBRATION** — `debugTerm(4)` triple > 5 % of frame | 75.63 / 26.99 / 15.61 / 18.38 / 73.70 %. **FIRED** (reproduces §262's 75.7 / 27.2 / 15.6 / 17.5 / 73.7) |
| **I5 CLASS-MAP CALIBRATION** — `debugTerm(7)` | **FAILED. See §6. All per-class attribution in this run is VOID by the registered consequence.** |

### 2.1 The inertness test I designed was confounded, and it fired

`base` vs `base` against §262's pre-edit frames differs on **5.6 / 15.3 / 15.7 %** of the frame,
max |dL| **146.5**. Read alone that says the scaffolding is live. It is not, and the control was
already on disk: **`off` sets `uSpecGain 0`, which multiplies the whole specular by zero in both
runs**, and its rows differ by the *same* amount (52 092 px vs 52 043 px on `hero`). The
specular cannot be what differs.

The unconfounded measure is `base − off` inside one boot — the specular's whole footprint, with
boot noise cancelled because both arms are consecutive captures in the same boot:

```
shot         footprint px   pre -> post      peak |dL|  pre -> post
hero            36 624 -> 36 589  (0.10 % apart)   135.25 -> 135.25
temple           8 133 ->  8 155  (0.27 % apart)    45.62 ->  45.62
courtyard       74 429 -> 74 428  (0.00 % apart)   112.20 -> 112.20
```

**The specular term is unchanged by the scaffolding.** Standing consequence worth carrying:
**§233's bit-determinism is a WITHIN-boot claim.** Across boots this project's frames differ on
5–16 % of pixels on static shots and **50.8 %** on `sly-closeup`. Any cross-boot frame
comparison needs a zero-signal control or it is measuring the boot.

## 3. The frame numbers

Display bytes, Rec.709, 1280×720. `n035`/`n050`/`n100` are `uSpecNormPow`; `n050k` also sets
`uSpecKey 1` and is interaction sizing only, never a ship candidate (PREREG §2.1).

```
shot          arm      p1   p50   p99  p99.9    max   >230 px    >230%   >250 px
hero          base     15    71   183    195   232.2        4   0.0004        0
hero          n035     15    71   183    200   232.2        4   0.0004        0
hero          n050     16    71   184    203   233.0       18   0.0020        0
hero          n100     16    73   186    221   247.8      370   0.0401        0
hero          n050k    16    73   186    221   246.8      364   0.0395        0

temple        base     31    89   181    195   230.2        1   0.0001        0
temple        n100     31    89   181    197   230.2        1   0.0001        0

courtyard     base     23   104   180    210   237.2       29   0.0031        0
courtyard     n035     23   104   186    213   240.6      124   0.0135        0
courtyard     n050     23   104   187    216   247.6      291   0.0316        0
courtyard     n100     24   105   194    239   254.6     4456   0.4835        8
courtyard     n050k    24   105   195    237   254.2     4333   0.4702        4

sly-closeup   base     25    82   179    214   239.4       42   0.0046        0
sly-closeup   n035     25    82   181    214   239.4       44   0.0048        0
sly-closeup   n050     25    82   183    214   239.4       47   0.0051        0
sly-closeup   n100     25    82   189    216   239.4      217   0.0235        0
```

**`courtyard` at `n100` clears T2's 0.20 % bar with 0.4835 %** — the first time any candidate in
this line of work (hilite1, hilite2, specnorm) has cleared an inherited deliverable bar on any
shot. `hero` goes 4 px → 370 px and `sly-closeup` 42 px → 217 px.

### Registered gates

| gate | bar | `n035` | `n050` | `n100` |
|---|---|---|---|---|
| **T1** p99 ≥ 200 | ≥ 3 of 4 outdoor | 0/4 | 0/4 | **0/4 FAIL** |
| **T2** >230 ≥ 0.20 % | ≥ 3 of 4 outdoor | 0/4 | 0/4 | **1/4 FAIL** |
| **H1** >230 ≥ 0.02 % | ≥ 3 of 4 outdoor | 0/4 | 1/4 | **3/4 PASS** |
| **G1** >250 ≤ 0.50 % and rise ≤ 0.40 pp | all shots | pass | pass | **pass** (worst 8 px = 0.00087 %) |
| **G2** p50 rise ≤ 4 L, ≤ 130 | all shots | pass | pass | **pass** (worst +2) |
| **G3** p1 ≤ 45, \|Δ\| ≤ 2 | all shots | pass | pass | **pass** (worst +1) |
| **G4** Sly's saturated-lobe median rise ≤ 20 L | `sly-closeup` | — | — | **VOID — I5 failed** |
| **G5** `interior` byte-identical | `interior` | pass | pass | **pass — 0 px on every arm** |

## 4. It does not blow out, and the only pixels that exceed 250 never ran the term

PREREG §4.2 named bloom's spatial gather as the one mechanism absent from the model, and made
it separable: `spec` is multiplied by `sh * step( 0.02, ndl )`, so a pixel whose `debugTerm(6)`
B channel is below 250 **cannot** have run the specular.

Across every arm of every shot, exactly **8 pixels** anywhere exceed L 250 — `courtyard` at
`n100` — and **0 of the 8 are gated.** None of them ran the term. The lobe itself never blows
out; the only super-250 pixels in the entire run are bloom spill, at 0.00087 % of one frame
against a 0.50 % bar.

## 5. What it did to each material class — POST-HOC, NOT REGISTERED (see §6)

Median display-L rise on **lobe-saturated** pixels (`debugTerm(6)` R ≥ 252 ∧ B ≥ 250), masked to
the mode-4 toon population. Full table in `specnorm/class.txt`; `hero` and `courtyard` here.

```
                             hero                                courtyard
material            glossP  satPx   n035   n050   n100 |  glossP  satPx   n035   n050   n100
granite_pink          45.1      0      —      —      — |    45.0   4489  +21.1  +30.1  +59.1
gold_leaf             67.8      4  +10.6  +15.2  +28.8 |    66.7     16   +4.8   +5.7  +13.1
props gold (coins)    60.0      1   +1.0   +1.8   +5.7 |    59.5     89  +12.2  +21.1  +47.1
hieroglyph_gilded     40.2   1473  +21.2  +31.0  +53.6 |    38.5     11  +13.9  +19.7  +41.4
ceiling_stars         17.4      0      —      —      — |    20.1    117  +12.6  +18.4  +39.1
slydlrig / kaykit     20.1    208   +7.3  +10.6  +24.5 |    20.3      3   +4.4  +10.0  +22.6
hieroglyph_wall       11.0    125   +2.7   +4.1   +9.6 |    11.1      0      —      —      —
sandstone_block        9.1    481   +2.4   +3.8   +8.5 |     9.0      0      —      —      —
limestone_polished    26.0      0      —      —      — |    26.3     47   +1.0   +1.9   +4.8
paving:court           7.1     35   +0.3   +0.8   +1.8 |     7.4      0      —      —      —
sandstone_worn         5.9     17   +0.1   +0.0   +0.8 |     6.1     32   +0.0   +0.1   +1.1
sand_ring              6.5    123   +0.0   +0.0   +0.3 |     4.5    640   +0.1   +0.2   +0.9
mudbrick / pyramid   4.4–5.2     0      —      —      — |  5.2        0      —      —      —
```

`bronze_dark` on `courtyard` prints **−7.8 L** at `n100` on a population of **one pixel** and is
noise, recorded so nobody quotes it.

**"Gold sings, limestone turns to plastic" is not what happened, in either half.**
`limestone_polished` moves **+4.8 L** where it lands at all; `paving` — 17 meshes, most of the
ground — moves **+1.8 L**; the sandstones and sand +0.3 to +8.5; `mudbrick` and the pyramids
never catch the lobe on any shot. And **`gold_leaf` is not the winner**: it is +28.8 / +13.1
because it is already on the flat of the AgX curve, exactly as the prereg's model said. The
material ordering is preserved and *sharpened*, which is what energy conservation is for.

**Which material carries the highlight differs by shot**, which is the signature of a lobe that
scales with gloss rather than a scene-wide gain:

- `hero`'s 370 px above L230 are **`hieroglyph_gilded`** (uSpec 0.55, glossP 40–45, mask 0.85).
- `courtyard`'s 4 456 px are **`granite_pink`** (uSpec 0.42, glossP 41–49) — a material with
  *zero* saturated pixels on `hero`. The model predicted its glossP at 44.1.
- The shape is a glint field, not a wash: `hero` 11 components, largest 58 px, median 13.
  `courtyard` 8 components, largest 3 390 px in a 33×177 box — one column, not the frame.

`granite_pink` is also the answer to a question §262 left open. It is 115 902 px of `hero` with
749 sunlit and 0 lobe-saturated, and 4 456 saturated pixels of `courtyard`. Incidence, not
amplitude, decides which of the two it is — per shot, for the same material.

## 6. I5 failed, and it is my error, and it takes the ship path with it

I registered:

> `debugTerm(7)` must resolve ≥ 6 distinct `(uSpec, metal)` buckets summed over the five shots,
> and **every** bucket's `uSpec` must match a row of the live census to within 1/255. If it does
> not, **all per-class attribution in this run is VOID** and the whole-frame numbers stand alone.

Two errors, both in that sentence:

1. **`metal` is not a class key.** `debugTerm(7)`'s B channel is `slyMetal`, which the shader
   defines as `uMetal * texture2D( metalnessMap, … ).b` — a **per-pixel texture read**, not a
   per-material uniform. I wrote the channel and then registered a check against what I assumed
   it contained. Keying on it shatters one material into a bucket per mask level:
   `hieroglyph_gilded` alone produces B = 217, 216, 215, …, 32, 0. **`hero` has 1 580 buckets,
   not ~20.**
2. **"every bucket" is unmeetable by any real frame.** ~1 % of the toon population is
   anti-aliased edge, where two materials' `uSpec` blend to a byte no material owns (21, 22, 23,
   24 sit between `sandstone_worn`'s 20 and `paving`'s 25). A *share* bar was the right shape; an
   every-pixel bar was not.

**§141.1: a mis-derived threshold is VOID, stated, and not re-derived.** So I5 is FAILED, the
per-class attribution in §5 is post-hoc and carries no registered force, and — because **G4 is
defined over mode-7 class membership** — G4 is unscoreable. The ship rule requires G1–G5
satisfied. A void guard is not a passed guard. **Nothing ships**, and the reason is my
instrument, not the candidate.

The channel itself is demonstrably sound, which is the frustrating part and is stated as
evidence rather than as a substituted threshold: **R arrives as `round( uSpec × 255 )` exactly**
on every material owning more than 1 500 px of `hero` (242, 230, 140, 107, 82, 64, 51, 41, 38,
36, 25, 20, 15, 13, 10 — all seventeen census values), and **G reproduces `normmodel.mjs`'s
`glossP`** — committed before the capture existed — to within 1–3 on every class
(`granite_pink` 44.1 modelled / 45.1 measured, `paving` 6.9 / 7.1, `slydlrig` 20.1 / 20.0,
`sandstone_worn` 5.9 / 5.9).

### What G4 would have said

Reported because it is the substantive constraint and should not be lost, and **flagged as
void**: on `hero` the `uSpec 0.25` bucket's median rise on lobe-saturated pixels is **+24.5 L at
`n100`** against a 20 L bar, and +10.6 L at `n050`. So at the exponent that delivers the
highlight, the class Sly belongs to gains about 25 L on its saturated pixels — the regression
G4 existed to catch, had G4 been scoreable.

That bucket is shared with `kaykit:props`, and **nothing in this capture separates a SkinnedMesh
from a static prop** — a second, independent reason the registered G4 was not well posed.

## 6.1 — and a third: the mode-4 mask does not contain the character

**On `sly-closeup`, the `uSpec 0.25` bucket holds 23 pixels. On `hero` it holds 4 706.** The
character is not absent from the frame — he fills the middle of it. He is absent from
**`debugTerm(4)`'s exact-triple mask**, which is the denominator §262 §8.1 established for every
incidence claim in this line of work.

Measured directly, over Sly's own pixels (x 560–720, y 140–620), `debugTerm(4)` writes:

```
(81,143,200) x4206   (79,141,199) x4179   (80,142,200) x3758   (77,139,198) x3277
(74,137,196) x2986   (82,144,201) x2902   (70,133,194) x2858   (68,131,193) x2764
```

— the calibration triple **(64,128,191) plus a positive offset**, never the triple itself. So he
*is* running the cel program (nothing else would land that close), and the exact-match mask
drops him anyway.

**This extends §262 §8.1 in the opposite direction, and both directions are now measured.**
§8.1: an *unmasked* share counts the sky and over-states. This: a *masked* share can silently
drop the subject and under-state — and on a character shot it drops the character. §262's own
`sly-closeup` row ("toon 17.5 %, gates FULL 24.576 %") is therefore a statement about the
pavement and the gilding, not about Sly. My run reproduces those numbers (18.4 %, 18.9 %) and
identifies the population: `paving:court`, 137 367 px, 2 044 of them lobe-saturated.

**The cause is not separated by this capture** and is not claimed. Two candidates: the material
draws blended (so the debug constant composites against what is behind it), or something adds to
`outgoingLight` after TOON_SHADE's debug override. Whoever owns that should also re-check
whether the mask is exact-match by necessity or whether a tolerance is admissible — an
exact-match mask that silently omits the subject is a worse instrument than a tolerant one.

## 7. Forecast, scored

| # | forecast | outcome |
|---|---|---|
| 1 | T1 and T2 both fail, 0/4 or 1/4 | **RIGHT.** T1 0/4, T2 1/4 |
| 2 | H1 passes on **2** of 4 — `courtyard` and `hero` | **WRONG on the count.** 3/4: `courtyard`, `hero` **and `sly-closeup`**; the two named were right |
| 3 | G4 binds at `p = 1`; **predicted ship value 0.50** | **WRONG.** `n050` reaches H1 on 1/4 and would not have shipped on its own terms. And G4 turned out unscoreable |
| 4 | G1 holds everywhere; flagged as most likely to be wrong because bloom is not in the model | **RIGHT, and right about the mechanism** — the only 8 super-250 px in the run are ungated, i.e. bloom |
| 5 | G2 fails on `courtyard` at `p=1` via bloom | **WRONG.** p50 104 → 105 |
| 6 | `interior` byte-identical on every normalisation arm | **RIGHT.** Exact zero |
| 7 | `n050k` exceeds G4 and G2 | **WRONG on G2** (p50 +1). G4 void |
| 8 | biggest display mover is `ceiling_stars` or `bronze_dark`, **not** `gold_leaf` | **HALF RIGHT.** Not `gold_leaf` — correct, and for the predicted reason (already on the flat of the curve). But the biggest is `granite_pink` at **+59.1**, which I never named; `ceiling_stars` does move (+39.1) but only on `courtyard`, and `bronze_dark`'s whole population is 1 px |

**The single largest miss is the one that mattered most.** The prereg's §3 table ranked the
movers by a *model* of each class's peak, and ranked `granite_pink` sixth. In the frames it is
first, by a distance, and it is the entire highlight on `courtyard` — because the model ranked
by amplitude and the frames are decided by **incidence**: `granite_pink` has 0 lobe-saturated
pixels on `hero` and 4 489 on `courtyard`. §262 said "amplitude or incidence is both, and which
one depends on the shot". That is now true *per material* as well as per shot.

Model inputs that held up: every `glossP` in §3 of the prereg, to within 1–3 measured. The
prereg's central correction to the handoff — that "×12.9" is `gold_leaf` alone and the frame is
`paving` at glossP 6.9 where the factor is ×1.86 — is confirmed: `paving` moved **+1.8 L**.

## 8. What should happen next

1. **Re-register I5 correctly and re-run.** Key on the R byte alone with ±1 tolerance against
   `round( census.uSpec × 255 )`; bar it on a *share* (e.g. ≥ 98 % of toon pixels resolved) and
   not on every bucket. `specnorm-class.mjs` already implements it and reports 0.89 % unresolved
   on `hero`. Nothing else about the run needs to change; the frames are on disk.
2. **Give G4 a population it can actually name.** Sly's mesh and `kaykit:props` share
   `uSpec 0.25 / gloss 32 / metal 0` because both are at the TUNE defaults. `debugTerm(1)`'s
   `vSlySkin` separates them and was not captured. Capture it.
3. **The binding art constraint is that Sly's material is un-art-directed.** §262 found the same
   material is `metal 0` when the cane is meant to be gold. A character at the TUNE default
   `uSpec` is what makes a physically-correct lobe look wrong on him. That is CHARACTER's, and
   fixing it is what would let energy conservation ship at `p = 1`.
4. **`uSpecNormPow` between 0.5 and 1.0 was not swept** and the registered set cannot be widened
   after the fact. `n050` → `n100` moves `courtyard` from 291 px to 4 456 px, so the interesting
   ground is entirely inside that gap.
