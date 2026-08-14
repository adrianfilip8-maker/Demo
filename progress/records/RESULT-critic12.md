# RESULT-critic12 — blind round 12: REJECT, avg 3.97/16 (r11: 4.44) — but the signal is family convergence and rater variance, and the guards are now the measured floor

Blind critic (tools/CRITIC.md verbatim, shots/r12/ 16 frames + 16 crops + manifest, no
changelog). Scores verbatim:

```
temple 6.5 · hero 5 · sly-profile 5 · sly-key 5 · sly-startle 4.5 · courtyard 4.5 ·
interior 4.5 · traversal 4.5 · kaykit 4 · sly-closeup 4 · dunes 4 · sly-perch 3.5 ·
sly-arm 3.5 · night 3.5 · combat 3.5 · guard 2.5          avg 3.97 — REJECT
```

## The calibration finding (read this before reading the average)

night scored 6 in r11 ("the set's most convincing mood, closest to the license") and 3.5 in
r12 ("a black hole with a moon") — while the only mechanism change between the rounds was
nightfloor's PURE ×1.12 shadow LIFT (§307), which cannot crush anything. Two honest blind
raters disagree by 2.5 points on near-identical pixels; the round-over-round average delta
(−0.47) is inside that noise. Per-shot where mechanisms shipped: hero 4→5 (goldenrake's
raking floor credited in pixels even as the critique moved to albedo/sky), sly-profile 4→5
("the frame that shows the target is reachable"), startle/perch +0.5 each. The average is
not the instrument; the FAMILY LIST is — and both critics independently derived the same
three.

## The three families (r12's ranking, convergent with r11)

1. **Grade/exposure destroys the palette** — the salmon flood (perch/arm/combat/profile/
   courtyard), action-shot bleach-to-white (traversal, combat — Sly's blue gone under the
   warm key: §277's lit-side saturation, now the top character-color item), night crush
   (see calibration note), inked FX contours (temple shafts, combat ring — §306's fxink,
   fix seal due at raster scope). Owners: POSTFX + LIGHTING; perch/arm's flood itself is
   CLOSED as a lighting question (§305) — Option-A staging, OWNER.
2. **Sly off-model where identity lives** — mask shape/tan face/ears (HEAD SCULPT: routed
   as owner-waived §294(1), but ON RECORD: both blind critics rank it top-3; the waiver is
   costing points on six shots — surfaced to the owner, decision unchanged), ratio 5.72,
   cane hook never reads as gold in 16 frames (material-only fix fair game under §294(2)),
   tail rings only in half the shots (TEXTURES all-yaw bands), shirt facets (normals).
3. **Guards are raw KayKit mannequins outside the art pipeline** — untextured, outline-less,
   cel-less white figures in SIX frames (kaykit, hero, temple, traversal, night, guard);
   the dedicated guard shot is the set floor at 2.5 with a blown formless cone. This family
   has NEVER had a dedicated pass and is now the highest-leverage open item. Owner: GUARDS
   (GuardModel through the toon/outline/rim pipeline + a real cone volume).

Also on record: §1 budgets (15/16 over tris — night 2.57M, courtyard 2.43M; 6 over draws),
the live-clock capture warning (aesthetic-only harness, sealed A/Bs unaffected — standing
note), black-rendering coin/lamp props, the coil basket cloned into seven frames (PROPS),
box-slab colossi (PROPS/Statues).

## Queue out of this round

1. GUARDS art pass (new lane: toon/outline/rim + designed silhouette + real cone volume).
2. §277 lit-side saturation hold (Sly's blue must survive warm keys — SHADING seal).
3. fxink raster-scope fix + ghost ambient-leg + screen-rim floor (§306 follow-ups).
4. Character-material: cane gold (spec+bloom+occlusion, shape locked §294(2)), tail
   all-yaw ring bands, shirt normal smoothing.
5. tombdim follow-up (paired dim+pool-gain — the r12 interior critique is exactly its
   thesis: "drop ambient ~70% and let the torch pools own the exposure").
6. PROPS: basket dedupe, coin/lamp unlit-render fix, colossi sculpt. 7. Budgets. 8. OWNER:
   Option-A staging; head-sculpt waiver reaffirm-or-lift.

> **CORRECTION (2026-08-14, §310):** the §1 budget breach reported in this round is FALSE. The
> manifest's `drawCalls`/`triangles` are `renderer.info.render` with `autoReset=false` — an
> all-passes submission counter (3 shadow cascades + beauty + normal prepass + blits). §1 caps
> VISIBLE geometry. Measured offline (`tools/budgetattrib.mjs`, reproduced by the coordinator):
> worst shot 85 draws (34% of 250) and 0.647M tris (54% of 1.2M); the whole level is 0.647M with
> culling off, so the reported 2.1x was arithmetically impossible. The critic brief that caused it
> is fixed at source (09808c1). No mass arbitration is owed to ARCHITECTURE/PROPS/TERRAIN.
