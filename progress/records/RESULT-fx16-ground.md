# RESULT — fx16 grounding A/B, scored against PREREG-ground.md

Frames: `shots/fx16/sly-closeup.{base,lowbias,minbias,back}.png` (19:33–19:36), `fx16.json`.
Scored in the sealed order. Every crop named below was opened and looked at.

## 0. Instrument and gate — both pass

`m12.mjs --validate`: **INSTRUMENT VALIDATED** on the current tree — under-boot 0.12 L mean abs
error vs `RESULT-critic5.md` §4.3, ctrlB 0.17, ctrlA 0.72 including its 84.4→82.5 fleck.

**Staging gate passes on all four arms** (real, not nominal — the staging guard is live):
`sly_body` visible, `cast: true`, `culled: false`, skinned, `inC0: true`, world (0.26, 0.89,
30.02), `footY −0.003` (i.e. in contact — §7's 15.5 cm penetration is NOT happening in this
pose), screen bbox overlaps the sampled columns. Boot-run warnings: one texture-prewarm notice,
**no `setShot` warning**. The bbox bottom reads y=779 on a 720-px frame; that is the projected
3D box overshooting, and the boots are visibly in frame at y≈540–630 — checked by eye, not
assumed.

**Sole re-located on this run's own baseline** as the seal requires: (617, 637) by crop-and-eye,
which is critic5's (617, 638). The baseline column is flat exactly as critic5's was.

## 1. THE APPLIED STATE WAS NOT THE REQUESTED STATE — `minbias` never reached c0

The seal required reading back the *live* `normalBias` rather than assuming it, and that is what
caught this. `TUNE.normalBiasClamp = [0.012, 1.4]` floors the value:

| arm | requested `nbt` | c0 `normalBias` | c0 pcf | c1 | c2 | predicted lateral (bias+PCF) |
|---|---|---|---|---|---|---|
| base | 1.7 | 0.01785 | 2.4 | 0.04897 | 0.25013 | 11.23 cm |
| lowbias | 0.5 | **0.012 (clamped)** | 1.0 | 0.0144 | 0.07357 | 5.87 cm |
| minbias | 0.1 | **0.012 (clamped)** | 1.0 | 0.012 | 0.01471 | 5.87 cm |
| back | 1.7 | 0.01785 | 2.4 | 0.04897 | 0.25013 | 11.23 cm |

`0.0105 × 0.5 = 0.00525` and `0.0105 × 0.1 = 0.00105` both floor to 0.012, so **on c0 the two
treated arms are the same state**, and the near-zero extreme was never applied to the cascade
the contact shadow lives in. The frames confirm it independently: `lowbias` vs `minbias` differ
by 563 px (0.06%), all of it in c1/c2 territory where the clamp did bite (c1 0.0144 vs 0.012,
c2 0.07357 vs 0.01471) — and **0 px** in the under-boot box.

**Consequence, stated plainly: the seal's "minbias makes a null decisive" leg is VOID.** What
was actually tested on c0 is 11.23 cm → 5.87 cm of predicted displacement (a 5.36 cm / ≈15 px
reduction at this framing's ~278 px/m). The untested remainder is 0.012 → 0, worth a further
≈3.1 cm (≈8.7 px). This is a real limit on the strength of the null and it is not repairable by
re-reading these frames.

## 2. Band 1 — CONTACT: **FLAT**, and stronger than the threshold language allows

`ΔL_contact = 0.00 L at every d` for both treated arms. Controls move **0.0 L** (< 3.0 required).

The reason it is stronger than "below threshold": the under-boot sample box is **pixel-identical**
across arms, verified independently of `m12.mjs` — 754/754 identical px between `base` and
`lowbias`, and **754/754 identical to the critic5 frame itself**. Not "a small change"; no change.

That null is not the knob being dead. The same toggle moved **18,299 px (1.99%)** elsewhere in
the frame, concentrated on the mid-ground floor and kerb boundaries — the knob is demonstrably
live and demonstrably moves shadow boundaries; **zero of that movement is under the boot.**

Supporting geometry, which explains the null rather than excusing it: sun dir (−0.927, 0.358,
−0.109) at 20.97°, so light travels ≈+x with a 1.8 m figure throwing ≈4.7 m of shadow almost
horizontally, sideways in screen space. M12 samples a fixed 13-px column *straight down* from the
sole. So the sampled region contains no cast shadow in **any** arm — which is consistent with the
contact darkening being absent rather than displaced.

**Verdict: FLAT / UPSTREAM.** Per the seal addendum this licenses exactly one sentence and no
more: **lateral displacement is not the cause.** It does **not** close critic finding #3, it does
not transfer ownership, and it must not be merged with SHADING's AO ceiling into a single story.
A dedicated contact term is still owed; the AO knobs are proven dead as levers for it (+0.6 L at
maximum); and my displacement hypothesis is now eliminated over the range tested, with the
0.012→0 remainder untested for the clamp reason above.

## 3. Band 2 — ACNE: **FAIL as sealed**, and the failure is my threshold, not acne

| ROI | darkened >12 L | area test (<1.0%) | in comps ≤8 px (<50%) | verdict |
|---|---|---|---|---|
| R1 litwall (950,60,300×380) | 143 px | **0.125% PASS** | 16.1% PASS | PASS |
| R2 litfloor (770,480,200×120) | 624 px | **2.600% FAIL** | 11.5% PASS | **FAIL** |

Identical for `lowbias` and `minbias` (same c0/c1 state in R2's depth range).

The seal says "either threshold breached" = FAIL, so **Band 2 is scored FAIL** and I am not
reinterpreting it into a pass. But the diagnosis matters for whoever sets the next threshold:
`fx16-r2.png` (4×, opened) shows the darkening is a **coherent shift of the kerb's shadow
boundary onto the sunlit slab** — the shadow reattaching toward its caster as bias falls, which
is the intended effect of the knob — not speckle on lit faces. The component test, which exists
precisely to separate those two mechanisms, agrees: 88.5% of darkened px lie in components >8 px.

**The flaw is mine and it is structural:** I specified R2 as "sunlit floor band with **one shadow
boundary**" and then applied a 1.0%-of-ROI area threshold to it. A boundary shift necessarily
darkens a band, so that ROI could fail on area for a correct fix. R1 — specified as the "ideal
acne canvas", large flat sunlit masonry with no boundary — is the one that answers the acne
question, and it passes both parts cleanly. A future version should apply the area test only to
boundary-free ROIs and score boundary ROIs on the component split alone.

**Nothing is shippable here regardless**: Band 1 is FLAT, so there is no contact win to bank or
to trade against an acne result.

## 4. Controls

`base` vs `back`: **BYTE-IDENTICAL** (`cmp` clean). The restore leg is exact, so the toggle path
is clean and §35's cross-boot nondeterminism did not touch this run.

## 5. The `S` floor re-statement is NOT deliverable from these frames — probe gap, disclosed

fx16's probe carries `time, frame, body, cascades, nbt, sun, predict` and **no cache fields**:
`cache.statics`, `trackedTris` and the biggest-statics list were in **fx15's** probe, not this
one. I built fx16's probe around the grounding gate and did not carry the cache block over, so
the post-§39 runtime static picture did **not** arrive free with these frames.

Standing position is therefore unchanged and unembellished: the headless census cannot see the
`Bag` fix (it never builds Props — 81.16% → 81.11%, −0.04 pp, architecture-side drift only), and
`S` remains an **architecture-only floor, now understated by more** than before because the
colossi and sphinx avenue have moved off the world origin out across the level. Re-stating it
costs one probe block on the next capture that boots — mine or anyone's — and no dedicated run.
