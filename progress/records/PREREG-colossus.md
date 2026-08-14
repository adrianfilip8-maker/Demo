# PREREG — colossus: the courtyard pair is a stack of slabs, and the number that says so is **2**

**Seal (c) of the PROPS lane's three.** Registered BEFORE any candidate exists. §141.1 applies:
no threshold below moves once a candidate is measured.

## 1. The complaint

Both blind critics, convergent (r11 + r12): *"stacked rectangular slabs, no lap, no knees,
Egyptian mecha/shipping crates"*. §8.1 asks for **landable knees at y ~ 4.5**.

## 2. What is actually in HEAD, and why the critics are still right

`Statues.seatedColossus` already authors legs, knee blocks, an apron, hands, arms, a nemes and a
back pillar — 122 pieces, 2392 tris — and `Props._colossi` already registers a `ledge` collider
at world y 4.5. So this is NOT a missing-parts bug. Measured offline
(`progress/records/props1/propgeom.mjs`, `base-geom.json`):

```
colossus west   pieces=122 tris=2392 top=13.32   infW=2  infD=9
                front relief over the seat band (y 2.0..6.6): sd=0.7335  range=2.134 m
                kneeTops=4 at y [4.494,4.510,4.491,4.503]  frontZ=28.414  hipFrontZ=26.525  reach=1.888 m
                ledge colliders at knee height: 2   coversKnee=TRUE
colossus east   pieces=121 tris=2380 ... infW=2 infD=9  sd=0.7420 range=2.133  reach=1.896
pair profile L1 (asymmetry) = 0.0218 m
```

**`infW = 2`.** Over 11.3 m of figure the horizontal-extent profile changes direction **twice**.
That is the arithmetic definition of a stack: widen, widen, narrow. A seated human silhouette
turns at feet, knee, lap, waist, chest, shoulder, jaw and headdress. The critics read the number
that is there.

Second finding, recorded because it re-aims the sculpt: the knee already reaches **1.89 m past the
hip**, so "no knees" is not about projection — the shin front (z+3.16), the knee front (z+3.34)
and the foot front (z+3.42) all sit inside **0.26 m of one plane**, so feet, shins and knees
present as a single flat face. `zfSd = 0.73` over the seat band is that face.

Third: `pairProfileL1 = 0.0218 m` — the two figures are the same object mirrored, which is the
"matched pair" tell `Props._colossi` already paid once to close on the collar alone.

## 3. Bars (registered)

Offline instrument `propgeom.mjs`; scorer `progress/records/props1/colossus-score.mjs`, against
the sealed `base-geom.json`. Both figures must pass independently.

| id | bar | base (west/east) | ship requires |
|---|---|---|---|
| **C1 SILHOUETTE** | `infW` — horizontal-extent profile inflections, 160 samples, 0.10 m noise floor | 2 / 2 | **>= 6 on both** |
| **C2 RELIEF** | `zfSd` — s.d. of the front-most z over the seat band y 2.0..6.6 | 0.734 / 0.742 | **>= 1.10 on both** |
| **C3a KNEE** | a landable knee top: bbox top y in [4.35, 4.70], footprint >= 0.68 m each way (2 x Controller radius 0.34) | 4 / 4 | **>= 2 on both** |
| **C3b REACH** | `kneeReach` — knee front minus hip front | 1.888 / 1.896 | **>= 1.60 on both** (may not regress) |
| **C3c REACHABLE** | `kneeLedgeCoversKnee` — a registered `ledge` collider at knee height whose footprint overlaps a knee top in plan | TRUE / TRUE | **TRUE on both**, and `ledge` tag count in `PROT.colliderTags` **>= 90** |
| **C4 ASYMMETRY** | `pairProfileL1` — mean absolute difference of the two width profiles | 0.0218 | **>= 0.08** |
| **C5 BUDGET** | `PROT.propTris` delta vs base 76288 | 76288 | **<= +1600** for this seal, and the PROPS lane's CUMULATIVE delta after seals (a)+(c) **<= 0** |
| **LOOK (binding)** | "reads as a seated colossus, not a crate" on the candidate `courtyard` frame, read against `shots/r12/courtyard.png` | crate | must read as a seated figure |

**C5 is the §1 clause.** The triangle budget is already breached on 15/16 shots and a separate
BUDGET lane owns the breach; this lane may not make it worse. The declared trade is stated up
front: seal (a) removes rope-coil triangles, this seal spends some of them on the colossi, and
the LANE's net must land at or below 76288. If (a) does not ship, C5's cumulative clause fails
and this seal does not ship either — that coupling is deliberate.

**LOOK is cross-boot and is NOT pixel-differenced.** It is a human read of one candidate frame
against the r12 frame, declared as such. No [0,0] bar is claimed across those two boots (§302).

## 4. SCORING RECIPE

```bash
rm -rf node_modules/.cache/props1-cand && mkdir -p node_modules/.cache/props1-cand
cp -a src node_modules/.cache/props1-cand/src   # scratch copy, OUTSIDE src/
git apply --directory=node_modules/.cache/props1-cand -p1 progress/records/props1/cand-colossus.patch
node progress/records/props1/propgeom.mjs --root node_modules/.cache/props1-cand/src \
     --json progress/records/props1/cand-colossus-geom.json
node progress/records/props1/colossus-score.mjs progress/records/props1/cand-colossus-geom.json
# LOOK frames come from the lane's shared capture run, which installs this patch itself
# under the capture lock (§186: acquire -> install -> boot -> capture -> revert -> release):
bash tools/launch.sh progress/records/props1/props1.mjs \
     /home/user/Demo/progress/records/logs/props1-run1.log /tmp/sands-of-ra/props1-run1.pid
```

* **PASS on all eight rows (seven numeric + LOOK)** -> ship-write is exactly
  `git apply progress/records/props1/cand-colossus.patch` (into `src/world/Statues.js` and
  `src/world/Props.js` only) plus `tests/colossus.test.mjs` pinning C1/C2/C3/C4/C5.
* **numeric FAIL** -> no LOOK is claimed, `src/**` unchanged.
* **numeric PASS + LOOK FAIL** -> `src/**` unchanged; the numbers are recorded as a measured
  falsification of the metric (a sculpt that passes an inflection count and still reads as a
  crate is a finding about the metric, and it gets written down as one).

## 5. Correction landed during this seal's drafting (§310)

The C5 note above cites the "breached on 15/16 shots" figure, which §310 measured as FALSE (an
all-passes submission counter; real worst shot 85 draws / 0.647 M tris). **No threshold moves**
(§141.1): C5 stays at seal <= +1600 and lane <= 0, which is a self-funding rule that is correct
with or without a breach. Recorded rather than edited away.
