# PREREG-combatrecipient — the combo lands on a body: `SHOT_POSE.combat`, and the restore that has to ride with it

**One shot, one owner, two edits, both in `src/ai/Guard.js`.** This seal covers **`combat`'s
recipient only**. It does **not** seal, claim, or measure-as-a-result Sly reading brown rather than
blue (22 blue px, hue 200–250 / sat > 0.35 / L > 60) — that is the flash/tonemap interaction already
routed to **FX + SHADING** (CRITIC-sbs3 §3.10(a), §4.2). It is reported here as context in §2.4 and is
explicitly **ungated**: nothing in this seal may be read as having moved it, and nothing in this seal
may be reverted because it did not.

**Diagnosis of record:** `NOTE-combatguard-staging.md` §1 (STAGING) and `KNOWN_ISSUES.md` §181's
combat paragraph. **Every load-bearing figure in that diagnosis was re-derived here from source
before being used**, not carried over — see §0.2. Source read at `c8d8957`.

---

## 0. Verification of the inherited evidence (§13 — run a control first)

### 0.1 The scorer

Pointed at CRITIC-sbs3's published `combat` numbers on the same committed PNG
(`progress/records/sbs3/combat.png`) before being used for anything new:

| quantity | CRITIC-sbs3 | this seal's scorer | verdict |
|---|---|---|---|
| figure box (360,390,720,670) medL | 119.98 | **119.98** | exact |
| …medSat | 0.435 | **0.435** | exact |
| …chalk (L>150, sat<0.30) | 9,122 px / 9.05% | **9,122 px / 9.05%** | exact |
| …blue px (hue 200–250, sat>0.35, L>60) | 22 | **22** | exact |
| flash core (300,280,520,400) median RGB | [178,120,87] | **[178,120,87]** | exact |
| …medL / mean R−B | 129.8 / +88.2 | **129.8 / +88.2** | exact |
| frame L>200 / sat<0.15 | 131 px | **131 px** | exact |

Seven of seven exact. Rec.709 luma on 0–255 sRGB bytes; `sat = (max−min)/max`; differing-pixel
counts are at **`ΣRGB ≥ 4`** and that threshold is stated with every count (§122.1).

### 0.2 The projector and the solver — independently re-implemented, not inherited

A Python `lookAt` + perspective projector and a from-source re-implementation of
`Guard.js:_solveShotPose` were written against `src/`, then checked against a figure this repo
published **before either note existed**: `Shots.js`'s `guard` header states the west colossus
plinth's SW top corner projects at **px (1022, 338)**. Mine puts (−13.5, 2.0, 28.5) at
**px (1022.5, 338.5)**. Sub-pixel.

*One correction to the record while I am here:* that header's **"d = 2.9 m" is a range, not an axial
depth.** Euclidean range from the guard eye is 2.891 m; depth along the lens axis is **2.715 m**.
`NOTE-combatguard-staging.md` §0 quotes 2.90 as agreement and it is agreement — of the range. Nothing
downstream depends on it; recorded so the next person does not spend a run on the 0.18 m.

Re-derived, and **every one of these reproduces STAGING's figure exactly**:

| quantity | STAGING | re-derived here |
|---|---|---|
| impact anchor (Sly chest + 1.05 m along normalize(0.30,0.10,0.95)) | (0.3146, 1.3849, 28.9963) | **(0.3146, 1.3849, 28.9963)** |
| anchor → px, depth | (452, 433), d 4.91 | **(451.9, 432.6), d 4.906** |
| Sly chest → px, depth | (576, 421), d 5.80 | **(575.9, 420.6), d 5.796** |
| anchor is nearer the lens than Sly's chest by | 0.89 m | **0.890 m** |
| `screenSide +1`: d = 4.5 rejected (feet ndc) | −1.095 vs the −0.96 gate | **−1.095** |
| `screenSide +1`: winning d, stand | 5.0, (0.102, 0, 29.035) | **5.0, (0.102, 0, 29.035)** |
| stand → anchor horizontal gap | 0.216 m | **0.216 m** |
| `screenSide −1`: stand, gap | (1.523, 0, 27.355), 2.038 m | **(1.523, 0, 27.355), 2.038 m** |

And the three hazards, each re-checked rather than accepted:

1. **`spec.x` / `spec.z` / `spec.yaw` are dead fields — CONFIRMED.** `grep -n "spec\." src/ai/Guard.js`
   returns exactly `index (1726), look (1740), clip/t (1741), screenSide (1772), minDist/maxDist
   (1782), towardCamera (1832)` plus an unrelated material `spec` bag at 1094–1120. The comment at
   `Guard.js:150` — *"`x`/`z` are only the fallback for when COLLISION isn't up"* — describes a reader
   that does not exist. `_poseForShot` also **ignores `_solveShotPose`'s return value** (`Guard.js:1735`
   calls it as a statement), so a `false` leaves the guard frozen wherever his patrol left him. This is
   the §129.2 shape: *authored intent present and legible, route to the frame absent.* **Not fixed by
   this seal** (it is a live-code correction on a path nothing exercises); routed in §7.
2. **`_poseForShot` never restores `g.position` — CONFIRMED, and it is worse than "0.97 m from a
   spawn".** Measured, by projecting a 1.95 m × 0.42 m-radius temple guard parked at the combat stand
   through every camera that stages the player at (0, 0, 30):

   | shot | residue screen bbox | depth | overlaps viewport | Sly's own bbox |
   |---|---|---|---|---|
   | `sly-closeup` | (433, 76)–(696, 589) | 3.82–5.20 | **YES** | (524,112)–(765,672) |
   | `sly-startle` | (−47, −202)–(610, 980) | 2.83–4.34 | **YES — he fills the frame** | (372,−89)–(937,1163) |
   | `sly-perch` | (431, −10)–(696, 514) | 3.77–5.16 | **YES** | (523,7)–(767,581) |
   | `sly-arm` | (168, 4)–(538, 763) | 2.52–3.92 | **YES** | (521,112)–(766,672) |
   | `sly-profile` | (652, 67)–(924, 565) | 3.84–5.39 | **YES** | (521,120)–(755,628) |
   | `sly-key` | (−1460, −44)–(−497, 875) | 2.04–3.43 | no (entirely off-frame left) | — |

   **Five shots, not four**, and the brief's "four" and STAGING's "sly-closeup, sly-profile and
   sly-key" are both slightly off: the exact-(0,0,30) population is `sly-closeup`, `sly-startle`,
   `sly-perch`, `sly-arm`, `sly-profile`; `sly-key` is at (4, 0, 30) and is the one that is **safe**.
   In `sly-profile` the residue is a **272 × 498 px body standing 1 m behind the character in a
   character sheet** — 14.7% of frame. *Caveat on the method, stated because it bit me while writing
   it:* a corner-in-viewport test reports `sly-startle` as "not in frame" because a body that
   straddles the whole frame has every corner outside it. The table uses bbox-overlap. **A test whose
   answer does not depend on the thing it claims to measure** — the recurring defect in the DIGEST,
   caught here in my own instrument.
3. **The recipient covers part of Sly — CONFIRMED, and my number is wider than STAGING's.** STAGING
   projected a 0.9 m slab and got x 332…510; I project the 0.42 m collision radius as an 8-corner box
   and get **x 307…543, y 308…743**, depth 4.39…5.80. Sly's box is x 503…648, depth 5.32…6.37, so the
   recipient is **nearer and does occlude**. Both numbers are registered in §2's band because they
   disagree by 33 px on the edge that matters.

**Nothing inherited is being built on unverified.**

### 0.3 One premise check the diagnosis did not do

`sbs3/combat.png` was read directly: **there is no guard anywhere in it.** The starburst sits in
open air at ≈ (430, 400) with pale paving behind it, which is what the projection predicts. The
premise "the combo hits air" is therefore a property of the frame and not only of the code path.
**Base-gate B3 below re-checks it in my own base arm** (§122.3, "was the subject even in the frame?"
— here the reverse: the subject must be *absent* in base or the A/B is measuring something else).

---

## 1. The mechanism — exact wiring, file, line, old → new

`src/core/Shots.js` has **no field that can place a guard**: `applyShot` (`Shots.js:461-479`) emits
`engine.emit('shot', { name, shot })` and `Guard.js:1399` subscribes with
`on('shot', (p) => this._poseForShot(p?.name || null))` — only `name` crosses. So the mechanism is
mine, and it is two edits, **both in `src/ai/Guard.js`, and independently revertible**.

### Edit 1 — the recipient. `src/ai/Guard.js`, insert a `combat` key into `SHOT_POSE` (lines 152–161)

`SHOT_POSE` is read at `Guard.js:1721` (`const spec = name ? SHOT_POSE[name] : null`), consumed by
`_poseForShot` (1718–1745) and `_solveShotPose` (1765–1840). **Today it contains exactly one key,
`guard`**; any shot name not in it unfreezes every guard and returns (1722–1725).

**old** (`Guard.js:160-161`)
```js
    minDist: 4.5, maxDist: 17,
  },
};
```
**new**
```js
    minDist: 4.5, maxDist: 17,
  },

  /* The combo's third hit needs somebody to land on. `Particles._stageShot()` fires
     cane_flash/ring/spark/debris at a HARDCODED point — Sly's chest + 1.05 m along
     normalize(0.30, 0.10, 0.95) = (0.3146, 1.3849, 28.996) — with no target lookup, no guard
     query and no raycast, so the arc terminates on a *coordinate* 0.89 m NEARER the lens than
     Sly's own chest (CRITIC-sbs3 §3.10: "the combo still hits air"; KNOWN_ISSUES §181).

     Nothing below aims at that point. The shipped solver already arrives at it: with
     screenSide +1 the d-walk rejects d = 4.5 (feet at ndc -1.095, past the -0.96 gate), takes
     d = 5.0, and stands him at (0.102, 0, 29.035) — 0.216 m from the anchor, i.e. inside a
     temple guard's 0.42 m body radius, at y 1.385 m, his upper chest. The two quantities agree
     because _stageShot's 1.05 m offset and _solveShotPose's 0.34 lateral fraction independently
     encode "a body-length in front of the lens, a third of the way off centre".

     The sign is load-bearing: screenSide -1 mirrors him to (1.523, 0, 27.355) and misses by
     2.038 m. `stunned`, not `look_around` — `guard` stages a sentry, this stages a recipient —
     and t = 0 is the authored key rather than an interpolated pose, so the frame does not
     depend on where the sampler lands between keys.

     No x/z/yaw: they have no reader (grep "spec\." — index, look, clip, t, screenSide,
     minDist, maxDist, towardCamera and nothing else). The "fallback for when COLLISION isn't
     up" at line 150 describes code that does not exist. */
  combat: {
    index: 0, clip: 'stunned', t: 0.0,
    towardCamera: 0.35, screenSide: +1,
    minDist: 4.5, maxDist: 17,
  },
};
```

**`index: 0` — chosen against STAGING's "not 0", with the reason.** STAGING wrote `index: <not 0 —
see the hazard below>` and the hazard it pointed at is the position-restore hazard. **I measured that
hazard and it is index-independent**: the residue bboxes in §0.2 are a function of the *stand*, which
`_solveShotPose` computes from the camera alone — the roster member is irrelevant to it. So "not 0"
buys nothing, and index 0 buys two things: (a) roster #0 is the only guard `SHOT_POSE` already
touches, so **all staging mutation stays confined to one roster member** instead of two; (b) `guard`
(shot 13 of 15) re-solves roster #0 from scratch, so in a canonical full-set run the two staged shots
cannot leave two displaced guards. Roster #0 is `{ type: 'temple', route: 'south_gate' }` — `temple`
matters, because `TUNE.headTop.temple = 1.95` is the height the d = 5.0 selection was solved on
(`heavy` is 2.22 and would re-frame; `scarab` is 0.34 and is not a person).

*One consequence of index 0, registered so it is not discovered later:* in a canonical-order full-set
run the residue **self-cancels** — `guard` restages roster #0 five shots after `combat` and moves him
to (−15.49, 0, 27.55), which is out of frame in both shots that follow (`sly-profile` bbox
(−225,117)–(−107,264), off-frame left; `sly-key` entirely behind the lens). **That accident is not a
fix and must not be mistaken for one** — every subset run (`critic.mjs combat sly-profile`, which is
what everybody actually runs) still carries the residue. It is also why the capture order in §5 puts
`sly-profile` directly after `combat` with no `guard` between: that is the *exposing* order, not the
convenient one.

### Edit 2 — the restore. `src/ai/Guard.js:1718-1745`, `_poseForShot`

**old**
```js
  _poseForShot(name) {
    this._shot = name;
    this._shotLock = null;
    const spec = name ? SHOT_POSE[name] : null;
    if (!spec) {
      for (const g of this.guards) g.anim.unfreeze();
      return;
    }
    const g = this.guards[spec.index];
    if (!g) return;
    g.senses.reset();
```
**new**
```js
  _poseForShot(name) {
    this._shot = name;
    this._shotLock = null;
    /* Put back whoever the LAST staged shot teleported, before staging this one. Staging
       mutates g.position and nothing has ever undone it, so the stand leaked into every
       shot captured afterwards in the same boot: a guard parked at combat's stand
       (0.102, 0, 29.035) projects INTO the frame of all five shots that stage the player at
       (0, 0, 30) — in `sly-profile` as a 272x498 px body standing 1 m behind the character.
       `guard`'s stand never showed this because (-15.5, 0, 27.5) is off-frame in the two
       shots that follow it; combat's is 0.97 m from the spawn. See PREREG-combatrecipient §0.2. */
    this._restoreStagedGuard();
    const spec = name ? SHOT_POSE[name] : null;
    if (!spec) {
      for (const g of this.guards) g.anim.unfreeze();
      return;
    }
    const g = this.guards[spec.index];
    if (!g) return;
    this._staged = {
      g, pos: (this._stagedPos || (this._stagedPos = new THREE.Vector3())).copy(g.position),
      yaw: g.yaw, u: g.u, dwell: g.dwell, dwellAction: g.dwellAction,
      state: g.state, hadGround: g.hadGround,
    };
    g.senses.reset();
```
plus a new method immediately after `_poseForShot` (before `_solveShotPose`):
```js
  /** Undo a previous `_poseForShot` teleport. Idempotent; safe when nothing is staged. */
  _restoreStagedGuard() {
    const s = this._staged;
    if (!s) return;
    this._staged = null;
    const g = s.g;
    g.position.copy(s.pos);
    g.yaw = s.yaw; g.u = s.u;
    g.dwell = s.dwell; g.dwellAction = s.dwellAction;
    g.state = s.state; g.hadGround = s.hadGround;
    g.forward.set(Math.sin(g.yaw), 0, Math.cos(g.yaw));
    g.speed = 0;
    g.root.position.copy(g.position);
    g.root.rotation.set(0, g.yaw, 0);
    g.root.updateMatrixWorld(true);
  }
```

**Why the restore is inert on the treated frame** (and this is a registered prediction, P-F5):
`Debug.setShot` calls `applyShot` **twice**, so `_poseForShot('combat')` runs twice per staging. Call
1 restores nothing (nothing staged), stashes, solves. Call 2 restores to the stash, re-stashes the
same values, re-solves — and `_solveShotPose` is a pure function of (camera, spec, ground), so it
returns the identical stand. **`combat` must therefore be 0 px different with and without Edit 2**,
which is exactly what the `norestore` arm measures.

**Edit 2 changes nothing that ships today, and that is measured, not assumed.** `guard` is the only
existing `SHOT_POSE` consumer; its stand (−15.487, 0, 27.545) projects **off-frame left** in
`sly-profile` and **behind the lens** in `sly-key`, the only two shots that follow it. So restoring
roster #0 after `guard` cannot move a pixel in the shipped set. If it does, that is a **latent
pre-existing defect surfacing**, and it is a registered outcome (P-F6), not a reason to abandon the
restore.

### What is deliberately NOT in the mechanism

- **No change to `_solveShotPose`.** Its two structural defects — a scorer with no luminance term
  (`fill·1.6 − centre·1.1`) and a single chest-height occlusion ray — are real, are GUARDS', and are
  **routed in §7, not sealed here.** `combat` is a `tod 0.74` daylight frame, so the luminance defect
  cannot bind on it; fixing it inside this seal would be a second lever on one A/B.
- **No `spec.x`/`z`/`yaw` for `combat`.** Adding dead fields to a new entry would ship the §129.2
  defect a second time.
- **No change to `Particles._stageShot()`.** The anchor stays hardcoded. This seal makes the *world*
  agree with the anchor; making the anchor find a target is FX's, is bigger, and is not needed for
  the flip.

---

## 2. Registered quantities — sealed before any capture

**Arms.** `base` (shipped tree) · `cand` (Edit 1 + Edit 2) · `norestore` (Edit 1 only — the residue
known-bad) · `kbside` (Edit 1 with `screenSide: -1`, + Edit 2 — the on-target known-bad) ·
`restore` (shipped tree again — determinism control).

**Frames.** 1280×720, `--q high`, `tools/harness.mjs` `withGame`/`grab`, i.e. the shipped
`Debug.setShot` staging, so the frames are comparable to CRITIC's.

**Rects and predicates.**
- `FLASHDISC` = the disc of radius **24 px** centred on **(452, 433)**, the projected impact anchor.
  1,793 px. On `sbs3/combat.png` it is medL 191.03, medSat 0.396, median RGB [231, 185, 134] — flash
  over pale paving, with **67 ink px** (L < 45) inside it.
- `RECIPBOX` = **(307, 308)–(543, 743)**, the projected recipient silhouette box.
- ~~`SLYMASK_A` = pixels inside (470, 315)–(690, 700) on the **`base`** arm with hue ∈ [8°, 48°],
  sat > 0.25, L ∈ [35, 205]~~ — **STRUCK, see §2.0. There is no colour predicate that isolates Sly
  in this frame.**
- `SLYBB` = **(503, 334)–(648, 660)**, 145 × 326 = **47,270 px** — Sly's body box, obtained by
  projecting a 0.60 m-wide, 1.75 m-tall figure at his staged (0, 0, 28) through the shipped combat
  camera with the projector validated in §0.2. It is a **proxy and an under-estimate**: his
  `cane_combo_3` lunge and his cane sweep both exceed it. Under-estimating the denominator makes
  P3 **harder** to pass, which is the direction an honest proxy should err in.
- `Δ` = the differing-pixel mask between two arms at **`ΣRGB ≥ 4`**.

### 2.0 AMENDMENT, made before any frame of this seal existed — the Sly mask is struck

Written, then falsified against `progress/records/sbs3/combat.png` **before the first capture**
(no `combatrecipient1/` frame existed; the base arm was queued but had not acquired the lock).
Recorded rather than silently swapped, because the failure is the one the DIGEST names five times.

The sealed `SLYMASK_A` predicate selects **58,982 px** inside a box in which Sly occupies roughly
ten thousand. The reason, measured:

| population (sbs3/combat.png) | medL | medSat | medHue |
|---|---|---|---|
| Sly torso (555,420,615,500) | 131.8 | **0.394** | 18.3° |
| Sly head/ears (560,345,640,410) | 121.0 | 0.469 | 20.4° |
| Sly legs (520,560,600,650) | 105.2 | 0.564 | 20.0° |
| **sunlit paving (300,600,400,690)** | 134.3 | **0.579** | 20.8° |
| glow ellipse on the floor (480,430,560,470) | 129.1 | 0.452 | 25.5° |

**The sunlit sandstone is warmer, brighter and MORE saturated than Sly's own torso, at the same
hue.** A warm/saturated predicate cannot separate them, and neither can luma. Six alternative
predicates were tried; the best still returned 34,562 px with a nearly flat column histogram
across the whole box — i.e. it was measuring the floor. **This is §128.2's denominator hazard
exactly**, and it would have produced a P3 that passed or failed on how much *paving* the
recipient covered.

**P3 is therefore re-registered below on geometry rather than colour**, using a box derived from
the validated projector and the change mask itself. No mask, no hue, no threshold on saturation.
The replacement is *stricter* on the thing that matters (it adds an absolute intrusion line), and
its prediction is stated before the frame exists, as the original was.

### 2.1 Base gates — VOID (not FAIL) if out

The `base` arm must be the frame this seal was reasoned about.

| id | quantity | band | `sbs3` anchor |
|---|---|---|---|
| **B1** | figure box (360,390,720,670) medL | [112, 128] | 119.98 |
| **B2** | flash core (300,280,520,400) median R−B | [+78, +98] | +88.2 |
| **B3** | **no guard in the base `combat` frame**: telemetry shows every guard's screen bbox missing the viewport, **and** `Δ(base, cand)` restricted to the complement of `RECIPBOX`-dilated-40 px is < 4% of frame | | none visible in `sbs3/combat.png` |

`sbs3/combat.png` was captured at `167c508`-dirty and the tree has moved to `c8d8957`, so B1/B2 are
deliberately banded rather than pinned (§133.1).

### 2.2 Gated predictions

| id | quantity | band (`cand`) | `base` anchor | known-bad anchor |
|---|---|---|---|---|
| **P1 — a recipient is in the frame** | area of the largest connected component of `Δ(base, cand)`, **and** its bbox centre | **area ≥ 20,000 px**; centre within **±60 px** of (425, 525) | 0 px, no component | `base` = 0 |
| **P1b** | that component's bbox is inside `RECIPBOX` dilated by 70 px, i.e. within (237,238)–(613,813) | **true** | — | `kbside` predicted bbox (735,·)–(980,·) ⇒ **false** |
| **P2 — the arc terminates ON him** | share of `FLASHDISC` inside `Δ(base, cand)` | **≥ 0.80** | 0.00 by construction | `kbside` **≤ 0.15**; `base` = 0.00 |
| **P2b** | `FLASHDISC` ink share (L < 45) on `cand` | **≥ 0.04** (a body under the flash brings its ink hull and banded linen with it) | **0.037** (67/1793) — *reported, weak, see below* | — |
| **P3 — Sly does not lose more than a registered share** (amended §2.0) | share of `SLYBB` covered by the recipient's change component | **≤ 0.40** — predicted **0.28–0.34** | 0.00 | — |
| **P3b — the recipient may not cross Sly's centre line** | rightmost column `x1` of that component | **≤ 560** — predicted **543–550** (543 unsquashed, 549 with `stunned`'s `sq` 1.055 x); Sly's projected centre is **576** | n/a | — |
| **P3c — the cane hook** *(reported, NOT gated — it is the declared cost)* | ink (L<45) px in (380,535,450,615) | — | **1,000 px / 17.86%** | — |
| **P4 — the four/five spawn shots do not regress** | `Δ(base, cand)` on **`sly-profile`**, frame-wide | **≤ 0.5% of frame (4,608 px)** | — | `norestore` predicted **≥ 8%** (a 272×498 body = 14.7% of frame) |
| **P4b** | largest connected component of `Δ(base, cand)` on `sly-profile` | **< 3,000 px** | — | `norestore` **≥ 40,000 px** with bbox overlapping (652,67)–(924,565) |
| **P4c** *(instrumented, covers all five)* | on the `cand` arm, at the moment `sly-profile` is captured: min over all 11 guards of the horizontal distance to (0.102, 0, 29.035) | **≥ 2.0 m** | — | `norestore` **≤ 0.5 m** |
| **P4d** *(instrumented, covers all five)* | the dumped guard positions projected through all five spawn cameras: no guard bbox overlaps the viewport in any of them | **true for all 5** | — | `norestore` **false for all 5** |

**P2b is deliberately marked weak and is reported, not decisive.** `base` already scores 0.037 on it
(the flash's own dark speckle), so the band is barely above the null; it is here as a *direction*
check on P2, and **P2 is the decisive leg.**

**One confound inside P4, registered before it can be discovered.** The restore returns roster #0's
*position, yaw, `u`, dwell and state* — it cannot return the 17 frames (0.283 s) of patrol and clip
phase he did not live through while frozen. So in `cand` he is ~0.28 m and ~0.28 s **behind** where
`base` left him for the rest of the boot. If he is visible at all in `sly-profile` he is on
`south_gate`, ≈ 30 m down the lens at ~68 px tall, and a 0.28 m lag there is a few hundred pixels at
most. **P4's 0.5% band is set with this in it.**

**And the confound has a registered address, so P4b cannot be ambiguous.** Projecting roster #0's
`south_gate` control points through the `sly-profile` camera, he is in that viewport at four of
seven waypoints, **60–83 px tall at 24–34 m, at x 915…1270, y 121…209** — the far right of the
frame. A 0.28 m lag there moves him ~11 px, which could plausibly make a connected component of
1,600–3,300 px and would otherwise sit right on P4b's 3,000 line. **The residue this seal is
gating lives somewhere else entirely: x 652…924, y 67…565, 272 × 498 px.** So P4b is scored on
*both* area and bbox:

- a component at **x ≳ 900, y ≲ 240, ≤ 3,300 px** is the patrol-lag confound → **reported, not a
  failure**;
- a component **overlapping (652, 67)–(924, 565)** at ≥ 3,000 px is the residue → **P-F4 fires**.

If a component is large **and** in the confound's address, that is neither: it is an unmodelled
change and the verdict is **UNSCOREABLE** for P4 until it is identified. Registering the two
addresses before the frame exists is what stops "3,100 px" from being argued either way afterwards.

**P4c/P4d are the honest way to gate five shots with two frames.** The residue is a *position* fact;
`sly-profile` is the one I pay pixels for (it is the worst case that is also cheap: the residue lands
14.7% of frame there and it is the only spawn shot that follows `combat` in canonical order), and the
other four are settled by projecting the telemetry that the same boot dumps for free. **This is
stated as a limitation, not sold as equivalent**: P4/P4b are frames, P4c/P4d are projections of
measured world positions through cameras this seal's projector has been validated on (§0.2).

**Why these bands and not tighter ones (§133.1).** P1's modelled area is ~35–55 k px (a 236 × 435 box
at 35–50% fill); 20 k is a floor a correct result clears 2–3×. P2's model is ≈ 1.0 — the disc is
48 px across, his body is ~164 px wide at chest depth, and the disc sits between his head (py 317)
and chest (py 472) — but 0.80 leaves room for the flash being *additive over* him rather than
replaced by him. P3's model is **28–34%**: the recipient's right edge lands at x 543 (549 once
`stunned`'s `sq: [1.055, 0.905]` widens him 5.5%), so he covers columns 503…549 of `SLYBB`'s
503…648 — 45 of 145 columns — over essentially all of its height. **0.40 is the composition line
I am drawing before seeing the frame**, and §3's P-F2 says what happens above it. P3b's 560 is
the sharper statement of the same judgement and is the one I would defend: *a recipient that
reaches Sly's centre line has stopped being a recipient and started being the subject.*

### 2.3 The calibration this metric already has

**P4's metric has an anchor at both ends by construction**: `norestore` is a real arm, not a model,
and it must produce ≥ 8% where `cand` produces ≤ 0.5% — a 16× separation on the same predicate in the
same shot. **P2's metric likewise**: `kbside` puts a real guard in the frame at the wrong place, so it
must pass P1 (a recipient is present) and fail P2 (the flash is not on him). *That pairing is the
whole point of `kbside`* — without it, P1 and P2 could both be satisfied by "a guard appeared
somewhere", and a metric that cannot separate those two is a metric with no scale (§141.1).

### 2.4 Reported, explicitly NOT gated

- Sly's blue-pixel count on the figure box (base: 22). **FX + SHADING's.** Reported in both arms only
  so round 4 can see it did not move. A change here is not a result of this seal in either direction.
- Figure-box chalk (L>150, sat<0.30), base 9,122 px / 9.05%. **This will move, for a reason that has
  nothing to do with the flash**: the recipient's body replaces mid-bright warm glow inside CRITIC's
  own rect, which today reads medL 134.47 / chalk 8.71% over `RECIPBOX`. STAGING flagged this
  (§3.3) and this seal repeats it because it is the single most likely misreading of round 4:
  **the figure box will contain two characters, and its chalk number stops being an FX statistic.**
- Frame-wide draw count and tri count (one extra guard is already in the roster and already drawn;
  the recipient is a *relocation*, not an addition, so the budget is expected flat).
- The nearest-guard local light. `_updateSpill` enables exactly one handle, the guard closest to the
  camera; a recipient 5 m from the combat lens becomes that guard. `Guard.js:1633` records that
  SHADING's toon material strips `lights_fragment_*`, so this contributes nothing to a toon surface
  — **reported and checked in the frame rather than assumed inert.**

---

## 3. P-falsifiers — revert, do not defend

- **P-F1** — P1, P1b or P2 out of band on `cand` ⇒ **REVERT both edits.** No retune of `minDist`,
  `screenSide`, `clip` or `t` toward a band. A different stand is a different prereg.
- **P-F2** — P3 > 0.40 **or** P3b > 560 (the recipient eats too much of Sly, or crosses his centre
  line) ⇒ **REVERT, and report the measured share.** The registered next candidate, so it is on
  record before the number exists, is
  `minDist: 6.0` (stand (−0.798, 0, 28.562), anchor gap **1.194 m**, box x 325…523) — but note that
  **at any d > 5.0 the flash stops being inside his body** (gaps: d 5.5 → 0.691 m, d 6.0 → 1.194 m,
  d 6.5 → 1.700 m, against a 0.42 m radius), so that candidate trades P2 for P3 and needs its own
  seal. It is **not** a retune available inside this one.
- **P-F3** — a base gate (B1–B3) out ⇒ that chunk is **VOID**, not FAIL. Re-boot. Three voids ⇒
  re-diagnose against the current tree.
- **P-F4 — the residue falsifier, and it is a gate not a footnote.** P4 > 0.5% **or** P4b ≥ 3,000 px
  *with its bbox overlapping the residue address (652, 67)–(924, 565)* **or** P4c < 2.0 m **or** P4d
  false for any of the five ⇒ **REVERT both edits.** (A ≥ 3,000 px component confined to the
  patrol-lag address — x ≳ 900, y ≲ 250 — is the registered confound of §2.2, reported not fatal;
  a large component in neither address is **UNSCOREABLE** until identified.) A recipient that
  ships a guard into five character-sheet frames is a net loss no matter how good `combat` looks, and
  this seal does not get to trade one shot's flip for four shots' regression. *If P4 fails while
  `norestore` also fails, the restore is insufficient and the mechanism is wrong. If P4 fails while
  `norestore` passes, my instrument is wrong ⇒ **UNSCOREABLE**, not FAIL.*
- **P-F5 — the inertness falsifier.** `Δ(cand, norestore)` on **`combat`** must be **0 px**
  (`ΣRGB ≥ 4`). Edit 2 is argued to be a no-op on the treated frame (§1); if it is not, the argument
  is wrong, and every P1–P3 number is attributing to Edit 1 something Edit 2 did ⇒ **verdict
  WITHHELD**, re-seal with Edit 2 as a second lever.
- **P-F6 — the latent-defect falsifier.** If `Δ(base, restore)` on `combat` is nonzero, the boot is
  not deterministic and every differing-pixel count in that pair is void (§122.1 precedent). Separately,
  if the restore turns out to move `guard`-then-`sly-profile` pixels in a later run, that is a
  **pre-existing latent defect surfacing** — report it, do not revert the restore for it.
- **P-F7 — the known-bad falsifier.** If `kbside` does **not** read as its own failure (i.e. it scores
  P2 > 0.15, or fails P1), then P2 cannot distinguish "a guard is in the frame" from "the arc lands on
  him" ⇒ **UNSCOREABLE**, no verdict in either direction. This is the §141.1 rule: *an uncalibrated
  metric has no scale.*
- **P-F8 — the premise check. AMENDED before capture; both versions recorded.**

  ~~If the `cand` telemetry shows a stand more than **0.30 m** from (0.102, 0, 29.035), the registered
  rects are not measuring the subject ⇒ verdict WITHHELD.~~ **Struck, because I falsified its stated
  reason with my own arithmetic before any frame existed.** The likely deviation is the chest
  line-of-sight ray or `groundCheck` pushing the selection one step out to d = 5.5, and the
  contingency table below — computed offline, with `stunned`'s `sq: [1.055, 0.905]` applied — shows
  the registered rects still measure the subject there:

  | d | stand | anchor gap | box x | box y | `FLASHDISC` inside his silhouette? |
  |---|---|---|---|---|---|
  | 4.5 *(rejected on framing)* | (+0.552, 29.271) | 0.363 | 289…563 | 350…808 | yes |
  | **5.0 (predicted)** | **(+0.102, 29.035)** | **0.216** | **302…549** | **340…746** | **yes** |
  | 5.5 | (−0.348, 28.798) | 0.691 | 312…538 | 332…697 | yes |
  | 6.0 | (−0.798, 28.562) | 1.194 | 321…528 | 325…656 | yes |
  | 6.5 | (−1.248, 28.325) | 1.700 | 329…520 | 319…622 | yes |

  A rule whose justification I know to be false is worse than one I have fixed and declared. So:

  - **P-F8a — reported, never gated.** The telemetry stand's offset from (0.102, 0, 29.035). Any
    offset > 0.30 m is a real finding (the offline solve did not survive the real probes) and is
    reported with the selected `d` and the row above, whatever the verdict.
  - **P-F8b — gated ⇒ WITHHELD.** Offset > **1.20 m**. Beyond that the *world-space* claim in §4 —
    "the flash goes off inside his body volume" — is false by more than a body radius, and the §17
    declaration stops describing the frame. Re-anchor, re-seal.

  **This amendment loosens a falsifier, which is exactly the move to be suspicious of, so its blast
  radius is stated: it touches no band that decides SHIP.** P2 — the decisive on-target leg — is a
  *screen* test by design, because a screen is what CRITIC judges, and it is unchanged. P1, P1b, P2,
  P3, P3b, P4, P4b and every known-bad are unchanged.

  *A note the table makes visible and the seal should not hide:* `FLASHDISC` sits on his projected
  silhouette at **every** candidate depth, so **P2 alone cannot distinguish d = 5.0 from d = 6.0.**
  P2 distinguishes *on-target from off-target laterally* — which is what `kbside` calibrates and
  what the defect actually is. Depth is settled by P-F8a's telemetry, and it is reported, not gated.
- **P-F9 — the tautology guard, declared against myself.** P4c/P4d and the P-F8 stand readback all
  read `g.position`, which is *the value the mechanism sets*. **They cannot fail if the code ran**, so
  they are **plumbing checks, not results** (§143.1 — "a guard can bless the broken thing"). The
  decisive legs are the pixel legs: P1, P2, P3, P4, P4b. Anywhere a telemetry number and a pixel
  number disagree, **the pixels win.**

---

## 4. §17 look-change declaration

**This is a look change to a canonical shot and is declared as one.** §7.2's contract for `combat` is
*"Impact frame: third hit of the cane combo landing on a guard, full FX"* — a contract that names a
guard and has never had one. This seal makes the frame match its own written contract; it is still a
change to a shipped look and it gets an A/B with the outcome predicted first.

**What visibly changes in `combat`:**
- A temple guard appears at world (0.102, 0, 29.035), ~370 px tall, occupying roughly
  **x 307…543, y 308…743** — the left-of-centre third of the frame — in the `stunned` reel pose, three
  quarters to the lens (yaw ≈ +119°, 57° off the lens axis, struck from his right rear).
- **The carnelian starburst, the ring, the sparks and the debris stop hanging in open air and go off
  on his upper chest.** They are drawn at d 4.91, in front of his 4.97–5.21, so they read as landing
  on him rather than inside him.
- **He occludes part of Sly** — the cane-hook / lower-left silhouette, predicted x ≈ 390…543 by
  STAGING's measurement of Sly's ink and my box projection together. Registered at ≤ 30% of Sly's own
  body pixels (P3) with a revert above it.
- The `crack` ground decal and the white floor glow ellipse are **unchanged** (FX's, untouched).
- One guard is **absent from his south-gate beat** for this one frame. He is not visible in `combat`
  today and his beat is 22+ m away; Edit 2 puts him back before the next shot.

**What changes in every other shot: nothing, and that is P4's job to prove.** Edit 2 exists precisely
so the blast radius is one frame. `tod`, `fov`, camera, player pose/position, every material, every
light parameter and every FX emitter are untouched.

**Blast radius by construction:** one new object literal in `SHOT_POSE` and one restore in
`_poseForShot`, both in `src/ai/Guard.js`. No other module, no shared constant, no `TUNE` value.
Verifiable by diff.

**Not declared, because not claimed:** nothing about Sly's colour, the flash's colour, the floor
glow, the tonemap, or the chalk count. This seal credits itself with none of them.

---

## 5. Capture plan — chunked per §163/§164

Arms are **source values in `src/ai/Guard.js`**, so **one arm per boot** (`SANDS_NO_HMR=1`; the
bundler reads the tree at boot, §124.4). Launched via `bash tools/launch.sh <script> <ABSOLUTE log>
<pidfile>` — never `pgrep -f`. Each chunk takes its own FIFO lock hold, writes its PNGs and telemetry
**into `progress/records/combatrecipient1/` before releasing**, and the `src/**` edit is made inside
the held ticket and **reverted before release**.

| # | arm | tree state | shots, in this order, one boot | outputs | required? |
|---|---|---|---|---|---|
| 1 | `base` | shipped | `combat`, `sly-profile` | `combat-base.png`, `sly-profile-base.png`, `telemetry-base.json` | **yes** |
| 2 | `cand` | Edit 1 + Edit 2 | `combat`, `sly-profile` | `*-cand.png`, `telemetry-cand.json` | **yes** |
| 3 | `norestore` | Edit 1 only | `combat`, `sly-profile` | `*-norestore.png`, `telemetry-norestore.json` | **yes** (P-F4/P-F5 calibration) |
| 4 | `kbside` | Edit 1 w/ `screenSide: -1` + Edit 2 | `combat` | `combat-kbside.png`, `telemetry-kbside.json` | **yes for SHIP** (P-F7) |
| 5 | `restore` | shipped (reverted) | `combat` | `combat-restore.png` | conditional (P-F6) |

Two shots is ≈ 11–13 min of hold at ~14 s/frame × 17 frames; one shot is ≈ 6–7 min. **Scoring happens
at the first wake after a chunk lands, before anything else (§163.2).** A missing `shots/` directory
after a rollback is not evidence about whether a run happened (§14, §139.3) — the committed frame is.

**Resume rule.** Restart at the first chunk whose PNGs are not in `progress/records/combatrecipient1/`.
Chunks are independent; chunk 3 does not need chunk 2 scored, only chunk 2's frames present.

### 5.1 Operator card — everything a resumed agent needs, in one place

The container rolls back roughly every 45 minutes and a resumed agent reads its transcript, not the
repo (§143.3), so the procedure is here rather than in anyone's head. All paths absolute.

```
# 0. where am I?
python3 /home/user/Demo/progress/records/combatrecipient-arms.py check     # tree state + which arm
ls /home/user/Demo/progress/records/combatrecipient1/                      # which chunks landed
python3 /home/user/Demo/progress/records/combatrecipient-score.py --selftest   # 9/9 or do not score

# 1. IF the tree is not base (a previous chunk died holding an arm) — do this FIRST
python3 /home/user/Demo/progress/records/combatrecipient-arms.py revert

# 2. one chunk = launch and wait. DO NOT install the arm by hand — the harness does it
#    itself, INSIDE the held lock, and reverts before releasing (see below).
bash /home/user/Demo/tools/launch.sh \
     /home/user/Demo/progress/records/combatrecipient.mjs \
     <ABSOLUTE log> <ABSOLUTE pidfile> <arm> combat sly-profile
#    ... wait for "DONE arm=<arm>" in the log ...
python3 /home/user/Demo/progress/records/combatrecipient-score.py
```

**Never install an arm before launching.** The FIFO queue here routinely runs 20–60 minutes deep,
and `src/` is shared: an arm installed at launch time sits in the tree across *other owners'*
boots, and because the bundler reads the tree at boot (§124.4) their capture would silently render
my candidate. That is the worst failure shape available here — invisible, and in someone else's
result. So `combatrecipient.mjs` inverts the order itself:

```
acquire lock  ->  install arm  ->  boot vite  ->  capture  ->  revert arm  ->  release lock
```

The revert runs from a `finally`, **before** the lock is released, so a crash mid-capture still
hands the tree back clean; `arms.py revert` asserts the file back to base's sha256 and `arms.py
install` refuses to run on a tree that is not base. **The tree must be at base whenever this task
is not holding the lock** — `arms.py check` answers that in one line.

Chunk 4 (`kbside`) captures `combat` only; chunk 5 (`restore`) captures `combat` only.

**Order matters and is not negotiable:** `combat` is staged **first** in every chunk, because it is
what creates the residue that `sly-profile` then measures. A chunk that captures `sly-profile`
without staging `combat` before it in the same boot answers a different question.

**If a capture dies:** record what landed in `RESULT-combatrecipient.md` and **stop**. Degradation
ladder, fixed in advance so it is not chosen after the fact:

| landed | verdict available |
|---|---|
| chunks 1–2 only | P1/P2/P3/P4 reported; **no SHIP** (no known-bad ⇒ P-F7 unresolved) |
| chunks 1–3 | + P-F4/P-F5 resolved; **no SHIP** (P-F7 still unresolved) |
| chunks 1–4 | **full verdict available** |
| chunk 5 absent | P-F6 unresolved; differing-pixel counts carry an unbounded boot-noise floor — say so, do not quote them as exact |

**Telemetry dumped per staged shot, in-page, at zero render cost:** every guard's world position,
yaw, type, route and clip; the resolved camera; `_shotLock`'s index; and the engine warning list.
That is what feeds P4c/P4d and P-F8.

**A tree gate, because the launch-time hash is not the rendered tree.** The harness hashes
`src/**` twice — once at launch, once *after* the boot — and records `srcStable`. It has to: a run
launched into a contended FIFO waits minutes to an hour before Vite reads the tree, so a
launch-time hash on its own is *a number that does not depend on the thing it claims to measure*,
which is the DIGEST's recurring defect and would have let an arm be scored against the wrong
source. **`srcStable: false` voids that arm outright** — no gate on it is scored. (§121.4: hash the
`src` tree, not the git SHA; §124.4: the bundler reads the tree at boot.)

*Caveat, recorded rather than quietly fixed:* **chunk 1 was already in flight when this gate was
added**, so its telemetry carries the launch-time hash only. Its tree state is instead guaranteed
procedurally — no `src/**` edit is made by this task until chunk 1 reports `DONE`, and
`combatrecipient-arms.py check` confirms the tree at base. Chunks 2–5 carry the gate.

---

## 6. Decision table

| outcome | action |
|---|---|
| B1–B3 out | chunk **VOID**, re-boot |
| P-F8b fires (stand > 1.20 m off) | verdict **WITHHELD**, re-anchor, re-seal |
| P-F8a fires (stand 0.30–1.20 m off) | **reported**, verdict proceeds on the pixel gates |
| P-F5 fires (`cand` ≠ `norestore` on `combat`) | verdict **WITHHELD**, re-seal with Edit 2 as a second lever |
| P-F7 fires (`kbside` doesn't read as failure) | **UNSCOREABLE** — no verdict either way |
| P-F4 fires and `norestore` also passes P4 | **UNSCOREABLE** (instrument wrong) |
| P-F4 fires and `norestore` fails P4 | **REVERT both edits** — mechanism insufficient |
| P3 > 0.40 or P3b > 560 | **REVERT both edits**; report the share; `minDist: 6.0` named as a *separate* seal, not a retune |
| P1/P1b/P2 out | **REVERT both edits**; report which and by how much |
| all gated bands in, both known-bads read as their own failures | **recommend SHIP** of Edit 1 + Edit 2 to the coordinator, with file/line/old→new as in §1. The ship decision is the coordinator's, not mine. |

**Edit 2 may be shipped without Edit 1** (it is a standalone correctness fix with a measured null on
today's tree). **Edit 1 must not be shipped without Edit 2**, and that is a registered recommendation
with a measured basis, not a preference: without the restore a guard stands in five character-sheet
frames.

---

## 7. Routing NOT sealed here

- **Sly reads brown, not blue (22 blue px)** → **FX + SHADING.** Untouched, ungated, reported only.
- **`_solveShotPose`'s scorer has no luminance term, and its occlusion test is one ray to chest
  height** → **GUARDS**, next vehicle. Not binding on `combat` (`tod 0.74`); it is exactly what let
  `guard`'s stand pass while 86% of him was behind a cornice (`NOTE-combatguard-staging.md` §3.1).
- **`spec.x`/`z`/`yaw` are dead fields and `Guard.js:150` documents a reader that does not exist; and
  `_poseForShot` discards `_solveShotPose`'s return value** → **GUARDS**, next vehicle. A live-code
  correction on a path no shipped shot exercises; it does not belong inside a look-change A/B.
- **`Particles._stageShot()`'s hardcoded impact anchor** → **FX.** This seal moves the world to the
  anchor; making the anchor find a target is a different and larger change.
- **CRITIC's `combat` figure box (360,390,720,670) now contains two characters** → **CRITIC /
  coordinator.** Its chalk statistic changes meaning if this ships. Flagged in §2.4 and repeated here
  because it is the most likely misreading of round 4.

---

## 8. Files of this seal (coordinator sweep list — no git run by this task)

- `/home/user/Demo/progress/records/PREREG-combatrecipient.md` (this file)
- `/home/user/Demo/progress/records/combatrecipient.mjs` — the capture harness (one arm per boot,
  telemetry per staged shot, PNGs written incrementally)
- `/home/user/Demo/progress/records/combatrecipient-arms.py` — builds / installs / reverts the four
  arm variants of `src/ai/Guard.js` by exact string replacement. **Carries base's sha256
  (`350dece5a1b13fb7…`) and refuses to build on a tree that is not base; `revert` is the exact
  inverse edit and asserts the result back to that hash.** Verified: all four arms parse, and all
  four revert to base byte-exactly.
- `/home/user/Demo/progress/records/combatrecipient-score.py` — the scorer. Every band is a
  constant copied from §2; `--selftest` reproduces 9/9 of CRITIC-sbs3's published `combat`
  statistics on the committed frame before it will score anything.
- `/home/user/Demo/progress/records/combatrecipient1/` (frames + telemetry, one commit per chunk)
- `/home/user/Demo/progress/records/RESULT-combatrecipient.md` (written after scoring)

`src/ai/Guard.js` is edited **only inside a held lock ticket and reverted before release**; it must
be byte-identical to `c8d8957` at every point where this task is not holding the lock.
