# RESULT — hero hook merge: diagnosed. Not occlusion; backdrop + scale, with a one-line pose lever

Frames read: shots/bud35/hero.png (newest, f026ef3 tree) and shots/agx1/hero.png; crops
hero-bud35-char4x.png, hero-bud35-hook8x.png. Instrument: $SCRATCH/hookprobe.mjs +
hooksweep.mjs (CPU-skinned pose, real cane pivot composition aim∘base exactly as
Animation.js applies it, real shot camera; §11 suffix in the file headers — no renderer,
no world occlusion; backdrop lumas read off the real PNG).

## The diagnosis, with the hypothesis space closed

**Pose-occlusion: NO.** 40/41 crook samples are clear of the body (z-buffered against the
full skinned mesh). The old "[-174,50,30]-family hides the cane inside the body" failure is
not what is happening at the current aim.

**What actually defeats it, measured on bud35/hero:**
1. **Backdrop**: the crook sits at bbox [589,247..612,267] over the darkest quadrant of his
   surround — frame luma at crook px median L38 vs surround ring L74. A gold-that-renders-
   dark hook (see 3) on dark ledge shadow ≈ invisible.
2. **Scale**: the whole crook is 23×20 px at 11.0 m. Tube 0.075 m ≈ 5.8 px wide, its own
   ink hull ≈ 2.5 px per side → the crook is ~46% ink by width and cannot read as a gold C;
   the C-void (~20 px) is the only legible feature. Scale is set by the hero camera
   (Shots.js, read-only for me) — no pose/aim lever exists for it.
3. **Gold value (both shots, separate ledger)**: at sly-closeup the crook is 92×76 px,
   fully clear, perfectly shaped — and reads at 8.0L contrast against its wall (crook
   median L54): the gold renders as gunmetal with one small warm patch
   (cap5-crook5x.png). This is the §8/§25 gold chain (diff *= mix(1,0.20,slyMetal), spec
   orientation, AgX shoulder, cool grade) — the goldhalo A/B now in flight is aimed at
   exactly this. Character-side lever if needed later: the cane's material spec in
   SlyModel/_matSpec('gold') — mine, post-freeze, only with SHADING coordination.

## Classification asked for: **pose-aim (fixable now) + camera-scale (Shots.js decision) + gold-value (routed)**

## Prepared minimal fix (post-freeze, one line in Clips.js)

`perch_idle` cane aim [-30,30,-30] → **[-40,40,80]** (and the two breath keys' aims move by
the same delta pattern: they are absolute, §9's orphaned-key trap — all three keys change
together: [-26,26,-30]→[-36,36,80], [-34,34,-30]→[-44,44,80]).

Sweep evidence (1539 aims, floors: hook y ≥ 9.05 above the ledge, clearFrac ≥ 0.85, zero
head/face crossing):
```
current [-30,30,-30]: backdropL 38  extent 31px  round 0.89  clear 0.97
best    [-40,40,80]:  backdropL 86  extent 25px  round 0.94  clear 1.00  bb [608,234..627,251]
alt     [80,80,20]:   backdropL 100 extent 28px  round 0.56  clear 1.00  (edge-on C — weaker shape)
```
The winner puts a broadside open C in the torso-tail gap against the hazed bright wall:
2.3× lighter backdrop for a dark hook, full clearance. **No aim reaches sky** — the grip
rides at hip height in this pose and the crook tops out ~0.66 m above it; sky-silhouette
would need an arm re-pose (larger blast radius; not prepared) or a camera change (not mine).

Honest bound stated in advance: even placed, the crook stays ~25 px and reads as a dark
open C on a light wall — correct noir-ink read, but if the critic wants the LOGO-scale hook
in `hero`, that is a Shots.js framing decision (dolly or a hook-side camera), reported to
the coordinator rather than fixed here.

Verification plan (post-freeze): hero recapture; check = crook C-void visible against
backdrop at 1x, crook px median vs surround ring ≥ 35L (current 36L but against L38 ground;
target is the same contrast against L86 ground where it is visible), and the silhouette
test (§7.3) run on the character box.
