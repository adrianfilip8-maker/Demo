# Re-derivation of the shadowed-architecture hue acceptance — from §2.2 *surface* intent

> **§§5–6 OF THIS FILE ARE SUPERSEDED — see `ADDENDUM-shadowhue-restate.md`.** They were computed
> against `shadowBounceMix 0.20` with no `shadowTeal` term; the live constants are **0.05** and
> **0.15**, and the live shadow light is G/R **3.258**, not 1.336. Consequences: the break-even
> albedo G/R is **0.307**, not 0.749; the whole stone family **passes** the product test; and the
> pre-registered `bounceMix 0.20 → 0.00` arm in §6 must not be run as written. §4's "shipped
> fails by 37–45°" rests on frame numbers of unknown vintage and is now **unmeasured**, not known.
>
> **§§1–4 — the derivation and the band — stand.** They rest on §2.2's surface constants and on a
> measured lit mass, neither of which this correction touches.

**Ruling honoured:** GRANTED as a re-derivation, REFUSED as a relaxation. So this file derives the
replacement from the art bible's statements about **surfaces**, independently, and does **not** set
it to whatever `night` achieves. The derivation is written before the number, and the number falls
out of it. `night` is not an input anywhere below; it appears once at the end, as a check that was
run *after* the band was fixed.

Instrument: `scratchpad/huederive.mjs`. Scope stamp (§11): it computes **no rendered pixel**. It is
arithmetic on authored hex constants plus two frame values measured by other tools. Every transform
between it and the renderer is absent, by design — its only job is to locate §2's own colours on the
hue circle. HSV hue on display sRGB 0–255, the same space `huestat.mjs` scores in.

---

## 1. Why 226° was the wrong object, restated precisely

226° was the mean of `aoTint` (225.5°) and the split-tone cool leg (225.5°) — **chain constants that
describe light**. §41 measured the consequence: a shaded pixel is `light × albedo`, 88.4% of shadow
radiance arrives multiplied by the albedo, and sandstone's own G/R (0.483, 0.605 after `shadowSat`)
puts a floor under the surface hue that no light hue clears. Scoring a surface against a light spec
is §8's recorded category error.

The replacement therefore has to be derived from statements §2 makes about **masses of stone in
shade**, not about lights.

---

## 2. What §2 actually says about surfaces — the full inventory

| source | colour | hue | sat | channel order |
|---|---|---|---|---|
| §2.2 SANDSTONE light `#e6b878` | authored albedo | 34.9 | 0.478 | R>G |
| §2.2 SANDSTONE mid `#c9915a` | authored albedo | 29.7 | 0.552 | R>G |
| §2.2 SANDSTONE dark `#8a5a38` | authored albedo | 24.9 | 0.594 | R>G |
| §2.2 SANDSTONE crevice `#4a2f22` | authored albedo | 19.5 | 0.541 | R>G |
| §2.2 LAPIS `#1f4f96` | authored pigment | **215.8** | 0.793 | G≥R |
| §2.2 TURQUOISE `#2fa8a0` | authored pigment | **176.0** | 0.720 | G≥R |
| §2.1.2 ink, shadow side `#161022` | authored surface | **260.0** | 0.529 | **R>G** |
| measured, shipped | lit sandstone wall | **27.1** | 0.487 | R>G |
| measured, shipped | shaded worn / block / paving | 274 / 282 / 261 | ~0.21–0.26 | R>G |

Three things in that table have to be dealt with honestly before any band is drawn.

**(a) The stone ramp's `dark` and `crevice` stops are warm (24.9°, 19.5°) and are *not* the target.**
They are albedo — what the stone *is*, not what a shaded mass *renders as*. §1 records the defect of
shadows rendering as "a darker, more saturated version of the sunlit hue" precisely so that this stop
is not mistaken for the goal. Excluded, with reason.

**(b) §2.1.2's shadow-side ink is 260° with R > G — i.e. the art bible's own explicit shadow-side
surface constant sits on the *magenta* side of the G≥R line.** This is the strongest available
objection to the whole acceptance and it must be stated rather than skipped. It does not govern here,
for a reason that is structural rather than convenient: **the ink is a line, not a mass.** §2.1.2 is
the *outline* clause; the colour is specified at value 34/255, where hue is close to unreadable, and
its job is to be a near-black separator that is "not pure black". §2.1.3 is the clause about masses,
and the object under acceptance is a mass. Two different clauses, two different objects. If a future
pass scores *ink* hue, 260° is its target and this band does not apply to it.

**(c) §2.1.3 lists "violet" as an admissible shadow colour** — "Shadows are never grey — they are
coloured (violet, teal, or deep cyan)". On a hue-*name* reading the shipped 274° passes. So the
hue name is not what the shipped state violates, and an acceptance built on the name would be
unfalsifiable (it admits both the shipped frame and its fix). The binding clause has to be the
quantitative one in the same paragraph.

---

## 3. The derivation

§2.1.3's first sentence is the only quantitative statement §2 makes about the relationship between
the lit mass and the shaded mass:

> **Saturated complementary palette.** Every shot holds a warm/cool tension: gold sandstone against
> deep teal shadow, orange sun against violet sky.

"Complementary" is a statement about **hue separation between two masses**, and both masses are
surfaces measured in the same frame. That is the derivation:

**Step 1 — centre.** Complementary = opposite on the hue circle. The lit sandstone mass measures
**27.1°**. Its complement is `27.1 + 180 =` **207.1°**.

**Step 2 — tolerance.** Take it from colour theory's own definition rather than from what a knob can
reach: the standard *split-complementary* interval is **±30°** about the exact complement — the width
at which a scheme stays complementary instead of collapsing to analogous. That gives

> **shaded architecture hue ∈ [177°, 237°], centre 207°**

**Step 3 — check it against §2.2's cool surface anchors, which were not used to build it.** The
palette's two cool *pigments* — the only cool colours §2.2 states as surfaces — are TURQUOISE 176.0°
and LAPIS 215.8°. The derived band is [177, 237]. **The band reproduces the span of the palette's own
authored cool surfaces**, one endpoint landing within 1° of TURQUOISE. Nothing was fitted to them;
they are an independent corroboration that ±30° about the lit mass's complement is the interval §2.2
was authored inside.

**Step 4 — the G≥R requirement falls out; it was not assumed.** In HSV the `G = R` line is exactly
hue **240°** (for `h < 240` the max is B and `r < g`; above it `r > g`). The derived band tops out at
237°, so **`G ≥ R` is implied by the band with 3° to spare.** The coordinator's channel-order
requirement and this independent derivation agree, which is worth more than either alone.

---

## 4. State it as a separation, not as an absolute hue — this is the important part

§8 of `PREREG-shadowhue.md` carries a caveat that would otherwise sink any absolute-hue band: frame
hue = model hue + a per-material offset (+8 worn, +23 block, +24 courtyard), and those offsets are
**not equal across materials** and are not guaranteed invariant under a fix. An absolute target
carries ±24°, which is most of a ±30° band.

Score the **circular separation between the shaded mass and the lit mass in the same frame** instead:

> **ACCEPTANCE — `Δh = |hue(shaded stone) − hue(lit stone)|` circular, target `180° ± 30°`,
> i.e. `Δh ∈ [150°, 210°]`, with `G ≥ R` on the shaded mass.**
>
> **CORRECTION to this statement's FORM (its content is unchanged).** A circular separation cannot
> exceed 180°, so the upper half of `[150, 210]` is **unreachable by construction** — a band whose
> top half no measurement can enter (§33's reachability rule, applied to a circular quantity). The
> operative form is **`|180 − Δh| ≤ 30°`**, which is what the ±30° split-complementary tolerance
> always meant. It matters for reading results, not for passing them: a Δh of 178° is **1.7° from
> dead centre**, and the old wording would have had someone read it as "near the top of the band".

Three properties, and they are why this form is preferred:

1. **A shared calibration offset cancels in the difference.** Both terms are the same material family
   measured by the same instrument in the same frame.
2. **It re-derives itself.** If the lit mass moves — LIGHTING retunes the key, TEXTURES changes stone
   albedo — the target follows, because §2.1.3's requirement was always relational.
3. **It is what §2.1.3 asks for literally**: a *tension* between two masses.

Equivalent at today's lit hue of 27.1°: shaded ∈ [177°, 237°]. **If the lit mass moves, quote the
separation and re-derive the absolute band; do not carry [177, 237] forward as a constant.**

### Where the shipped state and the levers land

| state | shaded hue | Δh vs lit 27.1 | verdict |
|---|---|---|---|
| shipped | 274 / 282 / 261 | **113 / 105 / 126** | fails by 37–45° |
| `sSat −0.35 mix 0.05` | 242 / 256 / 244 | 145 / 131 / 143 | fails by 5–19° |
| `sSat −0.55 mix 0.10` | 237 / 252 / 245 | 150 / 135 / 142 | 1 of 3 at the edge |
| `sSat −0.65 mix 0.05` | 231 / 246 / 241 | 156 / 141 / 146 | 1 of 3 in, +104% chroma |

**The derived target is harder than 226°, not easier, and the ruling anticipated that.** Read as a
separation the shipped failure is also plainer than it looked: at 113° the shaded and lit masses are
**not complementary at all** — 113° apart is an analogous-to-triadic sweep, which is exactly why §3
recorded the frame as "two-tone orange/indigo with no middle" rather than as a warm/cool tension.

---

## 5. Consequence: the two multiplicative levers cannot reach it, and §41 says why

No cell of the `shadowSat` × `shadowBounceMix` sweep puts all three materials inside [150, 210], and
every cell that approaches it doubles shadow chroma — §3's recorded failure mode verbatim. This is
not a tuning shortfall; §41 gives the mechanism: 88.4% of shadow radiance is multiplied by the
albedo, so the surface hue is dominated by the albedo's channel order, and the only way to break that
multiplicatively is `shadowSat −1.00` — a grey albedo in shade, which deletes §2.2's readable-shadow
requirement.

**The lever that was under-read is `shadowBounceMix`, and the reason is that its endpoint was never
computed.** It moves the shadow *light* itself:

| `shadowBounceMix` | light G/R | × albShadow G/R 0.605 | product ≥ 1? |
|---|---|---|---|
| 0.20 (shipped) | 1.336 | **0.808** | fails by 19% |
| 0.10 | 1.652 | 0.999 | marginal |
| 0.05 | 1.869 | 1.131 | passes |
| **0.00** | **2.147** | **1.299** | **passes by 30%** |

At `mix 0.00` the sand bounce is out of the tint entirely and the shadow light returns toward §2.2's
authored `#2a3f66` — **219°, inside the derived band**. Two things follow that were not visible while
the target was 226° absolute:

- **`shadowBounceMix 0.00` flips the channel order on its own, at zero `shadowSat` cost** — i.e.
  without the chroma doubling that §3 records as the failure mode. It is the only lever in my files
  with that property.
- **It also moves the wash's asymptote.** §41 measured the additive wash asymptoting at 240° — but
  that asymptote *is the shadow light's own hue*, and it is 240° only because `mix 0.20` has dragged
  the light warm. At `mix 0.00` the wash asymptotes at ~219°, inside the band instead of outside it.
  §41's "even an unbounded wash cannot reach 226" is true of the shipped light and **false of the
  light at `mix 0.00`**. That is a correction to my own seal.

---

## 6. Pre-registered fix A/B (supersedes `PREREG-shadowhue.md` §7's candidate cell)

**Candidate: `shadowBounceMix 0.20 → 0.00`, `shadowSat −0.35 → −0.50`.** Chosen because bounceMix
carries the channel-order flip at no chroma cost and shadowSat is then only asked for the residual,
rather than the reverse. Arms: `base` · `candidate` · `mix-only` · `sSat-only` · `back` (must be
bit-identical to `base`). One boot, frozen clock (§28), `renderFrame(0)` ×3 (§19), **applied-state
readback per §40 on every arm — an arm whose applied uniforms equal another's is COLLAPSED and scores
nothing.**

**Order: `night` first** (ruling 1). §41's prediction is that the violet is daylight-only and night
has always been on the correct side; night is also what the cool terms are paid for. If night comes
back violet the mechanism is wrong and everything above falls.

### WOULD move
- `Δh` on shaded stone from 113/105/126 into [150, 210] on all three materials. **This is the claim.**
- channel order on shaded stone `R > G → G ≥ R` — a sign flip, so a clean pass/fail.
- `interior` most of all; it is the worst shot (Δh from its own lit mass) and must move most.

### WOULD NOT move
- **The lit mass, at all.** Neither knob is in `alb * keyRad * key`. Any arm that moves the lit hue
  by >3° has a second cause and the run is void. *This also protects the criterion itself*, since
  `Δh` is defined against the lit mass.
- **`night`'s verdict** — it must keep passing.
- The whole-frame two-window hue statistic, by much (three shots are 83–98% stone; this moves stone's
  shadow hue between adjacent bins, it does not add hue variety). Stated in advance so a small number
  is a confirmed prediction, not a disappointment.

### Falsifiers — any one voids the fix
- lit-mass hue moves > 3°.
- `night` leaves the band, or loses > 25% of its saturation.
- shaded chroma more than **doubles** anywhere (§3's tripwire).
- `interior` goes green/olive (`Δh` overshoots past 210°, i.e. shaded hue < 177°). **The band is
  two-sided; overshoot is a failure, not extra credit.**
- any arm reports COLLAPSED applied state.
- **the frame reads worse.** §3 has twice produced on-target numbers over a plainly wrong image.

---

## 7. The check that was run last, and was not allowed to set the number

`night`'s modelled shaded hue is 231°. Its own lit mass is not 27.1° (different key), so its `Δh`
has to be measured, not inherited — that is part of the night-first capture. Recorded here only to
note that **night was not consulted while the band was being derived**, per the ruling: it is
evidence a band is attainable, never evidence it is correct.
