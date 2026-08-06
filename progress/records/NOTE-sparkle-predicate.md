# NOTE-sparkle-predicate — the night sparkle false positive: confirmed, and the instrument corrected

**Owner:** FX. **Date:** 2026-08-06. **Requested by:** coordinator dispatch §174.
**OFFLINE** — committed frames only, no capture, no lock, **no `src/**` touched**, no git.
**Instrument:** `progress/records/fxcluster1/sparkdiag.mjs` → `sparkdiag.json`.

**Verdict: CONFIRMED in substance, with a correction to the numbers.** Night's strict-band
population is contaminated by sky pixels that are not FX output; the §2.1 item-6 grammar floor
would pass a shot with no sparkles in it. The corrected predicate is registered in §4 and passes
both controls. **CRITIC-sbs3's counts do not reproduce under the sealed predicate and are
corrected at their declaration site per §34** (§5).

---

## 1. The sealed predicate, quoted, and unchanged by this note

`fxcluster-diag.mjs:530`, section B:

```js
if (Math.abs(r - 143) <= 40 && Math.abs(g - 216) <= 35 && Math.abs(b - 255) <= 40) inBand++;
```

`#8fd8ff` = (143, 216, 255). **The colour test is not what is wrong and this note does not
change it.** What is missing is any restriction on *where* a pixel may be.

## 2. Confirmation — the structural claim reproduces exactly

| frame | strict px | row distribution |
|---|---|---|
| `sbs2/night.png` | **50** | y 480–540: 42, y 540–600: 8. **Nothing above y 480.** |
| `sbs3/night.png` | **224** | y 0–60: 95, y 60–120: 66, y 120–180: 13, y 480–540: 42, y 540–600: 8 |

The decomposition is clean: **sbs3 = sbs2's population preserved exactly (42 + 8 = 50) plus 174
entirely new pixels, and every one of the 174 is at y ≤ 180** — the night sky band. The largest
old component is bit-identical across rounds (30 px at bbox [399,528,427,533] in both).

**So: 100 % of the new pixels are in the sky band. CRITIC's structural claim is confirmed.** The
sparkle grammar is still absent from night; what grew is haze grazing the tolerance.

## 3. Four candidate restrictions, all four falsified — recorded so they are not re-tried

The obvious fixes do not work, and each fails for a reason worth keeping:

| candidate | result | why it fails |
|---|---|---|
| **component-area cap** (a sparkle is small, haze is a big field) | **backwards** | Night's haze specks are the *small* ones (top components 30, 21, 19, 16, 13; median 1). Traversal's genuine sparkles are the *large* ones (82, 67, 42, 34). At `≤64 px & maxDim ≤16` it keeps **194 of night's 224** and destroys **148 of traversal's 236**. |
| **dark-surround test** (a sprite sits on geometry; sky does not) | **no separation** | It is a *night* frame — the sky is dark. Annulus-min luma median is 20.1 for night's haze and 21.4 for traversal's genuine sparkles; **221 of 224** haze px pass a `<60` surround test. |
| **sparkle-core adjacency** (the b2 letter shows the in-band px is a sprite *annulus*, so a hotter core should sit beside it) | **kills the signal** | Keeps only **10 of 236** genuine traversal px at any radius 3–10. No core survives the grade above the band's R ceiling in the composited frame, so the test rejects real sparkles. |
| **flood-fill sky mask** (fill from the top border, stop at luma steps) | **self-defeating** | Any bright speck breaks the fill and is therefore classified as *geometry* — including the haze specks it exists to catch. It labels **0 of night's 224** as sky while calling 94–97 % of the frame sky. |

**Conclusion: colour and shape do not separate these two populations.** A composited PNG does
not carry the information that separates them — whether there is geometry behind the pixel. That
is why the restriction has to be geometric and externally supplied, not inferred.

## 4. The corrected predicate — REGISTERED

```
sparkle px  =  |R−143| ≤ 40  AND  |G−216| ≤ 35  AND  |B−255| ≤ 40     (colour, unchanged)
               AND  y ≥ skyCut[shot]                                   (NEW: geometric)

skyCut = { night: 200, traversal: 120 }
```

`skyCut[shot]` is the row below which that shot's camera frames no sky. It is **registered per
shot and published with every count** — it is data, not a constant, and a shot whose camera
moves must have it re-derived before its number is quoted.

### Controls, as required

| control | requirement | result |
|---|---|---|
| `b2-traversal.cand.png` — the genuine population | **must still count it** | strict 236 → **counted 236**, rejected 0 ✔ |
| `sbs3/night.png` sky band | **must read ~0** | strict 224 → **counted 50**, rejected as sky **174** ✔ |
| `b2-traversal.base.png` — known-bad, preroll off | **must stay 0** | strict 0 → **counted 0** ✔ |
| `sbs2/night.png` — the pre-regression round | should be unchanged | strict 50 → **counted 50**, rejected 0 ✔ |
| `sbs3/traversal.png` | unchanged by the cut | strict 239 → **counted 239** ✔ |

The known-bad fails as its own failure: `b2-traversal.base.png` reads 0 both before and after the
correction, so the correction cannot manufacture a pass, and traversal's genuine 236 is untouched
while night's 174 sky pixels are removed.

### What this predicate is honestly not

A per-shot row cut is a **registered mask, not a universal rule**, and it will drift if a camera
moves. It is the correct fix for the metric *as published today* — it makes the number mean what
its name says — but the durable fix is upstream and belongs on the capture side: **count the
markers from `SparkleField`'s own instance data rather than from the composited frame.** The
probe path already exists (`sbs1/sly-closeup`'s in-page probe recorded `sparkles latched=17
fresh=17`, `fxcluster-diag.mjs` §B4), and a count taken there cannot include a sky pixel by
construction. Recommend that for whoever next touches §B; it needs a capture, so it is out of
scope here.

## 5. §34 correction applied at the declaration site

CRITIC-sbs3 §4's bullet publishes **"41 → 179"** with **"138 new pixels ... (y 15–158)"**. Under
the sealed predicate quoted in §1 those numbers do not reproduce; the measured values are
**50 → 224** with **174 new pixels (y 15–136)**. The same offset appears on traversal, where
CRITIC publishes **230 px in 14 blobs, largest 80 px at (506,249)** and the sealed predicate
gives **236 px in 14 blobs, largest 82 px at bbox [500,245,513,256] (centre ≈ (506,250))** —
**identical blob count and identical blob positions, counts ~2.6 % higher**, which is the
signature of a slightly different tolerance convention rather than a different phenomenon
(CRITIC's own text says "tolerance 40", i.e. ±40 on all three channels; the sealed predicate is
±40/±35/±40).

**The correction is applied at CRITIC-sbs3's own bullet, per §34** ("a correction lives where the
claim lives"), leaving the original figures visible and attributing the difference to the
convention rather than to an error of observation. **CRITIC's conclusion is untouched and was
right**: the new pixels are sky, they are `uGraze` haze inside the sparkle tolerance, they are
not FX, and the sparkle language is still absent from night.

## 6. Files

`progress/records/NOTE-sparkle-predicate.md` (this note);
`progress/records/fxcluster1/sparkdiag.mjs` + `sparkdiag.json` (instrument and output);
`progress/records/CRITIC-sbs3.md` (§34 correction added inline at the declaration site, original
figures preserved).
Frames read, all previously committed: `sbs2/night.png`, `sbs3/night.png`, `sbs2/traversal.png`,
`sbs3/traversal.png`, `fxcluster1/b2-traversal.{base,cand}.png`.
Read for the predicate, not modified: `progress/records/fxcluster1/fxcluster-diag.mjs`.
