# RESULT — colossus: LOOK NOT MET, **concurred**, and the reason the seven numbers saturated while the frame did not

The coordinator adjudicated this gate because the lane had already reported and ended
(RESULT-props1 / §320). **I have read the frames and I concur.** Recorded here in the lane's own
voice because a gate the owner does not re-examine is a gate that gets rubber-stamped next time.

## 1. The read, on the frames

`progress/records/props1run1/courtyard.off.png` (patch installed) vs `shots/r12/courtyard.png`
(pre-sculpt), same framing, right-hand figure at 2x.

What genuinely landed: the bases step forward, the toe row reads at the plinth, dark recesses
separate the leg masses from the throne, a distinct forward knee ledge with an undercut appears
where r12 had one flat face, and the waist narrows against both neighbours.

What did not land, and it is the deliverable: **there is still no torso/arm assembly, no lap, and
the crown is still a slab.** Meeting the frame cold, the figure reads as stepped architecture
wearing a headdress — r11/r12's complaint almost verbatim. The seal's own binding LOOK line was
*"reads as a seated colossus, not a crate."* It does not. **Ship blocked.** `src/**` unchanged;
`cand-colossus.patch` stays in `records/`.

## 2. Why 7/7 numeric bars passed anyway — the metric's actual failure mode

This is the useful half, and it is a finding about the INSTRUMENT, exactly as PREREG-colossus §4
said a numeric-PASS + LOOK-FAIL would have to be recorded.

**`infW` and `zfSd` are profile statistics of the OUTER extent envelope.** For each height slice
they take the max-minus-min of x (and the max of z) over every piece spanning that slice. That
makes them blind by construction to the thing a seated figure is actually recognised by: the
INTERNAL mass boundaries — arm against torso, thigh against throne, the lap plane against the
kilt. Every mass this candidate added stayed INSIDE the existing silhouette envelope, so the
profile turned six times while the drawn silhouette barely changed.

The arm is the clean worked example. `courtyard` is a near-frontal camera; the upper arm sits at
|x| 1.94-2.70 against a shoulder half-width of 2.62. **It is arithmetically incapable of breaking
the outer silhouette from that camera at any thickness**, and at this key angle it casts no
separating shadow either. `infW` counted it as an inflection because it widens the envelope by
0.08 m; the eye never saw an arm. Same for the lap: a thigh block from the knee back to the hip
raises `zfSd` handsomely and is completely occluded by the knee that overhangs it.

**So the numeric bars are necessary and demonstrably not sufficient, and the reason is nameable:
they measure the envelope, and the defect lives in the interior.** A successor's bar has to be a
statistic of the RENDERED figure at a registered camera — for example the ink-edge length and the
connected-component count strictly INSIDE the figure's own silhouette, rasterised offline through
`SHOTS.courtyard` — because that is the only quantity that can tell "I added a mass" from "the
mass reads".

## 3. What a re-seal must aim at (agreeing with the coordinator's steer)

Not more inflections; the profile bars are saturated. The missing MASSES, and each has to break or
be visible from the courtyard camera specifically:

1. **An arm that leaves the body.** Elbow out past the shoulder half-width with sky or throne
   visible between forearm and flank, or the whole arm brought forward onto the thigh so it
   occludes the torso instead of hiding beside it.
2. **A lap that is not occluded by its own knee.** Either raise the lap plane above the knee cap's
   top or pull the knee back — the current knee overhangs and eats it. Hands ON the lap, which
   this seal deliberately declined for the ledge contract; that contract can move instead, since
   `bag.knee` is now derived from the sculpt.
3. **A crown that is not a slab** — the nemes terraces need a real recess between them, not a
   width step.
4. Keep the collider derived from `bag.knee` and keep the forked rng; both survived this seal and
   are the parts of it worth carrying forward regardless.

## 4. Disposition

LOOK NOT MET, concurred by the lane. Nothing ships. `basketvary` (11b852c) is unaffected. The
patch, the offline instrument, the scorer and the sealed baseline stay in `records/` so a
re-seal starts from measured ground rather than from scratch — with the standing warning that the
profile bars must NOT be reused as the primary gate.
