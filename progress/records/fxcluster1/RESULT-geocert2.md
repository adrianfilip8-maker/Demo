# RESULT-geocert2 — the cone grade re-judged on the shipped camera: the objection that blocked it was an artefact of the old framing

Task #14 has been blocked since the guard camera went under review, on the note *"geocert on its
cand frame, PLINTH_Y 720"*. §201 shipped that camera, so the re-judgement can run.

Instrument: `geocert2.mjs`, a parameterised copy of the committed `geocert.mjs` — the same
z-buffered rasterisation of the authored guard surface through the camera, **no capture involved**.
Only two things are parameterised: `CAM.pos` and `PLINTH_Y`. Everything else is byte-identical.

## The camera move is a pure translation

`pos [-11.5, 2.6, 30.5] → [-13.25, 2.6, 30.5]` and `target [-17.0, 1.1, 28.0] → [-18.75, 1.1, 28.0]`
give **the identical forward vector** `(-0.8835, -0.2410, -0.4016)` and the identical 6.225 m throw,
because §201's lever moved position and target together. So `CAM.fwd` needed no re-derivation —
only the eye point moved. Verified arithmetically before anything else was run.

## Results

| | old cam, plinth 300 | **new cam, plinth 300** | **new cam, plinth 720** |
|---|---|---|---|
| lit px visible, base | 4754 | 583 | 12515 |
| lit px visible, cand | 3730 | 554 | 11285 |
| **lit-facing fraction, base** | 0.7804 | 0.4271 | 0.4155 |
| **lit-facing fraction, cand** | 0.6098 | 0.4197 | 0.3923 |
| **cand's cost** | **−17.06 pp** | −0.74 pp | **−2.32 pp** |
| cone pool in frame, base (full / floor) | 7.7 % / 16.0 % | 0.7 % / 1.3 % | 0.7 % / 1.3 % |
| cone pool in frame, cand (full / floor) | 29.2 % / 54.2 % | **20.6 % / 37.9 %** | **20.6 % / 37.9 %** |

## What this says

**The blocking objection was framing, not grade.** On the old camera the candidate cone cost
**17.06 pp** of lit-facing fraction — a real penalty, and the reason this sat unresolved. On the
shipped camera that cost is **2.32 pp**. The penalty was almost entirely an artefact of where the
camera stood, and it left with the camera.

**The pool argument, which always favoured the candidate, now favours it overwhelmingly.** From the
shipped camera the base cone puts **0.7 %** of its throw inside the frame — the patrol beam is
effectively not in the shot at all. The candidate puts **20.6 %**, and **37.9 %** of the guaranteed
floor. §7.2 asks for a readable patrol cone; at 0.7 % there is nothing to read.

So the trade on the shipped camera is **2.3 pp of lit-facing fraction against roughly thirty points
of cone visibility**. That is the opposite of the trade this task was blocked on.

## PLINTH_Y: the old value is now meaningless, and it does not matter

`PLINTH_Y = 300` was measured on a3/a4 frames as the edge where the §152 plinth ate the guard. On
the shipped camera the guard's apex projects to **y 399** instead of y 306, so only 583 of 12515
lit pixels — **4.7 %** — fall above y 300. The old edge now excludes almost the whole figure and
measures noise.

**The decision is robust to the choice anyway**, which is why this is reported rather than
re-derived: the ordering is identical at 300 and at 720 (candidate slightly lower lit fraction,
candidate far better pool), and only the magnitude of a penalty that is small either way moves.
A correct occlusion edge for the new framing should still be **measured** on real frames before any
number here is quoted as an absolute — it has not been, and nothing above depends on it.

## Status

**The arithmetic objection to `towardCamera -0.20` is withdrawn.** What it does not do is
constitute a ship: every previous cone decision in this cluster rested on captures (a2/a3/a4), and
this is a model of authored geometry, not a rendered frame. §141.1 discipline says an instrument
that reverses its own earlier verdict deserves the same evidence the original had.

**Registered next step:** a capture A/B on the shipped camera — `towardCamera 0.35` against
`-0.20`, both arms at `dt: 0`, three discarded prerolls per §198.1 — scored against bands sealed
before it boots. `debug.guardTowardCamera` already exists as a runtime poke (`Guard.js:1832`), so
this is an in-page lever with no `src/**` install and none of §186's contamination hazard.
