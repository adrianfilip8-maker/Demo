# RESULT-staging1 — VOID. The boot was not settled at arm 1, and the seal's own P-F4 caught it.

**VERDICT: VOID (P-F3 + P-F4). No ship, no revert, no verdict on the candidate.**
Nothing to revert — `src/core/Shots.js` was never written (see §1). A re-run is required and the
protocol fix is one line. The candidate's provisional signal is very strong and is reported in §5
**as a non-verdict**, clearly marked, because "the picture is obviously better" is not what this
seal registered and is not what it is allowed to conclude.

Frames: `progress/records/staging1/guard.{base,cand,kbover,restore}.png` (committed `5146a4c`).
Readback: `staging1/readback.json`. Scores: `staging1/score.json`. Runner: `staging1.mjs`.
Scorer: `staging1-score.mjs`. Seal: `PREREG-staging1.md`. Diagnosis: `NOTE-combatguard-staging.md`.

---

## 1. What was executed, and one deviation from the seal (declared)

The seal's §5 said one arm per boot with source edits to `src/core/Shots.js`, on the premise that
`SHOTS` was unreachable from the page. **That premise was wrong and I found it while wiring the
runner:** `Debug.setShot()` returns the live `SHOTS[name]` object (`Debug.js:78`, returned at
`:143`), and `applyShot()` re-reads `.pos`/`.target` on every call. So all four arms ran in **one
boot** by mutating that object — the same object, the same reader, the same code path a file edit
would exercise.

Consequences, all confirmed in the readback:

- **`srcTree` before `85bab2d30f5f7b59`, after `85bab2d30f5f7b59`, `same=true`.** §121.4's
  arms-differ-by-tree-state hazard is gone by construction. `src/**` was never written.
- No window in which a modified `Shots.js` sat on disk while other owners booted against it.
- `armTook=true` on all four arms — the camera is at the arm's value to <1e-4 in every case.

**The framing-invariance claim the seal made by construction is confirmed on real frames.** All
four arms:

| arm | camera pos | solved stand | feet px | head px |
|---|---|---|---|---|
| base | [-11.50, 2.6, 30.5] | (-15.4871, 0, 27.5446) | (843.9, 625.3) | (863.6, 244.3) |
| cand | [-13.25, 2.6, 30.5] | (-17.2371, 0, 27.5446) | (843.9, 625.3) | (863.6, 244.3) |
| kbover | [-15.50, 2.6, 30.5] | (-19.4871, 0, 27.5446) | (843.9, 625.3) | (863.6, 244.3) |
| restore | [-11.50, 2.6, 30.5] | (-15.4871, 0, 27.5446) | (843.9, 625.3) | (863.6, 244.3) |

The stand translates by exactly −1.75 and −4.00 m; the projected figure does not move by one
tenth of a pixel. `_solveShotPose` follows the lens exactly as the seal argued, and the shipped
stand `(-15.4871, 27.5446)` reproduces the value `fxcluster1/geocert.mjs` hardcodes
(`-15.487, 0, 27.545`) — a third independent derivation agreeing with two earlier ones.

**Scorer calibration (§122.1).** `staging1-score.mjs` is an independent JS reimplementation of the
Python scorer that produced the seal's anchors. It re-derives all ten anchors from the committed
`sbs3/guard.png` before scoring anything and hits every one (P1 15.89, P2 306, P3 89.56, P4 692,
P5 29.99, P6 23.19, cone-air 27.59, guard-mass 18.64, frame-NBC 38.49, pool 113.46). Two
implementations, two languages, no disagreement.

---

## 2. The falsifiers that fired

| falsifier | seal band | measured | consequence |
|---|---|---|---|
| **P-F3** base gate: guard-mass rect medL | [17.5, 19.8] | **31.41** | **capture VOID** |
| **P-F4** `restore` vs `base`, ΣRGB ≥ 4 | [0, 0] | **389,975 px (42.31%)**, maxΣ 504 | **every arm number in this boot void** |
| **P-F2** KBover must read P3 < 15 | < 15 | **28.58** | UNSCOREABLE |
| **P-F5** cand: connected NBC ≥5% touching an edge, not the residual corner | none | **two masses**, 6.96% and 6.79% | fired |
| P-F1 P6 (figure-rect medL) | [26, 70] | **23.36** | FAIL |
| P-F6 cand figure within ±12 px | 625 ± 12 / 244 ± 12 | 625.3 / 244.3 | **ok** |

**VOID takes precedence over all of it.** A void is not a soft fail: it means the boot did not
produce a comparison, so P6's failure and P-F2/P-F5 do not get to be verdicts either. They are
recorded because they tell the re-run what to change.

---

## 3. Diagnosis of the void: the first staged shot of the boot rendered unsettled

`base` was the first scored arm. It is the outlier on every axis:

| | base | cand | kbover | restore |
|---|---|---|---|---|
| wall-clock for the arm | **454 s** | 249 s | 226 s | 253 s |
| differing px vs committed `sbs3/guard.png` | **386,973 (41.99%)** | — | — | **25,285 (2.74%)** |

`restore` — same camera as `base`, captured 1,300 s later in the same boot — reproduces the
committed `sbs3` frame to **2.74%** (mean ΣRGB 0.57). `base` differs from it by **42%**. The
~200 extra seconds `base` spent is the signature of shader-program compilation and texture prewarm
still running while its frame was captured. My settle protocol (10 frozen frames + a throwaway
capture, banda1's voidA recipe) is sufficient for *subsequent* stages and **not** for the *first*
stage of a boot.

**Where the divergence sits, and why it still voids the run.** A 16×12 block map of `base` vs
`restore` puts the difference in the **lit left half and the upper right** — the sandstone wall,
the floor pool, the sky above the doorway. The *plinth* quantities are bit-stable:

| quantity | base | restore |
|---|---|---|
| dense-mass top row in the figure column | **306** | **306** |
| NBC px in the residual-corner bbox (1039,557,1279,719) | **35,718 (91.9%)** | **35,718 (91.9%)** |
| P1 / P2 / P3 | 15.88 / 306 / 89.84 | 15.99 / 306 / 89.56 |
| P4 / P5 / P6 | 771 / 30.99 / 23.25 | 795 / 30.92 / 23.19 |

So the six gated quantities agree between `base` and `restore` to about 1%, and it is tempting to
say the void does not touch the claim. **I am not saying that, and it would be wrong to.** P-F4
exists to establish that the boot was settled so that arm-to-arm differences are attributable to
the lever. It established the opposite. Narrowing a fired falsifier to the regions that happen not
to move — after seeing which regions moved — is the post-hoc scope cut the seal forbids in the same
sentence it forbids retuning. The run is void; the fix is cheap; re-run it.

---

## 4. What the re-run must change (four items, each caused by something measured above)

1. **A discarded preroll stage before the first scored arm.** Stage `guard`, settle, capture and
   **throw the frame away**, then begin `base`. This is the whole fix for P-F3/P-F4; the runner
   already has the code path.
2. **Retire P6, keep P4 and P5.** P6 (figure-rect medL, band [26,70]) read **23.36** on the
   candidate against 23.19 on `restore` — it barely moved, while P4 (warm-pixel count) moved
   **795 → 13,729** and P5 (warm medL) **30.92 → 37.31** on the same rect. My band was badly
   derived: I reasoned that unburying the guard replaces near-black plinth with guard body, but the
   plinth pixels there sit at medL ≈ 21 and the guard's ink outlines and shadowed flank sit at
   about the same value. The *median of the whole rect* was never going to move; the warm half is
   where the signal is, which is precisely why P4/P5 were registered alongside it. **P6 was the
   weakest of the three honesty gates and it deserves to fail.** It is retired in the successor,
   not re-banded, and its failure is recorded here rather than argued away.
3. **Replace the known-bad discriminator — the risk I registered materialised.** Seal §2.1 said in
   terms: *"Both predicates say 'dark and cool', not 'plinth'. They cannot, alone, distinguish
   'the wedge left' from 'the frame got brighter'."* KBover returned P3 = **28.58** against a
   required < 15, because at 4 m west the lower-right quadrant fills with **unlit courtyard floor**,
   which satisfies NBC exactly as the plinth does. A plinth-specific quantity that does separate the
   arms is measured above and is the successor's candidate (diagnostic only — it decides nothing
   here): **NBC share of the residual-corner bbox — base 91.9%, restore 91.9%, cand 33.4%,
   kbover 20.6%.** It must be calibrated against a known-bad before it is trusted.
4. **Re-form P-F5 as a depth test, not a connectivity test.** It fired on `cand` for two masses that
   inspection shows are *not* foreground occluders: `[815,0,1119,330]` is the dark doorway
   **behind** the guards, and `[413,573,1279,719]` is shadowed paving. The falsifier's intent was
   "a near-field replacement occluder"; its written form was "a big dark connected thing touching an
   edge", and a night frame has several of those by design. The successor should test the near
   field through the geometry model, not through NBC connectivity.

---

## 5. Provisional signal — NOT A VERDICT

Reported because the coordinator will want to know whether a re-run is worth the lock, and for no
other purpose. **These numbers come from a void boot and decide nothing.**

| quantity | base | **cand** | kbover | restore | sbs3 |
|---|---|---|---|---|---|
| P1 figure-column NOT-NBC % | 15.88 | **82.20** | 84.28 | 15.99 | 15.89 |
| P2 dense-mass top row | 306 | **668** | 672 | 306 | 306 |
| P3 lower-right-quadrant NBC % | 89.84 | **27.23** | 28.58 | 89.56 | 89.56 |
| P4 warm px in figure rect | 771 | **13,729** | 12,532 | 795 | 692 |
| P5 warm medL in figure rect | 30.99 | **37.31** | 35.19 | 30.92 | 29.99 |
| P6 figure-rect medL | 23.25 | **23.36** | 23.43 | 23.19 | 23.19 |
| warm px over the full figure column | 1,629 (3.3%) | **21,582 (43.6%)** | 22,362 | 2,137 (4.3%) | — |
| warm medL / p90 over that column | 32.27 / 38.35 | **36.96 / 70.03** | 37.33 / 67.88 | 31.03 / 39.90 | — |

The figure spans py 244…625. The dense-mass top row is **306 on both shipped-camera arms**
(occluding) and **668 on the candidate** (clear by 43 px below his boots). The guard's own warm
pixels go from 3.3% of his screen column to **43.6%**, at medL **36.96** — inside the 2004
comparand's 32.57–40.7 band, without one photon of new light. That is the NOTE §2.4 correction
arriving in delivered pixels: he was hidden, not dark.

**One model error to record against myself.** The seal predicted a residual dark corner of ~3.4% of
frame at bbox (1039,557)–(1279,719), kept deliberately so §7.3's "dark foreground framing element"
checkbox retained a tenant. The delivered candidate has **33.4%** NBC in that bbox against base's
91.9% — the plinth's real silhouette falls further short of my AABB model than the 8 cm I allowed
for. Foreground framing in the candidate is carried by the pale column at the left edge and the
shadowed paving, not by the plinth. Whether that satisfies §7.3 is a CRITIC judgement, not a
measurement, and the successor should stop trying to buy it with a corner of the occluder.

**Answering the earlier question directly:** the `base` arm is **not** a wedge-free guard frame
(dense-mass top 306, corner 91.9% NBC). `staging1/guard.cand.png` is the wedge-free frame.

---

## 6. §183 follow-through — the cone's −17.06 pp claim **inverts**

Asked: re-run `fxcluster1/geocert.mjs` against the CAND camera with `PLINTH_Y → 720`, and say
plainly whether −17.06 pp survives, is reduced, or inverts.

**It inverts.** Run on a scratchpad copy (FX's `geocert.json` was never overwritten), three
constants changed — `CAM.pos → [-13.25, 2.6, 30.5]`, `G → [-17.237, 0, 27.545]`,
`PLINTH_Y → 720`:

| quantity, `towardCamera` 0.35 → −0.20 | shipped cut (`PLINTH_Y 300`) | cut retired (`720`) |
|---|---|---|
| silhouette px scored | 6,092 → 6,117 (22.5% of the figure) | 27,122 → 23,879 (all of it) |
| **lit-facing fraction** | 0.7804 → 0.6098 = **−17.06 pp** | 0.4555 → 0.5050 = **+4.95 pp** |
| rim-facing fraction | — | 0.5922 → 0.5297 = −6.25 pp |
| **key-OR-rim fraction** | — | 0.9562 → 0.9285 = **−2.77 pp** |

**`PLINTH_Y → 720` is now justified by measurement, not by my model.** In the delivered candidate
frame the dense dark mass in the guard's own screen columns starts at py **668**, and his boots are
at py **625** — nothing occludes him, so there is no occlusion edge left to model. On the two
shipped-camera arms the same measurement returns **306**, which is within 6 px of the `PLINTH_Y =
300` FX derived independently from the a3/a4 frames.

And the translation is provably free: `project()` differences the camera position out, so
translating `CAM.pos` and `G` together changes nothing. Verified empirically — `diff` of the full
console output, shipped vs translated camera: **no differences**.

**Plain statement for the ship decision, which is yours.** The sole reason §179 holds the cone is a
−17.06 pp key-lit narrowing computed over 22.5% of the subject, that 22.5% being exactly the
head-and-shoulders sliver the plinth leaves visible — and it is the part of him turned most
directly into the key, so rotating the body away costs it disproportionately while the rest of the
figure gains. On the whole figure the same lever reads **+4.95 pp key, −6.25 pp rim, −2.77 pp for
the union**. The union is the quantity that decides whether a silhouette separates from its
background, and 2.77 pp is a small fraction of the 17 the hold was placed on.

Three caveats I will not let this be read without:

1. **This is contingent on the wedge actually going, and `staging1` is VOID.** The cone should be
   re-judged on a *scored* wedge-free frame, not on this one. The re-run is cheap.
2. `geocert` is a **geometric** certifier over an authored surface approximation — "how much of him
   faces the key", not "how bright is he". Nothing here is photometric.
3. The **−12.0% full-figure silhouette shrink** at `towardCamera −0.20` is real, unaddressed by any
   of this, and is a separate line item for whoever judges the cone. So is `ear separation −30.3%`.

For context, from the same committed certifier and unchanged by any of my work: the cone lever
takes the patrol pool's in-frame footprint from **7.7% → 29.2%** (fullThrow) and **16.0% → 54.2%**
(guaranteedFloor), against a §7.2 contract that names the patrol light cone as half of what this
shot proves. That is FX's number, not mine, and I cite it only so the trade is visible in one place.

---

## 7. Recommendation

1. **Re-run `staging1` with the preroll fix** (§4.1) under a successor seal that retires P6, swaps
   the known-bad discriminator, and re-forms P-F5 (§4.2–4.4). Same four arms, same lever, one boot,
   ~35 minutes including the queue. I have not written that seal, because writing it after seeing
   these numbers requires saying so in it — which I would.
2. **Do not ship the camera on this capture.** The signal is strong and the run is void; those are
   both true and only one of them is a verdict.
3. **Hold the cone until the re-run scores**, then judge it on the full-figure rows with `PLINTH_Y`
   retired. §179's ordering was right, for a stronger reason than it was chosen for.

---

## 8. Files (coordinator sweep list — no git run by this task)

- `progress/records/RESULT-staging1.md` (this file)
- `progress/records/ADDENDUM-conecert-denominator.md`
- `progress/records/staging1-score.mjs`, `progress/records/staging1.mjs`
- `progress/records/staging1/score.json` (written by this scoring run)
- already committed at `5146a4c`: `staging1/guard.{base,cand,kbover,restore}.png`,
  `staging1/readback.json`, `staging1/run.log`

Scratchpad only, never committed: `geocert-shipped.mjs`, `geocert-west175.mjs`,
`geocert-west175-nocut.mjs` and their outputs under
`/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/`.

**No `src/**` edits. No git. Lock taken and released by the runner's own `withGame` hold; the
in-page shot table was restored to `[-11.5, 2.6, 30.5]` / `[-17.0, 1.1, 28.0]` inside the hold.**
