# RESULT — specnorm2: the conflict is real and it is **p ∈ (0.70, 0.90]**

Registered in `PREREG-specnorm2.md` before any arm existed, amended **pre-capture** (§4's strike,
on already-published §263 frames), then run. Scored against those thresholds and no others.

**Verdict by the registered ship rule: DO NOT SHIP at every swept value.** `TUNE.specNormPow`
stays **0**; the shipped build is bit-identical.

**The product of this run is not a ship decision — it is the interval.** Energy conservation
needs `p ≥ 0.90` to put a highlight on 3 of 4 shots. The character's un-art-directed `uSpec 0.25`
tolerates at most `p ≤ 0.70`. **They do not overlap, and the gap is 0.20 wide.**

Record: `progress/records/specnorm2/`, frames `shots/specnorm2/`. Runner `specnorm2.mjs`.

---

## 1. The interval

```
G4′  median rise on the character's lobe-saturated pixels (bar ≤ 20 L), n = 2 760 px
     p060  +15.47 L  PASS
     p070  +18.47 L  PASS      <- last PASS
     p080  +21.72 L  FAIL      <- first FAIL
     p090  +25.17 L  FAIL
     p100  +28.38 L  FAIL

H1   >230 ≥ 0.02 % of frame on ≥ 3 of 4 outdoor shots
     p060 1/4   p070 1/4   p080 2/4   p090 3/4  <- first PASS   p100 3/4
```

**⇒ `p ∈ (0.70, 0.90]` is the measured width of the conflict between a physically normalised
specular lobe and Sly's material.** Below 0.70 the highlight does not reach 3 of 4 shots; above
0.70 the character starts to read wet. There is no value that does both.

## 2. Every shot, every arm

```
shot          arm     p1  p50  p99    max  >230 px   >230%   >250 px
hero          base    15   71  183  232.2        4  0.0004        0
hero          p060    16   72  184  237.1       63  0.0068        0
hero          p070    16   72  184  240.8      126  0.0137        0
hero          p080    16   72  185  243.8      188  0.0204        0   <- H1 crosses
hero          p090    16   73  185  245.7      259  0.0281        0
hero          p100    16   73  186  247.8      370  0.0401        0

temple        base…p100  unchanged at 1 px — incidence-bound, moves at no value

courtyard     base    23  104  181  237.2       29  0.0031        0
courtyard     p060    23  104  188  249.4      365  0.0396        0   <- H1 crosses
courtyard     p080    24  104  190  253.4     1380  0.1497        2
courtyard     p090    24  105  192  254.4     3722  0.4039        4   <- T2 crosses
courtyard     p100    24  105  194  254.6     4448  0.4826        8

sly-closeup   base    25   81  179  239.4       42  0.0046        0
sly-closeup   p080    25   81  186  239.4      140  0.0152        0
sly-closeup   p090    25   81  187  239.4      205  0.0222        0   <- H1 crosses
sly-closeup   p100    25   81  189  239.4      218  0.0237        0

interior      byte-identical on every arm (G5)
```

**Cross-boot reproduction of a statistic, not of pixels:** `p100` gives `hero` 370 px and
`courtyard` 4 448 px against §263's 370 and 4 456 — while §263.3 measured the *frames* differing
on 5–16 % of pixels between boots. The aggregate is stable; the pixels are not.

Gates: **T1 0/4** at every value. **T2 1/4** (`courtyard`, from `p090`). **G1/G2/G3/G5 PASS
everywhere** — worst >250 is 8 px = 0.00087 %, worst p50 rise +1, worst p1 rise +1, `interior`
exactly 0 px.

## 3. The instrument

| check | result |
|---|---|
| **I1** null arm | **0 px on all five shots. FIRED** |
| **I2** positive control | 36 630 / 8 125 / 73 681 / 60 047 px. **FIRED on all four outdoor** |
| **I3** applied state | eight distinct states per shot, read back live |
| **I4** mode-4 calibration | 75.67 / 27.24 / 15.01 / 18.79 / 73.76 %. **FIRED** |
| **I5′** class-map share ≥ 98 % | 99.11 / 99.61 / **97.63** / 99.73 %. **BLIND** — see §4 |
| **I6** skin bit sees what the mask cannot | **FIRED, and starkly** — see below |
| **I7** skin bit is bimodal | 0.35 % in the dead zone against a 1 % bar. **FIRED** |

### I6 — §263.2, quantified

> `sly-closeup`: **65 632** pixels carry `vSlySkin` (7.12 % of frame). Of those, the number
> inside `debugTerm(4)`'s exact-triple mask is **0**.

Not "few". **Zero.** The denominator that §262 §8.1 established for every incidence claim in this
line of work contains none of the character on the character's own close-up. That is why G4′ had
to be built on `vSlySkin`, and I7 confirms the bit is clean: `B` is bimodal, 0.35 % in [64, 192].

The same offset is what forced §4's pre-capture strike — over Sly, mode 7's R reads **74–82**
against a census byte of 64, so the `uSpec` key could not have found him either.

## 4. I5′ BLIND — and I mis-derived its bar, using data I had already published

`courtyard` resolves **97.63 %** against a **98 %** bar. It misses by 0.37 pp, and **the bar was
unmeetable before the run started.**

I wrote: *"Derived from §263's measured unresolved shares of 0.57–2.34 %; the bar is the round
number just above the worst."* §263's worst unresolved was `courtyard` at **2.34 %**, i.e.
**97.66 % resolved** — so a bar of "≥ 98 % resolved" sits *above* the best §263 ever achieved on
that shot. I reasoned in unresolved-space ("2.34 → round to 2 %") and wrote the bar in
resolved-space, and the round went the wrong way.

**§141.1: not re-derived.** I5′ is BLIND and the per-class architecture table in §6 is **VOID**.

This is the same species of error as I5 itself, one level up: in §263 I fixed the *shape* of the
check (share-based, not per-bucket) and then set its *level* without testing it against the
number I had already measured and published two commits earlier. **A threshold derived from data
must be checked against that data before it is registered**, and "just above the worst" is a
phrase that needs the units written down next to it.

### Does I5′ void G4′? The two readings, and why it does not matter

- **The prereg text** makes G4′ depend on the 70-px floor, I6 and I7 — all fired — and *not* on
  I5′. G4′ uses only mode 8's **B** channel and mode 6; it never touches the R byte that I5′
  measures. On this reading G4′ is scoreable and gives §1's crossing.
- **The runner** conjoined `i5` into G4′'s gate, which is stricter than the text. On that reading
  the gates table prints `G4′ VOID` on every row.

I flag the discrepancy rather than silently taking the convenient branch — but **the ship
decision is identical under both**: under the text, G4′ FAILs from `p080` while H1 needs `p090`,
so no value passes both; under the runner, G4′ is VOID so nothing ships. Consistent with §263.1,
where the text was *stricter* than the code and I honoured the text, I take the text as
authoritative here too — the rule is "the text governs", not "whichever is stricter today".

## 5. Where the highlight comes from, per shot

Same signature as §263: which material carries it depends on the shot, because a gloss-scaled
lobe follows incidence.

- `hero` — `hieroglyph_gilded`, +28.0 → +45.7 L across the sweep, on 1 473 saturated px.
- `courtyard` — `granite_pink`, +36.1 → +59.1 L on 4 489 px; plus `ceiling_stars` (+22.8 → +39.2)
  and `coins` (+27.4 → +48.1), neither of which lands on `hero` at all.
- `temple` — nothing. 822 saturated px of `pyramid` at `uSpec 0.04`, worth +0.8 L at `p100`.

## 6. Per-class table — **VOID by I5′**, reported for continuity only

```
shot        material              glossP  satPx    p060    p070    p080    p090    p100
hero        hieroglyph_gilded       38.5   1473   +28.0   +33.5   +37.8   +42.1   +45.7
hero        sandstone_block          9.1    481    +4.5    +5.5    +6.5    +7.5    +8.5
hero        kaykit:props            20.0    208   +13.2   +15.9   +18.7   +22.1   +24.5
hero        hieroglyph_wall         11.0    125    +5.1    +6.0    +7.1    +8.2    +9.6
hero        sand_ring                6.5    123    +0.0    +0.0    +0.1    +0.1    +0.3
courtyard   granite_pink            45.0   4489   +36.1   +42.6   +50.0   +55.9   +59.1
courtyard   sand_ring                4.5    572    +0.7    +0.8    +0.9    +1.0    +1.1
courtyard   ceiling_stars           20.1    115   +22.8   +27.0   +31.2   +34.9   +39.2
courtyard   coins                   59.6     71   +27.4   +35.6   +42.7   +45.8   +48.1
temple      pyramid                  5.0    822    +0.2    +0.3    +0.7    +0.8    +0.8
temple      hieroglyph_wall         11.0     72    +5.9    +6.9    +8.3    +9.5   +10.8
```

**The 70-px floor did its job.** `paving` (35 px), `sandstone_worn` (17), `bronze_dark` (11),
`gold_leaf` (4), `coins` on `hero` (1), `limestone_polished` (47) and `kaykit:props` on
`courtyard` (3) all print **VOID** instead of a number. §263 had to hand-flag `bronze_dark`'s
spurious −7.8 L; here it never reaches the page.

**And it exposes what §263 could not:** on `hero` the `uSpec 0.25` bucket is now correctly
labelled **`kaykit:props`**, and it reads +24.5 L at `p100` — *exactly* §263's figure for what it
called the character. The true character population, isolated by `vSlySkin` on `sly-closeup`,
reads **+28.4 L**. §263's merged bucket understated the character by ~4 L and was measuring props
on the wrong shot.

## 7. Forecast, scored

| # | forecast | outcome |
|---|---|---|
| 1 | T1 fails at every swept value | **RIGHT.** 0/4 throughout |
| 2 | T2 passes on `courtyard` only, 1 of 4, at `p ≥ 0.9` | **RIGHT, exactly** |
| 3 | G1, G2, G3, G5 pass at every value | **RIGHT** |
| 4 | H1 reaches 3/4 only at `p ≳ 0.95` | **WRONG.** 0.90. And every per-shot crossing was late: `hero` predicted 0.89, actual **0.80**; `sly-closeup` predicted 0.95, actual **0.90** |
| 5 | G4′ fails above `p ≈ 0.84` | **WRONG, and by the most.** It fails above **0.70** |
| 6 | (4) and (5) have no common solution ⇒ DO NOT SHIP at every value | **RIGHT** |
| 7 | I7 fires | **RIGHT.** 0.35 % vs a 1 % bar |
| 8 | falsifier: `sly-closeup`'s H1 is architecture and 0.80–0.85 ships | **DID NOT FIRE.** Nothing ships |

**Both numeric misses are in the same direction and have the same cause.** I interpolated from
**two** points (`p = 0.5` and `p = 1.0`) and assumed the curve between them was smooth in the
obvious way. It is not: the effect grows fast at low `p` and flattens at high `p`, so every
crossing landed *earlier* than predicted. Predicted interval `(0.84, 0.95]`, width 0.11; actual
`(0.70, 0.90]`, width **0.20**. **I under-estimated the conflict by nearly half.**

The G4′ miss has a second cause worth separating: my prediction extrapolated §263's *merged*
`Sly + kaykit` bucket on `hero`. The isolated character on `sly-closeup` is hotter than that
bucket (+28.4 vs +24.5 at `p100`). Predicting a population's behaviour from a different,
contaminated population on a different shot is exactly the kind of substitution this run existed
to remove.

## 8. What this hands over

1. **The number for CHARACTER: `p ∈ (0.70, 0.90]`.** Sly's mesh is at the TUNE defaults —
   `uSpec 0.25`, `gloss 32`, `metal 0` — and was never art-directed. At `p = 0.90`, the exponent
   the *world* needs, his lobe-saturated pixels rise **+25.2 L**. This run does not compensate
   for that and should not; it measures it.
2. **The mode-4 mask needs fixing or retiring as a denominator.** I6 measured it containing
   **0 of 65 632** character pixels. Every "of the toon population" figure in §262 and §263 on a
   character shot is a statement about architecture. `vSlySkin` works and is now the pattern.
   The *cause* of the offset is still not identified and remains open.
3. **I5′'s bar needs re-deriving, in resolved-space, against §263's own 97.66 %.** It is the only
   check that failed, and it failed for arithmetic rather than for anything about the build.
4. **`p` between 0.70 and 0.90 was swept at 0.1** and both crossings are bracketed but not
   resolved finer. If anyone wants the crossing to 0.05, the frames and runner exist.
