# PREREG-pnight — drawing the line §133.2 left open

Registered by SHADING. Scores the one open item on the `compose1` seal: **P-night was registered
as an acceptance with no numeric threshold, and declined rather than scored.**

The original words are worth keeping because they are the reason this file exists:

> *"Choosing a line now that happens to clear is precisely the move §13 forbids."*

That refusal was correct. It was also incomplete: it left the impression that what P-night needs
is **a number**, and the request that came back — *"that line still needs drawing by someone who
is not looking at the number"* — inherits the same assumption. This file argues the assumption is
wrong, and that P-night has **two** defects of which the missing threshold is the lesser.

---

## 0. Disclosure, stated first because it constrains everything below

**I have read the measurement.** §133.2 is in the committed ledger — Δb−r **−0.0033** on a base of
+0.1605 (2.1 % warm-ward), Δluma +0.0004, 69.4 % anyCh, 4.09 % at sum4, localised to shaded
architecture. Reading it is unavoidable for anyone reconstructing this item from the ledger.

So I am exactly the contaminated party the request was trying to route around, and **I do not
assert a verdict.** What follows is a *procedure* whose free parameter is fixed before the numbers
it will be applied to exist. If the procedure is executed as written, my having read −0.0033
cannot reach the outcome — which is a stronger guarantee than handing the same broken check to an
uncontaminated person, because that person would still be picking an uncalibrated number.

---

## 1. The instrument is the larger defect, and it is independent of the threshold

P-night was scored as **frame-wide Δb−r**. Three things in the ledger say that statistic cannot
carry this acceptance:

- **§115.2 — frame-wide b−r cannot localise anything, and cannot see green at all.** §8's live
  residual is green-suppression. A statistic blind to green is being asked to protect a frame
  against a warm-ward drift whose ledger-recorded signature is *green becoming the darkest
  channel*.
- **§133.2's own result** localises the movement to **shaded architecture only** — moon, torch and
  the cool palette untouched. A frame-wide mean over a mostly-dark frame can only **dilute** a
  change confined to one population. The 2.1 % is not a measurement of the affected surfaces; it
  is that measurement divided by an unknown amount of unaffected frame.
- **The same run scored the day shots with a strictly better instrument.** `huescore.mjs` scores
  ROI populations (`archShade` / `archLit` / `sky`) and reports hue, saturation, R/G, B/max,
  per-channel means and G-darkest share **together**, precisely because §8's green-suppression and
  §3's blue inversion are the same trap from opposite sides and *either statistic alone calls the
  other one solved*.

> **The inversion is the finding.** `night` — the shot the acceptance itself calls the most
> fragile, the one the cool terms are *paid for* — was scored with the weakest instrument in the
> run, while the three shots least at risk got the strongest. That is backwards, and it is true
> regardless of where anyone puts the threshold.

**Correction to my own §133.2 wording.** I reported P-night as *"a gap in the seal, not a result."*
The gap is real but I named it wrongly: it is not only that the line was missing, it is that the
quantity the line would have been drawn on **is the wrong quantity**. A threshold on frame-wide
Δb−r would have been unjustified at any value.

---

## 2. Why "pick a number" cannot be answered as asked — §13

§13's rule, in its own words:

> *A metric that has never been shown to move on a state known to have the defect is not evidence
> about that defect, in either direction.*

**Δb−r on `night` has never been run across a known-bad night.** So it has no scale. A line at
1 %, at 5 % and at 20 % are equally arbitrary, and — this is the part that matters — a line chosen
now would be arbitrary *even if chosen by someone who had never seen −0.0033*. Uncontaminated
arbitrary is still arbitrary. §13's remedy is not a more disinterested chooser; it is a
**calibration**: run the metric across a state known to have the defect and publish the separation
next to the number.

That is the whole of what P-night is missing, and it is obtainable.

---

## 3. The registered procedure

### 3.1 Instrument

Score `night` with **`huescore.mjs` on `roi-night.json`** (`roigen.mjs night 4`), the same
instrument and the same populations the day shots were scored with. Frame-wide Δb−r is retained
and reported **only** as the continuity link to §133.2's published figure, and is explicitly not
the acceptance.

`roigen.mjs` derives `archShade` from the shot's **own** key direction (`tod`), not a fixed vector
— §8 records a band-crossing measurement that was 4.7× wrong for exactly that mistake, and `night`
is one of the two shots whose key sits in the opposite quadrant.

Carried forward unchanged: roigen's §11 gap. `archShade` means *"on an away-facing architecture
surface"*, **not** *"in shadow"* — no shadow map, no ink hull, no bloom bleed. It must not be
quoted as if it did.

### 3.2 Calibration arms — the known-bads

Both are live uniform/TUNE pokes in one boot, both on the warm/cool axis the acceptance is about,
and neither is nominated by eye:

| arm | poke | why this is a *known* bad |
|---|---|---|
| `rimfloor0` | `uniforms.uRimShadowFloorArch.value = 0` | `ToonMaterial.js:536` ships 0.55, and 0.55 is the documented **no-op**. The floor is what carries `night`'s shadow-side rim on architecture (`toon.glsl.js:731`, `mix(uRimShadowFloorArch, 0.55, vSlySkin)` — architecture only, character unaffected). Zeroing it attacks §7.3's *"no rim light separating silhouettes from the background"* directly. |
| `sbm040` | `shadowBounceMix` / `Lit` = 0.40 | The **same lever as the treatment**, at 4× §119.4's ledger ceiling of ~0.10. A state that violates an existing ledger line by four-fold is known-bad by the ledger's own commitment, not by my judgement. |

Plus the two controls the run cannot be read without: **`base`** and **`base2`** (must be
bit-identical, 0 px — §119.3's P1 discipline; a falsified fix and a dead fix are indistinguishable
without it), and **`sky`** as the population control that must not move.

**`rimfloor0` is known-bad by a seal that is not mine, which is the point.** `PREREG-kerb.md`
already registers a `night` arm on this exact lever, with **V3 — night whole-frame rim retention:
`[0.85,∞) pass` · `[0.70,0.85) marginal` · `[0,0.70) fail, arm dies`**, on the stated grounds that
*"the 0.55 floor is what night's rim buys; the shader comment is the contract"*. Floor **0 lies
below that seal's whole swept range** (its arms are 0.35 / 0.20 / 0.10) and zeroes the shadow-side
architecture rim outright, so it is a *registered* failing night state rather than one I nominated
— which is exactly the independence a calibration point needs. `toon.glsl.js:731` and its comment
confirm the scope: architecture only, character pinned at 0.55 by construction, and the floor
reaches the rim through `mix(rimShadeFloor, 1.0, sh)`, i.e. it bites on the **shadow side** — the
half of the frame `night` is made of.

Two consequences worth stating. This capture therefore also produces the night half of
PREREG-kerb's V3 for free, and **whichever seal reads these frames first must not quietly rescore
the other's question in its own statistic** — V3 is rim-pixel retention against `norim`, P-night is
`archShade` hue; §122.1 is the record of one run scored 1.86× apart by two instruments. And if
`rimfloor0` comes back *passing* V3's 0.85, then it is **not** a known-bad, the calibration in 3.3
has no valid unit, and P-night must be reported unscoreable rather than scored against it.

### 3.3 The line — fixed now, before the separations exist

Let `S = min(|Δhue(rimfloor0)|, |Δhue(sbm040)|)` on `archShade`, the **smaller** of the two
known-bad separations, i.e. the more conservative unit.

> **`night` PASSES P-night iff the composite arm's `archShade` hue shift is ≤ S / 5, warm-ward,
> AND `sky` does not move, AND the frame is looked at (P-frame).**

The fraction **1/5 is the single free parameter in this file and it is fixed here, before `S` is
known.** It is registered rather than derived, and that is the honest description of it. §133.1's
own lesson applies — *register the interval you would accept, not the value you expect* — and the
reason a tighter, cleverer-looking line is not offered is that a tighter band around a point
prediction is exactly what would have falsified a correct result last time.

**This is falsifiable in both directions**, which the original P-night was not:

- If `S` comes back **small** — the known-bads barely move `archShade` hue either — then the
  metric does not separate a broken night from a good one, **P-night is unscoreable in this
  statistic**, and that is a reportable result, not a pass. §13's outcome is on the table and must
  not be quietly converted into a pass by a permissive fraction.
- If the composite lands **above** S/5, night regressed, and per PREREG-compose1 A.4 that **voids
  the day arms regardless of what they showed** — including §133.1's 71/45/40, which would then be
  a result obtained at a cost the seal refuses.

### 3.4 What this does *not* settle

The ledger's **≤ 226° line is not transferable to `night` and is deliberately not used here.**
That line is for shadowed architecture under the *daylight* shadow light; `night` is moon- and
torch-lit. Applying it would be §8's category error — comparing a surface measurement against a
spec derived for a different light — which the ledger records having already cost a cycle when a
surface R/G of 1.468 was scored against a *light's* 0.667. The calibration in 3.2 exists precisely
because the day line cannot be borrowed.

---

## 4. Cost

`roigen.mjs night 4` is offline — no renderer, no capture lock. The capture is **one boot, five
arms, one shot**: `base`, `rimfloor0`, `sbm040`, `compose`, `base2`. It can ride any boot that is
already staging `night`.
