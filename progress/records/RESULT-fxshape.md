# RESULT — fxshape: D12 characterised, attribution VOID twice, and both voids are findings

Status: **the defect is measured, the attribution is not.** Two capture windows were spent and
both runs are VOID on their own validity arms. Each void has a named root cause, both are now
standing rules in `KNOWN_ISSUES §275`/`§275.1`, and the third run is in the FIFO queue. Nothing
has been proposed, tuned or shipped on `src/fx/**` — the brief's instruction was to measure what
reaches the frame before proposing anything, and I do not yet know which emitter draws the
smear.

---

## 1. What IS measured, all of it lock-free and reproducible

From `shots/r9/combat.png` and the scratchpad reference. Quoted **as of r9** throughout —
per §273, an absolute pinned to a stored capture is stale the moment other lanes commit, and
these motivate the claim rather than gating it.

### The effect is enormous and achromatic

| | ours (`r9/combat.png`) | reference (`sly3-venice`) |
|---|---|---|
| share of frame at L >= 0.70 | **4.58%** in 253 blobs | **0.25%** in 239 blobs |
| largest bright connected component | **8,591 px = 0.93% of frame**, sat 0.324 | **179 px = 0.02%**, sat 0.185 |
| 3rd largest, lying across the hero | 4,690 px = 0.51%, **sat 0.095** | — |
| identifiable VFX chroma | band peaks rgb(191,187,174)–(201,196,183), **sat 0.089–0.095** | lamp flames 108–116 px at **sat 0.736–0.740** |

**18x the bright-pixel share, a largest bright component 46x larger, and roughly an eighth of
the chroma.** The critic's "soft grey smear" is those three numbers.

### It desaturates what it crosses, and by how much

One material, crossed by the band and not crossed, in the same frame (left wall):

| | L | sat |
|---|---|---|
| above the band | 0.277 | **0.211** |
| inside the band | 0.481 | **0.108** |

**+0.204 of luminance and half the chroma.** That is an additive near-white sprite over a
coloured surface, and this project has already diagnosed and fixed that exact mechanism once:
`Emitters.js`'s `PAL.flameBody` note — *"AgX desaturates hard toward the top of its curve, so a
near-white emitter cannot come out of this grade as anything but white however it is scaled"*.
RESULT-fxcluster c3 applied it to `cane_spark` (`0xe8912a`) and `cane_flash` (`0xd4823a`) and
**left `cane_ring` on `PAL.goldSpec` `#fffbe8`, saturation 0.098** — the one cane emitter still
starting near-white, and also the only one exempt from `TUNE.flashMaxH` because the shader's
size ceiling skips the `PLANAR` branch. `Particles.js`'s own TUNE comment names it: *"`cane_ring`
reaches frac 1.89 and is the standing second suspect, deliberately NOT changed here."*

**That is a hypothesis with three independent pointers and it is still a hypothesis.** It is
exactly what the attribution run exists to test, and the ledger already holds one confident
wrong attribution of this same frame (§215.1). It is not being acted on until an arm says so.

### The sparks, by contrast, are fine

Visible in `shots/r9/combat.png` at (350–520, 340–470): the `cane_spark` burst is hard-edged,
radial, tapered and orange. The c3 colour fix worked and is visible. Whatever is wrong with this
frame's VFX is **not** "our particles are bad" — it is one specific emitter.

---

## 2. Run 1 — VOID. `dt: 0` deletes every event-driven effect. (KNOWN_ISSUES §275)

Seven arms, one boot, `{ dt: 0 }` per the repo's standing A/B advice (§28/§195). **Every arm
came back 0 changed pixels** at `fx5an`'s `>= 4` threshold, including `nocane`, which suppresses
everything the hit draws. The levers were fine — the log records `cane_ring`, `cane_flash`,
`cane_spark`, `cane_debris` each entering the wrapped `_emit` twice per arm and being blocked.

Particle age is `uTime - aTime.x`, `_stageShot` emits at the current `uTime`, and every emitter's
alpha opens with `smoothstep(0, fadeIn, u)`, which is exactly 0 at u = 0. **A frozen clock
freezes particles at birth, where they are transparent by construction.** `combat` staged at
dt 0 contains no impact effect at all.

The dangerous part is not the wrong answer, it is the *shape* of the answer: a zero. "The lever
removed nothing" and "the subject was never drawn" produce the identical artefact, and the
natural reading of a zero is "your change is a no-op".

## 3. Run 2 — VOID. A fixed non-zero dt does not rewind. (751,902 px)

`{ dt: 1/60 }`. The impact was drawn, and `base` vs `base2` differed on **751,902 px, 58% of the
frame**. `setShot` advances `engine.time` by `(14 + 3)/60 = 0.283 s` per call and never rewinds
it, so arm N renders a third of a second after arm N-1 and every ambient term — torch flames,
dust, shimmer, sparkle, birds, water — has moved. `Debug.js`'s own warning describes this
failure precisely and prescribes `dt: 0`, which is the setting that deletes the subject.

**So neither of the two available settings gives comparable arms over a transient**, and that is
a structural gap rather than a mistake by either run. The resolution is in §275.1 and is now
implemented: `engine.time` is a plain writable field, so run 3 **rewinds the clock to 0 before
each arm** and then runs forward at a fixed 1/60. Every arm then shares one absolute timeline —
identical ambient phase, and the impact 0.05 s old in all of them — while particles left from
the previous arm carry a t0 from the old timeline, go negative in age, and are clipped by the
vertex shader.

## 4. What the two voids bought

- **KNOWN_ISSUES §275 and §275.1**, now propagating to every lane: dt 0 for static subjects,
  fixed dt with a per-arm clock rewind for transients, and a mandatory non-zero-footprint check
  that VOIDs.
- **`fxshapean.mjs` refuses rather than reports.** A zero-footprint `nocane` arm is VOID; a
  manifest without provenance blocks any ship verdict; a sha mismatch between capture and
  scoring blocks it too.
- **One defect found in my own provenance guard and fixed rather than hidden**: `fxshape.mjs`
  samples `git rev-parse HEAD` at *process start*, then waits 20–60 minutes on the FIFO before
  vite compiles anything. With four agents committing continuously that sha can name a tree the
  boot never saw, and a confidently wrong provenance record is worse than an absent one.
  `fxdraw.mjs` samples inside `onLocked`; `fxshape.mjs`'s field is labelled ADVISORY at its
  declaration, and what actually makes its arms same-tree is stated instead — they share one
  boot, and vite is frozen for its duration.
- **A `courtyard` ride-along** at no extra lock cost, which is what closed D9's own falsifier
  (see `RESULT-smiley` §8).

## 5. What is sealed and ready

- `PREREG-fxdraw.md` — thresholds registered **before the attribution frames existed**, so no
  gate can have been chosen to suit whichever emitter wins. D1 shrink and D3 not-deleted are a
  deliberate two-sided band: the trivial way to pass "not a smear" is to switch the effect off,
  and an impact frame with no impact is not a fix, so a zeroed emitter must FAIL.
- `ADDENDUM-fxdraw-sametree.md` — all five candidate arms in one invocation; a fail-closed
  provenance guard; and D2 given a **same-run control** (`>= 2.5x` the same emitter's own
  contribution chroma in the same boot) alongside its r9-derived absolute, so a threshold ~120
  commits stale cannot certify a candidate no better than its own control.
- `progress/records/fxdraw.mjs` — the candidate run, written and syntax-checked, taking the
  emitter and a JSON patch as arguments so it does not presuppose the attribution.

## 6. What I am NOT claiming

- **Which emitter draws the smear.** Three pointers converge on `cane_ring` and none of them is
  an arm.
- **Anything about the `temple` god rays.** D12's second sentence is about them, but the
  critic's number there is a black-point measurement, which is D5's, and D5 has an owner and an
  in-flight run.
- **That the reference frame proves anything about slashes.** `sly3-venice` contains no combat
  impact. It is evidence for how this IP draws a bright effect — compact and saturated — and
  nothing more.
