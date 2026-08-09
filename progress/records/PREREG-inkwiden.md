# PREREG-inkwiden — give the ink a VALUE range without touching its hue

Registered **before** the candidate exists. Third document in the §270 lane, after
`PREREG-inkblack.md` (which of the two ink systems owns the black point) and `PREREG-inkfar.md`
(D10a). This one is about the fix.

---

## 1. What is actually wrong, restated from a matched instrument

`progress/records/inkspread.mjs` runs **one** ridge detector — same radius, same 0.04 margin —
over the reference and all ten r9 frames, so neither side inherits the other's calibration:

| | ink p10 | ink median | ink p90 | p90/p10 | frame min |
|---|---|---|---|---|---|
| REF-venice | **0.0474** | 0.1556 | 0.3588 | **7.57** | 0.0000 |
| ours (median of the 9 frames that pass the detector's own sanity check) | **0.0955** | 0.129–0.279 | — | **4.06** | 0.0146–0.0714 |

So the floor is lifted **2.01x** (not the ~3x that comes from comparing two detectors), the median
is genuinely fine, and **the missing quantity is RANGE** — we carry 54 % of the reference's ink
dynamic range.

And the cause is authored, in two constants (`progress/records/inkpredict.mjs`):

| | shade leg | sun leg | ramp span |
|---|---|---|---|
| HULL, scene-linear luma | 0.006566 | 0.006896 | **4.8 %** |
| CREASE, display luma | 0.0728 | 0.0767 | **5.0 %** |

`inkWarm #1a1210` is hue 12°, `inkCool #161022` is hue 260° (§105.2) — a real warm/violet split
at **the same value**. §2.1 asked for coloured ink and got coloured ink; what it did not ask for
is ink that never changes darkness. **Darkening the constant is therefore the wrong fix**: it
would move the floor and leave the range at 4.06.

## 2. Why this document is about the CREASE and not the hull

Derived, before any arm ran, and registered in `PREREG-inkblack.md` as PRED-5:

- The hull's authored endpoints come out of the validated grade chain at display **0.0375 /
  0.0445** — already at or below the reference's re-derived 0.0474 floor.
- The crease's endpoints are display-referred at **0.0767 / 0.0728**, and `inkStrength 0.95` can
  only raise a crease pixel off them.
- The measured ink p10 is **0.0955**.

0.0955 sits just above the crease floor and roughly 2.3x above the graded hull. The population a
ridge detector finds on the visible line is crease-owned. `PREREG-inkblack.md`'s P1 asks a
different question — who owns the darkest decile of the *union* mask — and may well answer "hull"
without contradicting any of this.

**If P1's numbers contradict the paragraph above, this document is withdrawn rather than
retrofitted.** Registered that way on purpose: the arms below are sized entirely on the crease
model, so a hull-owned black point would make them the wrong arms, not arms with the wrong
thresholds.

## 3. The candidate, sized by arithmetic

`scratchpad/creasemodel.mjs` reproduces `PostFX.js:1366-1379` with every constant **parsed out of
the file** rather than typed, so the model cannot drift from the shader:

```
line = edge.r * smoothstep( gateLo, gateHi, lum )
ink  = min( mix( uInkCool, uInkWarm, smoothstep( 0.12, 0.55, lum ) ), c )
c    = mix( c, ink, clamp( line, 0, 1 ) * uInkStrength )
```

Two terms, and the model says both are needed:

**T1 — the cool leg gets a value.** Scale `inkCool` uniformly so its display luma lands at
`0.80 x 0.0474 = 0.0379` — below the reference p10, because p10 has a tenth of the population
under it. That is a scale of **0.5206**, giving **`0x161022` → `0x0b0812`** (luma 0.0367). A
uniform scale of a display-referred hex scales luma by exactly that factor and moves hue by
**exactly zero**, so 260° survives intact. `inkWarm` is **not touched** — the lit-side line is not
the complaint, and moving it is how "reach black" turns into "flatten to grey".

**T2 — the dark gate stops erasing the ink where the reference's black lives.**
`smoothstep(0.05, 0.20, lum)` → `smoothstep(0.02, 0.10, lum)`. T1 alone is not enough and the
model says by how much: on a background of display luma 0.15 the fully-inked pixel goes
0.0957 → 0.0702 with T1 alone, and → 0.0429 with both. At 0.10 it is 0.0927 → 0.0844 → 0.0399.

Predicted, for a fully-inked pixel by the background it sits on:

| bg | shipped | candidate | Δ |
|---|---|---|---|
| 0.05 | 0.0500 | 0.0456 | −0.0044 |
| 0.10 | 0.0927 | 0.0399 | **−0.0528** |
| 0.15 | 0.0957 | 0.0429 | **−0.0528** |
| 0.30 | 0.0856 | 0.0643 | −0.0213 |
| 0.60 | 0.1029 | 0.1029 | **0.0000** |
| 0.80 | 0.1129 | 0.1129 | **0.0000** |

The zeros at the bright end are the point: this candidate is *only* able to move the dark end.

### The lever, and one thing not claimed

T2 lives in GLSL. Rather than editing the literal per arm, the pair is hoisted to
`TUNE.inkDarkGate = [0.05, 0.20]` behind a `uInkGate` uniform re-read every frame, so the shipped
default is the shipped behaviour and every arm below is a page-side poke (§186 — no source edit
while a capture runs). `uInkWarm` / `uInkCool` are set once at construction today
(`PostFX.js:1601`) and move into the per-frame copy for the same reason.

**Not claimed: bit-identity.** Substituting a uniform for a literal is *algebraically* identical
and the float32 values are the same, but constant folding is the compiler's business and this run
does not test it. The claim made is "same value, same expression", and no arm below depends on
byte equality with the previous build.

## 4. Arms

One boot per shot, `dt = 0`, 1280x720, all levers page-side.

| arm | `inkCool` | gate | purpose |
|---|---|---|---|
| `S-ship` | 0x161022 | 0.05, 0.20 | shipped |
| `T1-colour` | 0x0b0812 | 0.05, 0.20 | the colour alone |
| `T2-gate` | 0x161022 | 0.02, 0.10 | the gate alone |
| `W-both` | 0x0b0812 | 0.02, 0.10 | the candidate |
| `Z-noink` | — | `inkStrength = 0` | defines the mask |

`inkMask = { p : S != Z }` — the **shipped** crease pass's own pixels. Every statistic below is
read over that one fixed set in all four inked arms, for the reason `PREREG-inkblack.md` gives at
length: a candidate allowed to define its own population can improve its number by shrinking it.

### Frames, chosen by mechanism and fixed here

Five, and the reason for each is a property of the change rather than of any result:

- `interior` — the most coherent frame in the set (critic 9 §3) and the one with the largest warm
  shadow pools, so it has the most to lose from a mush regression.
- `night` — dayAmount 0, the most shadow-dominated frame, and therefore the **maximum** exposure
  to T2. If relaxing the dark gate breaks anything it breaks here first.
- `temple` — god rays, large dark architecture, and the frame whose darks critic 9 measured at
  2.86 % below L 0.15.
- `sly-closeup` — IQR 0.083, the tightest value band in the set and so the frame most at risk of
  the ink flattening rather than widening.
- `dunes` — the brightest frame, where the model predicts the candidate does **nearly nothing**.
  It is here as a specificity control, not as a pass.

## 5. Calibration, claims, falsifiers

### Calibration (MUST FIRE)

- **CAL-W1** `inkMask` is non-empty and covers 0.5 %..15 % of every frame.
- **CAL-W2** each of `T1-colour` and `T2-gate` changes at least one pixel: both levers are live.
  A candidate assembled from a dead lever is a candidate whose mechanism story is wrong.
- **CAL-W3** on `dunes`, `W-both` must change **less** of `inkMask` than on `night` — the
  specificity prediction, stated as a comparison so it cannot be satisfied by an arm that simply
  moves everything.

### Claims

- **W1 — the floor drops.** Over `inkMask`, p10 in `W-both` is **at least 0.030 L below** p10 in
  `S-ship`, on every one of the five frames.
  **FW1:** less than 0.015 L on any frame refutes the candidate as sized.
- **W2 — and the range WIDENS rather than the whole line darkening.** Over `inkMask`,
  `p90/p10` in `W-both` is **greater** than in `S-ship` on every frame, **and** p90 drops by no
  more than **0.010 L**.
  **FW2:** a p90 drop beyond 0.010 L means the lit-side line came down too and the ink is being
  flattened, not widened — which is precisely the design constraint this lane was given, and it
  refutes the candidate even if W1 passes.
- **W3 — no mush.** The *additional* darkening (`S-ship` vs `W-both`, pixels darkened by >= 4 L)
  must stay line-shaped: **no single connected component covering more than 2 % of the frame**,
  and **median minimum-chord width <= 4 px**.
  **FW3:** either bound exceeded means T2 has reopened the failure the gate was written to
  prevent — "a single connected region covering 17 % of `courtyard`, darkened by a mean of 46
  luma, is a shading pass" (`PostFX.js:127-134`). 4 px is set from the line the game draws:
  `inkPixels(720)` is 1.67 px at this capture height, so 4 px is generous for a line and far
  under the 10 px median that diagnosed the original defect.

### Registered outcomes

`SHIP` (W1, W2, W3 all met) · `NARROW` (W1 and W3 met, W2 refuted — the ink darkened rather than
widened, and the candidate must not ship on the strength of its floor alone) · `MUSH` (W3
refuted — T2 is too wide; T1 may still be reportable on its own arm) · `FAIL` (W1 refuted) ·
`VOID` (any calibration null).

The per-term arms exist so that a partial result is still actionable: if `T1-colour` meets W1 and
W3 by itself, it ships alone and T2 is dropped.

### Not being tested here

The hull. Whatever `PREREG-inkblack.md`'s P2 returns about the hull's authored colour is a
separate change with a separate verdict; the graded hull already sits at 0.0375/0.0445 and is not
what any arm here moves. Also not tested: whether the reference's ink distribution is the right
target at all. It is the target this project has chosen, and `inkspread.mjs` measures it — it does
not justify it.
