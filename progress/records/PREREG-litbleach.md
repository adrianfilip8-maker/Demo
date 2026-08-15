# PREREG-litbleach — the subject keeps its blue in the ACTION frames, tested on staging that actually contains the defect

**Lane:** SHADING/character-colour. **Date sealed:** 2026-08-15.
**Ancestry:** §277 (filed) → §312 (re-diagnosed: the driver is ADDITIVE, not the lit-band
multiply) → PREREG-lithold 677b914 (sealed correctly, VOIDed on its own staging gate) → §326
(my mis-reading of that VOID) → §328 (the mis-reading corrected by measurement, and the rule
this seal exists to obey). This is critic r13's **#1 ranked problem**.

**Status: REGISTERED before any capture.** `progress/records/litbleach1/` does not exist at the
time of writing and no frame of any arm has been rendered. Runner (`litbleach.mjs`) and scorer
(`litbleach-score.mjs`) are committed with this file, before the capture.

**Frame count: 14** (§329.1 requires this stated out loud — 3 shots × 4 arms + 2 mask arms).
At the guardcone-measured 3.1 min/frame that is **~45 min including boot**, which fits inside
every container life observed on 2026-08-15 except the shortest. This seal is deliberately small
because §329 measured that long captures no longer complete here.

---

## 0. Why this is a new seal and not a re-run

§141.1 says a VOID is re-run, not re-tuned. This is neither: **the bars and the calibration are
carried over unchanged, and the RUNNER is replaced.** §328 established by measurement that
lithold's bars were correctly aimed and its calibration was correct — what failed was that its
runner staged Sly *out of* the defect. A re-run would reproduce that. So this is a new file with
the same numbers and a different staging path, which is exactly what §141.1 intends.

**Nothing about the mechanism changes.** `TUNE.subjLitHold` already ships INERT at 0.0 in HEAD
(pin test `tests/lithold.test.mjs`), operating on assembled `outgoingLight` — i.e. on the
additive legs §312 identified — vSlySkin-scoped, luminance-exact, with the endpoint being the
surface's own albedo hue. **The lever was never refuted; it was never tested.** No `src` change
is proposed by this seal beyond, on a PASS, moving that one constant off 0.

## 1. The diagnosed defect, and the number that is now stable

The costume renders orange-cream in the action frames while holding canonical blue in close-ups.
Measured with the statistic in §3, on roster captures, across two independent rounds:

| shot | r12 | r13 | agreement |
|---|---|---|---|
| traversal | 0.205 | **0.205** | 3 decimals |
| combat | 0.080 | **0.080** | 3 decimals |
| sly-key (control) | 0.516 | **0.516** | 3 decimals |

Blind confirmation, r13, independently sampled by the critic: traversal shirt **29°/0.23**
against canonical **214°/0.76** in `hero`; and it ranked this #1 of sixteen shots.

This is not a drifting or one-off calibration. It is a stable, twice-reproduced defect.

## 2. THE STAGING FIX — the whole point of this seal

§328's rule: *a seal's runner must be proven to REPRODUCE the defect before its bars are sealed.*
The cause of lithold's VOID is now identified precisely, and it is one argument:

- **The roster** (`tools/critic.mjs` → `harness.grab()`) calls `setShot(name, {})` with `dt`
  **undefined** — the documented "live-settle behaviour", where the staging path's own settle
  frames advance the world clock. The character comes to rest at a live animation phase and
  position.
- **lithold's runner** called `setShot(name, { dt: 0 })`, freezing the clock *through staging*.
  The character therefore rested at a different phase and position — and measured **0.678** where
  the roster measures 0.205.

Both are defensible in isolation; §195/§28 introduced `dt: 0` precisely so a within-boot A/B's
settle frames cannot move the world between arms. **The error was applying it to the STAGING as
well as to the ARMS.** This runner separates the two:

1. **Stage once, LIVE** — `setShot(name)` with `dt` undefined, byte-for-byte the roster's call,
   so the character lands where the defect actually occurs. Not captured.
2. **Freeze, then arm** — every arm thereafter pokes the uniform and renders with
   `step(2, 0)` + `renderFrame(0)`: dt 0, no clock advance, no re-stage. All arms of a shot
   render from **one frozen world state**.
3. **Prove it** — the per-shot `off`/`back` bracket must be **0 px**. That is what certifies the
   world did not move between arms, and it is a registered validity bar, not a hope.

This reconciles §195's discipline with §328's rule: roster-faithful staging, frozen A/B.

## 3. The statistic (unchanged from lithold, so the numbers above remain comparable)

`S(shot)` = mean HSV saturation over the **brightest half** of the registered rect.
`H(shot)` = chroma-weighted circular mean hue over the same pixels.
`L(shot)` = mean Rec.709 luma over the same pixels.

Registered rects, carried over unchanged (derived from r12, **validated against r13** — the
agreement table in §1 is that validation):

```
traversal  [557, 261, 582, 291]
combat     [520, 468, 566, 522]
sly-key    [600, 228, 675, 290]     (control)
```

`REF_HUE = 213.5°` (§277/§283, the authored costume hue; the torso islands of
`sly_body_fix.png` measure 218.2° over 146,505 texels).

## 4. Arms — 14 frames

| shot | arms |
|---|---|
| traversal | `off` (0.00) · `on` (0.70) · `ko` (0.40) · `back` (0.00) · `msk` |
| combat | `off` · `on` · `ko` · `back` · `msk` |
| sly-key | `off` · `on` · `ko` · `back` |

`msk` renders `shading.debugTerm(1)` with `postfx.debugRaw('scene')` — R = vSlySkin, the exact
subject mask — so PROT-ENV below is **measured, not asserted**.

## 5. PRE-FLIGHT — fail-closed, and it runs BEFORE any candidate acts

This is the §328 rule made mechanical. Both gates read the **`off`** arm only.

| gate | bar | on failure |
|---|---|---|
| **PF_MASK** | ≥ 60% of the traversal rect and ≥ 60% of the combat rect are subject pixels per the `msk` arm | **VOID** — the rect is not on Sly in this boot; no verdict either way |
| **PF_STAGE** | `S(traversal) ≤ 0.30` ∧ `S(combat) ≤ 0.18` ∧ `S(sly-key) ≥ 0.42` ∧ `S(sly-key) ≥ 2.0 × S(traversal)` | **VOID** — the staging does not contain the diagnosed defect |

A VOID here is a **successful diagnosis, not a failure**: it says the runner is still not
reproducing the roster, and the correct response is to fix the staging, never to move the bar.
`PF_MASK` is new relative to lithold and exists because a saturation gate alone cannot
distinguish "Sly is blue here" from "the rect missed Sly entirely" — my probe on the lithold
frames had to establish that separately, after the fact, via the `ko` arm.

## 6. Validity

| gate | bar |
|---|---|
| `R_<shot>` | `diff(off, back) == 0 px` for all three shots (§302 same-boot bracket) |
| `V_ROWS` | 14 rows present, no capture error |
| `V_TREE` | one `src` hash across the whole run |

## 7. ACCEPTANCE — the candidate at `subjLitHold = 0.70`

Every bar below is sealed now, before any frame exists. All are scored on the `on` arm against
the same boot's `off` arm.

| bar | requirement | why this number |
|---|---|---|
| `E1` | `S(traversal, on) ≥ 0.42` | must read blue again; the five close-up shots measure 0.54–0.79, and 0.42 is a floor short of full recovery |
| `E2` | `S(combat, on) ≥ 0.30` | combat starts far lower (0.080) and carries 4× traversal's achromatic add, so its floor is lower and honest |
| `E3` | `\|H(traversal, on) − 213.5°\| ≤ 25°` | it must come back to **blue**, not merely to saturated |
| `E4` | `\|H(combat, on) − 213.5°\| ≤ 25°` | as E3 |
| `LUM` | `\|L(on) − L(off)\| ≤ 3.0` on traversal and combat | the lever is luminance-exact **by construction**; this is the mechanism check that must hold, and its failure means the shader does not do what its contract says |
| `KO` | `S(traversal, off) < S(traversal, ko) < S(traversal, on)` | half dose must land strictly between — proves a dial, not a switch |

## 8. PROTECTION

| bar | requirement |
|---|---|
| `PROT_CTL` | `S(sly-key, on) ≥ 0.42` ∧ `\|S(sly-key, on) − S(sly-key, off)\| ≤ 0.06` — the already-blue control must not be pushed further; the lever gives back, it does not invent |
| `PROT_ENV` | pixels differing between `off` and `on` that lie **outside** the `msk` subject mask dilated by 3 px must be **0**, on traversal and combat |

## 9. BINDING LOOK

Numbers do not ship this alone. I must open `traversal.on.png` and `combat.on.png` and confirm
(a) Sly reads unmistakably blue, (b) nothing outside him has moved, (c) he has not turned into a
flat blue silhouette — the hold is a chroma restore, and a costume that loses its shading bands
fails this look even at a passing `S`. A LOOK failure is a **NO-SHIP** regardless of the table.

## 10. Registered forecast (falsifiable, recorded before frames exist)

I expect **E1 to pass and E2 to be the coin-flip**, at roughly 65/35. §312 measured traversal's
achromatic additive at ~0.135 scene-linear against combat's ~0.570 — combat is over four times
as contaminated, and lithold's own §PF4 disclosed the registered risk that **combat's wash is
partly composited AFTER the shader** (PostFX screen-rim and bloom) and therefore outside any
in-shader lever's reach. If that risk is real, `E2` fails while `E1` passes.

**An E1-pass / E2-fail split does NOT ship.** It is a partial result, it names PostFX as the
owner of combat's residue, and it routes there. No partial ships, no bar moved after the fact.

## 11. Disclosed before sealing: what a dry run on lithold's frames already shows

The scorer was smoke-tested against `progress/records/lithold1/`'s frames — the WRONG staging by
construction — before this seal was committed and before any frame of its own exists. Three
things came out of it, all recorded here so none of them can be presented as a discovery later.

**(a) The pre-flight works.** `PF_STAGE` FAILS on those frames (traversal 0.678 > 0.30) and every
acceptance row correctly goes VOID. `PF_MASK` PASSES (81.2% traversal, 94.8% combat), which is
the distinction it exists to draw: the rect *was* on Sly, Sly simply was not bleached there. A
saturation gate alone could not have told those two apart.

**(b) The mechanism behaves as its contract claims.** Poked to 0.70 on already-blue frames it is
luminance-exact (`|dL|` 0.02 traversal / 0.10 combat, against the sealed tolerance of 3.0),
monotonic in dose (0.678 → 0.687 → 0.694), hue-preserving (214.1°, 0.6° off REF_HUE), and moves
the control by 0.001. It adds only ~+0.016 where the costume is already blue — "it gives back, it
does not invent" is now measured rather than asserted. **None of this is evidence the fix works**:
those frames do not contain the defect, which is the whole reason they VOID.

**(c) A registered risk to `PROT_ENV`.** On those same frames the candidate moved **1 px** outside
the subject mask dilated by 3 px on combat (against 11,401 px inside it). One pixel, and I do not
yet know whether it is a genuine leak — subject bloom crossing the dilation boundary — or mask
edge quantisation.

**The bar stays at 0 and is not widened.** I am disclosing this rather than pre-emptively
softening it because §141.1 cuts both ways: a threshold may not be loosened after frames exist,
and inventing slack *before* they exist to dodge a failure I already expect is the same evasion
one step earlier. If `PROT_ENV` fails by a single pixel in the real run, that is a **real failure**
that blocks the ship and routes to a leak investigation — not a number to be adjusted.

## 12. Disposition rules

- Every bar PASS **and** the §9 LOOK ⇒ SHIP `subjLitHold: 0.70`, citing RESULT-litbleach.
- Any acceptance bar FAIL ⇒ **DO NOT SHIP**, `TUNE` untouched, successor routed by which bar fell.
- Any PRE-FLIGHT or validity gate FAIL ⇒ **VOID**: nothing is claimed about the candidate in
  either direction, and the staging is diagnosed from the readbacks.
- §141.1 absolute: no threshold in this file may be moved after a frame exists. A mis-aimed bar
  is a NO-SHIP with the mis-aim recorded, and a re-seal is a NEW file.
