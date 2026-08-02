# goldhalo — metal-aware bloom feed A/B, registered before any frame exists

## Provenance, stated first

The original `PREREG-goldhalo.md`, `goldhalo-patch-draft.md` and `goldhalo*.mjs` were lost in
the ~11:33 container restart, together with the transcript-side design memory of the agent
session that wrote them. This file is a **re-type from the surviving record**, not a verbatim
copy. What is quoted versus re-derived:

- **Quoted from the coordinator's ledger** (their message, which quotes the lost report):
  the amended arms **{0, 4, 12, 24}**, the **inverted-alpha safety argument**, and the
  **in-boot falsifier**.
- **Re-derived from the committed record** (KNOWN_ISSUES §25, commit 4a5140b; PostFX.js's
  bloom comments; Ledger #31's prepass-alpha precedent at PostFX.js:536): everything else —
  the exact GLSL, the gain-vs-onset-drop argument, the metrics and thresholds below. If the
  ledger's verbatim copy of the lost report disagrees with any re-derived detail, the ledger
  wins and this file should be corrected, not defended.

Registered before pixels: no goldhalo frame exists at write time (the runner is queued behind
bud35 and has not booted).

## The change under test

§25's routing: §7.3's "gold-hot" cannot be met by surface spec — the AgX shoulder caps the hot
cohort near L≈204+21.7·log2(0.05+u), so surface L235 needs ≈2.7× the 0.95-arm scene spec while
texture-side headroom stacks to <×1.9. Bloom adds display-space energy past the shoulder, so
the halo is where 235 is reachable (old blown combat at 237.7 is the precedent). The gilded
responsive cluster feeds ~2.2–3.6 scene against the 1.90 feed onset.

Patch (applied 2026-08-02 ~11:52, after agx1's boot stamp was confirmed `7b0e3f8 dirty:false`):

- `toon.glsl.js`: TOON_SHADE exports `slyMetalOut` at main depth (initialised 0.0 =
  fail-closed), assigned from `slyMetal` unconditionally inside its scope block.
- `ToonMaterial.js`: opaque materials get `SLY_METAL_TAG`; the fragment gains
  `gl_FragColor.a = 1.0 - slyMetalOut;` after `<opaque_fragment>`. Transparent materials keep
  real alpha. The option hash already keys on `transparent`, so no cache aliasing.
- `PostFX.js`: `TUNE.bloomMetalGain = 0` (shipped), uniform `uMetalBloom`, and in BRIGHT_FRAG
  `w *= 1.0 + uMetalBloom * clamp(1.0 - s.a, 0.0, 1.0)`.

**Inverted-alpha safety argument** (the quoted anchor, spelled out): alpha is 1 on every path
that does not deliberately write the tag — sky, FX, transparent materials, the clear, any
non-toon material — and normal blending pulls dst alpha toward 1 while additive accumulates it
toward 1. `1 − alpha` therefore decodes to metal 0, boost ×1, on every failure path. Same
shape as Ledger #31's `1 − isSkinned` prepass flag: every way of failing lands on "not the
subject".

**Gain, not an onset drop, on purpose**: `w` is exactly 0 below the feed onset and the gain
multiplies `w`, so the term can only amplify pixels already legitimately over the bar. It
cannot recruit dim distant gilding — the "whole architraves glow uniformly" failure §25
measured on the min-rough-mip route and declined — by construction.

**No-op proof at gain 0** (this is what lets cap5/budget34/bud35 boot the dirty tree without
contamination): `w × (1 + 0·x) = w` exactly in IEEE for finite x; scene alpha has no other
consumer (bright/down/up/composite/raw sample `.rgb` only — checked line by line); RGB
arithmetic is textually unchanged. `scratchpad/goldproof.mjs` (23 checks, PASS) proves the
resolved-source scope/order/depth claims and that both modules import. The naive version of
this patch — tagging with `slyMetal` directly — **fails to compile** (TOON_SHADE scopes its
body in a bare block); goldproof caught it before any boot did. Driver-compile residual risk
is the class §24.6's agxcompile run showed this ANGLE build does not produce for plain
assignments.

## The run

One boot, `scratchpad/goldhalo.mjs`, out `shots/goldhalo/`, queued behind bud35's ticket.
Shots `hero` (kiosk gilded lintel — spec1's responsive cluster, 1,554 px) and `temple`
(distance guard: the architrave run whose ORM λ~1–4 population must NOT come up). Per shot,
arms in order: **a0, a4, a12, a24, a0b** — `pf.tune.bloomMetalGain` poked live; the render
loop republishes it to the uniform every frame; no recompile.

## Registered verdicts

- **F1 — in-boot falsifier (state leak):** `a0` vs `a0b` (first and last captures of each
  shot, same boot) must be **bit-identical**. Any nonzero diff invalidates the whole run —
  the sweep contaminated itself — regardless of how good the other arms look.
- **F2 — mask leak:** on a non-metal control (brightest 1,000 non-metal px ≥ 200 px in screen
  space from any gilded px, gilded matmask rebuilt on the capture tree — masks on disk predate
  temenos/rail moves and are stale), mean |ΔL| < 0.5 display units at every arm. Violation
  falsifies the "metal-aware" claim: the tag is leaking or a global side-channel exists.
- **F3 — mechanism:** on the gilded halo annulus (dilate(mask, 12 px) − mask, kiosk lintel
  cluster), display L rises **monotonically** with arm, and arm 24 lifts the annulus p95 by
  **≥ +6 L** over a0. If not, the bloom feed is not "the lever with headroom" and §25's
  routing conclusion is wrong — say so rather than re-tune.
- **Target shape (report, not auto-ship):** smallest arm putting **any px ≥ L235** in the
  halo annulus without an F2 violation becomes the ship *candidate*. §25's own caveat is
  carried: `hero`'s gilded band is 98.6% shadowed and spec is `sh`-gated, so the body of the
  band is expected NOT to move — this A/B is scored on the halo, never on the band body.
- **Distance guard (temple):** count of architrave-band px newly over L200 at a24 ≈ 0
  (tolerance: < 50 px). The gain arithmetic says below-onset px cannot feed; this is the
  in-frame check of that claim.

## Dirty-tree notice for the queued runs (cap5, budget34, bud35)

Their boots will stamp `7b0e3f8+dirty`. The dirt is exactly this zero-default patch
(PostFX.js, ToonMaterial.js, toon.glsl.js) plus nothing else at write time. Per the no-op
proof above it changes zero RGB bytes at `bloomMetalGain: 0`; PREREG-cap5's "expect 7b0e3f8
clean" should read "clean or +dirty(goldhalo zero-default)". Recorded here so nobody burns a
cycle on the stamp.
