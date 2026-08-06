# RESULT-combatrecipient — status

**Seal:** `PREREG-combatrecipient.md`. **Owner:** GUARDS. **Tree at seal:** `c8d8957`,
`src/ai/Guard.js` sha256 `350dece5a1b13fb7…`.

> **This file is written incrementally and is the record of what actually landed.** The container
> rolls back roughly every 45 minutes (§163) and a resumed agent reads its transcript, not the repo
> (§143.3), so state goes here as it happens rather than at the end. Anything below marked
> **PENDING** has not been measured.

---

## Status

| item | state |
|---|---|
| `PREREG-combatrecipient.md` | **SEALED** — mechanism (file/line/old→new), gated predictions, known-bads, falsifiers, §17 declaration, chunked plan, operator card |
| `combatrecipient.mjs` (capture harness) | **written, syntax-checked**; its screen projector cross-validated against an independent Python implementation to the decimal on all seven cameras |
| `combatrecipient-arms.py` (arm builder) | **written and verified**: four arms build, all parse under `node --check`, all revert to base **byte-exactly**; `cand` and `kbside` differ in exactly one token (the `screenSide` sign) |
| `combatrecipient-score.py` (scorer) | **written, calibrated 9/9** against CRITIC-sbs3's published `combat` statistics, and **dry-run end-to-end on synthetic frames** so it cannot crash on the real ones |
| chunk 1 `base` | **LANDED AND SCORED** (2026-08-06, srcTree `59fd366596517cf2`). `combat` 221.1 s, `sly-profile` 130 s; tree checked back to **BASE** (`Guard.js` sha `350dece5a1b13fb7`) by the runner's own `finally`. Instrument **CALIBRATED 9/9**. Base gates **PASS**: B1 figure medL **120.02** ∈ [112,128], B2 core meanR−B **+88.2** ∈ [+78,+98] ⇒ **not VOID**. B3 `minDist(stand)` **16.2638 m** (`combat`) / **15.8696 m** (`sly-profile`) — no guard near the stand, i.e. **base carries no residue**, which is what makes it the control the seal needs. |
| **P4d** | **STRUCK — see §190 and the strikethrough at its declaration site.** Demoted to REPORT-ONLY from the `base` arm alone, with `cand` still third in the FIFO queue and no candidate number in existence. |
| chunks 2–5 | **RUNNING** — `cand`, `norestore`, `kbside` dispatched 11:59 UTC (pids 3825/4328/4754, all ppid 1 verified per §189), queued ahead of `staging2` and `litwarm1` per §188.2 short-first |
| `src/ai/Guard.js` | **BASE, unmodified.** `combatrecipient-arms.py check` → `matches arm: ['restore']`, sha `350dece5a1b13fb7…` |

### What the next agent (or a resumed me) does first

1. `ls /home/user/Demo/progress/records/combatrecipient1/` — if `combat-base.png` and
   `sly-profile-base.png` are there, chunk 1 landed while nobody was watching.
2. `python3 /home/user/Demo/progress/records/combatrecipient-score.py` — scores whatever is on
   disk, self-tests the instrument first, and refuses to trust itself if the 9/9 calibration fails.
3. `python3 /home/user/Demo/progress/records/combatrecipient-arms.py check` — must say **BASE**. If
   it does not, a chunk died holding an arm: `revert` before anything else.
4. Then chunk 2 per the seal's operator card (§5.1). **Do not hand-install an arm** — the harness
   does it inside the held lock and reverts before releasing.

**No `src/**` edit has been made.** The four arm variants exist only as a generator; nothing is
installed until the lock is held, and `revert` runs before release.

---

## Findings already on the record (all pre-capture, all from source + committed frames)

These are settled and do not depend on any capture landing.

1. **STAGING's diagnosis reproduces exactly, independently re-derived.** The impact anchor
   (0.3146, 1.3849, 28.9963), its projection at px (451.9, 432.6) d 4.906, the 0.890 m it sits
   *nearer the lens* than Sly's chest, the d = 4.5 rejection at ndc −1.095, the winning
   d = 5.0 stand (0.102, 0, 29.035), the 0.216 m anchor gap, and `screenSide −1`'s 2.038 m miss —
   every figure, from a projector validated sub-pixel against a number `Shots.js` published before
   either note existed.
2. **`spec.x` / `spec.z` / `spec.yaw` are dead fields — confirmed.** Only `index, look, clip, t,
   screenSide, minDist, maxDist, towardCamera` have readers. `Guard.js:150`'s documented COLLISION
   fallback does not exist, and `_poseForShot` discards `_solveShotPose`'s return value.
3. **The restore hazard is worse than "0.97 m from a spawn", and it is FIVE shots, not four.** A
   guard parked at the combat stand projects **into the viewport** of `sly-closeup`,
   `sly-startle`, `sly-perch`, `sly-arm` and `sly-profile` — every shot that stages the player at
   exactly (0, 0, 30). In `sly-profile` he is a **272 × 498 px body standing 1 m behind the
   character in a character sheet**, 14.7% of frame. `sly-key` (at (4, 0, 30)) is the safe one.
   Both the brief's "four" and STAGING's "sly-closeup, sly-profile and sly-key" are slightly off.
4. **The hazard is index-independent**, which is why this seal uses `index: 0` against STAGING's
   "not 0": the residue is a function of the *stand*, which `_solveShotPose` computes from the
   camera alone. Index 0 confines all staging mutation to the one roster member `SHOT_POSE`
   already touches.
5. **Today's `guard` stand leaves no residue**, so Edit 2 changes nothing that ships: (−15.49, 0,
   27.55) is off-frame left in `sly-profile` and behind the lens in `sly-key`, the only two shots
   that follow `guard`.
6. **A canonical full-set run would appear to self-heal, and that is an accident, not a fix.**
   `guard` (shot 13) restages roster #0 five shots after `combat` (shot 12) and moves him out of
   sight. Every *subset* run — which is what everyone actually runs — still carries the residue.
7. **`Shots.js`'s `guard` header's "d = 2.9 m" is a range, not an axial depth** (range 2.891,
   depth 2.715). Harmless; recorded so nobody spends a run on the 0.18 m.
8. **Three defects caught in my own tools before they could cost anything:**
   - a corner-in-viewport test that called `sly-startle` **safe** precisely *because* the residue
     fills its frame (every corner falls outside the viewport). Replaced with bbox overlap.
   - a **launch-time** source hash standing in for the tree the boot actually renders. On a FIFO
     that runs 20–60 minutes deep those are different trees, so the hash was a number that did
     not depend on the thing it claimed to measure. The harness now hashes at launch *and* after
     the boot and records `srcStable`; false voids the arm.
   - **a contamination hazard in my own capture plan.** `withGame` acquires the lock as its first
     action, so the obvious procedure — install the arm, then launch — would have left
     `src/ai/Guard.js` modified in the *shared* tree for the 20–60 minutes my run sat in the
     queue, across other owners' boots. Because the bundler reads the tree at boot (§124.4),
     **their captures would have silently rendered my candidate.** The harness now does
     `acquire → install → boot → capture → revert → release` itself, with the revert in a
     `finally` so a crash still hands the tree back clean, and `arms.py install` refusing to run
     on a non-base tree. Nothing was installed before this was found: `src/**` has never been
     modified by this task.
9. **A confound inside P4 with a registered address.** Roster #0's own `south_gate` route projects
   into `sly-profile` at four of seven waypoints (60–83 px tall, x 915…1270, y 121…209), and the
   restore cannot return the 0.283 s of patrol he did not live through while frozen — so a
   1,600–3,300 px change component is expected *there*. The residue this seal gates lives at
   x 652…924, y 67…565. Both addresses are registered so that a borderline component cannot be
   argued either way after the fact.

### Two pre-capture amendments to the seal, both recorded rather than silently swapped

- **§2.0 — the Sly colour mask is STRUCK.** On `sbs3/combat.png` the sunlit paving reads
  **medSat 0.579 at medL 134** against Sly's own torso at **0.394**, at the same hue: *the floor is
  more saturated than the character.* The sealed predicate returned 58,982 px in a box holding
  roughly ten thousand of him — §128.2's denominator hazard. P3 is re-registered on geometry
  (share of Sly's projected body box covered by the recipient's change component, ≤ 0.40) plus an
  absolute intrusion line (component right edge ≤ 560, Sly's centre being 576).
- **P-F8 — loosened, and the loosening is declared.** Its stated reason ("the registered rects are
  then not measuring the subject") was falsified by my own contingency arithmetic before any frame
  existed: at the plausible d = 5.5 fallback the rects still measure the subject. It is now a
  reported premise check (> 0.30 m) with WITHHELD only past 1.20 m. **It touches no band that
  decides SHIP.**

---

## Gate results

**PENDING** — no frame of this seal has been captured yet. Scoring happens at the first wake after
a chunk lands, before anything else (§163.2), by
`python3 /home/user/Demo/progress/records/combatrecipient-score.py`.

## Verdict (superseded — see the final Verdict at the end of this file)

**PENDING.** Per the seal's degradation ladder (§5), chunks 1–2 alone give reported P1–P4 with
**no SHIP** (the `kbside` known-bad is unresolved); chunks 1–4 give a full verdict. **The ship
decision is the coordinator's**; this file will name file, line and old→new either way.

---

## Files (coordinator sweep list — no git run by this task)

- `/home/user/Demo/progress/records/PREREG-combatrecipient.md`
- `/home/user/Demo/progress/records/RESULT-combatrecipient.md` (this file)
- `/home/user/Demo/progress/records/combatrecipient.mjs`
- `/home/user/Demo/progress/records/combatrecipient-arms.py`
- `/home/user/Demo/progress/records/combatrecipient-score.py`
- `/home/user/Demo/progress/records/combatrecipient1/` (frames + telemetry; empty until chunk 1 lands)

---

## Base arm — measured, 2026-08-06

```
--- SELFTEST vs CRITIC-sbs3 published combat numbers ---
  figure medL 119.98 | figure medSat 0.435 | chalk 9122 px | blue 22 px
  core medR 178 / medG 120 / medB 87 | core meanR-B 88.2 | frame L>200 sat<.15 131
  => instrument CALIBRATED (9/9)

--- BASE GATES (VOID, not FAIL, if out) ---
  B1   figure medL 120.02   band [112.0, 128.0]   PASS
  B2   core meanR-B +88.2   band [+78.0, +98.0]   PASS
  B3   base minDist(stand) = 16.2638 m            (no guard near the stand)
  SLYBB = (503, 334, 648, 660) = 47270 px (projected; a deliberate under-estimate)
  cane-hook ink (base) = 1000 px   [P3c, reported not gated]

  [base] srcTree 59fd366596517cf2
    combat       minDist(stand)=16.2638  spawnHits={closeup:7, perch:7, profile:2, key:7}
    sly-profile  minDist(stand)=15.8696  spawnHits={closeup:7, startle:1, perch:7, profile:2, key:7}
```

### What the base arm decided, beyond passing its own gates

The `spawnHits` row is why **P4d is struck** (§190). Base is residue-free — B3 puts the nearest
guard **16.26 m** from the combat stand — and it *still* registers overlaps in all five spawn
cameras, from guards standing **15.9, 29.3, 34.1, 41.9, 75.6, 88.3 and 95.9 m** away, of types
`temple`, `heavy` and `scarab`. That is the level's ordinary roster, not the residue.

A predicate that a residue-free control cannot satisfy is not measuring the residue. P4d was
therefore **unpassable on `cand`** and **unfailable on `norestore`**, and it is now report-only,
printing the threshold-free nearest-overlapping-guard distance instead of a verdict.

**The seal is unaffected in substance.** The residue keeps three independent gates, all
position- or pixel-specific: **P4c** (`minDist(stand)` ≥ 2.0 m on `cand`, ≤ 0.5 m on `norestore`
— the same fact P4d was reaching for, measured against the stand instead of the viewport), **P4**
(frame-wide Δ ≤ 0.5 % of frame), and **P4b** (a ≥ 3,000 px component overlapping the registered
residue address). Base's own 16.26 m is the control that makes P4c readable: it establishes that
the shipped tree has no residue, so `norestore`'s predicted collapse to ≤ 0.5 m is a real signal
rather than a baseline.

## Verdict (superseded — see the final Verdict at the end of this file)

_(was: pending `cand` / `norestore` / `kbside`)_

---

## `cand` arm — measured, and **P-F1 FIRES**

`srcStable=true` (launch == atLock, boot == postInstall — §191's corrected check), tree reverted to
BASE `350dece5a1b13fb7` by the runner's own `finally`.

### The residue half PASSES, cleanly

| id | quantity | band | measured | |
|---|---|---|---|---|
| **P4** | `sly-profile` frame-wide Δ | ≤ 4,608 px (0.5 %) | **108 px (0.01 %)** | PASS |
| **P4b** | largest component at the residue address | < 3,000 px | **0** | PASS |
| **P4c** | `sly-profile` `minDist(stand)` | ≥ 2.0 m | **15.8106 m** | PASS |

And the seal's central geometric claim lands **exactly**: on `combat` the recipient stands at
`[0.1019, 0, 29.0349]`, **off-prediction 0.000 m** (P-F8a ok), with `lock=0` where base had
`lock=-1`. Edit 1 puts a recipient at the stand the note computed, and Edit 2 removes him again by
the next shot — `minDist(stand)` goes `0.0001 m` on `combat` → `15.8106 m` on `sly-profile`. The
restore works.

### The appearance half FAILS, and not narrowly

```
combat: base vs cand — frame-wide differing px 446,643 (48.46% of frame)
        largest component: area 436,368  bbox (152,0)-(1279,719)
  P1    area 436,368        band >= 20,000, centre +-60          **FAIL**
  P1b   bbox inside RECIPBOX+70   band (237,238,613,813)         **FAIL**
  P2    flash-disc changed 0.245  band >= 0.8                    **FAIL**
  P3    SLYBB covered 0.474       band <= 0.4 (pred 0.28-0.34)   **FAIL**
  P3b   component right edge x1 = 1279  band <= 560              **FAIL**
  P2b   flash-disc ink 0.126      band >= 0.04 (weak, reported)  PASS
  P3c   cane-hook ink 1000 -> 1207 (+21%)   [declared cost, NOT gated]
```

**What the frames show.** The recipient spawns **interpenetrating Sly** — his body and staff pass
straight through the player character. P3 is the gate that caught it and it is the honest one:
predicted occlusion 0.28–0.34 of Sly's bbox, measured **0.474**. Nearly half the player is behind
the guard the seal added. The seal's geometry was right (the stand is exact to 0.000 m); what was
underestimated is what standing 0.890 m nearer the lens than Sly's chest *looks like*.

**The 48 % is real, not an instrument artefact — established by controls that should have been
quiet and were.** Two regions far from the recipient are pixel-identical between arms:

```
top-left sky/tower   4.1% differing   base mean RGB [49.9 60.1 79.5] == cand [49.9 60.1 79.5]
floor bottom-left    1.7% differing   base [142.0 96.6 74.5] ~ cand [140.4 95.7 74.1]
```

So there is no global grade shift and no exposure drift. The change is confined to the recipient
**plus the right half of the frame**, where a large wall leaves shadow entirely:

```
right wall mid       100.0% differing  base [52.5 66.5 87.4] -> cand [103.9 98.6 91.0]
floor bottom-right    99.4% differing  base [132.6 85.5 65.7] -> cand [149.7 104.6 76.1]
```

Dark blue-grey to light warm grey at every pixel is a surface going from shadowed to lit, which is
consistent with the recipient joining the shadow-caster set and the cascade refitting around him.
That is a **second, unpredicted consequence** of the edit, and it is registered here as an
observation rather than folded into any gate — the seal did not band it, so it is not scored.

### Verdict on the candidate

> **CORRECTED below, after the `norestore` arm landed — see "P-F5 and the real verdict".** The
> reading in this subsection was taken with only `base` and `cand` on disk. P-F5 subsequently
> fired, and its registered consequence explicitly covers the P1–P3 numbers this paragraph rests
> on. The candidate still does not ship; the *outcome* is **WITHHELD**, not a P-F1 revert.

~~**P-F1 fires: P1, P1b and P2 are all out of band on `cand` ⇒ REVERT both edits.**~~
`src/ai/Guard.js` is already at BASE (the runner reverts inside the lock), so there is nothing to
undo in the tree — the candidate **does not ship** either way.

**No retune.** The seal forbids moving `minDist`, `screenSide`, `clip` or `t` toward a band, and a
different stand is a different prereg (§141.1). The right next move is a new seal that registers
occlusion of the player as a *first-class* quantity rather than a side condition, and that decides
the shadow-cascade consequence before capturing, not after.

**What this seal bought.** A recipient that interpenetrates the player would have been shipped on
the strength of "the combat veil now has something to land on" — the residue half passes, the
geometry is exact to a millimetre, and the telemetry all looks healthy. The frames are what said
no. Pre-registering P3 with a numeric band is what turned "it looks wrong" into a falsifier that
fired on its own terms.

_(Formal seal closure still awaits `norestore` and `kbside` for P-F2 instrument certification —
both are running. Their result cannot rescue the candidate; P-F1 is unconditional on `cand`.)_

---

## `norestore` arm, P-F5, and the real verdict

### KB-P4c reads as its own failure — the residue mechanism is real

| arm | edits | `sly-profile` `minDist(stand)` | |
|---|---|---|---|
| `base` | none | **15.8696 m** | no residue — the control |
| `norestore` | Edit 1 only | **0.0001 m** | residue present; KB band ≤ 0.5 m ⇒ **reads as its own failure** |
| `cand` | Edit 1 + Edit 2 | **15.8106 m** | Edit 2's restore removes it |

**P-F2 does not fire on P4c.** The known-bad is detectable, so the residue instrument is certified
in the direction that matters, and Edit 2 demonstrably does the job it was written for.

**This also sharpens §190 rather than merely confirming it.** The residue's true signature in
`spawnHits` is a **±1 delta buried in counts of 7**: `norestore` reads `sly-startle 1→2`,
`sly-arm 0→1`, `sly-key 7→6` against base — roster #0 leaving one camera's view and entering two
others as he moves to the stand. A boolean "any overlap in any of the five" can never see that. The
struck gate was not merely unpassable; it was blind to the exact quantity it was named for.

### P-F5 fires, and it governs

```
combat: cand vs norestore = 82,091 px differing   band == 0 (Edit 2 inert on combat)   **FAIL**
```

The seal argues in §1 that Edit 2 is a no-op on the treated frame, because the restore happens
*after* `combat`. It is not a no-op. P-F5's registered consequence is precise about what that costs:

> *"if it is not, the argument is wrong, and every P1–P3 number is attributing to Edit 1 something
> Edit 2 did ⇒ **verdict WITHHELD**, re-seal with Edit 2 as a second lever."*

P1, P1b and P2 are exactly the numbers P-F1 reverts on. P-F5 says those numbers cannot be
attributed. **So the registered outcome is WITHHELD, and it supersedes the P-F1 reading above** —
not because the candidate looks better than it did, but because the seal cannot say *which edit*
produced what it measured. Claiming "P1 failed, therefore Edit 1's recipient is wrong" would be
attributing to Edit 1 something Edit 2 may have done, which is the one inference P-F5 exists to
forbid.

**What is safe to say without attribution.** The candidate as a whole produces a broken combat
frame: the recipient interpenetrates Sly and covers 47.4 % of his bbox, visible in the frames and
independent of which edit causes it. **It does not ship.** What cannot yet be said is *why*.

### One thing must be ruled out before P-F5 is believed: the noise floor

P-F5's band is **0 px between two separate boots**. That is only a meaningful band if two boots of
*identical source* actually agree to 0 px — and nothing in this capture has measured that yet. If
boot-to-boot variation is itself of order 10⁴ px, then P-F5's band was unachievable from the start
and the falsifier is unscoreable in the §190 sense, rather than a finding about Edit 2.

The seal already contains the control: the **`restore` arm**, byte-identical to `base` by an
assertion in the arm builder (`assert A['restore'] == base`), captured in its own boot — which is
what **P-F6** compares. It was not in the original dispatch; it has now been queued **ahead of
`staging2` and `litwarm1`** because it decides between two different verdicts:

- **`Δ(base, restore)` ≈ 0** ⇒ boots are deterministic ⇒ the 82,091 px is really Edit 2 ⇒ **P-F5
  stands, verdict WITHHELD**, re-seal with Edit 2 as a second lever.
- **`Δ(base, restore)` ≈ 10⁴–10⁵ px** ⇒ the 0-px band was never achievable ⇒ **P-F5 UNSCOREABLE**,
  and P1–P3 attribution survives ⇒ the **P-F1 revert governs** after all.

Either way the candidate does not ship. The control decides what the seal is entitled to *say*, and
it is registered rather than invented for the occasion.

## Verdict

**WITHHELD** (P-F5), pending the `restore` arm's determinism control. The candidate does not ship
under any branch. `kbside` also outstanding for P-F7.

---

## `kbside` — **P-F7 fires. The seal is UNSCOREABLE**, and the known-bad is the better frame

```
combat: base vs kbside — frame-wide differing px 443,048 (48.07%)
        largest component: area 234,556  bbox (0,261)-(612,719)  centroid (272,495)
  KB-P1   area 234,556              band >= 20,000 (a guard IS present)     PASS
  KB-P2   flash-disc changed 0.824  band <= 0.15 (must NOT be on target)    **FAIL**
  KB-P4   176,745 px                band > 4,608 (known-bad MUST regress)   PASS
  KB-P4c  minDist(stand) 0.0001 m   band <= 0.5 m                           PASS
```

**P-F7's condition is met exactly**: *"if `kbside` scores P2 > 0.15 … then P2 cannot distinguish
'a guard is in the frame' from 'the arc lands on him' ⇒ **UNSCOREABLE**, no verdict in either
direction."* It scored **0.824**.

**And the failure is an inversion, not a near-miss.** Each arm landed inside the *other's* band:

| arm | intended | P2 band | P2 measured |
|---|---|---|---|
| `cand` | arc lands **on** the recipient | ≥ 0.80 | **0.245** |
| `kbside` | arc **misses** by 2.038 m | ≤ 0.15 | **0.824** |

An uncalibrated metric has no scale (§141.1). One that reads backwards has less than none, because
every earlier P2 number in this file was quoted with a sign the metric does not support.

### The frames say the known-bad is the shot the seal was trying to build

This is the finding worth carrying forward, and it is visible rather than inferred:

- **`cand`** — the recipient spawns **interpenetrating Sly**; body and staff pass through the
  player character, covering 47.4 % of his bbox. The frame is broken.
- **`kbside`** — **Sly reads clean and unobstructed in his combat pose, and the recipient stands to
  his right, reeling from the strike.** Two separated silhouettes, correct depth order, the flash
  behind them. It is the composition §1 set out to achieve.

So the seal's premise about `screenSide` is **backwards in effect**: the sign it registered as the
candidate puts the recipient on top of the player, and the sign it registered as the *known-bad*
produces the intended staging. `kbside`'s stand is 2.200 m from the computed impact anchor, so the
recipient is **not** where the arc mathematically lands — and it still reads better. That tension is
the real content of this capture: **the impact anchor was assumed to be the right target for
composition, and the frames say it is not.** A body placed exactly at the arc's terminus stands
inside the player, because the arc terminates at arm's length.

### Scope note on P-F8b, flagged not chased

`P-F8b` fires on `kbside` (stand `[1.523, 0, 27.3554]`, off-prediction **2.200 m** > 1.20 m). But
`kbside` is *defined* as the arm whose stand differs — a 2.038 m miss is its entire purpose. The
check is reading the known-bad doing its job and calling it a premise violation. It is scoped to
"the telemetry stand" without saying *whose*, which is the §189–§192 shape again in miniature. Not
repaired here: it changes no outcome (the seal is already UNSCOREABLE), and the re-seal should
scope it to the candidate arm explicitly rather than have me widen or narrow it mid-capture.

## Verdict — FINAL for this seal

> **~~WITHHELD (P-F5)~~ → UNSCOREABLE (P-F7), which subsumes it.** P-F5 withholds a verdict because
> attribution between Edit 1 and Edit 2 is unsafe; P-F7 says the metric doing the attributing has
> no scale at all. The stronger statement governs: **this seal returns no verdict in either
> direction.**

**The candidate does not ship**, and that conclusion needs none of the failed metrics — it rests on
the frames: the recipient interpenetrates the player character.

**What is certified and survives to the re-seal:**

1. **The residue mechanism is real and Edit 2 fixes it.** base 15.87 m (no residue) → `norestore`
   0.0001 m (residue) → `cand` 15.81 m (restored). KB-P4c passes at 0.0001 m against ≤ 0.5 m, so
   this instrument *is* calibrated — it is the one that was.
2. **The stand solver is exact.** `cand`/`norestore` land at `[0.1019, 0, 29.0349]`,
   off-prediction **0.000 m**.
3. **`screenSide −1` is the composition candidate**, on frame evidence, and the next seal should
   register it as such — with occlusion of the player as a *first-class gated quantity*, a P2
   replacement validated against both arms before capture, and the shadow-cascade refit (a wall
   going from shadowed to lit at 100 % of its pixels) modelled rather than discovered.

**Not re-tuned, not re-run under new bands.** `restore` is still queued and will settle whether
boot-to-boot noise is 0 px or 10⁴ px; that number is worth having for the next seal's P-F5, but it
cannot change this one's outcome.
