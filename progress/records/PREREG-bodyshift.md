# PREREG-bodyshift — the render's per-shot hue offset, measured across the canonical set

Sealed **before** any capture. `shots/bodyshift/` does not exist at the time of writing.

This is the run `RESULT-bodyhue.md` §"Next" calls for. It is a **measurement with a registered
decision rule**, not a candidate A/B: there is no arm to ship and no lever this run may flip.
Its job is to decide, on numbers fixed in advance, whether D2 stays a texture problem or is
reclassified as a render defect.

---

## 1. The question

Run 4 (`RESULT-bodyhue.md`) established two things: an authored albedo rotation survives the
render to ~1° (P1), and the render adds a **per-shot** hue offset — `sly-closeup` −0.9°,
`sly-perch` −7.9°, a 7.0° spread across just two daylight shots. The open question is the size of
that spread across the full canonical set, because it decides whether *any* single costume hue can
land the costume inside the sealed reference band on all shots where the albedo governs.

## 2. Instrument — the one that finally worked, unchanged

Same-boot A/B via `mesh.userData.slySwapBodyTex` (shot staged once, `dt = 0`, arm A `raw`
rendered, in-page swap, arm B `fix` rendered). Mask `{ p : maxChannelDelta(A(p), B(p)) ≥ 18 }`
(PREREG-bodyhue3 §2, derived from the textures alone). **Circular median** hue over the mask
(PREREG-bodyhue4 §2). Nothing in `src/**` changes for this run.

New per-shot quantities, both defined here:

> **dS_A(s)** = circular difference `hueA(s) − H_A` · **dS_B(s)** = `hueB(s) − H_B`
>
> `H_A`, `H_B` are the circular medians of hue over the costume texels of `sly_body.png` and
> `sly_body_fix.png` (predicate exactly `tools/slybody.mjs`: hue 190–270°, sat > 0.15, opaque),
> recomputed by the scorer with the same `hueOf` used on frames. Prior linear-median values were
> 229.3° / 208.2°; the recomputed values are used whatever they are. **Every decision below
> depends only on differences and ranges of dS, which are invariant to H_A/H_B** — the constants
> exist for reporting continuity, and cannot be tuned into a verdict.
>
> **camDist(s)** = |camera world position − world position of the mesh carrying `slySwapBodyTex`|,
> read in-page at the staged frame. Recorded for P-M.

## 3. Shots, order, and loss handling

The canonical critic set (`tools/CRITIC.md`) plus the replication anchor, captured in this order,
in batches of two, each shot scored and appended to `shots/bodyshift/arms.json` the moment its
frames land:

1. `sly-closeup`, `sly-perch` — P-S anchors; if P-S fails the run stops here
2. `hero`, `courtyard` — the daylight wides dropped from runs 2–4
3. `combat`, `temple` — §231's magenta outliers; P-O
4. `night`, `traversal`
5. `guard`, `dunes`
6. `interior`

Fresh frames only; no re-scoring of run 4's PNGs. A container rebuild mid-run does not void
completed rows (each is scored from its own frames before the next boot); shots lost in flight
are re-captured fresh. `kaykit` and the non-canonical `sly-*` staging shots are out of scope.

## 4. Per-shot gates (each shot classified independently; none voids the run)

- **CAL-1 — scoreable coverage:** mask ≥ 0.15 % of the frame. Below → shot **UNSCOREABLE**
  (recorded, excluded). Expected for shots that do not frame the character.
- **CAL-2 — swap took:** `sha(A) ≠ sha(B)` and both modes echo. Failure → shot **VOID**.
- **CAL-R — arm agreement (new):** |dS_A(s) − dS_B(s)| ≤ **2.0°** (run 4 observed 0.2° and
  0.9°). The two arms are two textures through one render; if the render's offset is a property
  of the shot, both must report it. Failure → shot **NONLINEAR**: screen hue there is not
  tracking albedo hue (deep shadow, additive FX), so *no* albedo choice lands that shot
  predictably — in this engine or the reference. NONLINEAR shots are **excluded from D and
  reported**; they are outside a texture fix's reach *by construction*, which is not a defect
  (the reference's own shadow shots behave the same way).

## 5. The decision rule

Let **D = { dS_A(s) : s scoreable }** (CAL-1 ∧ CAL-2 ∧ CAL-R).

> **TEXTURE-VIABLE** iff circular range(D) ≤ **12.0°** with |D| ≥ 4.
> **RENDER-DEFECT** iff circular range(D) > 12.0° with |D| ≥ 4.
> **UNDERPOWERED** iff |D| < 4 — no decision, and the scope limit is the finding.

**Why 12.0° and why it is not tuned:** it is exactly the width of P2's sealed reference band
(213.5 ± 6.0°, verbatim through four seals). A single albedo hue `h` lands shot `s` at
`h + dS(s)`; all of D fits inside a 12.0°-wide band iff range(D) ≤ 12.0°, in which case
`h* = 213.5° − midrange(D)` centres every scoreable shot in the band.

**Disclosure, per §141.1:** two elements of D are already known — closeup −0.9°, perch −7.9°,
range 7.0°, *inside* the bar. The decision is therefore genuinely open: this run determines
whether the remaining canonical shots push the range past 12.0°. The bar predates this seal by
four documents and is not adjustable after data.

**What each verdict licenses** (and nothing more):
- TEXTURE-VIABLE → a *new* sealed A/B at `h* = 213.5° − midrange(D)`. This run ships nothing.
- RENDER-DEFECT → D2 is reclassified: the deliverable becomes identifying the render-side
  source of the per-shot offset (after §269/§271's fashion). `?body=fix` stays default-off.
- Either way `bodyMode()`'s default remains `'raw'`; only a future A/B PASS may flip it.

## 6. Registered predictions

### P-S — instrument stability (must hold; gate on the run)
Fresh captures reproduce run 4: dS_A(`sly-closeup`) ∈ **−0.9° ± 2.0°**, dS_A(`sly-perch`) ∈
**−7.9° ± 2.0°**. Either outside → the instrument is not stable across boots →
**run VOID for decision purposes** (rows reported, no verdict).

### P-M — mechanism probe (scored, not gating)
If the offset is aerial haze, it grows with distance. **Spearman ρ(dS_A, camDist) ≤ −0.6**
over scoreable shots (evaluable at |D| ≥ 4; else MECHANISM-UNEVALUATED). Refutation removes
haze as the leading account; it does not change §5's verdict.

### P-O — the §231 outliers (scored, not gating)
`temple` and `combat` each finish **UNSCOREABLE or NONLINEAR**. §231 explains their magenta
frame means as shadow domination; shadow-dominated costume pixels cannot track albedo hue, so
a *clean* score with a dS consistent with the daylight shots would weaken §231's account and
be reported as such.

## 7. The expected outcome, written down in advance

I expect **RENDER-DEFECT**. Two daylight shots already span 7.0° of the 12.0° allowance, and
the canonical set adds night, interior, and haze-heavy wides — lighting regimes far more varied
than the pair that produced the 7.0°. Recording that now so a TEXTURE-VIABLE outcome registers
as a genuine surprise deserving scrutiny, not as a quiet relief.
