# Task #20 verification record (coordinator transcription of GEOMETRY's report, 2026-08-02 ~14:00)

GEOMETRY's completion numbers, transcribed from its report for durability — the probes lived
in scratchpad (`poleprobe.mjs`, `warnprobe.mjs`) and the report in a transcript, both
restart-mortal. Src edits landed in the 4ecaf5d checkpoint (Vegetation.js, Collision.js).

## 1. Phantom palm poles — retag taken, probe-verified both sides of the edit

Decision was GEOMETRY's own: the per-instance spline "proper fix" restores a capability that
never worked (palm climbing), at the cost of a sealed mini-prereg plus per-spot colliders;
the retag loses nothing that functions today. `Vegetation.js` trunk registration:
`{tag:'pole', material:'wood', climbable:true}` → `{tag:'misc', material:'wood'}`, comment
citing NOTE-void-and-poles §2b.

- Phantom mounts near world (0,·,0): **25 mount points (y 0–11, d=0.01 m) → 0**, at both the
  1.9/2 m auto reach and the 2.85 m interact reach.
- Trunk solidity **bit-identical** pre/post: 3 recs, 25/24/24 instances, 9,900/9,504/9,504
  BVH tris, same test-ray hit at 2.687 m (`misc` ∈ SOLID_TAGS).

## 2. proxy:pole warning demoted, and the message made true

`Collision._buildAffordances`: the authored top/bottom branch (affine-exact CatmullRom, per
NOTE-void-and-poles) is now silent; the bounds branch keeps its warning with corrected text —
"synthesised one from its world bounds, which may not match the visible geometry (instanced
meshes especially)". Synthetic verification: silent-for-authored PASS, loud-for-bounds PASS,
authored-branch spline exact (point on axis, tangent.y = 1.0000).

## 3. void.mjs end-to-end (post-§21-fix, first full run on the repaired tool)

319,840 tris; 10 shots × 14,400 rays = **144,000 rays, 0 into-void first hits**. Known-bad
axis-aligned ray hits at the analytic t ≈ 8.000; degenerate-null still misses; strip hole
count 0.

## Bonus verifications on today's tree (HEAD-era numbers, superseding pass-2-era baselines)

- **Guard cyan junction line: dead.** `shots/bud35/guard.png`: zero pixels of the
  #a0d6e6/L≈204 class at any wall/ground junction. The single 3-px near-match at (900,441)
  is a glint on the guard model itself (flat paving 8.5 m behind it by pixel-ray) — owner
  GUARDS, cosmetic.
- **Cel-ramp geometry: fixed by the landed chamfer/pillow work**, re-measured at HEAD with
  `tools/ndl.mjs`: band-edge-inside-a-primitive temple **47.50%**, guard **48.46%** (pre-fix
  11.75%/6.45%); smooth-shaded area 56.94%/80.21%; backface leaks traversal 16 px (0.00%),
  hero/guard 0. The refreshed `progress/frames/geo-{hero,guard,traversal}.png` at 257d298 are
  this re-run's debug renders (the Aug 1 pass-2-era versions live in git history at 905eb6d).
  **Open: no critic has re-scored the banding condition since the fix** — that frame belongs
  to the coordinated capture batch.
- **Hero kerb band geometry identified**: the obelisk terrace stage-2 deck rim at y≈5.20 — a
  §8.1 contract ledge with real width, not a modelling error. The sealed rim-floor A/B
  (PREREG-kerb, SHADING) is correctly its owner; **do not delete that geometry.**
- Architecture's own budget share at HEAD: 11–44 draws / 0.124–0.320M tris per canonical
  camera (314,970 tris, 44 meshes total).
