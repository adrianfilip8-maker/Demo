# PREREG — what a `kerbline` null on `guard` licenses me to say

**Written before any frame of the 3253 run was opened.** No PNG from `shots/propshull` has been
read at the time of writing; everything below is from source, from git history, and from offline
projection of built-geometry nominals through the shipped camera values. The point of writing it
now is that a null is the *uninformative* outcome here, and an uninformative outcome is exactly the
one that gets written up as a win after the fact.

Requested by the coordinator: *"decide now, in writing, what a null there licenses you to say about
attribution, given three candidates and one changed variable."*

---

## The three candidates (as `kerbline.mjs`'s own header states them)

1. **`EgyptLevel.js`** — stylobate apron sunk `+0.02 → −0.07` so its chamfered inner arris stops
   standing proud of the paving. **Mine.** In the tree since an earlier session, committed, never
   verified in a frame (§137). Clearance re-derived extremally at §143.4: apron top max `−0.0691`
   against perimeter paving top min `−0.0452`, so worst-case-against-worst-case the apron is 2.4 cm
   below and no placement of the jitter puts it proud.
2. **`src/core/Shots.js`** — the `guard` camera, moved off the west colossus plinth. Not mine;
   read-only to me.
3. **`src/render/shaders/toon.glsl.js`** — `uRimShadowFloorArch` at its no-op default `0.55`.
   SHADING's, untouched this session.

Candidate 3 has not changed, so it cannot *cause* a disappearance. It is a standing mechanism, not a
candidate for the null. Only 1 and 2 are candidates for a change of state.

---

## New measurement, offline, before the frames

`scratchpad/proj.mjs`, `proj2.mjs` — three.js `PerspectiveCamera` + `Vector3.project`, fov 38,
1280×720, against the three shipped `guard` camera values from git.

### A. Candidate 2's retrodiction reproduces independently

`Shots.js` claims the pass-2 artefact *is* the plinth's far edge, "predicted to project at y 255–264,
measured at y 260 and 278". Projecting the west colossus plinth's **NW top corner** `(−13.5, 2.0, 21.5)`
through the **pass-2 camera** `(−11.5, 2.05, 25.4) → (−15.6, 1.45, 22.0)`:

```
plinth NW  →  px (1090, 255)   IN FRAME, d = 4.4 m
```

**y = 255.** I did not fit anything to the critic's number; this falls out of the `L.colossi` table
and the camera on disk. Candidate 2's account of the *pass-2* line is corroborated by geometry I
derived independently of it.

### B. But the shipped camera is not the camera that docstring describes

There were **two** commits, not one:

| commit | `guard` pos | effect |
|---|---|---|
| pass 2 | `(−11.5, 2.05, 25.4)` | eye **0.05 m** above the plinth deck (deck y = 2.00) |
| `b81747d` | `(−11.5, 4.05, 25.4)` | "Raised 2.0 m" — **all four** plinth-top corners leave the frame |
| `e5f8260` | `(−11.5, 2.60, 30.5)` | shipped: **+0.55 m** and a +5.1 m southward dolly |

`b81747d` was reverted because y 4.05 is **inside the throne** — throne volume `x −12.9…−6.1,
y 2.0…4.5, z 22.0…27.6`, and `(−11.5, 4.05, 25.4)` is inside it on all three axes. Confirmed, and it
is what that commit's message says.

**The docstring in `Shots.js` explains `b81747d`'s rationale ("Raised 2.0 m so the camera stands
*over* the plinth rather than on it") while the file ships `e5f8260`'s value.** At the shipped value:

```
eye above plinth deck plane      0.60 m   (not 2.05)
plinth SW top corner        px (1022, 338)  IN FRAME, d = 2.9 m
plinth S top edge           crosses frame diagonally, tilted down to the right
```

— the same object, the same tilt sense the critic recorded. **Candidate 2 did not remove the plinth
from the frame.** What it changed is the *width* of the exposed up-facing deck band (throne south
face z 27.6 → plinth south edge z 28.5):

| camera | projected band width where in frame |
|---|---|
| pass 2 | **36 – 70 px** |
| shipped | **239 – 265 px** |

So on the shipped camera the plinth deck is not a few-pixel sliver; it is a broad foreground surface.

### C. Candidate 1 is in frame — I checked rather than assumed

I was about to argue that the apron is not in the `guard` frustum and therefore untestable here. It
is testable here. The west apron arris `x = −26, y = −0.07` projects in-frame across **z 10…32** on
the shipped camera (px `(1250,233)` → `(41,324)`) and **z −16…22** on pass 2. Both cameras see it, at
12–17 m.

*Caveat, stated rather than buried:* these are **nominal** extents from `L.colossi` and the
`masonryShell`/`vol` arguments, not built vertex positions. Jitter here is ±0.018–0.03 m ≈ 1 px at
2.9 m, so it moves no conclusion — but §143.4 corrected me for exactly this substitution once, and an
unlabelled nominal argument is how that happened.

---

## The decision

**A null licenses exactly one sentence:** *the pass-2 signature — a thin, cyan, local-maximum contact
run — is not present anywhere in the `guard` frame at this tree.* That is a claim about the frame,
and it is the claim §7.3 scores. It closes the symptom for all three owners at once, which is what
`kerbline.mjs` was built to do and what its header already says.

**A null does not license "the apron fix is verified", and I will not write that.** In descending
strength:

1. **Candidate 2 independently predicts the null** and is the only candidate with a matched
   quantitative retrodiction (§A: y 255 predicted, 260 measured). An outcome that every candidate
   predicts is evidence for none of them — §147.2, and the coordinator named this shape before I got
   to the frames.
2. **Candidate 2's mechanism-removal is measured to be partial** (§B). The plinth is still in frame
   at 2.9 m; what changed is that a 36–70 px band became a 239–265 px band. `kerbline`'s signature
   requires a *thin* run — local vertical maximum over ±2 px, ≥12 px of horizontal continuity. A
   240-px-wide band cannot match it, because its interior is not a local maximum. **So a null is at
   least as consistent with "the artefact got wider and stopped matching a thin-line detector" as
   with "a geometric defect was removed."** That is a confound in the instrument, and it is mine.
3. **Candidate 3 is unchanged and still live elsewhere** — §24.3 measures its class at 1,704 px on
   `hero` on the current tree. A term that still produces this class in another frame is not ruled
   out in this one.

**The coordinator's conditional resolves against attribution.** *"A null attributes to the apron only
if the other two were already independently eliminated"* — neither is eliminated, and candidate 2 is
strictly better-evidenced than candidate 1 (it has a matched coordinate; candidate 1 has a mechanism
and a clearance, but has never been tied to this frame's artefact at any coordinate). The antecedent
fails. The correct ledger entry for a null is **"symptom absent, cause unattributed"**, not "§137's
item verified".

§137 exists because this item was collapsed from *"a fix is in the tree"* to *"already found and
fixed"* once. Doing it again with a null attached would be the same error with a frame for cover.

**The informative outcome is a hit, not a null** — and I state the asymmetry now so a null is not
written up as the strong result. But `kerbline.mjs`'s header overstates what a hit gives: it says a
hit "means candidates 1 and 2 have both landed and it is still there, which points at 3 and routes
cleanly." That inference assumed candidate 2 removed the plinth from frame. **§B shows it did not**,
so a hit is also consistent with the plinth edge having merely moved. **My own instrument's header is
wrong on this point and is corrected here rather than left to be quoted.**

---

## What would actually attribute, none of which needs this run

- **Candidate 2 ↔ the pass-2 line: already settled** by §A. And note what it attributes it *to* — a
  camera standing 5 cm above a deck, i.e. a framing error, **not** a modelling error. If that holds,
  candidate 1 fixed a real defect that was never this symptom, which is the reading `kerbline.mjs`'s
  header already offers and which §A now supports with a number.
- **Candidate 1:** a two-arm capture toggling the apron y between `+0.02` and `−0.07` on a *fixed*
  camera, scored on the apron arris ROI (in frame, §C). One variable, mine, does not exist yet.
- **Candidate 3:** SHADING's `norim` / `uRimShadowFloorArch` arm on this frame. Not mine.

## Routed, not fixed

`src/core/Shots.js` is read-only to me (§4568). Its `guard` docstring describes the rationale and the
displacement of a value the file no longer ships (§B). Routing that to its owner, with the note that
the shipped camera still frames the plinth deck at 2.9 m and 0.60 m above its plane — so if the
intent was "get the plinth out of the shot", the intent is not met by the shipped value.
