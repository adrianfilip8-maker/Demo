# Critic pass 7 — brief (written 2026-08-03, to run when the capture queue drains)

Sealed in advance, as passes 5 and 6 were. Pass 6 returned **REJECT, 2.1/10**, with **14 of 14
frames losing their blind side-by-side**, against a passing floor of 8.

## What is deliberately NOT in this brief

**The change list.** The critic is not told what was fixed, what shipped since pass 6, or which
conditions the owners believe closed. A harsh critic who knows where the work went looks there and
grades the effort; a blind one looks at the frame and grades the result. Every owner's claimed
closure is a hypothesis about what the frames will show, and this pass is the test of those
hypotheses — so it must not be handed the answers.

`KNOWN_ISSUES.md` and `progress/records/` remain readable if the critic chooses. They are the
project's record and the method sections are legitimately useful. **But nothing will be pushed at
the critic, and no owner will brief it.**

## On the 2.1, and the one way this number can poison the pass

Pass 6's score is stated because pass 6's brief stated pass 5's, and because a critic that does not
know the history can drift generous out of politeness. **It is also the single most dangerous
sentence in this document.**

> The failure mode is *anchoring*: awarding a 4 or a 5 because the last one was 2.1 and "some
> progress" feels proportionate. **Do not grade the delta. Grade the frame.**

Note that pass 6 scored *lower* than pass 5's 2.88 after a session of work. That is allowed, it was
the correct call, and it is evidence the instrument is not drifting. If the frames still lose their
side-by-side, the correct score is in the same range regardless of how much work happened in
between — and saying so is the whole value of the pass.

## Standing requirements, from the original mandate

1. **Score all THIRTEEN scored shots** — see the roster table below, which is not the same list as
   pass 6's fourteen.
2. **Passing floor is 8/10**, not negotiable downward by the critic or by me. The mandate is
   "utterly wowed when compared with the actual Sly Cooper, Mario, and Zelda games."
3. **Blind side-by-side comparison is the binding test.** Set each frame against the comparison
   title's equivalent shot type and answer the question the mandate actually asks: *which one looks
   better?* If ours loses, say so and say why, in terms a modeller or shader author can act on. A
   number that does not survive "would a player pick this frame" is not the verdict; the picked
   frame is.
4. **Provenance before pixels.** State the commit and dirty flag from the manifest, confirm no
   `src/` mtime falls inside the capture window, and quote frame mtimes. A run that straddles two
   builds is void and must be re-shot, not caveated.
5. **Every claim carries its instrument.** Bands partition, no sealed adjectives without thresholds,
   and any falsifier on an FX-bearing shot is written as a duplicate-arm bracket rather than a
   bit-identity bar.
6. **State how every ROI was derived, before quoting anything measured inside it.** An ROI
   inherited, auto-located, or assumed is an ROI that has not been checked. Derive it, say how, and
   where practical show that it contains what it claims to contain.
7. **Look hardest where nothing is instrumented.** Passes 5 and 6's most valuable findings were
   things no seal in the project was watching. The measured items were mostly in decent shape; the
   unmeasured ones lost the comparison. **The frames' worst problems are, by construction, the ones
   nobody has built a number for yet.**

## New in pass 7: the roster carries per-shot evaluability

Passes 4–6 treated every frame as able to answer every question, and it cost real findings. Three
of pass 6's fourteen frames could not support conditions they were scored against: one was a
measurement rig scored as a composition (my error), one stages the player **behind the lens by
design**, and one frames him at **42 px in a 720-row frame**. Character findings were filed against
all three.

The fix is not a shorter roster. It is stating what each frame can and cannot carry. Figure heights
below are measured through the real shot cameras at **1280×720, the capture resolution** — not at
the harness's 900 rows, which is a 26%-different number and has been mixed in before.

| shot | view° | figure px | can carry | **cannot carry** |
|---|---|---|---|---|
| `sly-closeup` | 33 | 484 | everything, incl. face, eyes, hands | — |
| `sly-key` | 33 | 484 | everything; key-light behaviour | — |
| `sly-profile` | 95 | 443 | silhouette, bill/ear resolve, tail | frontal face, eyes |
| `combat` | 45 | 281 | pose, silhouette, cane, FX | **all character colour/material — see below** |
| `sly-startle` | 9 | head shot | face, eyes, pupils, expression | **feet, stance, contact shadow, full silhouette** |
| `interior` | 70 | 187 | environment, light shafts, materials | facial detail |
| `dunes` | 70 | 170 | environment, haze, horizon | facial detail |
| `traversal` | 59 | 147 | composition, motion read, environment | facial detail |
| `hero` | 70 | 133 | composition, tail + cane-hook silhouette | muzzle, eyes, hands, fine pose |
| `night` | −111 | 101 | environment, night grade, guard cones | face (looking at his back) |
| `temple` | 35 | 99 | architecture, shafts, materials | any character detail |
| `courtyard` | 77 | **42** | architecture, layout, composition | **any character condition whatsoever** |
| `guard` | 116 | **behind lens** | environment, guard staging, cones | **any character condition whatsoever** |

**`combat` is a fourth limited frame, and it was found by looking rather than by arithmetic.**
The figure is 281 px — the second-largest in the roster — so every count said it was sound. In
`shots/char12/combat.png` the FX impact flash blows him to a **flat cream cutout with a black
outline**: no mask, no cap colour, no tail rings, no blue on the clothing, no material read of any
kind. Pose and silhouette survive; nothing else does. **A pixel count is not an evaluability
check**, and this one was wrong by the widest margin in the table.

**The consequence for this pass, stated plainly:** with `courtyard` and `guard` mute on character,
`sly-startle` limited to the face, `sly-perch` out of the roster and `combat` reduced to
silhouette, **`sly-closeup` and `sly-key` are effectively the only frames that can score character
colour, fur and material**, with `sly-profile` on silhouette and `hero` on tail and cane-hook
alone. That is a **roster weakness, not a licence to go easy** — it means character findings will
come from few frames and should be weighted by what those frames genuinely show, and it means a
character defect visible in `sly-closeup` has no second frame to confirm it. Say which frame each
character claim rests on.

**Requirement:** before filing a finding, name the shot and confirm the condition is in that
shot's "can carry" column. A finding in the "cannot" column is not a weak finding — it is an
unsupported one, and pass 6 produced several that were later refuted on exactly this ground. If a
frame looks wrong in a way the table says it cannot show, that is worth reporting as *"this frame
cannot answer it; capture X could"* — which is useful — rather than as a defect.

**This table is a floor on scepticism, not a ceiling.** It says where character claims are
unsupportable; it does not certify anything. Every shot above remains fully open on composition,
colour, light, material and the side-by-side question.

## Not in the scored roster, and why

`sly-perch` and `sly-arm` are **diagnostic framings** and are excluded. `sly-perch` advertises a
perch and is deliberately staged on flat ground for a spine measurement, so *"there is no perch,
ledge or rail under him"* is a complaint about the rig rather than about the art. They may be
captured and consulted as evidence; they are not scored, and they do not enter the aggregate.

The rule, stated so it is not over-applied: **exclude a shot when the shot type it advertises
cannot be delivered from the staging it uses.** Do not exclude one merely because its camera was
derived from a measurement — `sly-startle`'s lens was placed to equalise eye presentation for a
threshold test, and it is still a real reaction close-up, so it is scored.

## Sequencing

The capture must be the LAST thing to render on a final tree. Order: capture queue drains → every
in-flight verdict is adjudicated and its winning value shipped or explicitly withheld → tree
committed and clean → **then and only then**, one capture for the critic.

A critic pass on a tree that is about to change is a pass that will have to be repeated, and each
one costs 40–60 minutes of exclusive lock.

Run `tools/keeplog.sh <run>` when the capture lands and **before** any scoring. The run log is the
only artefact carrying applied-state readback, it is not written to a tracked path by default, and
the container has rolled back twice.

## What a REJECT means here

The loop continues: findings route to owners, owners seal preregs, fixes ship, another pass runs.
Six rejections so far are the process working, not failing. The one thing a critic must never do is
soften a verdict because the work has been long.
