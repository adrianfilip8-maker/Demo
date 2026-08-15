# RESULT-litbleach — VOID on two bracket gates. But the staging fix WORKED, and the candidate looks near-inert on the defect it was built for

Scored against `PREREG-litbleach.md` (096d31e) + `AMENDMENT-litbleach-A1.md` (c4461e7).
14 frames across 3 boots, all force-added and durable. Scorer output quoted verbatim below.

## Verdict: VOID

`R_combat` FAIL and `R_sly-key` FAIL ⇒ every acceptance and protection row is VOID by
construction. **Nothing is claimed about the candidate in either direction.** `TUNE.subjLitHold`
stays 0.0; no `src` change is proposed.

```
V_ROWS  14 rows (want 14)                                              PASS
V_CHUNKS  chunks present [combat, sly-key, traversal]                  PASS
V_CHUNK_TREE  1 distinct src hash across 3 chunks: 2b5c7c49ad9c4668    PASS
R  traversal   off-vs-back    0 px (want 0)                            PASS
R  combat      off-vs-back    2 px (want 0)                            FAIL
R  sly-key     off-vs-back 1120 px (want 0)                            FAIL
PF_MASK traversal  rect is 81.2% subject (want >= 60%)                 PASS
PF_MASK combat     rect is 99.6% subject (want >= 60%)                 PASS
PF_STAGE  traversal 0.205 <= 0.3 · combat 0.066 <= 0.18 ·
          ctl 0.516 >= 0.42 and >= 2x traversal                        PASS
```

## 1. THE HEADLINE: `PF_STAGE` PASSED — §328's diagnosis is vindicated

This is what the seal was built to establish, and it is the one thing the VOID does not touch,
because the pre-flight is measured on the `off` arm before any candidate acts.

| shot | this run (roster-faithful staging) | r12 | r13 | lithold (dt:0 staging) |
|---|---|---|---|---|
| traversal | **0.205** | 0.205 | 0.205 | 0.678 |
| combat | **0.066** | 0.080 | 0.080 | 0.486 |
| sly-key (control) | **0.516** | 0.516 | 0.516 | 0.516 |

**Traversal reproduces the roster to three decimal places on a fresh boot.** §328 argued that
lithold VOIDed because its runner staged with `setShot(name, {dt: 0})`, freezing the world clock
*through* staging and resting the character where the defect does not occur; and that staging
live then freezing would put the defect back in frame. That argument is now confirmed by
measurement rather than reasoning: same seal, same bars, same rects, one changed call, and the
statistic moves from 0.678 to 0.205 — onto the roster's own value.

`PF_MASK` passed at 81.2% / 99.6%, so the rects are on Sly in these boots too. **The staging
problem that killed lithold is solved.**

## 2. Evidence-grade, explicitly NOT a verdict: the candidate barely moves the defect

These rows are VOID. They are reported because they are informative for the successor, and they
must not be read as a partial pass or a refutation.

```
E_S_traversal on S 0.215 >= 0.42        (off 0.205 -> on 0.215,  +0.010)
E_S_combat    on S 0.066 >= 0.3         (off 0.066 -> on 0.066,  +0.000)
E_H_traversal on H 223.0  |dH|   9.5 <= 25
E_H_combat    on H 348.5  |dH| 135.0 <= 25
LUM_traversal |dL| 0.09 <= 3            LUM_combat |dL| 0.05 <= 3
KO  traversal off 0.205 < ko 0.211 < on 0.215 (strict)
PROT_CTL  sly-key on S 0.516, drift 0.001 <= 0.06
PROT_ENV traversal 1 px BEYOND mask+3   ·   combat 7 px BEYOND
```

At the sealed dose of 0.70 the hold lifts traversal's costume saturation by **+0.010** against a
bar of 0.42, and moves combat by **nothing at all**. The dose is monotonic (KO strict) and
luminance-exact (|dL| ≤ 0.09), so the mechanism is *operating* — it is simply not restoring
chroma on bleached pixels.

That contrast is the useful part. §11's pre-seal dry run measured the same lever adding **+0.016**
on lithold's *already-blue* frames (0.678 → 0.694). So the hold moves an already-saturated
costume slightly, and a bleached one slightly less. **On this evidence the lever's magnitude does
not scale with the chroma loss it is supposed to repair** — which is the opposite of the "gives
back what was lost" behaviour its contract in `ToonMaterial.js` describes. A successor should
start by instrumenting the gate that scales the hold (the `uShadowHoldKnee` chroma gate and the
measured-loss term) rather than by raising the dose.

Two caveats, stated because this is VOID evidence and not a finding: the numbers come from a run
whose validity gates failed, and `E_H_combat` at 348.5° suggests combat's rect may be dominated
by non-costume pixels at this staging despite `PF_MASK` reading 99.6% subject — 99.6% subject is
not 99.6% *costume*, and the rect could be sitting on skin, fur or trim.

## 3. Why the brackets failed, measured — and they are two different phenomena

Diagnosed offline from the committed frames (`NOTE-litbleach-bracket.md`, committed *before*
this score existed so it could not be shaped by the verdict).

| shot | drift | max channel delta | where | vs the measured rect |
|---|---|---|---|---|
| traversal | **0 px** | — | — | — |
| combat | **2 px** | **1** | on subject, one 8×8 cell | inside |
| sly-key | **1120 px** | **21** | band x 0–466, y 276–326 | rect is x 600–675 — **outside** |

**combat** is float/rasterisation non-determinism in a skinned draw: two least-significant-bit
pixels, 0.02% of the candidate's own 10,372 px effect on that shot. My published guess in commit
4b02250 — that combat's FX advance per render call — is **refuted**: FX drift would be a cluster
on the trail or starburst at large deltas, not 2 px at delta 1 on the character.

**sly-key is a genuinely different thing** and the successor must not lump them together: a
coherent 467×51 horizontal band, deltas up to 21, only 48.6% of it within ±2. Something in that
region really moved between the first arm and the last. It does **not** touch the control's
measured rect, which is why `PROT_CTL` still read a drift of 0.001 — but "the drift missed the
rect" is luck, not validity.

## 4. What does NOT happen here

**No bar moves.** `R` was sealed at 0 px before any frame existed, frames exist, §141.1 is
absolute. Two pixels at ±1 LSB is exactly the number that invites *"that is basically zero"* —
and §11 of this seal committed **in writing, before the capture**, that a **one-pixel**
`PROT_ENV` failure would be a real failure blocking the ship. Holding that line for a bar I
expected to fail and abandoning it for one I did not would be indefensible. It is also worth
noting that `PROT_ENV` *did* fail here (1 px traversal, 7 px combat), exactly as §11 disclosed
it might — so the discipline is being applied to the bar it was written about, not only to the
convenient one.

## 5. AMENDMENT A1 delivered, and it generalises

**Chunking produced a complete 14-frame capture across three boots in an environment where five
consecutive single-process captures were destroyed.** `V_CHUNKS` and `V_CHUNK_TREE` both passed —
one src hash `2b5c7c49ad9c4668` across chunks taken at 05:34, 06:24 and 06:43, i.e. the tree
verified at three separate points in time instead of the two a single process could check.
Chunk 1 provably survived rollback nine byte-identical (§329.1).

Two rules now transfer to every future seal in this environment:
1. **Chunk any capture longer than ~15 minutes**, with the bar-by-bar argument written before the
   frames (A1's form: which comparisons cross a boot, and why the ones that do are measurements
   rather than pixel diffs).
2. **Force-add completed chunk frames.** `progress/records/*/**/*.png` is gitignored and a
   rollback wipes the working tree *and* `/tmp`, so an un-force-added chunk has no durable copy
   anywhere. A chunked seal that skips this is a chunked seal in name only.

## 6. The §302 narrowing

§302 established that **cross-boot** `[0,0]` pixel bars are unachievable here. This run narrows
it with a three-shot spread inside one seal: traversal returns **exactly 0 px**, so same-boot
exact-zero *is* achievable — but combat and sly-key both drift, so it is **the exception rather
than the rule**. A whole-frame 0-px bracket is the wrong instrument on this renderer for most
shots.

## 7. §10's registered forecast is UNRESOLVED

The forecast was *E1 passes, E2 is the coin flip at ~65/35, because combat's achromatic additive
is ~4× traversal's and may be composited after the shader*. Both bars VOIDed, so the forecast is
**neither confirmed nor refuted** and no credit is claimed for it. The evidence in §2 is if
anything adverse to its optimistic half — traversal's E1 would have failed at 0.215 against 0.42
— but a VOID run cannot settle that, and it does not.

## Disposition

Nothing ships. `TUNE.subjLitHold` stays 0.0. `TUNE` untouched.

**Successor — a NEW seal, never an edit to this one**, carrying over rects, doses, acceptance
bands, `PF_MASK`/`PF_STAGE` (all of which worked) and the §9 LOOK, and changing three things:

1. **A bracket argued from these numbers.** Whole-frame 0 px is not the right bar here. Candidate
   options, to be sealed with a stated rationale: a rect-scoped bracket over the pixels the seal
   actually measures, plus a whole-frame drift bar with a tolerance that admits ±2 LSB noise
   while still catching sly-key's 467×51 band. Whatever is chosen must be justified against the
   candidate's own effect size (3,040 px traversal / 10,372 px combat), which is three orders of
   magnitude clear of the noise.
2. **Instrument the hold's scaling gate before touching the dose** — §2's evidence says the lever
   moves bleached pixels no more than already-blue ones, which points at the chroma-loss/knee
   gating rather than at the dose.
3. **Verify combat's rect is on the COSTUME**, not merely on the subject. `PF_MASK` at 99.6%
   subject with a measured hue of 348.5° is a warning that the rect may be reading skin, fur or
   trim, and a costume-hue pre-flight would catch it where a subject-mask one does not.
