# RESULT-linchroma — CONFIRMED. The costume leaves the shader blue; AgX and the grade take the blue out

Scored against `PREREG-linchroma.md` (e0f1f00). 4 frames, one chunk, no `src` change, all
force-added. Every validity gate passed.

```
V_ROWS  4 rows (want 4)                                        PASS
CAL  (64,128,191) over 62.1% of frame (want >= 5%)             PASS
R  off-vs-back 0 px (want 0)                                   PASS
CLIP 3.7% of measured px at 255 (want < 5%)                    PASS

measured px            : 375
DISPLAY chroma (off)   : 0.205   <- what litbleach2 measured as S
LINEAR chroma (raw)    : 0.873
albedo chroma (sealed) : 0.990
ratio linear/albedo    : 0.882
bands: CONFIRMED >= 0.792  ·  REFUTED <= 0.495

==> CONFIRMED
```

## 1. The result

**The costume pixel leaves the shader carrying 88.2% of its own albedo's chroma, and arrives on
screen at 0.205.** The display transform — AgX plus a grade carrying `saturation: 1.30` —
destroys **(0.873 − 0.205) / 0.873 = 76.5%** of the chroma that reached it.

The instrument proved itself in the same boot, as `PostFX.debugRaw`'s own documentation demands:
`CAL` reads `(64,128,191)` over **62.1%** of the frame against a 5% floor, so the bypass is a
bypass and the buffer is linear and undecoded. `R` holds at 0 px. `CLIP` sits at 3.7% under its
5% bar — and note the direction of that bias: clipped pixels read *lower* chroma, so the true
linear figure is if anything **higher** than 0.873. The result is not resting on the gate's edge.

## 2. What this settles — and it is not small

**§277/§312 re-routes from SHADING to POSTFX.** Three sealed attempts — lithold (VOID), litbleach
(VOID), litbleach2 (valid, DO NOT SHIP) — aimed in-shader levers at a defect that is not produced
in the shader. `subjLitHold` was never going to work: it measures chroma loss in linear, finds
almost none, and correctly declines. §332 already showed no legal dose reaches its bar; this
explains *why*, and closes the question rather than leaving it as an unexplained weakness.

It also puts **§312's central claim in question**. §312 concluded "the driver is ADDITIVE" from a
fit performed in display space. The additive legs are real, but this measurement shows the pixel
is still chromatic in linear *after* they land — so their contribution to the visible defect is
mediated by the transform, not by the addition itself. §312's mechanism was diagnosed in the wrong
space, which is the same error class as §326's calibration-vs-tree and my own model divergence.

## 3. Where my own numbers were wrong

`NOTE-linear-vs-display.md` inferred `loss ≈ 0.02` by inverting the captured effect through the
shader's arithmetic. The direct measurement gives `loss = 1 − 0.873/0.990 = **0.118**` — about
**6× larger** than I estimated. At dose 0.70 that puts `h ≈ 0.083`, against the model's 0.35.

**The conclusion held; the intermediate number did not.** The inference was directionally right
for the right reason — the linear pixel retains its chroma — but the specific figure was an
artefact of treating the measured display delta as if it mapped linearly back through AgX. Worth
recording because it is exactly the trap this whole arc has been falling into: reasoning across
the display transform as though it were transparent.

## 4. Forecast

§7 registered **~75/25 CONFIRMED**. It confirmed. The prediction was the expected outcome and the
credit is correspondingly modest — the value was in sealing the refutation band beforehand, so
that a low reading would have forced me to abandon a conclusion I had already written up.

## 5. Routing — and the thing NOT to do

The obvious next move is to reach for the grade's `saturation: 1.30`. **§7 of the seal forbade
that in advance, and the measurement does not change it:**

- The grade is **shared by every shot**. `saturation` is a whole-look control, not a character
  fix. Moving it changes temple, courtyard, dunes, night and every other frame at once.
- Any seal touching it therefore needs a **blind critic round as its LOOK gate**, not a rect —
  with explicit protections on the shots that currently read best (r13: sly-profile 6,
  courtyard 6, temple 6).
- A subject-scoped alternative may exist in PostFX — the character mask that `bloomSubjectCut`
  already consumes (normal prepass alpha = 1 − vSlySkin) is available at composite time, so a
  *subject-scoped* saturation hold is formulable without touching the global grade. That is the
  first candidate to seal, precisely because it does not put the whole look at risk.

Nothing in `src` moves on this result. This was a measurement seal and it proposed no candidate.

## Disposition

- **CONFIRMED**; §277/§312 re-routes SHADING → POSTFX.
- `subjLitHold` stays 0.0 and is closed as the wrong lever, with the reason now known.
- Successor: a POSTFX seal on a **subject-scoped** chroma hold at composite time, using the
  existing character mask; global `saturation` only behind a blind round.
- §312's additive diagnosis is flagged for revision — its fit was performed in display space.
