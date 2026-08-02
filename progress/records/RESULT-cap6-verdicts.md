# cap6 verdicts (coordinator transcription of CHARACTER's report, 2026-08-02 ~14:40)

Frames: `shots/cap6/{sly-closeup,sly-startle}.png`, stamp **9401cc7 dirty:false**, zero errors,
one boot warning (prewarm). Transcribed for durability — the analysis lived in a transcript and
the scratchpad instruments are restart-mortal.

## TAIL — verdict readable, and it FAILS its tip band

Baseline had to be rebuilt before it could be trusted (see KNOWN_ISSUES §27.1): re-running the
frozen instrument on the old frame gave under 6 / meanDepth 3.3 against the sealed 7 / 4.1,
which looks like a broken seal and is not — the instrument derives its ROI from live source, so
that pairing was a post-change mask over pre-change pixels. Rebuilt properly from the archived
sealed tree, it reproduces the seal **exactly** (tip 2, under 7, top 3, meanDepth 4.1 / 2.3).

| metric | baseline (matched) | cap6 | band |
|---|---|---|---|
| T-tip lobes | 2 | **3** | **FAIL-unmet** — regressed |
| T-under lobes | 7 | **5** | IMPROVED-not-met [3,5] |
| tip meanDepth | 2.3 | 2.8 | gate ≥2.0 pass |
| under meanDepth | 4.1 | 4.5 | gate ≥3.5 pass |
| ratio hold | 1.168 | **1.077** | HOLD-PASS, ink gate ok |

Both deletion guards pass, so the verdict is readable rather than gamed. Look ran first and
agreed with the number on the underside (isolated dark studs → denser scalloped fringe). On the
tip the prose impression was that the mass reads *more* consolidated while the counter found one
*more* lobe; per the seal that impression is non-binding and **the band governs: the tip fails.**
Routing, per the prereg's own instruction: extend the spine cap into a terminal cone.

Caveat recorded by the author: the tail-base ROI overlaps the body, so some "under" lobes are
self-occlusion boundaries. It biases baseline and verdict equally, so the direction holds.

## PUPILS — no verdict is available, and none can be manufactured

The sealed metric is a difference (ΔdarkFrac = calibration − verdict) requiring a **pre-change**
calibration capture. cap6 is the first capture that has ever contained `sly-startle`, and it is
post-change: **there is no minuend.** The coordinator's suggested re-anchor is not available for
a difference metric (§27.2). Clean path: neutralise the pupil `sc:` keys and capture
`sly-startle` once — that shot *is* the missing calibration.

Established anyway:
- **Mechanism confirmed in pixels** — at 6× the pupils are pinpricks in wide eye discs.
- **Rest-identity guard PASSES exactly** — cap5 vs cap6 idle eye stats bit-identical (median
  L67.5 / L124.3, max L232.2 / L232.3). No leak into the other 50 clips.
- **Bones verified** — `pupilL/R` parented to `head`; only 2 of 52 clips drive them.
- **Catchlight guard FAILS on one eye** — max L198.8 left (≥180 pass), **L121.9 right (fail)**:
  the glint rides the same bone and constricted with the pupil. A real defect, caught on the
  guard's first exposure. Owner CHARACTER, post-freeze.

## Triangle accounting — the +522 was a real miss, and the shell is why

| mesh | 7b0e3f8 | 9401cc7 | Δ |
|---|---|---|---|
| `sly_body` | 15,482 | 16,004 | +522 |
| `sly_outline` (ink shell) | 15,482 | 16,004 | +522 |
| character total | 33,676 | 34,720 | **+1,044** |
| character draw groups | 11 | 11 | 0 |

The inverted-hull shell duplicates the body 1:1, so every character geometry change costs ×2
(§27.3). Pupil re-weighting cost 0/0. The frame's residual (+764 tris, +2 draws) is not from
`src/player/**` — and is not necessarily a code change at all: cap5's own `sly-key` and
`sly-closeup` differ by 1 draw / 1,056 tris **on one tree**, so a 2-draw delta sits inside
scene-side emitter/cull variation.

## §7.3 character conditions, measured on landed work (nothing changed this session under freeze)

- **Proportions — pass.** 1:4.13 (idle_confident) / 1:4.14 (perch_idle) against §7.3's ~1:5
  cartoon target. `propprobe`'s "cap adds 0.000 m" is a §11 labelling artifact — the cap crown
  is weighted `[['head',1]]`, so the probe files it as skull; 4.13 is chin→cap-top, and the
  anatomical cranium alone is 1:5.79. The old "5.53 → 5.29, needs a shorter torso" line is
  superseded.
- **Silhouette — passes 3 of 4, fails the money shot.** `sly-closeup` and `combat` read
  unmistakably in pure black; `hero` at 185 px merges head/cap into the arm-and-torso mass and
  the cane hook goes ambiguous. It is a pose-overlap problem, not a cap problem.
- **Fur — improved, not smooth plastic**, but the tail is one band short of its own pass.
- **Pose — the open one.** `perch_idle`, which is `hero`'s pose, still has no line of action
  (hips 0.000, chest 0.006, head −0.007). Named by its owner as **the single highest-value
  remaining character fix**, blocked only by the freeze.
- §4.7 contract intact: 52/52 clips, `missing []`, zero warnings, two independent tools.

## Open requests routed

1. `sly-startle` framing: the hurt pose turns the head and puts both eyes under the cap's
   shadow — a pupil-reading shot wants tighter, better-lit head framing. (Shots.js, coordinator.)
2. One `hero` capture post-freeze to verify a `perch_idle` line-of-action fix.
3. **Cross-agent, flagged not diagnosed:** both cap6 frames read heavily blue — sandstone renders
   blue-grey rather than §2.2's gold, and Sly's fur reads blue where the offline shade render has
   it grey/cream. Routed to SHADING as a scope question against the character-scoped creamfix.
