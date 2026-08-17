# Feel decisions awaiting a person on hardware

Five changes have shipped this session that are **correct by measurement and unsettled by feel**. Each
was landed because leaving it alone was worse — a coin flip, a dead framing, a silent telegraph — but
where the new number sits is a judgement no headless drive can make.

This sheet exists so that judgement can be made in one sitting rather than rediscovered five times.
Every number here was measured, not estimated, and each item says **what to watch** and **which lever
moves it** — because in three of the five the obvious lever is the wrong one.

None of these is a bug report. If something feels right, the answer is "leave it", and that answer is
worth recording too.

---

## 1. Landing threshold — `landHard` 9.0 → 15.0 m/s

**Commit** `57c2c9e` · **File** `src/player/Controller.js` (`TUNE.landHard`)

Landings used to be a coin flip. `landImpact` was read as `-velocity.y`, but the swept capsule — which
is what actually stops a fall — zeroed `v.y` before the probe looked. The probe won only when the frame
before touchdown happened to leave Sly inside its 0.06 m band: **12 wins in 40 sub-frame phases**. Driven
on the shipped temple that produced silent landings at 0.5, 4, 6 and 10 m and audible ones at 1, 2.5, 8
and 15 m — *not ordered by arrival speed*, so unlearnable.

Silent meant completely silent: no `land` state, no `landed` event, so no sound, no shake, no impact pose.

Fixing the race made every landing register — and every ordinary jump then arrived at 10.474 m/s, above
the old `landHard` of 9.0. So the correct measurement would have turned **every jump in the game** into a
hard landing. The threshold had to move, and it was derived rather than chosen:

| population | range |
|---|---|
| what the player can do under his own power | 10.474 – 14.186 m/s |
| authored descents in the level | 24.00 · 25.55 · 35.93 · 46.99 m/s |

Two populations separated by an empty band **9.8 m/s wide**, and 14.186 is a hard ceiling — swept over 21
press timings from apex to 40 frames late, nothing exceeds it. The rule taken from the moveset:

> `landHard` is the first landing that was not a move you meant.

15.0 sits 5.7% above everything reachable under the player's own power and 9.0 m/s below the first
authored fall — a **4.69 m drop**, against a maximum reachable apex of 4.262 m. `landBeat` stays at 3.2,
so every real landing still speaks.

**What to watch.** Jump around normally: no landing should cost you control. Then take one of the level's
real drops. The hard landing should feel like something that happened *to* you rather than something you
did. If ordinary play produces hard landings, 15.0 is too low; if the big authored falls feel weightless,
it is too high.

---

## 2. Camera boom chain collapsed

**Commit** `be55d6f` · **File** `src/player/CameraRig.js` (`_boomLength`)

The camera's authored framings were not reaching the screen, and the cause was structural rather than
tuning: delivery tracked **chain depth, not `tau`**. `pitch` sits one blend from the screen and closed on
8 of 9 framings; `boom` sits three and missed on 7 of 9. Shortening any row's `tau` moves only the first
stage of three.

Two of nineteen blend sites were collapsed — `_boomWant`'s own `smoothDamp`, and `this.boom`'s **on the
free-air path only**. The occlusion pull-in and the entire recovery design are untouched.

| framing | before | after |
|---|---|---|
| `land` | 6% | **52%** |
| `combat` | 35% | **73%** |
| `dive` | 61% | **88%** |
| `roll` | 65% | **89%** |
| `idle` | 43% | **63%** |
| `air` | 13% | **32%** |
| `glide` | 100% | 100% |
| `sneak` | 100% | 100% |

**Cost.** Mean boom motion 11.35 → 15.27 mm/frame (**+35%**) and direction reversals 38 → 52 over 1852
frames. The **p99 single-frame step is unchanged** (108.6 → 111.9 mm), which is the evidence that this
adds small continuous movement rather than snaps — and the reason the occlusion pull-ins were left alone.

**What to watch.** Whether the camera now reads as *responsive* or as *restless*. The +35% is continuous
low-amplitude motion; the question is whether it registers as life or as noise. Stand still, then move,
then stop — the reversal count is where busyness would show.

---

## 3. The Cane Slam's two visual identities have largely merged

**Same commit as item 2.** Listed separately because it is a different kind of consequence, nobody
predicted it, and a reviewer will not notice it unless told to look.

The dive framing's delivery across drop heights was **5 / 50 / 86 / 96 / 100 %** and is now
**71 / 92 / 98 / 97 / 100 %**. A jump-apex dive went from 5% of its boom to 71%, so a short slam and a
full-height slam now look substantially alike where they used to read as two different moves.

The crossover arithmetic explains the residual exactly, so this is understood rather than mysterious.
Whether it is *wanted* is the open question.

**What to watch.** Cane Slam from a small hop, then from the top of something. If those should be two
distinct reads, this needs the dive framing separated by drop height rather than the collapse reverted.

---

## 4. Traversal telegraph — half a second of warning

**Commit** `8a3af14` · **Files** `src/player/Controller.js`, `src/ui/HUD.js`

The game did not tell you what it would let you grab. `targetLocked` — the signal meaning *the game has
chosen this hold* — had exactly one listener, `Particles`, and never reached the HUD. `hookGrab` and
`railMount` reached Audio and FX only, and fired **on contact**. The one telegraph that existed was gated
behind holding `focus`. Measured on both grab paths: announcement and commitment on the **same frame**.

The renderer already existed; what was missing was an emit and a subscription. Now:

```
E-grab (kiosk lintel -> ring 3)   telegraph@0, hookGrab@30   ->  30 frames, 0.50 s
```

The mark names the exact hold that gets taken. An early version ranked by *nearest* affordance and
pointed at the ledge under Sly's own feet — the frame count was already correct with the wrong hold
marked, which is why the arm now asserts the specific ring.

**What to watch.** Whether half a second is enough time to see a hold, decide, and act. **The lever if it
is short is `AFFORD.hook.range`, not the telegraph** — the telegraph fires the moment `afford` sees the
hold, and it cannot warn earlier than the game knows.

*Still unmeasured:* the auto-grab path, whose lead is bounded by `hookAuto` rather than `hookGrab` and is
structurally shorter. Expect it to be the weaker of the two.

---

## 5. Camera lead compensation — `TUNE.leadMode`

**Ships as** `'floor'`, with full compensation retained as a switch.

`FRAMES.lead`'s sign was inverted — −0.939 m delivered against +0.428 m authored — and floored rather
than fully compensated, pending exactly this review. The `lead` channel is the healthiest column in the
delivery table (73–120% wherever authored), so the decision was priced roughly right and remains the
trade it was.

**What to watch.** Full compensation buys `air` apparent size at the cost of `glide` sitting further down
frame. Glide across the courtyard, then jump off something — the two are in direct tension and one of
them has to give.

**Related and unresolved:** `land`'s felt channel is `stiff` — the landing snap — and it has **no screen
quantity at all**, because it modulates a rate rather than a position. It cannot be measured headlessly
and can only be judged by eye. Now that item 1 makes every landing register and item 2 gives the boom 52%
instead of 6%, this is the first time it has been watchable.

---

## What is *not* on this sheet

Decisions that were settled by measurement and need no review: the patrol route rewrite, the terrace
collision fix, `landBeat` staying at 3.2, the collision census (closed on a clean negative — every
deepest on-route candidate dissolved into intended traversal or centimetre registration), and the
framing-attribution audit.

Open **defects** under investigation, which are not feel questions: `jump`'s `lead` delivering 26% where
`fall` delivers 92% under the same pooled row, and the wall-run blend clock — 24 frames of residency
against a 40-frame blend, capping it at 84% before anything else.
