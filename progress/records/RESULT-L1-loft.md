# RESULT — L1, run before the `dunes` capture it can cancel

Sealed clause: `PREREG-loft-dunes.md` §L1 (sha256 `c4007009…`, committed `957c3f0` before any
`dunes` frame existed). Run offline, no lock, while `rim4` held it. Tree: `src/` at `8795030`,
`src/world/` clean.

**Verdict: the capture is CLEARED — but not by the route the clause specified, and L1 as
registered is unscoreable. Two corrections to §51.1 fall out, one of them substantial.**

---

## 1. L1 cannot be scored against its registered thresholds

The bands were `≥82.1% → PASS · 72.1–82.1% → PARTIAL · ≤72.1% → FAIL`, denominated in the
"swept-normal area" pair recorded in §51.1 and in `PropKit.js:393`.

**That statistic is not reproducible from anything in the record.** `scratchpad/form.mjs` is the
only instrument in the project that measures area-weighted normal clustering, and it reports
`top6` / `top12` / `top24` — no quantity named "swept-normal area", and no definition of it is
written down anywhere. Reconstructing the most natural reading (`100 − top6`, cos tolerance
0.9998, the tolerance `form.mjs` uses) gives, for the two arms the recorded pair describes:

| population | old slab body | flat-flank loft | recorded pair |
|---|---|---|---|
| body only | 47.9% | 69.3% | 82.1% → 72.1% |
| whole figure | 39.8% | 43.9% | 82.1% → 72.1% |

Neither population reproduces the pair, and in both the loft comes out **higher** than the
slabs — the opposite sign to the recorded finding. So the thresholds are denominated in a unit
I cannot compute, and any verdict I returned against them would be fabricated precision.

L1 is **UNSCOREABLE AS REGISTERED**. Recording that rather than forcing it into a band.

## 2. What is reproducible, stated with its definition

Metric, so the next reader can recompute it: area-weighted triangle-normal clustering, two
normals in one cluster iff `dot > 0.9998`; `swept = 100 − (area fraction in the 6 largest
clusters)`. Arms share `rng(12345)`; everything outside the body is held fixed by construction
(the shipped figure is built once and only its body part is substituted).

| arm | tris | swept, body only | swept, whole figure |
|---|---|---|---|
| A — the two `chunkAt` slabs the loft replaced | 88 | 47.9% | 39.8% |
| B — **shipped** loft, `belly` 0.06 | 240 | **76.9%** | **43.9%** |
| C — same loft, `belly` 0 (calibration) | 240 | 69.3% | 43.9% |

- **The shipped loft beats what it replaced**, by +29.0 points body-only.
- **`belly` earns its keep**: +7.6 points body-only (C → B).
- **At whole-figure scale `belly` is invisible** — 43.9% both, identical to three significant
  figures. The body is too small a share of the figure's area for it to register. Any future
  claim about `belly` must be made body-only or it is measuring the head and the plinth.

## 3. The correction that matters: §51.1's mechanism is measurably backwards

§51.1 and `PropKit.js:393` both state:

> `chamferBox` **pillows its face interiors by about 7°**, so a "flat" box face is not flat and
> contributes real normal variation. A ruled flank on a loft turns through **precisely zero**.

Measured directly — mean area-weighted angular deviation of face-interior normals, restricted to
triangles within 10° of +X so the chamfer bevels themselves are excluded:

| surface | tris | mean turn | max turn |
|---|---|---|---|
| `chunkAt` slab face interior, jitter **0** | 2 | **0.00°** | **0.00°** |
| `chunkAt` slab face interior, shipped jitter 0.025 | 2 | 0.46° | 0.48° |
| loft flank interior, `belly` 0 | 36 | 4.87° | 8.35° |
| loft flank interior, **`belly` 0.06 (shipped)** | 32 | **6.66°** | **11.17°** |

**It is the box face that turns through precisely zero, and the loft flank that carries the
gradient — exactly inverted from the claim.** A `chamferBox` side face is two triangles sharing
one normal; what little turn it has (0.46°) comes from *jitter*, not from pillowing, and
switching jitter off takes it to a hard 0.00°.

The origin of the wrong number is visible: widening the selection cone from 10° to 45° pulls the
chamfer bevels into the "face interior" population and the same slab reports **13.98°**. The
"~7°" in §51.1 is that artefact — a bevel measured and attributed to the flat face beside it.
This is the same shape as §50 and §51.4: an instrument that silently included what it was meant
to exclude, and a conclusion reasoned from it.

**Consequences, stated plainly:**

- §51.1's headline — *"the first loft measured worse than the boxes it replaced"* — is not
  supported by any measurement I can reproduce, and its stated mechanism is inverted. It should
  be marked unverified at its declaration site, in `KNOWN_ISSUES.md` and at `PropKit.js:393`,
  until whoever produced 82.1/72.1 states the statistic.
- `belly` should **not** be removed. It was added for a reason that turns out to be wrongly
  described, but it independently measures as a real +1.79° of flank normal turn (4.87 → 6.66)
  and +7.6 points of body swept area. The lever is good; the story attached to it was wrong.
- This is my own section, one after I reopened someone else's item for the same fault. The
  pattern is now four deep and it is always the same: a number quoted onward without its
  definition travelling with it.

## 4. Effect on the `dunes` capture

L1 was registered so that a FAIL could cancel the lock. **Nothing here is a FAIL.** The loft is
better than what it replaced on every measure I can reproduce, so `dunes` is worth spending and
L2/L3/L4 stand exactly as sealed.

One amendment, which does **not** touch L2/L3/L4: L1's thresholds are void, and L1's finding is
replaced by §2 and §3 above. `belly` at 0.06 is retained on the evidence in §2, not on the
construction argument in the source comment — that comment is wrong and should be rewritten.
