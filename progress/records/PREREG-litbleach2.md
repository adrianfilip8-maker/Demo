# PREREG-litbleach2 — the subject keeps its blue, measured on pixels that are actually costume, on frames the renderer has settled

**Lane:** SHADING/character-colour. **Date sealed:** 2026-08-15.
**Ancestry:** §277 (filed) → §312 (driver is ADDITIVE, not the lit multiply) → PREREG-lithold
677b914 (VOID: runner staged the defect away) → §328 (that diagnosed by measurement) →
PREREG-litbleach 096d31e + AMENDMENT A1 (VOID: brackets) → §330, §331, `NOTE-litbleach2-aim.md`.
Critic r13's **#1 ranked problem**.

**Status: REGISTERED before any capture.** `progress/records/litbleach2/` does not exist at this
sha and no frame of any arm has been rendered.

**Frame count: 9** (§329.1) — `traversal` {off, on, ko, back, msk} + `sly-key` {off, on, ko,
back}. Chunked one shot per boot (~5 and ~4 frames), each well inside the observed container life.

---

## 0. What is carried over, what is new, and why this is a new file

§141.1 forbids editing a sealed file, so this is a new one. **Carried over untouched** — every
one of these either worked or was never the problem: the rects, doses 0.70/0.40, `E_S ≥ 0.42`,
`E_H` within 25° of 213.5°, `LUM ≤ 3.0`, `KO` strict, `PROT_CTL`, `PROT_ENV`, the §9 BINDING LOOK,
the live-settle-then-freeze staging, `PF_MASK`, and `PF_STAGE`.

**Three things are new**, each forced by a measurement rather than by taste:

1. **A warm-up of 2 discarded renders after staging** (§331).
2. **`PF_COSTUME`, a hard hue gate** — the instrument that caught the real defect in the last run.
3. **Combat is dropped from the roster**, with its reason recorded rather than papered over.

## 1. §331 — the warm-up, and why the 0-px bracket stays at 0

`convprobe` rendered one shot eight times with the lever pinned at 0 and nothing else touched:

```
  i    vs r0 (px / maxD)     vs previous (px / maxD)
  r1      1125 / 21              1125 / 21
  r2..r7  1125 / 21                 0 /  0      (r1..r7 all sha 75991b4ed9a49ab3)
```

**Exactly one render after staging is unconverged; every render after it is bit-exact.**
litbleach captured `off` as that first render and `back` as the fourth, so its bracket compared a
pre-convergence frame against a converged one — probe 1125 px / maxD 21 against litbleach's
measured 1120 px / maxD 21 on the same shot, with no candidate involved.

So the bracket bar is **not relaxed**. It stays at **0 px**, and the runner discards **2** renders
after staging before capturing anything. The measurement says 1 suffices; the second costs one
render per shot and buys margin against a shot that settles more slowly. **With the warm-up in
place, a bracket failure now means something real** — which is what a validity gate is for.

## 2. `PF_COSTUME` — the gate that would have saved the last run

litbleach's `PF_MASK` reported combat's rect at **99.6% subject** while its hue read **355.2°**.
99.6% *subject* is not 99.6% *costume*: a rect on face, gloves or trim is subject-masked, off-hue,
and low-chroma — and low albedo chroma **gates the hold off by design**
(`smoothstep(0, uShadowHoldKnee, albChroma)` exists precisely so white trim and the guards'
achromatic mannequins do not move). One cause, three symptoms, and a subject mask cannot see it.

| gate | bar | on failure |
|---|---|---|
| **PF_COSTUME** | off-arm `\|H − 213.5°\| ≤ 30` on **every** shot | **VOID** — the ROI is not on the costume |

Measured on litbleach's spent frames: traversal **223.3°** (Δ9.8) pass, sly-key **205.4°** (Δ8.1)
pass, combat **355.2°** (Δ141.7) fail. The two shots this seal keeps are the two that pass.

## 3. Why combat is NOT in this seal

Not for convenience — because **the statistic cannot see the costume there at any rect.** `S` is
defined over the *brightest half* of the ROI. In traversal and sly-key the costume is among the
brightest things present. In combat it is **in shadow**, and the bright pixels are warm ground,
fur and impact FX. The costume *is* in frame (1812 subject px within 30° of 213.5° at chroma
≥ 0.25, centroid 582,608), but scoring even its densest 40×40 window `[516,635,556,675]` returns
**S 0.579 at H 11.8°** — orange.

Combat therefore needs a **costume-masked** statistic — mean S over pixels selected by
subject ∧ hue ∧ chroma rather than by luminance — whose bands must be derived and sealed
separately. Inventing that instrument here, uncalibrated, is how a seal produces a confident
wrong answer. **It is routed, not abandoned.**

## 4. Statistic, rects, arms

`S` / `H` / `L` as in PREREG-litbleach §3: mean HSV saturation, chroma-weighted circular hue, and
mean Rec.709 luma over the **brightest half** of the rect. `REF_HUE = 213.5°`.

```
traversal  [557, 261, 582, 291]     dose shot
sly-key    [600, 228, 675, 290]     control
```

Arms: `off` (0.00) · `on` (0.70) · `ko` (0.40) · `back` (0.00) on both shots; `msk` additionally
on traversal (`debugTerm(1)`, R = vSlySkin) so `PF_MASK` and `PROT_ENV` are measured, not asserted.

## 5. PRE-FLIGHT — fail-closed, before any candidate acts

| gate | bar | on failure |
|---|---|---|
| `PF_COSTUME` | `\|H(off) − 213.5°\| ≤ 30` on traversal and sly-key | **VOID** |
| `PF_MASK` | ≥ 60% of traversal's rect is subject per `msk` | **VOID** |
| `PF_STAGE` | `S(traversal) ≤ 0.30` ∧ `S(sly-key) ≥ 0.42` ∧ `S(sly-key) ≥ 2.0 × S(traversal)` | **VOID** |

`PF_STAGE`'s combat clause is dropped with combat. The traversal and control bands are unchanged
and have now reproduced across **four** independent captures (r12, r13, litbleach: 0.205 and
0.516, to three decimals).

## 6. Validity

| gate | bar |
|---|---|
| `R_<shot>` | `diff(off, back) == 0 px` — achievable per §331's warm-up |
| `V_ROWS` | 9 rows |
| `V_CHUNKS` / `V_CHUNK_TREE` | both chunks present; one `src` hash across both |

## 7. ACCEPTANCE — dose 0.70

| bar | requirement |
|---|---|
| `E_S_traversal` | `S(on) ≥ 0.42` |
| `E_H_traversal` | `\|H(on) − 213.5°\| ≤ 25` |
| `LUM_traversal` | `\|L(on) − L(off)\| ≤ 3.0` — the lever is luminance-exact by construction |
| `KO` | `S(off) < S(ko) < S(on)` strictly |

## 8. PROTECTION

| bar | requirement |
|---|---|
| `PROT_CTL` | `S(sly-key, on) ≥ 0.42` ∧ drift from off `≤ 0.06` |
| `PROT_ENV` | 0 px differing between `off` and `on` beyond the traversal `msk` mask dilated 3 px |

## 9. BINDING LOOK

Open `traversal.on.png`. Sly must read unmistakably blue, nothing outside him may have moved, and
the costume must **keep its shading bands** — a flat blue silhouette FAILS at any passing `S`.
A LOOK failure is a NO-SHIP regardless of the table.

## 10. The registered thesis, and the prediction that makes it falsifiable

`NOTE-litbleach2-aim.md` argues the hold looked near-inert in litbleach because its own gate
declined: `slyLitH = hold · vSlySkin · smoothstep(0, uShadowHoldKnee, albChroma) · loss`, and a
low-albedo-chroma ROI drives that to ~0. It also retracts my earlier PostFX thesis:
`bloomSubjectCut` ships at 1.0 ("the character never feeds the pyramid") and the PostFX screen rim
was measured at 0.1/0.3/0.3 display units, so the two downstream legs are small or absent on the
character while spec and the surface rim are already inside `outgoingLight` where the hold sees
them.

**The falsifiable prediction:** traversal **passes** `PF_COSTUME` (223.3°), so its ROI is on real
costume with real albedo chroma and the gate should **engage**. If the hold still moves traversal
by only ~+0.010 there — the same near-null litbleach measured on a *mis-aimed* ROI — then **the
gate hypothesis is refuted**, and the next suspects in order are the `loss` term and the
downstream legs. Either outcome is a finding; neither is a bar to move.

**Forecast:** I expect `E_S_traversal` to be genuinely uncertain, ~50/50. litbleach's +0.010 was
measured on a correctly-aimed traversal ROI (223.3° passes the gate), which is *adverse* evidence
— but that run's brackets were invalid, so it settles nothing. I am not claiming the fix works;
I am claiming this is the first run able to tell.

## 11. Disposition

- Every bar PASS **and** the §9 LOOK ⇒ SHIP `subjLitHold: 0.70`, citing RESULT-litbleach2.
- Any acceptance bar FAIL ⇒ **DO NOT SHIP**, `TUNE` untouched, successor routed by which bar fell.
- Any pre-flight or validity gate FAIL ⇒ **VOID**; nothing claimed about the candidate.
- §141.1 absolute: no threshold here moves once a frame exists. A mis-aimed bar is a NO-SHIP with
  the mis-aim recorded, and a re-seal is a NEW file.
