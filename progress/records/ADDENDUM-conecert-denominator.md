# ADDENDUM-conecert-denominator — the cone's one uncertified claim changes sign when the wedge stops defining its denominator

**Written by STAGING while `staging1.mjs` waited in the FIFO queue. No lock, no capture, no
`src/**` edit. Every number below is produced by running FX's own committed certifier,
`progress/records/fxcluster1/geocert.mjs`, unmodified except for named constants — and the runs
were done on COPIES in scratchpad so FX's `geocert.json` was never overwritten.**

Answers the coordinator's §179 question directly: the cone lever (`towardCamera 0.35 → −0.20`) is
CERTIFIED except for a **−17.06 pp key-lit narrowing**, held from shipping until the wedge work
lands. Here is what happens to that claim when the wedge lands.

---

## 1. First, a correction to my own NOTE: the wedge was not entirely unnamed

`NOTE-combatguard-staging.md` says "no round has named it", quoting CRITIC-sbs3. That is true of the
CRITIC rounds and false of the tree. `geocert.mjs:51` has carried this for a while:

```
const PLINTH_Y = 300;   // occlusion edge, measured on committed a3/a4 frames (see raster())
```

with the derivation in its `raster()` comment: *"the committed frames show the §152 plinth slab
eating him below y ≈ 300: per-row activity on a3/a4 frames is 97.6/88.2/88.7/88.0% moving down to
y 300, then 5.2% at y 300–320."* **FX had located the occlusion edge to within 6 px of my
independent pixel trace (297–310) and my box model (306), and had attributed it to the plinth.**

So the correct account is narrower and more useful than "nobody saw it":

| what was already known | where | what was not |
|---|---|---|
| there is an occluding edge at py ≈ 300 | `geocert.mjs:51` | which *piece* of the plinth group (it is the gilded **cavetto cornice**, not the slab/shell — 3 cm arithmetic match, NOTE §2.2) |
| it is "the §152 plinth slab" | `geocert.mjs` raster note | that it covers **26–29% of the frame** |
| the guard is cut at py 300 | FX's per-row activity | that this is **86% of him**, contact ground included |
| — | — | **that it inverts the sign of the cone's own headline number** (below) |

I am correcting my own claim rather than letting it stand, because "nobody named it" is exactly the
kind of statement that makes a shared tree less legible, and because FX's measurement is
corroboration I should be citing, not overwriting.

---

## 2. The finding: `PLINTH_Y` is the denominator of the uncertified claim

`geocert.mjs` computes its headline over the pixels the plinth leaves visible:

```
row('silhouette px (VISIBLE, y<300)', …)
… litFractionVisible = litPxVisible / silhouettePxVisible
```

Run unmodified (scratchpad copy), shipped constants:

| | base (`towardCamera 0.35`) | cand (`−0.20`) | Δ |
|---|---|---|---|
| silhouette px **(VISIBLE, y<300)** | 6,092 | 6,117 | +0.4% |
| lit px (visible) | 4,754 | 3,730 | −21.5% |
| **lit-facing fraction (visible)** | **0.7804** | **0.6098** | **−17.06 pp** ← the uncertified claim |
| silhouette px **(full figure)** | 27,122 | 23,879 | −12.0% |
| **lit fraction (full figure)** | **0.4555** | **0.5050** | **+4.95 pp** |

**The visible set is 6,092 of 27,122 px — 22.5% of the figure. On that sliver the lever reads
−17.06 pp. On the whole figure the same lever, same yaw, same key, reads +4.95 pp. The sign flips.**

The reason is not subtle once stated: `PLINTH_Y = 300` keeps only the head and upper shoulders,
which at `towardCamera 0.35` are turned most directly into the key. Rotating the body away costs
that sliver a great deal and costs the rest of the body nothing — indeed it gains, because the far
flank swings into the key. Averaging over 22.5% of a figure and reporting it as the figure's lit
read is the same defect shape as the one this seal already corrected: **a statistic whose
denominator was chosen by the occluder.** That is now two instances in one shot — CRITIC's
`medL 18.64` (80.8% doorway void) and geocert's `−17.06 pp` (77.5% of the subject discarded).

---

## 3. The camera translation is a provable no-op for the certifier

Both runs below are scratchpad copies of `geocert.mjs` with only the two camera/stand constants
changed to this seal's candidate:

```
const CAM = { pos: [-13.25, 2.6, 30.5], … }        // was [-11.5, 2.6, 30.5]
const G   = [-17.237, 0, 27.545];                   // was [-15.487, 0, 27.545]
```

`diff` of the full console output, shipped vs translated: **no differences.** Analytically this is
forced — `project()` uses `sub(P, CAM.pos)` and the facing test uses `sub(CAM.pos, P)`, so
translating the camera and every surface point by the same vector leaves every difference
unchanged; `fwd`, `fov`, the key direction and the guard's `yaw` are all untouched by a pure
translation. Checked empirically anyway, because "forced by the arithmetic" is how several wrong
numbers in this ledger got believed.

**Consequence: this seal cannot perturb the cone certification. It can only change which pixels are
on screen.** Two corroborations that my re-implementations agree with FX's committed one:

- geocert's own validation line prints `projection validation vs committed port (864,244):
  [863.3,244.4] -> AGREES` — the head px my solver replication derived independently.
- geocert hardcodes `G = [-15.487, 0, 27.545]`; my `_solveShotPose` replication returned
  **(−15.487, 27.545)**. Same stand, two independent derivations, neither aware of the other.

---

## 4. What the coordinator should do with the cone, stated as a decision, not a preference

If `staging1`'s candidate ships, `geocert.mjs` needs **three** constants updated, not two, and the
third is the one that matters:

| constant | shipped | after this seal | why |
|---|---|---|---|
| `CAM.pos` | `[-11.5, 2.6, 30.5]` | `[-13.25, 2.6, 30.5]` | bookkeeping; output is invariant |
| `G` | `[-15.487, 0, 27.545]` | `[-17.237, 0, 27.545]` | bookkeeping; output is invariant |
| **`PLINTH_Y`** | **300** | **720 (no cut)** | **substantive — the plinth no longer crosses the figure at any x, so there is no occlusion edge to model** |

Re-run with the cut removed (scratchpad, done):

| quantity, full figure | base | cand | Δ |
|---|---|---|---|
| lit-facing fraction | 0.4555 | 0.5050 | **+4.95 pp** |
| rim-facing fraction | 0.5922 | 0.5297 | −6.25 pp |
| **key-OR-rim fraction** | **0.9562** | **0.9285** | **−2.77 pp** |

So on an unoccluded subject the cone lever is **not a −17.06 pp narrowing**. It is roughly a wash:
key up ~5 pp, rim down ~6 pp, and the union — the quantity that actually decides whether a
silhouette separates from its background — down **2.77 pp**, which is a fraction of the 17 it was
being held against.

**This is not a recommendation to ship the cone.** It is the statement that the number the hold was
placed on is a function of the wedge, that the wedge is the thing `staging1` removes, and that the
claim must therefore be re-judged rather than carried forward. The ship decision is the
coordinator's, and the honest form of it is: *decide the cone against the full-figure numbers, on
the post-move frame, with `PLINTH_Y` retired.*

**Ordering follows from this:** `staging1` must land before the cone is judged, which is the
ordering §179 already chose — for a reason that turns out to be stronger than the one it was
chosen for.

---

## 5. Caveats

- `geocert` is a **geometric** certifier over an authored surface approximation (lofted torso, head
  ellipsoid, muzzle wedge, two ears, two tapered legs). It answers "how much of him faces the key",
  not "how bright is he". Nothing here is a photometric result and none of it substitutes for the
  delivered frame.
- The `+4.95 pp` and `−2.77 pp` are **the committed certifier's own numbers**, already printed by
  the shipped script on its "full figure" rows. I did not compute a new quantity; I read the row
  that was already there next to the row being quoted.
- `−12.0%` full-figure silhouette shrink at `towardCamera −0.20` is real and unaddressed here —
  a body turned 30° lens-away is a smaller target. That is a separate line item for whoever judges
  the cone.
- All runs were on **copies** in
  `/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad/`
  (`geocert-shipped.mjs`, `geocert-west175.mjs`, `geocert-west175-nocut.mjs`). FX's
  `progress/records/fxcluster1/geocert.json` was **not** touched.

## 6. Files

- `/home/user/Demo/progress/records/ADDENDUM-conecert-denominator.md` (this file)

No `src/**` touched, no captures, no lock, no git.
