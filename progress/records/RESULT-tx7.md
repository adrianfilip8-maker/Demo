# tx7 outcomes vs PREREG-tx7 + PREREG-landmark + the two routed checks

Frames: `shots/tx7/` temple/interior/hero/hero-aokey1, 1280x720 high, commit **7dc4442 clean**
(single boot, one cascade build — §15's fx6 corruption cannot apply; no cross-run comparison
here touches the four poisoned fx6 frames). Before-frames used: `shots/tx6/temple.png`
(3813148 dirty, the pre-pool-fix state) and `shots/bud/` (41d4a50, pre-crazing/pre-pillow).
Analysis artefacts: `ab-tx7/`. Instrument: `tx7verify.mjs` + mask-based ROI stats
(`*-mask.bin` from matmask, ARCHITECTURE-only — FX/character pixels are invisible to the
masks and show up as drift inside material ROIs).

## 1. PREREG-tx7 (falcon/pool fix) — ALL FOUR CONFIRMED

| prediction | band | landed |
|---|---|---|
| P2 relLocalContrast, ROI (950,200,180x380) | \|d\| < 5% of 0.05302 | 0.05433, **+2.5%** |
| P3 mean b−r, same ROI | \|d\| ≤ 0.003 | −0.0754 → −0.0756, **−0.0001** |
| P4 dark<0.09 share | not up | 0.01% → 0.01% |
| P1 varied signs (visual) | bands read as writing | **confirmed** — before: same falcon 4+ times per crop + duplicate triangles; after: bars/wavy-n/lens/dots, no repeated mark (`roi_{before,after}_2x.png`, `wallL_*`, `wallR_*`) |

Squint on all three tx7 frames: masses clean, subjects instant, no pattern pulse on temple's
axial columns (`*_squint.png`). Both §7.3 conditions hold at once in-frame.

## 2. Landmark question — temple axial AND interior square-on both clean

- temple: no countable accent on wall or column crops; the lone n=1 falcon on
  `column_papyrus` does not read as a beacon (PREREG-landmark predictions 3 and 4 confirmed).
- interior back wall (routed ROI x340–950 y0–390): frieze band y0–80 spans world
  x −10.1..+4.1 = **14.2 m = 2.73 repeats** of the 5.2 m tile at ~220 px/repeat (pixworld) —
  enough to count if a beacon existed. By eye: varied framed quadrats, no recurring accent.
  NCC autocorrelation: only the ~41 px quadrat rhythm (r 0.31), **flat at the 220 px repeat
  lag** (`int_frieze_2x.png`). Lower wall slices are shadow/torch-glow dominated, nothing
  countable (`int_wallslice_*`). Verdict: §7.3 tiling condition passes at both framings
  measured. Residual: a closer, better-lit square-on wall (night) remains untested.

## 3. Paving crazing (ce5e421) — verified in frame, both shots

Patch (24 px) high-pass energy on mask-restricted paving, bud → tx7:

| | mean energy | patch cv |
|---|---|---|
| interior | 0.01726 → 0.01691 (−2.1%) | 0.660 → **0.729** |
| hero | 0.02811 → 0.02680 (−4.7%) | 0.768 → **0.827** |

Total crack energy flat-to-down (no busy regression), dispersion up = flags now differ.
Visually (`pav_int_*2x.png`, `pav_hero_*.png`): before, every flag carries the same Worley
web; after, most flags clean, neighbour-runs share state, odd flag shattered. §8's "floor
reads slightly monotonous" item is addressed. Confounds bud→tx7 (pillow normals,
shadowDistance) noted; the per-flag state signature is unambiguous in the crops.

## 4. hero-aokey1 — CORROBORATES SHADING's aoKey=0-final at frame scale, with one scoping fact

- Whole frame net dLuma **−0.127** (0–255), mean |d| 0.367, 5.77% px changed >2 — same
  order as SHADING's rim2 finding (net sub-1, drift-scale). No material moves net >|0.35|
  except `gold_leaf` +4.9 — attributed by crop to the hook-ring **sparkle FX animating**
  across the step(3) between captures, not to aoKey (the term cannot brighten).
- The darkening that does occur is **crevice-shaped** — paving joint lattice, block seams,
  relief recesses (`aokey_changemap*.png`) — so the uniform is wired and lands exactly where
  authored AO lives. The mechanism in §8 is real; its net effect is small.
- **Scoping fact the verdict should carry:** only **1.4%** of hero's gilded pixels are
  sunlit (>120 luma) — hero's gilded mass is the shadowed entablature band, and aoKey touches
  only the key term. So this A/B corroborates "no visible global win" but **could not have
  tested §7.3's gold-occlusion line either way**; no frame in the tested set has key-lit
  gilded at size. On the tiny lit subset the direction is correct and small (span p95/p5
  1.550 → 1.582). The gold-reads-as-metal residual therefore stays where §8 left it:
  authored occlusion verified in the texture, discarded on the key term by (now final)
  default; remaining levers are spec/bloom/diffuse-strip (SHADING/POSTFX) and a framing
  with lit gold.

Invariants: no `src/textures/**` change since the pool/crazing commits these frames verify;
darkTail and jointDelta states are as recorded in §13 (ceiling_stars 0.0005 residual,
found-not-taken `lift` unchanged).
