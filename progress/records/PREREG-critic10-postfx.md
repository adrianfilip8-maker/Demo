# PREREG-critic10-postfx — traversal's blooming character (fix candidate) and the r10 "lens-ghost" blobs (attribution + routing)

Sealed **before** any capture. `shots/c10postfx/` does not exist at the time of writing. One boot,
world clock frozen (`{ dt: 0 }` on every `setShot`; arm re-renders via `renderFrame(0)`), per-shot
`back` restore controls. Runner `progress/records/critic10postfx/critic10postfx.mjs`, scorer
`critic10postfxan.mjs` beside it, candidate `PostFX.cand.js` + `cand.patch` beside it — all
committed with this seal. §186 ordering: the runner installs the candidate `onLocked` (after the
FIFO grant, before vite spawns) and restores the original `onReleasing`; the candidate does not
exist under `src/**` outside the lock window.

## 0. The two critic-10 items this run covers (RESULT-critic10, POSTFX family)

1. `traversal` 6/10 — "Sly is blown to a white ghost with a flare ball at his hip… clamp the
   bloom threshold/knee so the character never blooms."
2. "Lens-ghost" blobs — pink-purple blob in `temple`'s shafts, soft circular ghost mid-floor in
   `kaykit`, huge orange cluster beside Sly's head in `sly-profile`, faint mauve circles in
   `night`'s sky.

## 1. What was measured on the committed r10 frames before this seal (shadowhold's rule: ROIs are
   derived by looking, and the looking is disclosed)

`shots/r10/traversal.png` (commit 58e3f49):

- Sly's own body — head+torso box **SUBJ-DISPLAY = [536,205,42,92]** — reads mean 92 / p99 ~164 /
  max 204. **The character's own pixels do not clip.**
- The clipping pixels near him are two bright clusters: the "flare ball" core at (579–597,
  249–262), L≥238 (**BALL = [572,238,36,36]**), and an orb behind his head at (584–598, 198–210)
  (**ORB = [576,186,34,28]**). Both sit at traversal-affordance positions (the hook chain /
  rail), i.e. at `SparkleField` markers, whose near-player boost (`uNearBoost` 12 m,
  `gain = pulse·(0.85+0.75·near)`, `uCore` = lin(#8fd8ff)·2.4, final `col·(0.9+0.9·gain)`,
  additive) puts a marker core at scene ~6 in B right at his hip.
- So the critic's "white ghost + flare ball" decomposes as: (a) the character's own bloom feed
  (chest/muzzle fur at albedo·keyRad(tod 0.77 = 3.307,2.300,1.173) ≈ scene 2.4–2.8, over the
  shipped feed onset T−k = 1.90), plus (b) the sparkle quads and their bloom halos, plus (c) the
  AgX shoulder on his fur. Only (a) and the bloom half of (b) are POSTFX's.

Ghost ROIs on the committed r10 frames (documentation of the defect; the ambient field's sprite
positions are a function of the world clock, so a NEW boot will not reproduce these positions —
the in-run statistic in §4 is component-based for exactly that reason):

- temple **[592,126,72,72]** — pink-mauve disc against the blue star ceiling
- kaykit **[750,414,80,82]** — soft warm disc that DARKENS the lit floor (alpha veil, not bloom)
- sly-profile **[772,106,142,175]** — orange cluster of overlapping hard-edged discs with a
  diagonal two-band cel terminator — the `dustPainter` tile signature verbatim
- night — faint mauve circles upper-right sky, e.g. (1160–1195, 175–210), (1070–1100, 195–225)

## 2. Prior work this seal binds to instead of re-deriving

- **§135 (fx20, sealed):** `temple`'s pink disc IS the `sandHigh` pool (`sand_haze`); every other
  pool nulled. **§138:** screen-size ceilings and `nearFade` widening measured WRONG as fixes
  (the disc is at 4–28 m; any cap that removes it removes the field's own blob2 first);
  the defect is the sprite/backdrop PAIRING. **fx21:** exterior field worth ~1.5%/frame at mean
  ΔL ~2. **fx22 r4 (RESULT-fx22): candidate 1 (backdrop gate) REJECTED — D1 FAIL** (leaks onto
  night sky and sparkle-class sprites). Nothing shipped; the r10 critic saw the same family.
- The bloom TUNE history (1.02 → 1.55 → 2.20) and `progress/records/bloomcalc.mjs` (validated
  against captured frames): sclera scene 2.589 at tod 0.80; torch flame 3.0; gold glints ~6.8;
  sun 26. **The character class and the torch flame are 0.4 scene units apart**, so no
  (threshold, knee) both clears the character and keeps the torch halo:
  at T=2.90 k=0.20 (onset 2.70): sclera w = 0.000 but flame w 0.267→0.038 (−86%);
  at T=2.60 k=0.30 (onset 2.30): flame keeps w 0.156 (−41%) but sclera keeps w 0.027 and
  fur-at-2.8 keeps w ≈ 0.16 — the character still blooms. And a character-worn gold glint
  (~6.7) out-runs every sane threshold. **The knob the critic names cannot deliver "never".**

## 3. Item 1 — the candidate: a subject gate in the bright pass (`bloomSubjectCut`)

`PostFX.cand.js` (diff = `cand.patch`, ~20 lines): the bright pass samples the normal prepass
alpha — the ledger #31 subject mask, `1 − vSlySkin`, already consumed by the rim gate — and
multiplies its feed weight: `w *= 1.0 − uSubjCut · clamp(subj, 0..1)`.

- `TUNE.bloomSubjectCut = 0` in the candidate = **exact no-op** (`1.0 − 0·s ≡ 1.0`, `w·1.0 ≡ w`
  in IEEE for finite s; same arithmetic-identity family as `bloomMetalGain`/`bloomMetalCut`'s
  shipped no-op claims). One program, one uniform — arms differ only by the uniform (§148.2).
- Fail-closed on every path: the prepass clears alpha to 1 and writes `1−vSlySkin` only on toon
  draws, so sky / FX / unwritten pixels decode subj 0 → no cut; if the prepass is unavailable
  the fallback `MeshNormalMaterial` writes opaque alpha 1 → subj 0 → no cut. `needNormals` is
  extended with `(bloom enabled && bloomSubjectCut > 0)` so the mask is fresh whenever the
  bright pass consumes it.
- Population = skinned draws (Sly, guards, Carmelita). **The cane is NOT masked** — same
  documented boundary as `rimSkinExempt` (`ToonMaterial.js:558`, "vSlySkin comes from
  USE_SKINNING; the cane is not a subject").
- Half-res bright texels sample the full-res mask bilinearly → a soft partial cut at the
  silhouette, no aliasing.
- **Ship shape on PASS: `bloomSubjectCut: 1.0` becomes the shipped default** ("the character
  never blooms", all shots, all tods). Threshold/knee ship UNCHANGED at 2.20/0.30 — one lever.

## 4. Capture matrix (one boot, `dt: 0` everywhere, restore-first per arm, per-shot `back`)

| shot | arms |
|---|---|
| traversal | base · subj1 (`tune.bloomSubjectCut=1`) · T260 (`T=2.60,k=0.30`) · T290 (`T=2.90,k=0.20`) · bloomoff (`passes.bloom.enabled=false`) · sparkoff (`fx.sparkles.mesh.visible=false`) · back |
| night | base · subj1 · bloomoff · nosandhigh (`fx.batches.get('sandHigh').mesh.visible=false`) · back |
| interior | base · subj1 · bloomoff · back |
| sly-closeup | base · subj1 · back |
| hero | base · subj1 · back |
| temple | base · nosandhigh · nosandlow · noshimmer · back |
| sly-profile | base · nosandhigh · nosandlow · noshimmer · back |
| kaykit | base · nosandhigh · back |

T260/T290 are **report-only** (the critic's own suggested lever, measured to compare, never
shipped from this seal). sparkoff and bloomoff are attribution arms (report-only): they decompose
the BALL/ORB into sparkle-quad vs bloom-halo shares, and the SUBJ wash into feed vs spill vs
shoulder — the FX-routing evidence.

Every arm applies restore-first (all batches/systems visible, `tune` reset to candidate defaults,
passes re-enabled), then pokes its one config, then `renderFrame(0)` ×3, then captures. The probe
stamps tod, camera, batch visibility/live counts, and the applied tune values read back from the
LIVE uniforms (`uThreshold`, `uSubjCut`) per §40.

## 5. Registered bars — item 1 (fix; ship only on PASS)

Validity gate first, per shot: `back` vs `base` **strict 0 differing px**, else that shot is VOID
and no number from it is quoted. A VOID traversal kills the ship (fail-closed).

- **B1 (premise/mechanism).** diff(base, subj1) on traversal has ≥ 300 changed px at |ΔL| ≥ 2.
  Premise control: diff(base, bloomoff) must show ≥ 4× that changed-px count (bloom is live in
  the frame at all). If B1's count is < 300, the traversal wash is NOT character-fed —
  PASS-A is unreachable; see PASS-B.
- **B2 (containment).** On each of traversal / sly-closeup / hero: ≥ 99% of diff(base, subj1)
  changed px (|ΔL| ≥ 2) lie inside the character's screen bbox dilated by 128 px (bbox computed
  in-page per boot: projected root ± 1.2 m radius, root→+1.9 m height; stored in the json).
  Outside that region no pixel moves more than 2 codes in any channel.
- **B3 (direction).** Inside the region, no changed pixel BRIGHTENS by more than 2 L
  (the gate can only remove feed; +2 covers FXAA re-resolve at edges whose neighbourhood
  darkened). p99 |ΔL| reported.
- **B4 (halo-keep).** Under subj1: night LAMPS [660,0,120,60] and MOON [380,50,60,60], interior
  TORCH-A [1004,175,28,44] and TORCH-B [280,190,28,38]: |Δ mean L| ≤ 1.0 per ROI vs base.
  (bloomoff on the same ROIs is captured in the same boot and must show the halos are
  bloom-carried at all: mean-L drop ≥ 2.0 on at least 2 of the 4 ROIs — else the halo-keep bar
  is vacuous and is reported as such, not as PASS.)
- **B5 (the critic's read).** On traversal SUBJ-DISPLAY [536,205,42,92]: mean L under subj1 must
  not rise, and (p99 drops by ≥ 2 L) OR (mean drops by ≥ 0.5 L). BALL [572,238,36,36] must not
  brighten by more than 2 L mean. Crops at 3× (base vs subj1, the character) are looked at and
  the RESULT says what changed.
- **PASS-A** = B1–B5 all hold → ship `bloomSubjectCut: 1.0`.
- **PASS-B** (registered fallback if B1 fails): B1's analogue holds on sly-closeup AND hero
  (≥ 300 changed px each, subject-contained), and B2–B4 hold everywhere, and B5's ROIs move by
  ≤ 1 L (nothing to fix on traversal, nothing harmed) → ship 1.0 with the RESULT stating
  traversal's wash is spill/shoulder (FX/SHADING family), the gate shipping on the closeup/hero
  evidence and the "never blooms" guarantee.
- Anything else → **NO SHIP**; candidate reverted (it never leaves the lock window anyway);
  RESULT records which bar failed and the measured numbers.

Model prediction, in advance (held loosely): PASS-A — chest/muzzle fur at 2.4–2.8 over onset
1.90 feeds today and the gate removes it; lamps/torches/moon are not skinned and their pyramids
lose only the character's share, which at those ROIs is ~0.

## 6. Registered statistic — item 2 (attribution only; NO POSTFX SHIP, registered now)

PostFX.js contains no flare/ghost/lens pass (chain: scene → normals → AO → ink → bloom →
composite → FXAA; verified by reading the whole file before this seal). The r10 "lens ghosts"
are scene-side alpha sprites — the §135 family. **No change to `src/**` ships for item 2 from
this run**; the deliverable is binding the r10 critic language to the measured mechanism on the
r10 framings and routing to FX with current evidence (their candidate 1 is already REJECTED at
fx22; the next fix design is theirs).

Per ghost shot (temple, sly-profile, kaykit, night): diff(base, nosandhigh), components of
|ΔL| ≥ 4 (4-connected):

- **G1.** A component ≥ 800 px exists whose 3× crop reads as the soft warm disc/cluster family
  (looked at, stated). Report mean ΔL over the component, its bbox, and the backdrop class
  sampled off the nosandhigh frame (§148.3's units caveat applies: graded-PNG units).
- **G2 (discriminators, temple + sly-profile).** nosandlow and noshimmer leave that component's
  |mean ΔL| ≥ 70% of its base−nosandhigh value (i.e. the other two fields do not own it).
- **Retry rule** (sprite positions are clock-dependent): if a ghost shot shows no ≥ 800 px
  component, `step(300, 1/60)` once (advance 5 s, re-freeze) and capture the pair again
  (base2/nosandhigh2, paired at the new time). One retry per shot, disclosed in the RESULT.
- **ATTRIB-PASS** = G1 on ≥ 2 of the 4 ghost shots, and G2 wherever its shot fired G1.
- **ATTRIB-INCONCLUSIVE** (fewer than 2 fire after retries): the routing note rests on the r10
  ROIs' visual signature + §135's sealed attribution alone, and says so.

Either way the KNOWN_ISSUES entry routes item 2 to FX: pool `sandHigh`, mechanism
sprite/backdrop pairing (§138.3), candidate-1 rejected (fx22 D1), r10 evidence = the four ROIs
in §1 + whatever this run's components add.

## 7. Suite + ship mechanics

Full test suite green before each commit — the standing baseline is **468 pass / 1 pre-existing
fail** (`clockfreeze`: fxshape2.mjs, another lane's runner, not touched here; my runner passes
`{ dt: 0 }` and does not extend that list). On PASS: apply `cand.patch` to `src/render/PostFX.js`
with the shipped default flipped to `bloomSubjectCut: 1.0` (lock checked clear immediately before
the write), re-run the suite, commit with RESULT + KNOWN_ISSUES entry; pull before push.
