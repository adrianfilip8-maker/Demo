# `perch_idle` lateral line of action — measured, and the item is mis-aimed

**Verdict: the premise does not survive measurement.** `perch_idle` does not have zero lateral
line of action. It has the largest pelvis-relative lateral excursion of any of the five idles on
the shipped rig, and it sits at the 75th percentile of all 52 clips. The item as written is a
stale fact that was already corrected in `KNOWN_ISSUES.md` on 2026-08-02 and closed on
measurement in §204; it survived into this work order anyway.

The residual true statement is a different one, and it is not about the keyframes: **the lateral
excursion that exists is 1.81 px wide at `hero`, against a ~2.5 px ink hull (§2.1).** `hero`
cannot see it, cannot ever see it at this bearing, and no plausible pose edit changes that.

Offline throughout: no capture, no browser, no `src/` edit, no git. Measurement script beside
this note (`lineofaction.mjs`), syntax-checked with `node --check`.

---

## 1. Where the clip is authored

Everything is hand-authored keyframe data in one file — there are no imported clips (§1).

| what | path | lines |
|---|---|---|
| clip doc comment | `/home/user/Demo/src/player/Clips.js` | 428–433 |
| `const PERCH` — the base pose, all five keys reference it | `/home/user/Demo/src/player/Clips.js` | **434–529** |
| ↳ the lateral-line authoring note (`ledger #17`) | `/home/user/Demo/src/player/Clips.js` | 435–446 |
| ↳ the bones that carry the lateral line: `hips` / `spine` / `chest` / `neck` / `head` | `/home/user/Demo/src/player/Clips.js` | 447–451 |
| `def('perch_idle', {…})` — the clip | `/home/user/Demo/src/player/Clips.js` | **567–693** |
| ↳ key `t: 0` — **the frozen frame** (`hold: 0`, line 568) | `/home/user/Demo/src/player/Clips.js` | 673 |
| ↳ breath keys `t: 0.8 / 1.7 / 2.3 / 3.2` | `/home/user/Demo/src/player/Clips.js` | 686, 688, 690, 691 |

Consumers: required-name list `Clips.js:173`; `Animation.js:242,248`;
`Shots.js:97` (`hero`, the shot §7.3 scores this pose in) and `Shots.js:208–211` (`sly-perch`, the
line-of-action verification twin, justified in the comment at `Shots.js:187–207`).

`hold: 0` and `freezePose(name)` defaults to `clip.hold` (`Animation.js:524–533`), so the frame
the critic scores is key `t: 0` at line 673. That is the frame measured below.

---

## 2. The metric, and why this one

### 2.1 The instrument the item quotes is measuring the wrong thing

The item's three numbers — `hips 0.000, chest 0.006, head -0.007` — are `tools/poseprobe.mjs`'s
`S-curve` line, which prints **absolute model-space x** of three joints.

**A line of action is a shape, not a position.** That triple slides rigidly with the clip's
`pos.x` hips offset: translate the whole figure 5 cm to his left and all three numbers gain 5 cm
while the drawing is unchanged. This is not hypothetical here — it is exactly what happened to
this clip's own record. `perch_idle` now reads `hips 0.045 / chest 0.082 / head 0.045`, and
KNOWN_ISSUES §204 reports that as "+4.5 cm out at the pelvis, +8.2 cm at the chest, back to
+4.5 cm at the head … a genuine lateral S". **4.5 cm of that is the authored `pos.x` translation
at `Clips.js:673`, which draws nothing.** Referred to the figure, the shape is
`chest +0.037, head +0.000` — a C bowing to his left at the chest, not an S, and 3.7 cm not 8.2.

Every number below is therefore measured **relative to the figure**, never in absolute model
coordinates.

### 2.2 Definition

`Clips.js:16–18` states the house definition — "one readable line of action: a single curve from
the planted foot through the hips and spine to the head or the cane. Squint at any frozen frame
and the curve should still be there." §7.3 scores it as "Pose is A-pose/T-pose/stiff instead of a
confident line-of-action". Neither is scoreable until "lateral" and "how much" are numbers, so:

Chain: `hips → spine → chest → neck → head`. All five bind at **x = 0** in both rigs; the script
asserts this at run time, so every lateral centimetre reported is authored pose, not rig
asymmetry. Frontal plane = the character's own (x, y), +x his left, +y up (Rig.js conventions) —
the plane a camera in front of him sees, and the plane the item's own numbers are in.

| symbol | definition |
|---|---|
| **`latEx`** | **PRIMARY.** `max_i \|x_i − x_hips\|` over the chain — how far the centre line departs from the plumb line dropped through the pelvis. Zero for a straight vertical spine **and** for any rigid lateral translation. |
| `bow` | max signed perpendicular distance of `{spine, chest, neck}` from the `hips→head` chord. The **curve**, with the overall lean divided out. A straight diagonal spine scores `latEx > 0`, `bow = 0`. |
| `tilt` | signed angle of the `hips→head` chord off vertical. The **lean**. A confident line of action needs `tilt` or `bow` non-trivial; both ≈ 0 is the mannequin the item describes. |
| `span` | `max x − min x` over the five joints. Closest single number to what the item quoted, kept so the two are commensurable. **This is the monotone readout under a lever sweep** (§6). |
| `bow/chord` | scale-free curvature — `bow` as a fraction of the chord it bows off. A crouch has a shorter frontal chord than a stand, so the cm columns would otherwise quietly penalise every crouched pose. |
| `baseEx` | `latEx` measured from the mid-ankle instead of the pelvis, because the house definition runs the curve from the planted foot, and the pelvis is not obviously the right base for a crouch. |
| `hipTilt` / `shoTilt` | frontal-plane tilt of pelvis (`upperLegL→upperLegR`) and shoulder line (`shoulderL→shoulderR`), degrees. `opp` = opposite signs, i.e. genuine counter-rotation. Scored separately because `PERCH`'s own note claims the read is carried by tilt opposition rather than offsets — that claim deserves its own column, not a fold into one number. |

Normaliser for the `%` columns is the rig's **standing** height, a rig constant rather than the
pose's own height, so a crouch is not flattered by being short: 1.8538 m on the legacy rig — the
figure `tools/headratio.mjs` prints for `idle_confident` and the one AGENTS.md §7.3 now quotes,
reproduced here (`5.03 heads`, `total 1.8538`, `head 0.3688`; §7.3's corrected head-ratio
condition **PASSES** on the current rig, confirmed before any of this).

### 2.3 Both rigs, because they disagree about which is "the" rig

`tools/poseprobe.mjs`, `headratio.mjs` and `shotsil.mjs` all build `src/player/SlyModel.js`.
`src/main.js:50` ships **`SlyModelDLRig.js`**, which poses `RIG3.SKELETON` from `SlyModel3.js`
(`SlyModelDLRig.js:362`, bind positions taken verbatim, no rescale). The two skeletons have
different lever arms, so every conclusion below is checked on both and the script prints both.
The conclusion is the same on both; only the magnitudes move.

**Reproduction check.** The script reprints `poseprobe`'s `S-curve` triple from its own rebuilt
legacy rig and matches it exactly (`perch_idle` `hips 0.045 / chest 0.082 / head 0.045`;
`idle_confident` `−0.078 / −0.047 / −0.110`). If it had not, nothing below would apply.

### 2.4 What this cannot see (§11)

Authored clip pose only: **no foot IK, no tail spring, no look-at, no ink hull, no mesh** —
joints, not silhouette. `--proj` adds the shot framing and nothing else: still no occlusion, no
hull, no lighting, and `latShare` treats the view as horizontal (it ignores `hero`'s 1.5° camera
roll, worth ≤ 0.03 of the share). A pass here is necessary, never sufficient. Settle a read
against a frame.

---

## 3. `perch_idle` against every sibling in the same table

### 3.1 The five idles — the group the item's claim lives in

Legacy rig (H = 1.8538 m; cm, `%H` in brackets; + = his left):

```
clip                 hold   latEx@         bow@          tilt   span   baseEx  chord bow/chord  hipTilt shoTilt opp
idle_confident        0.0  -3.23[-1.7%] head    4.57[ 2.5%] chest   -4.5   6.29  -15.00   41.2     11.1%   -19.6    20.9  Y
idle_bored            2.0   1.96[ 1.1%] chest   1.74[ 0.9%] chest    0.6   1.96   12.48   43.5      4.0%    -9.9     4.2  Y
idle_look             1.4   1.90[ 1.0%] chest   1.27[ 0.7%] chest    1.8   1.90  -28.52   42.5      3.0%    -8.4     1.5  Y
perch_idle            0.0   3.66[ 2.0%] chest   3.65[ 2.0%] chest    0.0   3.66    5.04   40.5      9.0%    -7.6     7.0  Y
balance_idle          0.6   3.74[ 2.0%] neck    1.41[ 0.8%] chest    4.8   3.74   14.45   42.5      3.3%    -6.4    -2.9  .
```

Shipped rig, `RIG3` (H = 1.80 m):

```
idle_confident        0.0   5.30[ 2.9%] chest   6.68[ 3.7%] chest   -2.4   7.69  -13.15   56.6     11.8%   -19.6    20.9  Y
idle_bored            2.0   3.39[ 1.9%] chest   2.49[ 1.4%] chest    1.5   3.39   12.82   59.7      4.2%    -9.9     4.2  Y
idle_look             1.4   3.23[ 1.8%] chest   1.75[ 1.0%] chest    2.5   3.23  -25.82   58.6      3.0%    -8.4     1.5  Y
perch_idle            0.0   6.19[ 3.4%] chest   4.80[ 2.7%] chest    2.6   6.19    7.20   55.6      8.6%    -7.6     7.0  Y
balance_idle          0.6   6.05[ 3.4%] neck    1.74[ 1.0%] chest    5.8   6.05   15.66   58.5      3.0%    -6.4    -2.9  .
```

Read honestly, and the two readings disagree in an informative way:

- **By `latEx` (pelvis-relative excursion) `perch_idle` is 1st of 5 on the shipped rig** (6.19 cm,
  3.4 %H) and 2nd of 5 on the legacy rig, 0.08 cm behind `balance_idle`.
- **By `span` `idle_confident` wins** (6.29 / 7.69 cm against perch's 3.66 / 6.19), because
  `idle_confident` is a true **S** — chest +3.1 cm to his left, head −3.2 cm to his right, the
  centre line crossing the pelvis plumb line — while `perch_idle` is a **C**: chest +3.7 cm out,
  head returning to +0.0 cm.
- **By `bow/chord` (scale-free curvature) `idle_confident` 11.1 % > `perch_idle` 9.0 %** — second
  of five, and comfortably ahead of the other three (3.0–4.0 %).
- `perch_idle`'s hip/shoulder counter-tilt is real and third-largest of the group (−7.6 / +7.0,
  `opp = Y`), so `PERCH`'s claim that "the pelvis/shoulder tilt opposition carries the read" is
  supported, though `idle_confident` (−19.6 / +20.9) carries nearly three times as much.

On every one of these readings `perch_idle` is in the top two of its group. **On none of them is
it zero, and on none of them is it the outlier.**

### 3.2 All 52 clips

Legacy rig: **`perch_idle` ranks 13 of 52** by `latEx` — 39 clips score lower. Shipped rig:
**11 of 52**. Median clip is `land_hard` at −1.73 cm (legacy) / `ledge_shimmy_l` at −2.56 cm
(rig3), i.e. perch sits at roughly twice the median.

Top of the legacy list, for scale — and note what is above it is the wall and combat tech, where a
big lateral lean is the pose:

```
wall_run_l   29.88   wall_run_r  -29.88   wall_jump  -14.80   pole_swing   -6.70
cane_combo_1 -5.96   cane_combo_3 -5.78   cane_combo_2 5.74   run_fast     -5.65
hook_release -4.96   rail_slide    4.30   spire_balance -4.15 balance_idle  3.74
>>> perch_idle 3.66 <<<   land_roll -3.56   idle_confident -3.23   victory -3.21
```

The clips that genuinely match the phrase "zero lateral line of action" are at the other end
(`|latEx|` cm, legacy / rig3): `wall_cling` **0.00 / 0.00**, `crouch_walk` 0.05 / 0.08,
`jump_rise` 0.07 / 0.06, `pole_climb` 0.17 / 0.22, `roll` 0.33 / 0.46, `crawl` 0.35 / 0.41,
`crouch_idle` 0.46 / 0.61. None of these is `perch_idle`, which is 8–100× above them.

### 3.3 The lateral line survives the loop, not just the held frame

`Clips.js` warns twice inside this clip that its in-between keys carry absolute angles (§9's
orphaned-key trap), so a property present at `hold` can be absent for the rest of the cycle.
Sampled every 0.2 s across the 3.2 s loop, `latEx` stays in **3.35–3.96 cm** and `span` tracks it
exactly; `tilt` never exceeds 0.5°. No collapse, no orphaned key. The lateral line is a property
of the clip, not of the frozen frame.

---

## 4. The projection — which shots can actually see any of this

`latShare` = |model-X component of the screen-right axis| at that shot's bearing. At `latShare`
0.29, a frontal-plane excursion is 29 % of itself on screen and **the rest of the screen-lateral
excursion is the sagittal line of action wearing a lateral costume.**

```
shot          clip              view°   px/m   latEx px   bow px   span px  latShare  latEx-X px
hero          perch_idle          73.4  170.2     -17.50    -4.50    17.50      0.29        1.78
sly-perch     perch_idle          33.2  354.3     -16.03     4.38    16.03      0.84       10.84
sly-closeup   idle_confident      33.2  346.4      12.41    14.91    17.77      0.84       -9.37
temple        sneak_idle          35.3   73.8      -6.28    -1.66     6.28      0.82       -1.18
interior      sneak_idle          69.6  135.1     -18.18    -5.48    18.18      0.35       -0.92
night         sneak_walk        -110.6   74.0      11.43     2.61    11.43      0.35        0.39
traversal     hook_swing          59.0  107.2     -18.92    -4.25    18.92      0.51       -0.62
combat        cane_combo_3        44.9  203.2     -21.41    -4.62    21.41      0.71       -8.31
courtyard     run                 36.0   58.0      -2.61    -0.65     2.61      0.81        1.29
dunes         idle_confident      69.7  123.4       3.18     2.81     3.30      0.35       -1.38
sly-profile   idle_confident      95.0  313.5       8.56    -2.98     8.56      0.09        0.88
sly-arm       cane_combo_2       -60.2  346.2      34.54    -2.73    34.54      0.50        9.87
kaykit        idle_confident      -7.0   57.8      -7.00     3.67     8.30      0.99       -1.86
sly-startle   hurt                 8.6  737.3     -21.35     6.53    24.24      0.99      -12.20
guard         sneak_idle         125.0  420.4     -27.15    13.90    27.15      0.57        4.71   BEHIND CAMERA — meaningless
sly-key       idle_confident      33.2  346.4      12.41    14.91    17.77      0.84       -9.37
```

**This is the load-bearing row.** At `hero` — the only §7.2 canonical shot that freezes this clip
and therefore the only place §7.3 scores it — `latShare` is **0.29**. The shipped 3.66 cm of
frontal span reads as **1.81 px** at 1600×900. §2.1 specifies the ink hull holds at ~2.5 px. **The
lateral line of action at `hero` is narrower than the line drawn around it.** The 17.50 px of
screen-lateral excursion `hero` does show is ~90 % the sagittal diagonal the clip's doc comment
describes ("one long diagonal from the braced hand up through the spine to the cane tip"), which
is present, large, and not what the item is about.

At `sly-perch` — the twin built for exactly this question (`Shots.js:187–209`) — `latShare` is
0.84 at 354 px/m, so the same 3.66 cm reads as **10.84 px**, 4.3× the hull. That shot resolves it
comfortably. The twin is the right instrument and its existence is the right call.

---

## 5. VERIFIED / INFERRED / NOT CLAIMED

**VERIFIED** (measured from the authored data this session, both rigs, reproducing `poseprobe`
exactly):

1. `perch_idle`'s frontal-plane line of action is **not zero**: `latEx` 3.66 cm (2.0 %H) legacy /
   6.19 cm (3.4 %H) shipped rig; `bow` 3.65 / 4.80 cm; `bow/chord` 9.0 / 8.6 %; hip–shoulder
   counter-tilt −7.6 / +7.0 with opposed signs.
2. It ranks **1st of 5 idles on the shipped rig, 2nd of 5 on the legacy rig** by `latEx`, and
   **11th–13th of all 52 clips** — above the 75th percentile either way. Only `idle_confident`
   beats it inside the idle group on `span` and on `bow/chord`, and `idle_confident` is the
   character-sheet pose that §7.3 is written around.
3. The property holds across the whole 3.2 s loop (`latEx` 3.35–3.96 cm), not only at `hold: 0`.
4. `hips x 0.045` in the record is the authored `pos.x` translation at `Clips.js:673`, not a
   shape. Referred to the figure the pose is a **C** (`chest +0.037, head +0.000`), not the **S**
   §204 describes. The S in the idle table belongs to `idle_confident` (`+0.031 / −0.032`).
5. At `hero` the excursion projects to **1.81 px** against a ~2.5 px ink hull (`latShare` 0.29,
   170.2 px/m); at `sly-perch` to **10.84 px** (`latShare` 0.84, 354.3 px/m).
6. §7.3's head-ratio condition passes on the current rig — `tools/headratio.mjs` reproduces
   AGENTS.md's 5.03 (1.8538 m ÷ 0.3688 m) exactly. The stale 5.72 plays no part in anything here.

**INFERRED** (follows from the above, but is a judgement, not a measurement):

7. **The item is mis-aimed as written, and the aim was already corrected.** `KNOWN_ISSUES.md:797`
   was struck through and marked "STALE — corrected 2026-08-02"; §204 (`KNOWN_ISSUES.md:15891`)
   closed it on a `poseprobe` run. The task line "the one unfixed §7.3 pose item" is itself the
   stale artefact, propagating for a third time. And §204's own moral applies to §204: it closed
   the item on the absolute triple, which is the instrument this note shows is measuring position
   rather than shape — right answer, wrong number, and the 8.2 cm "S" it records does not exist.
8. Had the item been acted on as written, the likely outcome is the one §204 names — a second
   lateral lean authored on top of the first, doubling it, on the pose the money shot freezes.
9. If the underlying worry is "shipped poses read as plumb lines in the frames we score", the
   better-aimed targets are the **sneak** family: `sneak_walk` (span 1.48 cm) is frozen by
   `night`, and `sneak_idle` (span 3.39 cm, but `latShare` 0.35 at `interior`, giving 0.92 px) is
   frozen by `temple`, `interior` and `guard` — three canonical shots. I am **not** opening that
   as an item; it is a direction, and it needs its own measurement and its own seal.
10. The `sly-perch` twin's reasoning stands but its arithmetic does not: it argues `hero` cannot
    resolve the lean, and it is right, but by way of two errors that partly cancel (§7).

**NOT CLAIMED:**

- That the pose *reads* well, or badly, in any rendered frame. Nothing here has a mesh, an ink
  hull, foot IK, a tail spring or lighting in it. Joints only.
- That §7.3's "Pose is A-pose/T-pose/stiff instead of a confident line-of-action" checkbox passes
  or fails at `hero`. That checkbox is scored on a frame; this is a bone measurement, and §5 item
  5 says the quantity is smaller than the line thickness there — which means **the checkbox cannot
  be scored at `hero` for the lateral axis at all**, in either direction.
- That `sly-perch` has ever been captured and looked at. I have not run one and cannot.
- Any claim about the `RIG3`/`SlyModelDLRig` *skinned* result. I built its skeleton from
  `RIG3.SKELETON` (verbatim, as `SlyModelDLRig.js:362` does) and did not load the FBX or its
  artist weights, so the rig3 column is joints only — a mesh could redistribute the read.
- That any pose should change. See §6.

---

## 6. What a fix would have to change, in concrete numbers — **NOT a proposal**

The premise does not survive, so **the correct action on the keyframes is: none.** No degree of
any bone in `Clips.js:434–529` or `567–693` needs to move to satisfy the item as written.

Priced anyway, because "what would it take" is a fair question and because the answer is the
argument against doing it. Gains measured by patching the compiled quaternions **in memory** (the
technique `scratchpad/tailsweep.mjs` uses; tracks verified restored afterwards), applying the
delta to the bone's authored Z in **all four keys** — the only correct way, per this clip's own
§9 orphaned-key warnings at `Clips.js:674–683`, and the same warning `PERCH` itself paid for in
counter-rolls at `Clips.js:435–446`:

```
bone     +deg   latEx cm   span cm  d(span)/deg  footShift cm   hero px   sly-perch px
hips        5      -3.40      5.37        0.342          4.17      2.65          15.97
hips       10      -6.81      7.33        0.368          8.34      3.62          21.83
spine       5      -2.79      5.46        0.361          0.00      2.70          16.25
spine      10      -5.57      7.56        0.390          0.00      3.73          22.49
chest       5       3.66      5.55        0.378          0.00      2.74          16.51
chest      10      -3.76      7.42        0.376          0.00      3.66          22.09
```

- **Gain is ~0.37 cm of frontal span per degree of Z-roll**, near-identical on `hips`, `spine` and
  `chest`. `hips` costs 0.83 cm of foot displacement per degree (it carries the legs — precisely
  the counter-roll bill `PERCH`'s note already paid); `spine` and `chest` cost nothing at the feet.
- **To clear the ~2.5 px ink hull by 2× at `hero` (5 px of frontal span) needs span ≥ 10.1 cm** —
  2.8× shipped, i.e. roughly **+17° of additional torso roll**. For scale: 10.1 cm is 5.4 % of
  standing height and **1.6× the span of `idle_confident`**, the most laterally curved pose that
  ships. That is not a line of action; that is a figure falling over. `latEx` also flips sign
  before then (the chest-out C becomes a head-over lean), i.e. the lever changes the pose's
  *shape*, not just its amplitude.
- At `sly-perch` the threshold is span ≥ 1.7 cm — **already cleared, 2.2× over, by the shipped
  pose.**

(The `hero px` / `sly-perch px` columns in this table use the shot constants rounded to
`latShare` 0.29 / 0.84 and 170.2 / 354.3 px/m, so they read 1.81 / 10.88 px at the shipped pose
against §4's exactly-projected 1.78 / 10.84 px. The 0.2 % gap is the rounding and nothing else.)

**The conclusion the numbers force: the constraint is the camera bearing, not the keyframes.**
`hero` sits at 73.4° view, which foreshortens the frontal plane to 0.29 and forecloses this
measurement. Anything that would make the lateral line visible at `hero` by posing alone would
have to be large enough to wreck the pose, and would still be paid for at the one shot that
already reads well.

Any change to a shipped pose needs a **sealed PREREG with a frame-side criterion** first. Nothing
above is a candidate, and nothing above is decided.

---

## 7. Stale numbers found in passing — recorded, not acted on

I did not edit `src/`, `AGENTS.md` or `KNOWN_ISSUES.md`. Flagging for whoever owns them:

1. **`Shots.js:192`** (the `sly-perch` justification) says "at `hero`'s **87–97 px/m** that is
   **3.2–3.6 px** against a ~2.5 px ink hull". `tools/charview.mjs` currently reports `hero` at
   **295 px** for a 1.7 m figure = **173.5 px/m**; my projection independently gives 170.2 px/m.
   The comment is stale by ~1.8× — *and* it omitted the 0.29 foreshortening, so it multiplied the
   full 3.7 cm instead of its projected component. The two errors partly cancel: the correct
   figure is **1.81 px**, smaller than the comment's estimate, so **its conclusion is right and
   understated**. `Shots.js:194`'s companion figure for `sly-perch` ("~13.5 px") is 10.84 px once
   the 0.84 share is applied — same direction, smaller error. Worth correcting precisely because
   these are comments whose conclusions nobody will re-derive.
2. **`Clips.js:485`** says "`tools/charview.mjs` now measures `hero` at **view 70°, 166 px**".
   Current: **view 73.4°, 295 px**. Four `hero` pixel heights are quoted across this one clip's
   comments — 166 px (lines 485, 548), 185 px (508), 120 px (558) — and none matches the current
   framing. Tail and cane aims were reasoned about against those figures. The 70° bearing is very
   nearly right (73.4°) so the tail/cane conclusions are probably safe; the pixel sizes are not.
3. **`KNOWN_ISSUES.md:797` / §204** are correct and already say so. The work-order line is what
   is stale.

---

## 8. Reproduce

```
node --check progress/records/perchidle/lineofaction.mjs
node progress/records/perchidle/lineofaction.mjs                    # all 52 clips, both rigs
node progress/records/perchidle/lineofaction.mjs --idles            # the five idles
node progress/records/perchidle/lineofaction.mjs --idles --breath   # perch across its loop
node progress/records/perchidle/lineofaction.mjs --proj             # screen px at every shot
node progress/records/perchidle/lineofaction.mjs --idles --sens     # roll-lever gains
node tools/headratio.mjs idle_confident perch_idle                  # §7.3 head:body, unchanged
node tools/charview.mjs                                             # current view°/px per shot
```

Every mode counts what it inspected and exits non-zero on a count of zero (§211.1), and `--sens`
asserts the in-memory patch was restored before it prints its summary.
