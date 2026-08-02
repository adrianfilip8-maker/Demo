# RESULT — fpv2: geometry-fingerprint seal (V1–V3) + membership legs (V4), and the
# re-derived saving figure that closes §19's strikethrough

Run: `shots/fpv2/` (one boot, frozen clock, hero staged). Scored by `fpv2an.mjs` against the
bands in `PREREG-fingerprint-geometry.md`, **verbatim, no re-drawing**. The coordinator ran the
same analyzer independently as a cross-check; my run reproduces their numbers to the pixel.

## Gates

- **Gate 1 (staging):** clean — no `setShot` warnings in the manifest.
- **Gate 2 (valve/engagement):** OK — every cached job `engaged: true`, every legacy job
  `false`. This gate is load-bearing: a tripped valve makes every 0-px stake below pass
  vacuously, so it is checked before any verdict is read.

## Verdict

| leg | measurement | band | verdict |
|---|---|---|---|
| V1 stake — cached vs legacy, in-place position edit | **0 px** | `=0` | **PASS** |
| V1 non-vacuity — after-edit vs before | 105,704 px | `≥200` | probative |
| V2 stake — cached vs legacy, `drawRange` edit | **0 px** | `=0` | **PASS** |
| V2 non-vacuity | 12,409 px | `≥200` | probative |
| **V3 null control — refresh delta / 100 dt-0 frames** | **2** (8 → 10) | `=2` | **PASS** |
| V4A stake — membership ADD, cached vs legacy | **0 px** | `=0` | **PASS** |
| V4A non-vacuity / Δrefresh | 351 px / 2 | `≥200` / `≥2` | probative / PASS |
| V4B stake — membership REMOVE, cached vs legacy | **0 px** | `=0` | **PASS** |
| V4B non-vacuity / Δrefresh | 351 px / 4 | `≥200` / `≥2` | probative / PASS |

Target for V1/V2: `arch:hall:hieroglyph_wall`, 75,384 tris (largest tracked static, named by
the probe rather than chosen by me). Statics tracked 334–335, dynamics 13, cascades c0 auto /
c1+c2 cached.

**V3 is the headline.** Its PASS region was *unreachable by any fingerprint* while the
unconditional census reset stood — §33's case exactly, a band that partitions the outcome line
and discriminates nothing. The floor moved **26 → 2** and the leg now discriminates for the
first time. That is why reverting rather than arguing was the right call: no amount of
fingerprint work could have moved a number the reset was setting.

**The V4 legs.** Nothing in the original seal touched *membership*, and the census fix's entire
safety argument was about membership — so without V4 the argument would have shipped untested.
Both directions pass with probative non-vacuity.

**One unsealed observation, labelled as such:** `v4b.c` vs `v4base.c` = **0 px** — removing the
added caster returns the frame bit-identically to pristine. That is a good sign and it is *not*
a band. It was not pre-registered, so it is recorded as an observation and carries no verdict
weight.

## The re-derived saving figure

`r` = (delta 2 − restore 2) / (N 100 frames × C 2 cached cascades) = **0.00000**. The
12.5%-of-frames steady-state bill is **gone rather than reduced**.

`S` comes from the headless census (`casters2.mjs`, rebuilt this session — the original
`casters.mjs` was lost in the scratchpad rotation). It reproduces Lighting's own arithmetic;
the splits it derives (0.50 / 14.47 / 41.75 / 160.00) match the first census exactly, which is
the cross-check that it is the same instrument. Per-cascade architecture statics at `hero`:

    c0  radius  12.8 m   12 casters   134,478 tris   legacy (not cached)
    c1  radius  36.3 m   30 casters   277,130 tris   CACHED
    c2  radius 138.8 m   38 casters   302,130 tris   CACHED

**The figure, with its denominator in the same sentence:** the cache eliminates
`(1 − r) × S` = **579,260 architecture-static shadow triangles per frame** — `r` = 0.00000
measured over `N` = 100 frames × `C` = 2 cached cascades — against `D` = **713,738**, the same
census's all-cascade architecture-static shadow redraw, i.e. **81.2% of D**. The ratio is 81%
rather than 100% because c0 is deliberately left on the legacy path.

Two constraints that travel with that number and must not be dropped:

- **`S` is an ARCHITECTURE-ONLY FLOOR.** Vegetation does not build headless (needs textures),
  Terrain's headless init lands 0 casters, and Props/Statues are not built by `lvl.mjs`. The
  absolute saving is therefore understated; the *ratio* is internally consistent because `S`
  and `D` come from the same population in the same run.
- **The counted column is not quoted here** — not as a cross-check, not in parentheses. `S`
  and the dynamics redraw are both invisible to `engine.stats` (`Engine.renderFrame` resets
  `info` after module `update()`s, and all cache work happens inside `Lighting.update()`).

### The §33 clause, which applies with a twist

I pre-registered that if the corrected figure landed near the struck 33–41% / 34.7–40.1%, that
would be **luck, not vindication** — their input was unmeasured. It did **not** land near them:
81.2% against 33–41%. **That is equally uninformative about them.** The gap is a denominator
difference, not a disagreement: mine is the shadow-redraw population, theirs was a whole-frame
denominator that was never restated (which is half of why they travelled unchallenged), and I
decline to compute a whole-frame version because that denominator is a counted-column number.
**The struck figures stay struck** — neither the near-miss case nor the far-miss case is
evidence about a number whose input was never measured.

## Grounding — does this machinery bear on the critic's contact-shadow finding?

Asked directly, so answered directly: **partly, as a testable hypothesis with a decisive
one-shot test — not as a claim.** And the shadow *cache* is not implicated at all: c0 is the
near cascade, it is never cached (`shadowCacheFrom: 1`), so nothing in the cache work can
cause or cure this.

What *is* mine is c0's bias, and the arithmetic is suggestive. At `hero`'s c0 (radius 12.8 m,
2048 map) the texel is 1.25 cm, so `normalBias = clamp(1.25 × 1.7) = 2.12 cm` and the PCF
kernel is `2.4 texels = 3.00 cm`. A normal-offset lookup on a floor displaces the shadow
*laterally along the light* by `offset / tan(elevation)`; at the 22° sun these shots use that
is **5.2 cm for the bias alone and 12.7 cm for bias + PCF**. At plausible `sly-closeup`
scales (150–320 px/m) that is **8–46 px** — squarely inside the 3–55 px window the critic
sampled in M12. A contact shadow displaced that far is detached from the sole, which is what
"no measurable contact shadow" looks like.

**The frame it would change:** `sly-closeup`, re-running the critic's own M12 probe (13-px
column under the left boot sole at d = 3…55 px, against the same two side controls). **The
test:** A/B `normalBiasTexels` 1.7 → ~0.5 and `shadowRadius[0]` 2.4 → 1.0, one shot, both
values in my file. If a dark band appears in the near samples, peter-panning was a real
contributor; if the column stays flat at all d, the cause is upstream of me — the character
not casting into c0, not in contact (§7 records up to 15.5 cm of residual boot penetration),
or the floor not receiving — and it leaves my files with a measurement attached rather than a
guess.

**The counter-risk, stated because the knob exists to prevent it:** `normalBias` is what keeps
acne off. Any such A/B has to score acne on the same frame, or it trades §7.3's contact
condition for §7.3's surface condition. That is a two-band test, not a one-band one, and I
would pre-register both before touching the value.

**Priority, acknowledged.** §36 is right that this is correct engineering that is not what is
costing us the frame. Holding on further shadow-cache work; the grounding item above is
offered as a candidate with its test, to be scheduled or declined at the coordinator's call —
not started.
