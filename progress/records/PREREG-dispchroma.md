# PREREG-dispchroma — a subject chroma hold AFTER the tonemap, and a registered prediction that it FAILS

**Lane:** POSTFX. **Date sealed:** 2026-08-15.
**Ancestry:** §277 → §312 → lithold (VOID) → litbleach (VOID) → litbleach2 (valid, DO NOT SHIP,
§332) → **§333** (the re-route: the bleach is produced by the display transform) →
`NOTE-postfx-route.md`. Critic r13's **#1** ranked problem.

**Status: REGISTERED before any capture.** `progress/records/dispchroma1/` does not exist at this
sha. **Frame count: 9** — traversal {off, on, ko, back, msk} + sly-key {off, on, ko, back},
2 chunks, warm-up 2 discarded renders each (§331).

**Mechanism already landed INERT** at `TUNE.dispChromaHold: 0.0` (8acd7f3), branch untaken,
8 pin tests, suite 549. No further `src` change is proposed by this seal except, on a PASS, moving
that one constant off 0.

## 1. What is being tested

```glsl
c = clamp( mix( vec3( slyLuma( c ) ), c, 1.0 + uDispChromaHold * subj ), 0.0, 1.0 );
```
applied **after `slyLinearToSrgb`**, subject-scoped by ledger #31's mask. §333 measured the
costume leaving the shader at linear chroma **0.873** (albedo 0.990) and arriving at display
**0.205** — AgX removes 76.5%. Three seals aimed in-shader levers at that and could not have
worked. This sits downstream of the transform, where the loss happens.

## 2. Doses DERIVED, not guessed — and a correction to my own arithmetic

I previously asserted that `mix(vec3(l), c, 1+k)` scales chroma by `(1+k)`, so `k ≈ 1.05` would
reach 0.42. **That is wrong.** With `s = 1+k`:

```
S' = s·(max − min) / ( l + s·(max − l) )
```

The denominator grows with `s` too, so `S'` is strictly sub-linear in `s`. Applying the **shipped
arithmetic offline to the captured display frame** (`litbleach2/traversal.off.png`, the same
bright-half pixel set the statistic uses, with the real `msk` arm as `subj`):

```
  k     S      H      L      clipped
  0.00  0.205  223.3  135.7   0.0%
  0.50  0.279  223.3  135.7   0.0%
  1.00  0.341  223.2  135.7   3.5%
  1.60  0.403  222.9  135.6   8.0%
  2.00  0.440  222.6  135.4  13.6%
  2.50  0.480  222.1  135.2  19.2%
  3.00  0.515  221.8  135.0  23.5%
```

**Sealed doses: `ON = 2.00`, `KO = 1.00`.** ON is the smallest round dose clearing `E_S ≥ 0.42`;
KO is roughly half, for the monotonicity bar.

*Caveat, disclosed:* this offline application acts on the **final** frame, whereas the shipped
branch runs immediately after the encode, **before** the silhouette rim, ink, vignette and dither.
It is a close approximation, not a substitute for the capture — which is why the capture happens.

## 3. What the same table already tells us, before any frame

- **Luminance is preserved**: 135.7 → 135.4 at ON. The luminance-exactness claim holds in practice,
  with the tiny residue coming from the clamp.
- **Hue barely moves**: 223.3° → 222.6°, i.e. ~9° from `REF_HUE` throughout. I called the hue bar
  "load-bearing" when arming this lane; on this evidence **it is not** — it will pass comfortably.
  Recorded because a bar I predicted would bind and then didn't is worth saying out loud.
- **Clipping is the real cost.** At the dose required to pass, **13.6%** of the measured costume
  pixels are driven to the gamut wall. Those pixels lose their shading information — which is
  precisely the "flat sticker" failure the §9 LOOK exists to catch, now with a number attached.

## 4. Statistic, rects, arms

`S`/`H`/`L` over the **brightest half** of the rect, as PREREG-litbleach §3. `REF_HUE = 213.5°`.
`traversal [557,261,582,291]` (dose) · `sly-key [600,228,675,290]` (control).
Arms `off` (0.00) · `on` (2.00) · `ko` (1.00) · `back` (0.00) on both; `msk` on traversal.

**The cane is NOT masked** (`rimSkinExempt` boundary) and lies inside the traversal rect, so a
fraction of the measured pixels are unscoped by construction. `PF_MASK` reports the subject
fraction; the fold must read `E_S` in that light rather than treating the rect as pure costume.

## 5. PRE-FLIGHT — fail-closed

| gate | bar | on failure |
|---|---|---|
| `PF_COSTUME` | off-arm `\|H − 213.5°\| ≤ 30` on both shots | **VOID** |
| `PF_MASK` | ≥ 60% of traversal's rect is subject | **VOID** |
| `PF_STAGE` | `S(traversal) ≤ 0.30` ∧ `S(sly-key) ≥ 0.42` ∧ `S(sly-key) ≥ 2.0 × S(traversal)` | **VOID** |

## 6. VALIDITY

`R_<shot>` `diff(off, back) == 0 px` (achievable per §331's warm-up) · `V_ROWS` 9 ·
`V_CHUNKS` both present · `V_CHUNK_TREE` one `src` hash across both chunks.

## 7. ACCEPTANCE — at `ON = 2.00`

| bar | requirement |
|---|---|
| `E_S_traversal` | `S(on) ≥ 0.42` |
| `E_H_traversal` | `\|H(on) − 213.5°\| ≤ 25` |
| `LUM_traversal` | `\|L(on) − L(off)\| ≤ 3.0` — luminance-exact by construction; a failure here means the construction is wrong, which is itself a finding |
| `KO` | `S(off) < S(ko) < S(on)` strictly |
| **`CLIP_traversal`** | **≤ 10% of the measured pixels driven to the gamut wall** (any channel at 0 or 255 after the hold, having not been there before) |

`CLIP` is new and it is the bar this seal turns on. Its level is set from what §2.1's banded cel
shading requires — a costume whose bright half is >10% flat is no longer shaded there — and it is
set **knowing my offline prediction says the passing dose violates it**. It is not tuned to let
the candidate through, and it will not be moved afterwards (§141.1).

## 8. PROTECTION

| bar | requirement |
|---|---|
| `PROT_CTL` | `S(sly-key, on) ≥ 0.42` ∧ drift from off `≤ 0.06` |
| `PROT_ENV` | 0 px differing between `off` and `on` beyond the `msk` mask dilated 3 px |

`PROT_CTL` is honestly at risk: the control already sits at **0.516** and a subject-scoped
amplifier hits it too. The bar is **not** widened for that. `PROT_ENV` inherits litbleach2's
unresolved **1-px** leak as an open question, not a solved one.

## 9. BINDING LOOK

Open `traversal.on.png`. The costume must read blue **and keep its shading bands and its ink**.
A post-tonemap amplifier can produce a flat sticker or a neon decal; at 13.6% predicted clipping
this is a live risk, not a formality. **A LOOK failure is NO-SHIP at any passing `S`.**

## 10. REGISTERED FORECAST — I expect this to FAIL

**~70/30 that `CLIP_traversal` fails at the sealed dose**, from §2's own table: reaching
`E_S ≥ 0.42` needs `k ≈ 2.0`, which the offline model puts at 13.6% clipped against a 10% bar.
`PROT_CTL` is the second most likely failure. `E_S`, `E_H`, `LUM` and `KO` should all pass.

**Running a seal I expect to fail is deliberate.** The offline prediction is an approximation
(§2's caveat), and either outcome is worth the capture: a pass means the approximation was
pessimistic and the route is live; a fail closes "amplify in display space" **with measurements**
rather than leaving it as the untested obvious idea, and routes to the remaining option — that the
chroma must be preserved where headroom still exists, i.e. inside AgX's own shoulder rather than
after it.

## 11. Disposition

- All bars PASS **and** §9 LOOK ⇒ SHIP `dispChromaHold: 2.00`, citing RESULT-dispchroma.
- Any acceptance bar FAIL ⇒ **DO NOT SHIP**; `TUNE` untouched; route by which bar fell.
- Any pre-flight or validity gate FAIL ⇒ **VOID**; nothing claimed about the candidate.
- §141.1 absolute: no threshold here moves once a frame exists. A re-seal is a NEW file.
