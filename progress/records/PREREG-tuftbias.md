# PREREG — `TUNE.tuftShadeMix` two-arm capture (0.82 ship vs 0.40)

Written **before** the arm is queued, and before `char-ink` has landed. Nothing below may be
edited after a frame exists; corrections go in a RESULT file underneath.

Owner: CHARACTER. Files touched: `src/player/SlyModel.js` only (one constant).

---

## 1. What is being tested, and why it is not the knob three generations tuned

`Body.addTuft` blends each fur-clump vertex normal toward the **host surface normal** by
`shadeMix`, default `0.82`, previously hardcoded inside the helper and now surfaced as
`TUNE.tuftShadeMix` (behaviour-identical). One attribute — the vertex normal — is then read by
**two consumers**:

| consumer | what it does with the normal | which direction it wants the bias |
|---|---|---|
| **cel ramp** (SHADING) | `N·L` → band index | **HIGH.** At 0.82 no clump can land in a different band from the skin beside it. That is the entire reason the bias exists. |
| **inverted hull** (`Outline.js`) | extrudes vertices along the normal | **LOW.** At 0.82 every vertex of a card moves in nearly the *same* direction, so the shell **translates bodily instead of inflating** — a card-sized black offset, not a border. |

This is the mechanism I registered in `SlyModel.js` before measuring, and the flat-albedo sweep
then confirmed the half of it that a flat-albedo instrument can see:

```
tuftShadeMix   ink px   ink frac   visible CARD px
  0.82 (ship)   14048     0.2125         3124
  0.40           8166     0.1241         7155
  0.00           7942     0.1207         7380
(no cards at all, for scale:  8341 ink)
```

`tuftInk` moved ink 105 px; this moves it 5882 — **56×**. Density 2.2 → 1.05 → 0.46, card width
and roll width were all downstream of it.

**Why that table cannot decide the question.** `furheld.mjs` renders **flat albedo**. It can see
the hull and is *structurally blind to the cel ramp* — i.e. blind to the one thing the bias is
for. Shipping 0.40 on it would be §36 exactly: rigorous apparatus, wrong layer.

---

## 2. Arms

Two boots, one shot each, `sly-closeup` (33° bearing — the framing where the cheek row is
largest and where a face-on card population is most exposed).

- **Arm A** `tuftShadeMix: 0.82` — ship value, the control.
- **Arm B** `tuftShadeMix: 0.40` — the sweep's inflection; 0.00 is excluded deliberately (it
  removes the clump's own form entirely and is the strictly more dangerous end of the same axis).

Judged on the **frame**, at a head crop, by eye. Statistics are reported alongside but do not
rule — that is the whole point of running this in a renderer.

---

## 3. Registered outcomes — BOTH directions, in advance

### 3.1 What a BETTER SILHOUETTE looks like (the win I am hoping for)

- Cheek and chest clumps read as **lobes with an edge**: a thin ink border that follows the
  clump's own outline, rather than a filled black shape.
- The head's outer contour becomes **serrated** — the clumps break the capsule at the
  silhouette edge, which is §7.3's actual fur test.
- Black area *inside* the lit cheek falls. The chips stop being ink and become fur.

### 3.2 What a WORSE CEL-RAMP READ looks like (the loss this arm can cause) — REGISTERED

The coordinator's requirement, and it is the outcome I consider **more likely than not** for
arm B. Specific observable signatures, any one of which counts as the loss landing:

- **Speckle / measles in the lit band.** Clumps on the *face* of the cheek — not at its edge —
  taking a darker band than the skin around them, so the lit cheek reads as stippled or dirty.
  This is precisely what the 0.82 bias was authored to prevent.
- **A ragged terminator.** The cheek's band boundary, currently a clean curve, breaking into a
  dotted or scalloped line as individual clumps flip band across it.
- **Clumps reading as detached objects** — a clump whose value no longer belongs to the surface
  it grows from reads as debris stuck to the fur, not as fur.
- **Loss of form on the tail rings**, where the clump rows are dense and a per-clump band flip
  would turn a ring into noise.

### 3.3 The decision rule, written before the frames exist

- **B better on silhouette AND no signature from 3.2** → ship 0.40. (I do not expect this.)
- **B better on silhouette AND any signature from 3.2** → **do not ship either value.** Report
  the trade as priced and hand it to the structural fix in §4. Interpolating to 0.6 to split
  the difference is explicitly **out of scope for this arm** — it buys half a win and half a
  loss on an axis where I will have just demonstrated that no value wins both, and it is how a
  fourth tuning generation gets spent downstream of the same coupling.
- **B worse on silhouette** → the mechanism in my `SlyModel.js` note is *wrong rather than
  mistuned*, the same disposition I registered for `tuftInk`. Say so, and stop treating the
  normal bias as the lever.
- **No visible difference at all** → the hull weight and the bias are both near-inert in a real
  frame, and the ink the critic is seeing comes from somewhere I have not identified. That
  would retire the whole clump-ink hypothesis rather than refine it.

---

## 4. What this arm CANNOT close, stated up front

**A good result on either arm does not close §7.3's fur condition.** The trade exists only
because `slyNormal` is one attribute serving the ramp and the hull. The move that wins both is
**a separate hull normal attribute** — bias the shading normal 0.82 toward the host *and* keep an
un-biased normal for the shell to inflate along. That is `src/render/Outline.js` +
`ToonMaterial.js`, i.e. **SHADING's**, already routed with this framing, and held pending this
capture. If arm B shows the predicted split (better silhouette, worse ramp), that is not a
disappointing result — it is the **positive evidence** that the attribute split is worth
SHADING's time, because it demonstrates both jobs are live and in conflict on the same data.

---

## 5. Instrument and provenance caveats carried forward

- `furheld.mjs` is flat-albedo. Its numbers appear in the RESULT for continuity **only**; they
  cannot adjudicate §3.2 and must not be quoted as if they had.
- Capture provenance: `report.json` stamps the commit. Five agents are editing live. Before
  scoring, diff `src/player/**` between the intended tree and the booted commit and confirm any
  delta is behaviour-identical — as was done for `char-ink` (the `spec.ink` publication already
  existed on the shading path at `831f6de`; HEAD only added the fallback).
- Arm A must be **re-captured in the same session as arm B**, not compared against an older
  `char*` directory. TEXTURES landed a non-inert chisel change at `c54e41f`/`6e1fb05`; an
  A-vs-old-capture comparison would confound the character knob with an architecture texture.

## 5b. ADDENDUM, added 15:50 — BEFORE `char-ink` landed, and it closes one branch of §3.3

SHADING's in-page probe (`compose1/run.log`, boot at 15:48, real renderer, not a proxy) reports:

```
INK PROBE {"ok":true,"count":8454,"min":0.40,"max":1,"groups":11,"mats":11,
           "weights":[1,1,1,1,1,1,1,1,0.4,0.4,0.4],"hasShell":true}
```

Eleven material groups, **three of them carrying 0.40** — the three `furTuft*` groups — across
8454 shell vertices, with `hasShell: true`. So `TUNE.tuftInk` is **verified live in the real
renderer**, independently of me and independently of `char-ink`.

This is not a small bookkeeping note; it **removes the "dead knob" explanation in advance**.
§3.3's last branch ("no visible difference → the knob is near-inert") can no longer be read as a
delivery failure. If `char-ink` shows unchanged chips, the weight *was* applied at 0.40 to the
right vertices and the chips survived it — which is the translation-not-inflation mechanism, i.e.
the registered prediction, confirmed rather than merely unfalsified. §36's usual escape ("your
apparatus never reached the thing") is closed here before the frame exists.

## 5c. A THIRD LEVER, registered now so it is not later mistaken for a post-hoc idea

Recorded at 15:53, before any `char-ink` frame exists, and **deliberately not implemented** —
touching `src/player/**` while a capture is queued to boot would change the tree it renders and
destroy the provenance of the run I am about to score.

Looking at `furheld.mjs`'s card-highlight proxy (`held4/y-sly-closeup-A-ship.png`, cards in
magenta), the chip-producing population is visibly **the cards lying face-on** — chest, thigh,
forearm, near cheek — not the cards at the contour. That matches the on-face/edge split already
measured per row (`headR` 0% on-face in all four framings, `headL` 95.5/97.4/84.6/61.5%).

Both levers now on the table act on the *hull* (`tuftInk`) or on the *normal* (`tuftShadeMix`).
A third acts on the **geometry**: a clump's `dir`. A clump extruded along the surface normal is,
on the near face, a compact foreshortened blob — a chip. A clump swept **tangentially** (laid
back along the surface rather than standing off it) is nearly invisible face-on and still breaks
the contour at the limb's edge, because at the edge the tangential direction is the one that
projects at full length. `Body.addTuft` already takes `dir`, `bend` and `bendDir`, so this is a
placement change, not new geometry.

**Why it is not obviously right, stated now rather than after it fails:** a fully tangential
clump may simply disappear into the surface and return the smooth capsule of the no-cards arm
(`held4/y-sly-closeup-C-none.png`, which reads as unmistakable plastic). There is likely a
sweep angle that keeps contour serration while flattening the near-face blobs, and there is
equally likely not. It is a **third arm, after the bias arm resolves**, not a parallel change —
running it concurrently would confound the one variable this capture exists to isolate.

## 6. Plane caveat on any pose measurement quoted alongside this

The line-of-action figures I have reported (`perch_idle` 0.045 / 0.082 / 0.045 m hips/chest/head)
are **lateral displacement only**. That measure is blind to the sagittal plane — it scores
`cane_combo_3`'s 0.88 m stride as zero. **Any pose number I quote from here on names its plane**,
and a pose is not "stiff" on the strength of a lateral-only figure.

---

## 7. ADDENDUM, added 18:40 on the capture day — sealed BEFORE the arm is queued

Three things the coordinator asked be registered up front rather than discovered in scoring,
plus two design changes to how the arm is run. Nothing above is edited; this is additive.

### 7.1 The statistic's own limit, registered in advance

`chipscore.mjs` **cannot rule on this arm in either direction, and I am not going to let a
number from it stand in for a verdict.** This is not a new caveat, it is a measured result from
the previous arm (`RESULT-tuftink.md` §2): the dark-pixel count it reports is 68–97% *one fused
component* — bandit mask + body ink outline + cast shadow + shadowed backdrop — while everything
chip-sized is 1–3% of the numerator. A change that shrank every chip by 60% moves that statistic
by well under a percentage point, which is **less than the +0.29 pp of drift already observed
between two captures from other agents' work**.

So, registered now:

- **The frame is the primary and the only thing that rules.** A head crop and a tail crop, by eye.
- Any `chipscore` / dark-fraction number appearing in the RESULT is **corroboration at best**,
  and is admissible only in the direction the frame already independently says.
- **A `chipscore` delta in either direction is not, on its own, evidence of anything** — a null
  is not a pass and an increase is not a fail. If I quote one without the frame agreeing, that
  is the error, not the finding.

This is DIGEST's recurring shape (a number that does not depend on the thing it claims to
measure) and it has now been established *about this exact statistic* before the frames exist.

### 7.2 The tail contour is the named scored population

The previous arm's finding was legible on the tail and nowhere else as clearly: every serration
rendered as a **solid black filled wedge**, notches bitten out of the silhouette rather than fur
catching light. That is where a normal-bias change should act most visibly, because the tail
carries the densest clump rows in the model and its contour is half the silhouette (§7.3).

So the tail contour is scored **specifically and first**, at the ROI the previous arm used
(`690,250 220x150` at 1280×720), at 4×. The registered question about it is binary and is
written before the frames exist:

> **Does a tail serration acquire an interior?** I.e. does it read as a lobe with a thin ink
> border and a lit face, rather than as a filled black wedge?

- **Yes** → the bias was the term controlling card ink, and the silhouette half of §3.1 landed.
- **No, still filled black wedges** → §3.3's third branch fires: the normal bias is **wrong
  rather than mistuned**, exactly as the hull-share mechanism was, and the clump-ink hypothesis
  is retired rather than refined. I would then have eliminated both levers I own on this axis,
  which is a result and should be reported as one.

Note the asymmetry deliberately: §3.2's *loss* signatures (speckle, ragged terminator, detached
clumps, loss of tail-ring form) are scored on the tail **and** the cheek, because the tail-ring
one is specifically a tail signature and the speckle one is specifically a face signature.

### 7.3 §3.3's decision rule stands unrelaxed, and here is why it is not relaxed now

Restating because it is now tempting to relax it: I know from the previous arm that the hull
mechanism is *wrong rather than mistuned*, so the "B wins silhouette" branch is less likely than
when §3.3 was written. That is not a reason to soften the clause.

> **B better on silhouette AND any §3.2 signature → neither value ships.**

Unchanged. Interpolating to 0.6 remains explicitly out of scope. The reason this clause is worth
keeping is that the bad outcome is the *useful* one: a demonstrated split — better silhouette,
worse cel ramp, on one attribute — is the **positive evidence** that SHADING's `slyNormal`
attribute split (a separate hull normal from the shading normal) is worth doing, per §4. A
half-win shipped at 0.6 destroys that evidence and buys nothing, and it is how a fourth tuning
generation gets spent downstream of the same coupling.

### 7.4 Design change: the arm runs as a CHAR_AB token, not as an edited constant

Changed from §2's implied "two boots at two values of the constant". Arm B is now the token
`tuftbias40`, read per call in `Body.addTuft`'s `put`.

The reason is the one `charABRaw`'s own note already records: editing a constant, capturing, and
editing it back **puts a modified character into whatever other agents boot in that window**, and
that is not hypothetical — it has already silently corrupted one queued A/B on this repo. Both
arms are now the same commit and differ only in the named treatment. The shipped path (empty
token) is 0.82 and is what every process that does not deliberately set the token gets.

Scoping registered: the token moves the **default** only. The single explicit per-row override in
the file (boot cuffs, 0.90) is untouched — it is justified at its site against a different
failure and is not this arm's population.

### 7.5 Design change: three arms in ONE lock hold, with a bit-identity back control

Changed from §2's "two boots". The run is one lock acquisition, one vite server, one browser,
three fresh page contexts:

| arm | token | purpose |
|---|---|---|
| **A** | *(none)* | ship 0.82, the control |
| **B** | `tuftbias40` | 0.40 |
| **BACK** | *(none)* | re-run of A — **must be bit-identical to A** |

Two reasons, both from this file's own history. §5 requires arm A be re-captured in the same
session as arm B rather than compared against an older directory; running both inside one lock
hold on one frozen vite build is strictly stronger than that — every other agent's code is
identical between the arms **by construction**, not by checking. And the BACK control is fx6's
restore-first discipline: if BACK is not bit-identical to A, something in the boot is not
deterministic and **the A-vs-B diff is uninterpretable**, so it is checked before anything else
is scored.

Registered consequence: **if BACK ≠ A byte-for-byte, I report the arm as void and score nothing
from it.** Not "score it with a caveat".

### 7.6 What would have made this arm unnecessary, recorded so the cost is visible

`cap2` (`shots/cap2/`, `guard` + `sly-closeup` + `hero`) was relaunched and completed, and it is
**298 commits and 1387 changed `SlyModel.js` lines stale** by the time it was read. It cannot
serve as arm A and is not used as one. Its frames are archaeology, not a control — which is §5's
warning arriving in practice rather than in principle.

---

## 8. CORRECTION to §7.4, found by probe BEFORE any frame of this arm existed

Recorded here rather than in a RESULT because no frame exists yet — the run is queued behind two
other agents and has not taken the lock. Timestamped so the order is checkable: found ~18:50,
capture ticketed 18:48, no PNG written.

### 8.1 The scoping I registered was half wrong

§7.4 says the token moves "the **default** only" and names the boot-cuff row at 0.90 as the one
exception. The first half is true and the framing around it was wrong. Measured on the built
geometry, two module instances, thresholded (`tuftnull.mjs`):

```
group          verts   >1deg   maxdeg
furTuft          288     288    171.9
furTuftCream     144     144    126.8
furTuftDark      120     120    165.0
clothDark       2576      72    158.6      <-- NOT registered, and it is real
every other        -       0      0.0
```

**624 vertices move, not 552.** The extra 72 are the **knee-ruff row** (`SlyModel.js:3305`, three
clumps per leg, both legs, twelve vertices each). It is a fur card that passes **no** `shadeMix`,
so it takes the default and is inside the treatment — it is filed under `clothDark` only because
it is coloured to match the trouser it grows from, not because it is cloth.

The boot-cuff row *is* untouched, exactly as registered: it passes an explicit `shadeMix: 0.90`.
So the claim "the explicit override is out of the arm" survives; the claim it implied — that
`clothDark` as a group is out of the arm — does not.

**Corrected population, which is what the RESULT will be scored against:** every fur card that
takes the default bias — 552 vertices in the three `furTuft*` groups plus the 72-vertex knee ruff
— and **no body-loft vertex anywhere** (every non-card group moves 0 vertices at >0.05°).

This does not invalidate the arm and no arm is re-run for it. A knee ruff is a fur clump; it
belongs in a fur-clump treatment. What was wrong was my description of the population, and the
reason it was wrong is worth naming: I inferred the card set from `TUFT_GROUP`, which remaps only
`fur`/`furCream`/`furDark`, and never checked whether a card could be filed elsewhere. **A
mapping table tells you where things are sent, not what the set contains.**

### 8.2 The determinism control, which protects §7.5's void gate

§7.5 registers "if BACK is not bit-identical to A the arm is VOID". That gate is only usable if
the build is deterministic, which had never been checked. Built twice with the same empty token:

```
position floats differing: 0    normal floats differing (bitwise): 0
```

Bit-identical. **The gate is safe** — a BACK mismatch cannot be blamed on build noise, so if it
fires it means something in the boot is genuinely nondeterministic and the void verdict is the
right one.

### 8.3 A threshold of my own that sat inside its instrument's noise

Both earlier probes reported "~50% of every group's normals moved" and one returned a **PROBLEM**
verdict on the strength of it. That was entirely an artefact of a `>1e-4 deg` threshold: `acos` of
a dot product that is *exactly* 1.0 returns ~4.5e-4 deg of floating-point residue, so the test
fired on vertices whose normals are **bitwise identical** — the null control above shows 263
`fur` vertices "moving" with zero differing bits.

Recorded because it is DIGEST's recurring shape arriving in my own tooling within one hour of my
writing §7.1 about someone else's statistic: **a threshold placed below the precision floor of
the instrument reports the instrument, not the model.** The null control is what caught it, and
the null control existed only because I wanted to protect the §7.5 gate — it was not written to
find this.
