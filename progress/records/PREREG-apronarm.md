# PREREG — the apron toggle: one variable, and what each outcome licenses

**Written before any frame of this arm exists, and before `shots/propshull/guard-base.png` was
opened.** The runner is `progress/records/apronarm.mjs`. Every threshold below is duplicated in
that file's `ACC` block so the two cannot drift; if they ever disagree, the file is wrong and this
document is the record.

Requested by the coordinator, in these terms: *"draft it now with the arm set and the acceptance
fixed, and leave the ROI coordinates as the one thing you fill in once `guard-base` exists — that
way the seal is registered before you see a pixel, and the only thing the frames change is where
you point it."*

This supersedes nothing in `PREREG-kerbnull.md`. That document registered what a **`kerbline` null
on a single frame** licenses; this one registers a **two-arm counterfactual**, which is a different
instrument answering a narrower question, and the difference in what they license is the whole
reason to spend a boot on it.

---

## 1. The variable — and it is the only one

`src/world/EgyptLevel.js`, `courtyard()`: the stylobate apron, three chamfered volumes round the
court perimeter, top face at **y = −0.07**. It shipped at **+0.02** until an earlier session sank it
9 cm on the reasoning recorded at the site: proud of the paving, its chamfered inner arris runs the
whole perimeter as an up-facing sliver, and an up-facing sliver at ndl ≈ 0.62 under a 40° moon is
what a bright contact line is made of. §137 records that this fix **has never been seen in a frame**.

| | `lo` | `hi` | `lo2` |
|---|---|---|---|
| apron top y | −0.07 (shipped) | **+0.02** (counterfactual) | −0.07 |
| everything else | fixed | fixed | fixed |

Fixed means: same boot, same `guard` camera as shipped, `dt` pinned to 0 on every step, same
quality, same materials, no hull toggle, no light change, no pose change. `lo2` is a duplicate of
`lo`, not a second variable — it is the validity gate, and it is the only thing that makes a
difference between `lo` and `hi` attributable to the apron rather than to the boot.

**The move is rigid.** Every apron vertex translates by `dy = +0.09` as a body; the box is not
stretched back to its historical (−1.50 … +0.02) extents. The reason is not convenience:

- A rigid translation leaves **every normal bit-identical**. A stretch moves the chamfer normals as
  well as the positions, and the arm would then confound *"the arris is higher"* with *"the arris
  faces somewhere else"* — two mechanisms on one knob, which is the failure this run exists to avoid.
- What it costs: the apron's bottom edge sits at −1.41 instead of −1.50. That edge is 1.4 m below the
  contact, buried in TERRAIN's sand and behind the paving, and cannot reach the scored ROI.

So the `hi` arm reproduces the pre-fix **arris** exactly and the pre-fix **box** approximately. The
arris is the mechanism under test. Stated here rather than left to be discovered in the diff.

**Selection is proved, not assumed.** The apron is merged into `arch:court:sandstone_worn` with the
drifts, stairs and rolls. The runner selects by geometry (below the paving plane, in the perimeter
frame band), then checks the selected bbox against the apron's nominal extents and **aborts** if it
is catching anything else. Each arm re-reports the measured apron top, so an arm cannot silently
fail to apply.

---

## 2. Scope — what this arm is not

It tests the apron **at the `guard` camera**. The same arris runs the whole court perimeter and is
in frame in `hero`, `courtyard` and `night` as well. Nothing here licenses a claim about those
frames, in either direction.

---

## 3. The confound, carried forward and decided now

§152.3, restated: `kerbline.mjs` requires a **thin** run — a local vertical maximum sampled at ±2 px,
≥12 px of horizontal continuity, blue-dominant. On the shipped `guard` camera the plinth deck band
projects **239–265 px** wide, and a 240-px band has no local maximum in its interior. So if the apron
toggle changed the band's **width** rather than its presence, `kerbline` would report a null **for
the wrong reason**, and that null would be mistaken for the informative one.

**Decision, made before the run: `kerbline` does not score this arm.** It is still run over all three
arm frames and its output recorded, because it is the pass-2 signature of record — but it does not
carry the verdict. The verdict rests on:

- **S3 — the arm-difference map** over the ROI: pixels where `|ΔL| ≥ 8` between `lo` and `hi`. This
  is the statistic that is immune by construction: it makes no assumption about the artefact's shape
  at all. A band that appears, a band that widens and a band that brightens all move pixels; a band
  that does nothing moves none. With one variable, every moved pixel is downstream of the apron.
- **S1 — cyan-excess area** over the ROI: pixels that are blue-dominant (`B − R ≥ 12`) and brighter
  than the **frame's** median luma by ≥10. Area, not run length: a 2 px sliver and a 240 px band both
  register, the band simply registers more.
- **S2 — the profile** in `d = y − arris y`, averaged across x. **Reported, not gated.** A band that
  widens shows here as a broadened hump rather than a disappearance, which is what makes it worth
  printing; but see §4 for why it is not allowed near the acceptance rule.

### 3.1 The instrument failed its own control first, and that is recorded here

S1 was first written against **the ROI's own median**. Its selftest — a synthetic 2 px sliver and a
synthetic 240 px band, both required to register — failed immediately on the band: at 240 px the
artefact fills an 81-px-tall ROI, becomes its own reference, and S1 returned **0**. That is
`kerbline`'s confound reproduced one level up, inside the instrument built to avoid it, and it would
have produced a confident null.

The reference is now the frame median. Post-fix selftest, which is what the runner prints on every
invocation:

```
none (control)  S1 area       0 px  not seen ok   |  thin-line predicate:      0 px blind
2 px sliver     S1 area    2420 px  SEEN     ok   |  thin-line predicate:   2420 px fires
240 px band     S1 area   98010 px  SEEN     ok   |  thin-line predicate:      0 px blind
```

The right-hand column is `kerbline`'s predicate on the identical images. **The confound is now
demonstrated by the instrument on every run rather than asserted in prose**, and the blank control
shows S1 is not merely counting everything.

---

## 4. Acceptance — fixed, and one gate deliberately rejected

| outcome | rule |
|---|---|
| **VOID** | `lo` vs `lo2` moves > 0.05 % of frame pixels at `|ΔL| ≥ 2`, **or** any ROI pixel moves > 2 L. Also void if the selftest fails or the apron selection bbox misses its nominal extents. |
| **HIT** | S3 ROI moved ≥ **200** px **and** S1(hi) − S1(lo) ≥ **+150** px |
| **NULL** | S3 ROI moved < **50** px **and** \|S1(hi) − S1(lo)\| < **50** px |
| **AMBIGUOUS** | anything else — reported as ambiguous, not rounded toward either reading |

The S1 term is **signed**. The mechanism predicts a proud apron *adds* bright cyan arris; an
equal-sized *drop* is a different phenomenon and must not read as a hit.

**A third gate was drafted and rejected before the run:** *"the peak of the S2 profile difference lies
within 12 px of the arris."* It assumes the effect is narrow — which is precisely the assumption that
makes `kerbline` blind to a wide band. Carrying it into the acceptance would re-import the confound
as a **false negative**, after going to the trouble of building instruments that avoid it. S2 is
printed; it is not in the rule.

**And that rejection is now measured, not argued.** The scoring path was exercised offline on
synthetic arm frames covering all three verdicts (`null`, `hit`, `void` — the generator is in the
session scratchpad; it is a test fixture, not a result). On the synthetic **HIT** — a 240 px cyan band
present in `hi` and absent in `lo`, 96,801 ROI pixels moved, S1 delta +98,010 — the S2 profile peak
landed at **d = −40 px**, the far edge of the swath. The rejected gate would have demanded
\|d\| ≤ 12 and **downgraded an unambiguous hit to AMBIGUOUS**. A wide effect has no narrow peak; that
is what "width-blind" has to mean all the way through the rule, not just in the statistic.

---

## 5. What each outcome licenses — written before the frames

The three candidates are as `kerbline.mjs`'s header states them: **1** the apron (mine), **2** the
`guard` camera in `Shots.js` (not mine), **3** `uRimShadowFloorArch` in `toon.glsl.js` (SHADING's).

### HIT
*A 9 cm apron displacement produces the bright-cyan contact class at the arris, at this camera.*
Candidate 1 is **attributed** for this frame — which is more than §137 ever had, since §137 records a
mechanism and a clearance and no frame at all.

It does **not** follow that candidate 2 is wrong. §152.1's matched retrodiction (plinth NW corner
predicted at y 255 by independent projection, artefact measured at 260) stands on its own evidence,
and two mechanisms producing the same class in the same frame is an ordinary outcome, not a
contradiction. A hit licenses "the apron can produce it", not "the apron produced the pass-2 line".

### NULL — and this is a live outcome, not a disappointment
*A 9 cm apron displacement does not produce this class at this camera: **the apron was never this
symptom**.*

This is the outcome `PREREG-kerbnull.md` could not reach and this arm can, and the difference is
worth being precise about. A `kerbline` null on a single frame was uninformative because **every
candidate predicted it** — an outcome all hypotheses predict is evidence for none (§147.2). Here the
`hi` arm is a **counterfactual**: it puts the apron back. If the apron were the cause, `hi` must show
the artefact. So a null here bears specifically on candidate 1, and it bears against it.

What a null licenses:
- §137's item is **retired, not verified**: the apron fix corrected a real, measured defect (the
  clearance at §143.4 is not in doubt) that was **not this symptom**.
- The ledger entry for the `guard` cyan line stays **"symptom absent, cause attributed to candidate 2
  by §152.1 only"** — attributed by that retrodiction, *not* by this run.

What a null does **not** licence:
- Not "candidate 2 is proved". This arm cannot test candidate 2; it holds the camera fixed.
- Not "the apron is invisible" — see §2, and note the apron may still matter in `hero`/`courtyard`/`night`.
- Not "the artefact is gone from the frame" — that is `kerbline`'s question, and `kerbline` is not
  scoring here.

### BOTH ARMS CARRY THE ARTEFACT
S3 ROI moved is small **and** S1 is large in both arms: the class is present and the apron does not
control it. That reads as a null for candidate 1 **and** re-opens candidate 3, which is unchanged and
still live elsewhere (§24.3 measures its class at 1,704 px on `hero` on the current tree). Routed to
SHADING; not mine to test.

### VOID
The duplicate pair moved. The run says nothing about the apron or anything else, and no sentence from
any row above may be quoted. This has happened in this project before (§28: a gold-bloom sweep whose
DUPLICATE arm moved more pixels than its strongest real arm), which is why `lo2` is captured at all.

---

## 6. The one open value — the ROI

The **rule** is sealed here: the ROI is a swath of half-width **40 px** centred on the projected west
apron arris, which is the only place the manipulated geometry can appear.

The **coordinates** are an offline projection, not a measurement: three.js `PerspectiveCamera` +
`Vector3.project`, fov 38, 1280×720, the shipped `guard` camera `(−11.5, 2.60, 30.5)`, against the
arris `x = −26, y = −0.07, z ∈ [10, 32]` — endpoints **px (1250, 233) → (41, 324)** (§152.C).

`apronarm.mjs` holds `ROI.confirmed = false` and **refuses to capture** until it is set. The fill-in
procedure, fixed now:

1. Locate the apron arris in `shots/propshull/guard-base.png`.
2. If it lies within the pad of the projected line, set `confirmed = true` and record here that it did.
3. If it does not, amend **this document** with the measured line and why it moved, then set
   `confirmed = true`.

Editing the coordinates without recording the amendment would make this a post-hoc ROI wearing a
pre-registration's clothes, which is the failure the seal exists to prevent.

**Caveat, stated rather than buried** (§143.4 corrected me for exactly this substitution once): the
projection is against **nominal** extents, not built vertex positions. Corner jitter here is ±0.03 m
≈ 1 px at 12–17 m, well inside the 40 px pad — but it is a nominal, and it is labelled as one.
