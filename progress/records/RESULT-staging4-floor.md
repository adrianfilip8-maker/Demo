# RESULT-staging4-floor — the discriminating capture: BOTH candidate mechanisms are wrong, and [0,0] turns out to be achievable

Capture: `staging4-floor.mjs`, bootId in `staging4/readback-floor.json`, 2026-08-07. Six stages,
**every one at the shipped `guard` vectors** — the camera never moves, so excursion-count is pinned
at zero while restage-count and elapsed time run their full range. All stages `armTook` true; the
guard solved to `[-15.4871, 0, 27.5446]` identically every time. Registers no verdict: this is the
measurement §198 ordered, and its output is the input to PREREG-staging4.

## The numbers

```
pairs against s1 (separation grows, excursion-count pinned at ZERO):
  s1 vs s2:        2 px   maxΣ|Δ|   9
  s1 vs s3:      110 px   maxΣ|Δ|  27
  s1 vs s4:      103 px   maxΣ|Δ|  27
  s1 vs s5:      103 px   maxΣ|Δ|  27

consecutive pairs (one restage apart each):
  s1 vs s2:        2 px   maxΣ|Δ|   9
  s2 vs s3:      109 px   maxΣ|Δ|  27
  s3 vs s4:        7 px   maxΣ|Δ|  11
  s4 vs s5:        0 px   maxΣ|Δ|   0
```

Residue geography, s1 vs s5: one cluster, bbox **x [1170, 1279], y [107, 218]** — upper-right sky.
**0 px in the figure column, 0 in the guard-mass rect, 0 in the doorway pool, 0 in the lower-right
quadrant.** staging3's P-F4 residue was x [1167, 1278], y [107, 277]: **the same cluster.**

## Both registered mechanisms are dead, and the honest statement of it

**Path-dependence — dead.** PREREG-staging3 §4.2 named it: *"the through-cand excursion is
path-dependent (state the intermediate arm leaves behind)"*. This capture has **no excursion at
all** and still produces 110 px in the same place. The candidate arm was never the cause.

**Boot-age drift — also wrong as I stated it.** §198's replacement hypothesis was that residue
*"grows with stage index and elapsed time"*. It does not grow. It **steps**: 2 px, then 109 px
between s2 and s3, then 7, then **exactly 0**. s4 and s5 are bit-identical. A monotonic-drift
model predicts the opposite of s4-vs-s5 = 0.

So I proposed two mechanisms across two seals and **both were wrong**. What the data actually shows
is a **one-time state transition early in the boot, after which the renderer is bit-exact.**
Whatever settles up there — a lazily-built sky or FX resource, a periodic light/shadow sweep
reaching its first update — completes by the third or fourth staged frame and never moves again.

## The finding that matters: [0,0] IS achievable, from the right stage

`s4 vs s5 = 0 px, maxΣ|Δ| 0`. Two full restage cycles of the same vectors, byte-identical. The
determinism band PREREG-staging3 registered was never unreachable — it was **being measured across
the warm-up transition**. One discarded preroll absorbs shader compile (504 s here against ~240 s
scored, the fourth run confirming it) but does **not** absorb this.

**Protocol consequence for PREREG-staging4, derived from measurement rather than convenience:**
score nothing until the boot has reached steady state — **three discarded stages, not one** — and
the registered [0,0] then describes something the machine actually does. This is not a band being
widened after a failure; it is the same band, measured where it holds.

## The base-gate rect, now with four boots of evidence

Within THIS boot, across five stages, the P-F3 gate quantities are identical to three decimals:

| stage | guard-mass medL | pool medL | figure medL |
|---|---|---|---|
| s1 … s5 | **69.104** (all five) | **116.153** (all five) | **23.187** (all five) |

Cross-boot, the same rect reads **59.51** (staging3 deriveA), **65.86** (staging3 base), **69.10**
(staging2 r12), **69.104** (here) — a spread of **9.6 L, 16 % of the low value**, against the
±6 % band I had carried. Within-boot: exact. **The rect is not noisy; it is boot-dependent**, and
§198's conclusion stands and hardens: a base gate cannot live on this rect unless it is compared
within a boot. PREREG-staging4 must either move the gate to a rect that is cross-boot stable — the
figure column reproduces to 0.00–0.20 across boots — or anchor the gate inside the scored boot.

## What this does NOT decide

The scoping of P-F4 (frame-wide versus the union of measured rects) is still open and still must
not be settled by preference. The residue misses every measured rect in both captures, which
argues for scoping — but with three discarded stages the frame-wide band holds anyway, so the
question may simply not arise. PREREG-staging4 should keep it frame-wide, since that is the
stricter choice and the measurement says it is affordable.

## Protocol note against myself

This capture reported `in-lock tree pair same=false`: I committed an unrelated source change while
it held the lock. Checked rather than waved off — the commit landed at 14:59:54, inside the
**discarded** preroll, the s2→s3 transition is at 15:15–15:19 some fifteen minutes later, and the
changed file (`SlyModelDL.js`) is not in this boot's module graph, which ran the shipped `sly3`
character. The frames are sound. It was still a breach of the §186 discipline, and the discipline
exists precisely so that a capture's integrity never depends on an argument like the one I just
had to make.
