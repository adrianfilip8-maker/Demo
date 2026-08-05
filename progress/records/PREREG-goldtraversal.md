# PREREG-goldtraversal — the §7.3 gold seal on `traversal`, gated by GATE 0a/0b

Registered by TEXTURES, 2026-08-05, tree `47de8f1`. This prereg spends **no capture**: every
number below was measured offline against captures already on disk. One capture window is
warranted (see §7) and is the coordinator's to schedule behind fx22's lock hold.

Instruments, all offline, no lock: `progress/records/gildlit.mjs`, `progress/records/matmask.mjs`,
`progress/records/goldgap.py` (new, this run) with `progress/records/goldgap-jobs-traversal.json`.

---

## 0. The premise, measured before registration — and half of it is withdrawn

### 0.1 Provenance and staleness of what was measured

Newest `traversal` captures on disk (all `shots/` is Aug-1 vintage after the §161/§162.4
rollbacks):

| capture | when | what it is | camera (stamped) |
|---|---|---|---|
| `shots/fx5/traversal.full.png` | Aug 1 18:19 | FX shaft A/B, "full" = shipped config | `(6,14,6)` — current |
| `shots/rim2/traversal-base.png` | Aug 1 18:00 | SHADING rim A/B, base arm | `(6,14,6)` — current |
| `shots/rim1/traversal-base.png` | Aug 1 16:16 | SHADING rim A/B, base arm | `(12,14,6)` — **old** |
| `shots/r3/traversal.png` | Aug 1 13:48 | canonical sweep | pre-`c7e51c5` — **old** |

`c7e51c5` (Aug 1 15:57) moved the traversal camera 6 m west. The current tree additionally
carries `c54e41f` (chisel albedo on gilded), `d8a1134` (arris ring relocation), `61a4c9e`
(beadRoll on gilded beams) — **all post-date every capture on disk and all touch the gilded
surface.** So the numbers below measure the premise as of the Aug-1 18:19 tree; the gates in §2
re-run on the seal's own fresh base capture and are decisive there, not here (sha256 prefixes:
fx5 `6a78acb29426`, rim2-base `d2b5c7b8ff66`).

### 0.2 GATE 0a — share: **PASS, Δ = 0.0 %**

`arch:hieroglyph_gilded` share of `traversal`, mask rebuilt from the current tree (`matmask.mjs`,
1280×720): **14.00 % raw, 12.94 % eroded-2** (`gildlit.mjs`), against the recorded 12.94 %.

### 0.3 GATE 0b — luminance: **SPLIT — and the recorded premise figures are WITHDRAWN**

On both correctly-registered newest captures (fx5-full and rim2-base agree to 0.01 pp):

| clause | registered floor | measured | verdict |
|---|---|---|---|
| gild L p50 / same-frame `sandstone_worn` L p50 | ≥ 0.85 | **1.41** (78.3 / 55.4) | PASS |
| share over L160 | ≥ 3 % | **2.11 %** | **FAIL** |

**The recorded routing figures (11.09 % over L160, gild/ref 1.04) are withdrawn, by me.** They
were computed by crossing a **post-camera-move mask with the pre-move `r3` capture**. Localised,
14,703 of that run's over-L160 "gild" pixels sit in the upper-left cell band where the old
composition holds **sunset sky** — confirmed visually on a tinted-mask crop. `rim1-base`
(old camera, stamped in its own report.json) reproduces the artifact at 11.1 %; both new-camera
pairs give 2.1 %. This is §160.1's rule enforced against my own number — the 11.09 % was a
citation of a misregistered measurement, and re-deriving it dissolved it — and it is §158.5's
"shares are not stable across this tree" wearing a camera instead of an architecture change.
Corrected at the declaration site in `NOTE-gildguard-void.md` §3/§4.

Decomposition of the real 2.11 % tail (rim2 ablation arms, same mask):

- `nosly` arm: **2.45 %** — the character occludes a little lit gild; the architecture-only tail
  is if anything slightly larger than the base number shows.
- `norim` arm: **0.77 %** — roughly **two-thirds of the current highlight tail is rim light on
  arrises, not specular.** What §7.3 calls "hard spec" is, today, mostly a rim term.

**Fallback framings are not available.** `courtyard`'s recorded 6.57 % tail came from the same
mask-vs-stale-capture crossing and its current-tree mask visibly misregisters against every
existing courtyard capture (tinted patches on open sky — the gilded beams landed Aug 2–3, after
every capture). No framing except `traversal`×(rim2|fx5) currently has a registered mask/capture
pair, and none will until a fresh sweep.

### 0.4 What this means for the seal

The seal proceeds **only through GATE 0a + 0b re-measured on its own fresh base capture,
before scoring** — registered void conditions, not advice. On today's evidence the tail clause
fails absent a tree change that lifts it; the tree HAS changed (chisel, arris ring, beadRoll —
all plausibly tail-positive, none measured in frame). The fresh gate run settles it either way,
and **a gate failure is itself the registered result of the capture** — the frames still buy the
gate report, the registration crops, and the occluder map. "Unscoreable" is a registered outcome
(§141, §155.2).

---

## 1. What §7.3's gold condition means, as registered here

> *"Gold doesn't read as metal (needs hard spec + bloom + dark occlusion)"*

scored on `arch:hieroglyph_gilded` in the `traversal` frame, occluder-excluded, as four
frame-measurable quantities — each anchored to a real-frame reference gap measured under
`AGENTS.md` §7.4 (first run of the real-comparand protocol, 2026-08-05, §5 below):

1. **Hard spec** = a connected warm highlight lobe at ≥ 0.92 × the gold's own frame max, of
   non-trivial area, on the gold itself (not FX, not character).
2. **Highlight tail** = share of the gold population over L160 (the in-frame form of "the metal
   reaches toward clip somewhere").
3. **Dark occlusion** = the gold's own darks beside the highlight (ring p05 vs body p50) —
   already present today; the band exists to catch regression, not to demand improvement.
4. **Bloom** = halo width/tint past the gold edge at the lobe — a *guard*, not a target: the
   references show bloom is not load-bearing at these stagings (§5.3).

Body brightening is deliberately NOT the target: our gold body already sits at **1.41×** the
same-frame sandstone (0b clause 1) and the two night references hold body parity comparable to
ours. A candidate that passes bands by washing the body brighter fails B3 and reverts.

---

## 2. Gates (void conditions, run before scoring, on the seal's own base capture)

```
GATE 0a  share      re-measure hieroglyph_gilded's share of the traversal frame on a fresh
                    current-tree mask; VOID if |Δ| > 20 % relative to 12.94 %.
GATE 0b  luminance  gild L p50 / same-frame sandstone_worn L p50 >= 0.85
                    AND share over L160 >= 3 %
                    measured with progress/records/gildlit.mjs on the arm's own base capture,
                    BEFORE scoring. Either clause failing = seal VOID, gate report is the result.
GATE 0c  registration  tinted-mask crop over the exact base capture, eyeballed and saved.
                    Reproduce-to-the-digit is not registration (§0.3); this gate has no numeric
                    form on purpose — it is a look.
```

## 3. Partitioning bands — falsifiers written revert-not-defend

All scored by `goldgap.py` (mask ROI, occluder-excluded, `lobe_min_rmb = -5`) plus
`gildlit.mjs`, on 1280×720. Bands are intervals, not points (§133.1). "Revert" means the
candidate edit is reverted and the band outcome recorded — not argued, not re-thresholded.

| band | quantity | pass interval | above-interval meaning |
|---|---|---|---|
| **B1** | largest warm lobe: area px | **[30, 400]**, and bbox ≥ 5 px in both dims | > 400 = blown-highlight regime (combat's), **revert** |
| **B2** | gild share over L160 | **[3 %, 20 %]** | > 25 % = measuring the tonemap (calibrated: combat 39.78 %), **revert** |
| **B3** | gild p50 / sandstone_worn p50 | **[0.85, 1.8]** | > 1.8 = body wash instead of lobe, **revert** |
| **B4** | ring p05 / gold body p50 | **≤ 0.65** | above = the occlusion half regressed, **revert regardless of B1–B3** (today: 0.38 = 29.5/77.6 — the winning half, guarded) |
| **B5** | bloom halo at the lobe, px past edge | **[0, 40]** | > 40 = grey wash (§7.3's bloom checkbox), **revert** |

Below-interval on B1/B2 = the defect stands; no candidate claiming the gold condition ships.
The seal PASSES only if B1–B5 all land in-interval on the same capture that passed gates 0a–0c.

## 4. Calibration (§13) — the metric moves on known states, measured in advance

- **Tail metric separates the defect from its opposite on same-vintage captures:** traversal
  2.11 % (known carrier: no lit tail) vs combat 39.78 % / p95 198.7 / ratio 2.86 (known carrier
  of the opposite: §9's blown frame), both `fx5` Aug-1 18:19–18:23, same instrument, same erode.
  Band B2's [3, 20] sits strictly between.
- **Lobe detector positive control, in-frame:** with the occluder exclusion lifted the detector
  returns the **157 px** white FX glow lobe at (594,254) — a known bright lobe in the same frame
  and pipeline; with exclusion applied, **4 px**. The instrument finds a lobe when one exists and
  the exclusion removes exactly the known non-gold one.
- **Cross-capture null floor:** rim2-base vs fx5-full (19 min apart, same tree family): every
  gold statistic agrees within 0.01 pp (tail), 0.0 (p50), identical lobe bbox. Noise is far
  inside every band width.

## 5. The §7.4 reference run — the losing quantities, named with numbers

First run of the real-comparand protocol. Comparands fetched to scratchpad only (never
committed, never shipped — `AGENTS.md` §1.1 rule 3), equal-height side-by-sides built with
randomised left/right, looked at before scoring. Full JSON:
`goldgap-out.jsonl` (scratchpad), config committed as `goldgap-jobs-traversal.json`.

### 5.1 Comparands and their provenance (re-fetchable; scratchpad copies are volatile)

| ref | source (github clone, the only route the egress policy allows — §5.4) | caveat |
|---|---|---|
| Mario Odyssey checkpoint-flag gold (sunlit) | `Amethyst-szs/yoshi-star-kingdom` @ `7d46c59`, `2DAssets/Screenshots/1080p/0100000000010000_2021-04-29_10-06-46-270.png` | real Odyssey-engine Switch capture (title `0100000000010000`, album hash `8AEDFF…`), **modded kingdom, vanilla flag asset**, 1080p |
| Sly 2 Rajan-palace gold domes (night) | `libretro-thumbnails/Sony_-_PlayStation_2` @ `538ceb0`, `Named_Snaps/Sly 2 - Band of Thieves (USA).png` | **PS2-native snap, not the PS3 HD remaster** — same art, 512×384 |
| Sly 3 gold cane hook + coins (night) | same repo, `Named_Snaps/Sly 3 - Honor Among Thieves (USA).png` | same caveat |

Absolute luma is not comparable across frames from different games and exposures; every number
quoted below that crosses frames is a **within-frame ratio**.

### 5.2 The measured table

| quantity | OURS (fx5/rim2, gold only) | Odyssey flag | Sly 2 dome | Sly 3 hook |
|---|---|---|---|---|
| gold ROI px | 107,280 | 4,112 | 9,819 | 1,234 |
| body p50 | 77.6 | 193.6 | 87.0 | 137.9 |
| p99 / max | 180.8 / 229.4 | 244.5 / 253.8 | 156.1 / 170.2 | 239.4 / 240.6 |
| **lobe area (0.92·max)** | **4 px (4×1)** | **84 px (13×10)** on a 28 px ball | **95 px (18×12)** | **146 px (53×30)** |
| lobe share of gold ROI | **0.004 %** | 2.0 % | 1.0 % | 11.8 % |
| ring p05 (occl. beside lobe) | 29.5 → contrast 7.8 | 55.0 → 4.6 | 44.1 → 3.9 | 73.4 → 3.3 |
| bloom halo px / warm tint | ≤ 5 / +37 (likely edge shading, not bloom) | 0 | 2 / +54 | 1 (n=1, not quotable) |

### 5.3 The losing quantities, named (this is what the seal must move)

1. **Specular lobe area: 4 px vs 84–146 px.** Our largest connected bright-warm region across
   107k gold pixels is four pixels; every reference gold that reads carries a lobe of 1–12 % of
   its object. **This is the gap.** In our frame the only 100+ px bright lobe is an FX glow
   sprite. (And per §0.3, two-thirds of even our thin tail is rim, not spec.)
2. **Highlight ceiling: our gold never approaches clip — max 229, p99 181.** Odyssey p99 244,
   Sly 3 p99 239; even the PS2 Sly 2 dome puts its crescent at 1.79× its body (ours: long thin
   tail over a dark body — the profile of a dielectric with rim, not lit metal). In-frame form:
   the 0b tail clause, 2.11 % vs the 3 % floor.
3. **Dark occlusion: ours is the WINNING half** — contrast 7.8 vs their 3.3–4.6, ring p05 at
   0.38 of body. Registered so the fix is aimed at the bright side, and B4 guards the dark side
   against being washed by whatever brings the lobe.
4. **Bloom: a guard, not a target.** References carry 0–2 px of halo at these stagings; the
   metal read there is spec + occlusion, not glow. B5 only prevents the §7.3 grey-wash failure.

Side-by-side observation (equal height, ours right on all three sheets by md5 parity): their
gold *pings* even at 30 m at night — per-object lit crescents on Sly 2's domes, a white streak
on a 16 px Odyssey pole — while our gilded cornice reads as brown-bronze trim distinguishable
from sandstone by hue, not by luminance behaviour. The measured rows above are that sentence in
numbers.

### 5.4 Egress note for whoever fetches next

Every direct image host probed is policy-denied at proxy CONNECT (13 hosts: wikimedia, wikia,
mariowiki gallery, mobygames, imgur, IGN, GameFAQs, giantbomb, launchbox, nintendo assets,
slycooper.wiki.gg + earlier-logged ytimg, githubusercontent). Not retried, per proxy README.
**`github.com` clones through the git proxy are the working route** — `--filter=blob:none
--no-checkout` to list a repo's tree, then `git checkout HEAD -- <paths>` for the blobs wanted.

---

## 6. Arms, readback, and scoring procedure

- **ARM base** (the seal itself): one fresh `traversal` capture at the current tree.
  `SANDS_NO_HMR=1`, launched detached via `tools/launch.sh`, serialized via `tools/lock.mjs`.
  Stamp the `src/**/*.js` tree hash (not the git SHA, §121.4) at boot; the capture's own
  report must stamp `tod`, camera, and applied uniforms (as rim2/fx5 already do).
- **Gates first:** fresh mask → 0a; `gildlit.mjs` on the fresh base → 0b; tinted-crop → 0c.
  Any failure: stop, record the gate report as the result.
- **Occluder map, re-derived per capture** (registered procedure, not reused rects): cell map of
  ≥ 0.92·max pixels inside the gild mask → visual crop over each hot cell → exclusion rects over
  character/FX → rects stamped into the scorer output. The Aug-5 rect `[460,140,720,380]` is a
  worked example, not a constant.
- **Candidate arms** (if any owner stages a fix — gold levers live in SHADING's shader assembly
  and GEOMETRY's per-recipe `metalAmount`/`spec`, §136; TEXTURES stages no src edit under this
  prereg): one lever per arm; **applied-state readback per arm** — the arm's stamped uniforms/
  recipe values must equal the registered intent or the arm is not scored (§143's guard, on the
  correct side: readback of what *rendered*, not what was touched); A/BACK pairs with per-arm
  `srcAtArm`/`srcAfterArm` tree hashes (the `tuftbias.mjs` pattern, §160.5).
- **Scoring:** `goldgap.py` + `gildlit.mjs`, bands B1–B5 as sealed. No post-hoc thresholds; a
  band miss is a recorded miss. All verdict-bearing pixels come from the arm's own captures.

## 7. What is being asked of the coordinator

One capture window behind fx22's lock hold: fresh `traversal` base (plus `combat` in the same
boot if cheap — it re-anchors the B2 calibration on the current tree). On today's evidence the
likeliest outcome is a 0b tail-clause failure at ~2 % — in which case the recorded result is
"the gold condition's premise fails on its best framing at the current tree", which routes the
defect to the lobe-forming levers (§6) with the reference gaps of §5.3 as their targets, and
this prereg re-arms unchanged once a candidate exists.
