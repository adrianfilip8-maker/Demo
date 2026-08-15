# NOTE — A2.8's staging justification is refuted; the `{dt:0}` CHOICE stands until an A3

**Date:** 2026-08-15. **Status: not an amendment.** Nothing here moves a band, a bar, an ROI, a
hue window, a pixel count, a share, an arm, a shot or the §7 forecast. It records a defect in an
*argument* inside `AMENDMENT-guardcone-A2.md`, states why the *decision* that argument supported
is nevertheless kept, and fixes what a future lane would have to do to change it. Written while
**zero frames of a scoreable capture of this seal exist**, which is the only position from which
the staging question can be discussed at all (§141.1).

## 1. How this surfaced

It was surfaced by a briefing error, and saying so is the point of writing it down.

The chunked runner was implemented from a coordinator briefing that instructed **live-settle**
staging — `setShot(name, {})`, `dt` undefined — by asking that `progress/records/rim/rim-run.mjs`
be copied faithfully as the working reference for a chunked capture. `rim-run.mjs` legitimately
stages live; **PREREG-rim** is a live-settle seal. The briefing did not check what *this* seal
specifies. The implementer built the runner as briefed, flagged the conflict rather than absorbing
it, and the coordinator verified the flag and reverted the decision. The runner now stages
`{ dt: 0 }`.

Recorded because the near-miss is the interesting part: a sealed method was one unchallenged
briefing away from being changed by a side effect, in a capture whose whole purpose is that its
method was fixed in advance. The report-the-conflict step is what caught it, not review of the
diff — the diff would have looked like faithful copying.

## 2. What is refuted, precisely

`AMENDMENT-guardcone-A2.md:290` (A2.8, "Risks disclosed before capture", risk 2) reads:

> guardcone stages `{dt:0}` frozen — **deterministic by construction**, unlike litbleach's live
> settle — and runs 4 and 5 staged the same four shots in two different boots with the same
> `_light`, the same guard counts in frame and the same probe geometry, differing only in the
> **sub-perceptual render noise that §302 predicts**.

**KNOWN_ISSUES §334** measured the opposite, on this seal's own frames:

```
guardcone            setShot(name, { dt: 0 })   clock frozen THROUGH staging   0/12 match
litbleach2/linchroma setShot(name, {})          live settle, roster path       bit-identical x3
```

Runs 4 and 5 captured the same four shots on the **same src tree** (`2b5c7c49ad9c4668`, both
manifests) in two boots and **0 of 12 frames matched byte for byte** — `hero.off` is `1a8009c6…`
in run 4 and `c0fad6bc…` in run 5. §334's mechanism: *"Freezing the clock through staging leaves
the character wherever the live world clock happened to be when that boot reached the call, and
that varies boot to boot. Live-settling advances the world to a convergent state, so it lands in
the same place every time."*

Two clauses of A2.8 fall, and they are different sizes:

1. **"deterministic by construction" is false as stated.** `{dt:0}` is deterministic in the sense
   that the *staging path* adds no clock advance; it is not deterministic in the sense A2.8 needed,
   which was that two boots produce the same world state.
2. **"sub-perceptual render noise that §302 predicts" is a mis-attribution.** The 0/12 is the
   staging axis, not §302's renderer noise. A2.8's own supporting observations stand and are worth
   keeping straight — the two runs *did* agree on `_light`, on guard counts in frame and on probe
   geometry. Readbacks agreeing while pixels do not is exactly the shape §334 describes, and it is
   why the disagreement went unnoticed: everything A2.8 checked did agree.

**What is NOT refuted:** A2.3's bar-by-bar audit, A2.4's replacement of V-TREE, A2.5's warm-up,
A2.6's force-add, and the 49-frame / 16-shot census. §334 itself says so in terms — *"guardcone's
AMENDMENT A2 audit confirms none of its bars does [cross a chunk], but the constraint is real and
was not free."* This note is the "not free" part, written down.

## 3. Why the CHOICE stands anyway

A refuted justification is not authorisation to change a sealed method. Three reasons, in
decreasing order of how much they bind:

1. **§141.1 binds the method, not only the bands.** A2 specifies `{dt:0}` and the sealed
   single-process runner did `{dt:0}`. Changing it is a method change; it needs an amendment with
   its own argument, written before frames exist. It does not get to arrive as a consequence of a
   briefing that was about chunking.

2. **No bar of this seal depends on the difference.** Re-checked against `guardcone-score.mjs`
   line by line rather than against A2's prose: **every `img(row(...))` pair in the scorer shares
   one `shot` value.** `rBars` is `(shot, off)` vs `(shot, back)`; `BF1` and the report-only ΔL
   stddev are `guard.bon` vs `guard.off`; `BL1` is `guard.bon` vs `guard.blamp`; `BS1`/`BH1` read
   one frame against itself; the three named PROT ROIs and `PROT-B_<shot>` ×15 are `(shot, off)`
   vs `(shot, bon)`. There is **no cross-shot pixel comparison anywhere in the file**, therefore
   none across a chunk, therefore none across a boot. `BV1` and `PARK1` do cross boots and compare
   measurements against the constants sealed in §2/§3 — never one row against another row. So the
   instability §334 measured is real and costs *this seal* nothing.

3. **Changing the staging changes what the frames SHOW**, and this seal's target bars read exactly
   the quantity that would move. That is the subject of §4, because it is also the thing a future
   amendment has to argue.

## 4. What a future lane must argue — citing §334 is not enough

If a lane wants guardcone captured live-settled, an **A3** is required, written before any frame
of that run exists, and it must do more than point at §334. §334 establishes that live-settle
reproduces *frames* better across boots. It does not establish that live-settled frames are the
right frames for **these** bars. The A3 must state what the frames would then show:

`{ dt: 0 }` holds `engine.time` at whatever it was at boot. Live-settle advances it by
`(SETTLE_FRAMES + SETTLE_FRAMES_2) × 1/60 = 17 / 60 ≈ 0.283 s` (`Debug.js:16-17, 188-190`) before
the first captured arm. `engine.time` is this build's only phase source (`Debug.js:203-210`), and
in the cone specifically it is not a garnish — it is wired into three places this seal measures:

| site | code | which bar reads it |
|---|---|---|
| beam brightness flicker | `bright *= 1 + TUNE.beamFlicker * Math.sin(t * 6.3 + g.senses.phase)` (`Guard.js:1963`, `beamFlicker 0.09`) | `BF1` blown share, `BS1` apex hot-warm px, `BH1` near/far S |
| beam shader clock | `_beamMat.uniforms.uTime.value = t` (`Guard.js:1902`) | everything in the beam ROI |
| the candidate branch's motes | `sin( t*46.0 - uTime*2.1 … )`, `sin( t*21.0 - uTime*1.55 … )` (`Guard.js:347-349, 377-378`) | `LOOK-B` and the report-only beam-core ΔL stddev — *"dust structure"* |

The flicker term alone is an **18% peak-to-peak** swing on beam brightness, and `t ≈ 0.283 s`
lands `6.3t ≈ 1.78 rad` away from where `t = 0` sits — not a sub-perceptual difference, and not
one that any of `BS1`, `BH1` or `BF1` can be assumed to be indifferent to. The mote pattern that
`LOOK-B` judges is *literally* a function of the clock.

So the A3 must answer, before frames: **do the sealed bands still mean what they meant when they
were written, evaluated on a beam at a different flicker phase and a different mote pattern?** If
yes, say why. If the bands would have to move, that is a new prereg, not an amendment (§141.1) —
a threshold touched to fit frames is the forbidden move whichever direction it goes.

Two things that would make the A3 easier, both already true:

- **`PROT-B`/`PROT-MOON`/`PROT-LAMPS`/`PROT-SPARK` are `off`-vs-`bon` within one shot**, so a
  uniform phase shift affects both arms of every protection row identically. The protection half
  of the table is the half least exposed to this.
- **`R_<shot>` is unaffected either way.** All arms of a chunk render at one frozen clock under
  both modes, because `step(3,0)`, both warm-ups and every arm are dt 0 regardless of `STAGE_OPTS`.
  The bracket is a within-boot property and stays at [0,0].

## 5. What the runner already does to make an A3 cheap

None of this is a bar; it is machinery so that the question stays answerable from the record.

- `STAGE_OPTS` is a **single named const** in `guardcone.mjs`, spelled once, with `STAGE_DESC` as
  its human-readable form. One line changes the mode; nothing else in the file encodes it.
- `STAGE_DESC` is written into **every** `manifest.<shot>.json`, so each chunk carries its own
  staging mode rather than inheriting a claim from a document.
- The merge collects `stagingModes` across chunks. If two chunks disagree it sets the merged
  `staging` to `null`, prints `!! chunks were staged N DIFFERENT ways — the run is not one
  capture`, and lists them. A staging changed mid-run is a detected fact, not a silent one.
- `setShot` announces a live world clock into `engine.warnings` whenever `opts.dt` is not finite
  (`Debug.js:116`). The runner records staging warnings verbatim into the chunk manifest and, at
  `{ dt: 0 }`, **aborts loud** if that notice appears — the mode failing to take is caught rather
  than banked.

## 6. Standing instruction

**Until an A3 says otherwise, guardcone stages `{ dt: 0 }`.** A2.8's reason for it is wrong and
its conclusion is kept. Anyone reading A2.8 risk 2 should read this note beside it: the sentence
*"deterministic by construction"* should not be cited, and the frames it describes as *"differing
only in sub-perceptual render noise"* differed on 12 of 12.
