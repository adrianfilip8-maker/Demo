# PREREG-litwarm — the lit half of the palette: the diagnosis says the named gap is a term that is switched OFF, and the seal turns it on with a night gate

**Owner:** SHADING (`src/render/ToonMaterial.js`, `src/render/shaders/toon.glsl.js`).
**Date sealed:** 2026-08-06. **Status: REGISTERED before capture.** No `src/**` touched by this
seal (this task is OFFLINE; the capture comes on dispatch). No git run — the coordinator sweeps;
§9 lists every file.

Every number below is produced by the committed drift-guarded instrument
(`progress/records/banda-diag.mjs`, modes `state` / `grade` / `lit`), whose constants are parsed
out of the committed source at runtime and which **refuses to run on a drifted tree**. Its state
port is anchored on **six live per-shot `uShadowColor` readbacks from banda2's own committed
capture** (`banda2/readback-*.json`) and reproduces all six to **maxErr 0.00000**; its grade port
reproduces the committed calibration row to **worst |Δ| 0.35 L**. Frame numbers are from
`progress/records/sbs3/*.png` and `progress/records/banda2/*.png`. Reference numbers are from the
CRITIC-sbs3 pinned routes, re-fetched to scratchpad this session, byte-sizes matching CRITIC's
provenance exactly (197,584 / 250,114 / 221,625 / 140,946 B) — **never committed** (§1.1 rule 3).

---

## 1. The diagnosis — and the correction it forces to the gap's own name

CRITIC-sbs3 §4.1 names the round's #1 gap *"the LIT half of the palette"* and gives it to SHADING,
with hero's *"bible-lit sandstone 0.762 %"* as the headline. **Measured, the lit half is not the
defect.** Three findings, each reproducible from a committed frame:

### 1.1 Our key-lit architecture is already warm, and already matches the reference

The validated port, at a fully key-lit sandstone wall (`lit pop`):

| shot | key-lit wall (ndl 0.75, sh 1) | corridor (key 0.5) | reference's own warm register |
|---|---|---|---|
| hero | display **L 153, hue 30, R−B +123** | L 128, hue 28, R−B +101 | Odyssey hero.arch L80+ hue 10, R−B +72 |
| temple | L 155, hue 30, R−B +122 | L 130, hue 29, R−B +99 | — |
| interior | L 171, hue 34, R−B +106 | L 145, hue 31, R−B +87 | Odyssey interior L80+ hue 25, R−B +53 |

And in frame: `sbs3/courtyard.png` bottom-left quarter, band L80–140 — **mean R−B +85.4, medHue
26.1, 95.5 % of the band warm**, against the same rect of the Odyssey comparand at **+99.1, hue
11.6, 89.3 % warm**. On the predicate CRITIC used for "bible-lit sandstone" (hue ∈ [15,60] ∧
L > 100) the Odyssey hero frame scores **9.96 %** and ours scores **15.27 %** — *we are ahead of
the comparand on that predicate frame-wide*. The 0.762 % is a rect number on a rect that is
**46.6 % below L 40 and 46.3 % in L 40–80**: it measures how little of hero's beam is lit, not
what colour lit stone is.

### 1.2 The "L80+ band on sandstone" is not the lit band — it is the *bright-albedo shade* band

The port renders a **fully shadowed** wall into display L 78–106 depending only on albedo
brightness (`lit pop`, sh = 0, ndl −0.3): `worn` L 78 hue 200, `papyrus` L 86 hue 195, `hiero`
L 96 hue 193 (interior: L 86 / 96 / 106, hue 197 / 191 / 189). The frames agree to a few degrees:
hero.arch L80–140 **medHue 181.7**, temple lit-column rect **205.3**, interior frame **198.0**.
Meanwhile hero.arch has **0.56 %** of its pixels above L 140. So a display-L80+ architecture
pixel in this game is produced by **full shade on a bright albedo**, and its hue is the shadow
light's, not the key's.

**Consequence for the instrument, not just the diagnosis:** luma is not a variable the toon
shader branches on. It branches on `ndl` (the ramp), `sh` (the shadow map), `shadowMix`, `Nw.y`
(hemi), `vSlySkin` and `metal` — never on the pixel's own brightness. **There is therefore no
SHADING term that can select "the L80+ band" at all.** The only luma-scoped colour term in the
whole pipeline is PostFX's split-tone (`splitRange` [0.04, 0.24] scene-linear, `splitStrength`
0.16, `splitHighlight` #ffd9a0, `PostFX.js:495–532`) and that file is **POSTFX's**.

### 1.3 The whole SHADING budget on the shade register is composed of known-bads

`lit levers` / `lit sweep`, per-knob display movement on the bright-shade cell, and the sum with
every knob simultaneously at its own convicted edge (`shadowSat 0`, `shadowWash 0`, `sbm 0.20`,
`fillSkyMix 0`, `shadowTeal 0`):

| shot | shipped R−B | all-knobs-max R−B | budget | needed to cross `R > B+10` |
|---|---|---|---|---|
| hero | −43 | +20 | **+62** | +53 |
| temple | −42 | +21 | **+63** | +52 |
| interior | −35 | +29 | **+64** | +45 |

The budget exists **only** as the union of values the ledger has already convicted — task-16
magenta (`sbm 0.20`), the lavender coat (`shadowWash`), the temple violet (`fillSkyMix 0`), the
§132.4 grey-collapse (`shadowTeal 0`). Individually, on the same cell: `shadowSat −0.35 → −0.22`
buys **+8 R−B** and costs **13 % of the pixel's saturation** (0.38 → 0.33) — which is
**KB-warmmud's own registered signature** (wall-body satP50 relative drop ≥ 10 %, BANDS2). It
buys warmth by neutralising, not by warming. `shadowWash 0.05 → 0` buys +5 to +11 R−B and costs
**−8 to −11 display L on the shade register**, which cancels RESULT-banda2's registered P4
(+4.36 / +4.37 interior wall medL) and P3 outright. **All three are named and rejected in §4, with
their arithmetic, so nobody spends an arm on them.**

### 1.4 What IS available, and it is a term at zero

`toon.glsl.js:492–494` — the wrap leg:

```glsl
float wrapv  = clamp( ( ndl + uSss ) / ( 1.0 + uSss ), 0.0, 1.0 );
float sssAmt = clamp( wrapv - clamp( ndl, 0.0, 1.0 ), 0.0, 1.0 );
vec3  sss    = alb * uSssColor * keyRad * ( sssAmt * uSss * 2.4 * sh );
```

It is the **only warm, key-scaled term in the shader that survives where the ramp has already
gone to zero**. Its colour is `uSssColor`, which defaults to `PAL.wrapWarm` #ffb07a
(`ToonMaterial.js:949`, `ToonMaterial.js:1043`, `PAL.wrapWarm` at `ToonMaterial.js:663`); its
amount is `TUNE.sss = 0.2` (`ToonMaterial.js:549`). It is multiplied by **`sh`**, so it
contributes exactly nothing inside a cast shadow — it structurally cannot re-create the
"unlit face out-brightens a lit one" inversion that convicted `shadowWash` (`ToonMaterial.js:130–134`).
And `sssAmt` is **exactly 0 for ndl ≤ −uSss**, so its reach past the terminator is set by its own
value and the genuinely away-facing population is untouched by construction.

**`src/world/Architecture.js:209` passes `sss: 0.0`.** Every sandstone and limestone surface in
the game runs this term at zero. Props run 0.1/0.5 (`Props.js:626`), Vegetation 0.15–0.85
(`Vegetation.js:345–364`), Sly's fur runs `TUNE.furSSS` (`SlyModel.js:3589`). Architecture — the
material class the gap is about — is the one consumer that switched it off.

Sized on the population the ramp abandons (`lit sss`; every row `sh = 1`, i.e. **not** in cast
shadow, and `ramp = 0` for ndl < 0.116 so these pixels receive **no key at all today**):

| shot | ndl | ramp | sss 0.0 (**shipped**) | sss 0.20 (TUNE's own default) | **sss 0.30 (candidate)** | sss 0.45 (KB) |
|---|---|---|---|---|---|---|
| hero | 0.00 | 0.00 | L 78 hue 200 **R−B −52** | L 89 hue 309 R−B +1 | **L 97 hue 5 R−B +35** | L 110 hue 13 R−B +72 |
| hero | 0.10 | 0.00 | L 78 hue 200 R−B −52 | L 88 R−B −3 | **L 96 hue 2 R−B +29** | L 108 R−B +67 |
| hero | −0.10 | 0.00 | L 78 hue 200 R−B −52 | L 84 R−B −21 | **L 92 R−B +15** | L 105 R−B +59 |
| hero | −0.20 | 0.00 | L 78 R−B −52 | **L 78 R−B −52 (exactly 0)** | L 86 R−B −12 | L 99 R−B +41 |
| temple | 0.00 | 0.00 | L 80 hue 199 R−B −51 | L 91 R−B +2 | **L 99 hue 6 R−B +35** | L 113 R−B +72 |
| interior | 0.00 | 0.00 | L 86 hue 197 R−B −43 | L 99 R−B +9 | **L 108 hue 13 R−B +41** | L 123 R−B +75 |
| hero | 0.30 | 0.50 | L 128 hue 28 R−B +101 | L 131 R−B +106 | **L 133 R−B +110** | L 138 R−B +117 |
| hero | 0.75 | 1.00 | L 153 hue 30 R−B +123 | L 153 R−B +123 | **L 154 R−B +123** | L 155 R−B +123 |

At **sss 0.30 the near-terminator band crosses CRITIC's own warm predicate** (R−B > +10 ∧ L > 40)
on all three shots, landing at **hue 5–13** — which is where the Odyssey comparand's warm register
sits (hero.arch **hue 6.8–7.3**, courtyard.bl **hue 8.7–11.6**, interior L80+ **hue 23.5**). The
already-lit register moves by ≤ +9 R−B and ≤ +2 L, i.e. it is not disturbed.

### 1.5 The honest statement of what this can and cannot do

**It does not close CRITIC's gap and this seal does not claim it will.** hero is 23.16 % frame warm
against Odyssey's 59.38 %; the reference gets there because **its shade is warm** (Odyssey
hero.arch L40–80: mean R−B **+57.6**, hue 6.1; ours: **−18.7**, hue 222.9) and because **87 % of
its frame is above L 80 where ours is 37 %**. Ours is cool in shade *by §2.2*, which sanctions
"violet, teal, or deep cyan" shadows and which every shipped shadow-hue seal (task #16, task #19,
§132.4, pnightcal) has been defending. Closing the remaining ≈ 30 pp would mean **abandoning
§2.2's shadow direction**, which is an art decision above this seal, not a shader lever.

Routed, not claimed: **lit-area coverage** (the frame's L80+ share, driven by key elevation,
shadow-map density and enclosure) → **LIGHTING** + **GEOMETRY**; **a luma-scoped warm/cool split**
→ **POSTFX** (`splitRange`/`splitStrength`/`splitHighlight` — the only luma-scoped colour term
that exists); **albedo** → **TEXTURES**; **the §2.2 shadow-hue direction itself** →
**coordinator / the blind critic**, since it is the thing the comparand actually differs on.
This file gives each of them its scale: `banda-diag.mjs lit` prints the band tables both
comparands and both our arms are measured on.

## 2. The candidate — one value, one gate, one scaffold

- **L1 — `sss` on architecture, `0.0 → 0.30`** (`src/world/Architecture.js:209`). **This line is
  ARCHITECTURE's file, not SHADING's.** SHADING sizes it, registers it, scores it and ships the
  gate; the one-word value change is routed to **ARCHITECTURE** with this seal attached. Nothing
  in `src/render/**` changes the number.

- **G — the night gate, and it is a general mechanism rather than a special case.** `uSss` is a
  per-material uniform written once at construction (`ToonMaterial.js:1043` region). The gate adds
  an **opt-in night pin beside the value**, published per frame at the `setKeyLight` `nightAmount`
  consumer that banda2's own gate already occupies (`ToonMaterial.js:1300–1301`):

  ```js
  // material build: o.sssNightPin = num(opts.sssNightPin, o.sss)   // default == sss ⇒ no write
  // setKeyLight, beside the banda2 gate:
  for (const m of this._sssPinned)                                  // only materials that declared a pin
    m.uniforms.uSss.value = m.userData.sss +
      (m.userData.sssNightPin - m.userData.sss) * Math.min(1, Math.max(0, nightAmount));
  ```

  ARCHITECTURE then passes `{ sss: 0.30, sssNightPin: 0.0 }`. **At the default (`pin === sss`) no
  material is enrolled and no uniform is written, so the SHADING half is bit-identical on its own**
  — the inert-scaffold pattern `uGoldGlint` and `uAtmoWire` already ship under. It is deliberately
  *not* a global `vSlySkin`-scoped shader gain: that spelling would also kill Props' (0.1/0.5) and
  Vegetation's (0.15–0.85) night wrap, which is a look change nobody asked for. Checked before
  writing it down.

- **Why the value is 0.30 and not 0.20 or 0.45.** 0.20 is `TUNE.sss`'s own default and leaves the
  band at R−B −3 to +9, i.e. *neutral, not warm* — it does not cross the predicate the gap is
  measured with on hero or temple. 0.45 lights surfaces **turned away** from the key (ndl −0.20 →
  L 99, R−B +41 at hero) and is registered as the known-bad. 0.30 is the smallest value that
  clears the predicate on all three enclosed/day shots while `sssAmt`'s exact zero still holds for
  every surface more than 17° past the terminator.

## 3. The night claim — [0,0] frame-wide, by arithmetic, and pnightcal untouched

Registered: **P7-fw = `night` candidate-vs-base differing px at ΣRGB ≥ 4, whole 1280×720 frame,
= [0, 0]**, plus the same on `guard`. Term by term:

1. **`nightAmount` is exactly 1.000 at `night` and `guard` and exactly 0.000 at every other
   canonical shot.** Not assumed — banda2's P-F7 read it **live, per shot, on six shots of the
   same staging** (`RESULT-banda2.md`: *"P-F7 ok: live nightAmount = 1 exactly"* / *"0 exactly"*).
2. **At `nightAmount = 1` the gate's output is `sssNightPin` exactly.** `a + (b − a) * 1.0` is `b`
   in IEEE754 for finite `a, b`. `sssNightPin = 0.0` ⇒ `uSss = 0.0`, which is **the value
   architecture ships today**.
3. **At `uSss = 0.0` the whole wrap term is exactly zero.** `sssAmt * uSss * 2.4 * sh` contains a
   multiply by exactly 0.0, and `x * 0.0 == 0.0` for every finite `x`. `wrapv = (ndl + 0)/(1+0)`
   collapses to `clamp(ndl,0,1)`, so `sssAmt = clamp(clamp(ndl,0,1) − clamp(ndl,0,1)) = 0` as well
   — the term is zero **twice over**, independently.
4. **Nothing else in the candidate touches a night quantity.** No shadow-side knob, no fill knob,
   no grade knob moves: `lit levers`' night column prints `uShadowColor Δmax 0.0e+0` and
   `uShadowColorLit Δmax 0.0e+0` for this candidate at `night`'s tod. **pnightcal's L1
   (`archShade |dHue| ≤ 1.40°`) is therefore satisfied at dHue = 0.000° exactly, and its published
   night-safe `sbm` ceiling of 0.0845 is not approached because `sbm` is not in this candidate.**
   L2 (sky ≤ 0.30°) and L3 (archShade luma ≤ 10 % rel) are 0.000 for the same reason.
5. **Boot determinism at equal uniforms** — banda2 measured restore-vs-base = **0 px on all six
   chunks** after the settle protocol.

1+2+3+4+5 ⇒ predicted night/guard differing px = 0 frame-wide. **Any nonzero px is a mechanism
this arithmetic does not cover ⇒ P-F6 fires and the candidate does not ship on this seal.**

**Emulation-exactness (P-F7, carried from banda2 and extended).** The committed tree has no
`sssNightPin`, so the arms are produced by poking `uSss` on **architecture materials only**: day
arms 0.30, night arms 0.0. The runner must (a) enumerate architecture materials through
`engine.get('architecture')`'s own scene subtree — **not** by scanning `shading._cache` for
`uSss == 0`, because `SlyModel.js:3678/3757` also build materials at `sss: 0.0` and poking those
would deviate from the ship; (b) print the enumerated count and every material name in the
readback; (c) print live `nightAmount` per shot. **A chunk whose readback shows a poked SkinnedMesh
material, or fewer than 4 architecture materials, or `nightAmount` ≠ exactly {0,1}, is VOID — not
FAIL.** The candidate was never on screen.

## 4. Named and rejected, with the arithmetic, so nobody spends an arm

| lever | what it buys on the bright-shade cell | why it is not this seal |
|---|---|---|
| `shadowSat −0.35 → −0.22` | +8 R−B | costs 13 % of pixel saturation — **KB-warmmud's own registered signature** (≥10 % satP50 drop). Buys warmth by neutralising. |
| `shadowWash 0.05 → 0` | +5 to +11 R−B | costs **−8 to −11 display L** on the shade register ⇒ cancels RESULT-banda2's P3/P4 outright. A registered, shipped, four-shot gain traded for a hue nudge. |
| `shadowBounceMix 0.05 → 0.08` | +5 R−B | same axis as KB-warmmud; night-live (pnightcal slope **40.5°/unit**, ceiling **0.0845** — 0.08 sits at 95 % of a line that is already a FAIL verdict's remedy). Needs its own seal, not a rider. |
| `fillSkyMix 0.70 → 0.40` | +4 R−B | re-opens the temple violet task #19 closed (232→218 measured), and is **night-live** — it is half of pnightcal's `compose` arm, the arm that FAILED L1. |
| `shadowTeal 0.15 → 0.08` | −1 R−B (**wrong sign**) | rotates hue +9 to +12 toward magenta; §132.4's interlock says ship both or neither. |
| `bounceGain 0.42 → 0.60` | +2 to +3 R−B | too small to register, and it lifts the fill on lit surfaces too (a brightness change wearing a hue's name). |
| a new key-side warm blend (`uKeyWarm`) | **+0 measurable** | the key-lit register is already hue 30 / R−B +123 and already counted warm; warming it moves no registered statistic. **Measured dead by arithmetic before it was written.** |
| `termLo 0.14 / termHi 0.52` (widen the lit population) | large, unquantified | a real coverage lever and SHADING's, but it is the cel-band placement itself — a §17 look change to every surface in the game, night included, and the wrong first move while a warm term sits at zero. Registered here as the **next** candidate if this one's population turns out to be small (P-F8). |

## 5. Registered quantities — BANDS-LW, sealed (to be duplicated verbatim into `banda-diag.mjs score3`; a mismatch voids the scoring, not the seal)

Conventions, §122.1-stated. Luma = Rec.709 on 0–255 display bytes. **warm% = R > B+10 ∧ L > 40,
denominator = the whole rect** (CRITIC's). **All Δ(R−B) rows use the FIXED-MASK convention**: the
mask is built on the **base** arm's luma and the difference is taken **per pixel** — see
`NOTE-traversal-contrast.md` §4 for why, and `banda-diag.mjs lit bins` for the calibration
showing a moving-bin band table reporting ±4 R−B where the fixed-mask truth is ±0.4. Differing px
at ΣRGB ≥ 4. Arms: `base`, `C` (the candidate, arch sss 0.30 / night 0.0), `KBover` (arch sss
0.45), `KBnull` (arch sss 0.0 = base re-poked), `restore`.

**Base gates (P-F3 — VOID not FAIL; from `sbs3`, the frames this seal was sized on):**
hero frame warm% ∈ [21, 26] (measured 23.16); courtyard ∈ [31, 37] (33.80); temple ∈ [16, 21]
(18.08); interior ∈ [5.5, 9.0] (7.05); hero.arch <L40 % ∈ [30, 41] (35.19).

| id | quantity | band | basis |
|---|---|---|---|
| **W1** | hero frame warm% Δpp (C − base) | **[+0.3, +8.0]** | base 23.16; ref 59.38 (not claimed) |
| **W2** | courtyard frame warm% Δpp | **[+0.3, +8.0]** | base 33.80; ref 63.68 |
| **W3** | temple frame warm% Δpp | **[0.0, +10.0]** | base 18.08; ref (2004 Sly 2) 22.31 |
| **W4** | interior frame warm% Δpp | **[0.0, +12.0]** | base 7.05; ref 31.03 |
| **H1** | hero frame Δ(R−B), fixed mask base L∈[40,140] | **[0.0, +30]** | base mean −8.52 |
| **H2** | courtyard, same | **[0.0, +30]** | base +19.21 |
| **H3** | temple, same | **[0.0, +30]** | base −17.81 |
| **H4** | interior, same | **[0.0, +30]** | base −21.30 |
| **H5** | hero.arch (200,300,900,600) Δ(R−B), fixed mask base L∈[80,140] | **[0.0, +45]** | base −15.98 |
| **H6** | temple lit-column (80,260,200,420), same | **[0.0, +45]** | base −16.33 |
| **S1** | **shade-band non-regression**: frame Δ(R−B), fixed mask base **L<40**, every day shot | **[0.0, +20]** | banda2's gains must SURVIVE; the wrap is an add and cannot cool ⇒ negative = FAIL |
| **S2** | hero.arch Δ<L40 pp | **[−12.0, 0.0]** | base 35.19; must not darken |
| **S3** | banda2 **P5** wall-body hue, every non-KB arm, hero/temple/interior rects | **[200, 246]** | banda2's registered family band, verbatim |
| **S4** | banda2 **P1/P2** cream + rings on `sly-closeup` | P1 creamROI **[−58,−30]**, rings **[+5,+45]**, P2 tail body **[−4,+18]** | verbatim from BANDS2; architecture-scoped candidate ⇒ must not move |
| **S5** | **subject invariance**: sly-closeup subject-interior box (600,200,700,300) differing px, C vs base | **[0, 0]** | Sly's materials are not poked; a nonzero here means the enumeration leaked |
| **T1** | **traversal figure−surround contrast** Δ (fig medL − sur medL), C vs base | **[−0.5, +5.0]** | base 3.41 (`NOTE-traversal-contrast.md`); banda2 already took 2.46 — this bounds a second bite |
| **P7-fw** | `night` C-vs-base Δpx, **frame-wide** | **[0, 0]** | §3 arithmetic |
| **P7-g** | `guard` C-vs-base Δpx, frame-wide | **[0, 0]** | §3 arithmetic; `nightAmount` = 1 there too |
| **P-F4** | restore-vs-base Δpx, every chunk | **[0, 0]** | banda2: 0 px on all six chunks |
| **P-F9** | `KBnull` (arch sss re-poked to 0.0) vs base Δpx | **[0, 0]** | the poke path itself is exact; a nonzero here voids every arm in the boot |

**Known-bad arms (§13/§141.1 — the metric must see both failure directions):**

- **KB-overwrap (arch `sss` 0.45).** Must read as **its own failure** via **S3**: hero.arch **and**
  temple lit-column body hue must fall **below 200** (out of banda2's registered family band) on
  this arm. Basis: at 0.45 the port puts the touched population at hue 6–17 with R−B +41 to +75
  *including surfaces turned away from the key* (ndl −0.20 → L 99), which is the "unlit
  out-brightens lit" inversion re-entered from the warm side. It must also lift hero.arch <L40 by
  more than the candidate does (reported beside it).
- **KB-null (arch `sss` 0.0).** Must be **bit-identical to base** (P-F9). This is the calibration
  that the poke mechanism is exact, in the same slot banda2's `restore` occupied.
- **Either KB failing to read as its own failure ⇒ UNSCOREABLE (P-F2)** — no verdict either way.

## 6. P-falsifiers — revert, do not defend

- **P-F1** any gated band (W1–W4, H1–H6, S1–S5, T1) outside on the `C` arm ⇒ **candidate REVERTED**.
  No post-hoc retune toward a band; a different value is a different prereg.
- **P-F2** a KB arm fails to read as its own failure ⇒ **UNSCOREABLE**.
- **P-F3** a base gate outside ⇒ capture **VOID** (the tree/staging is not the diagnosed one).
- **P-F4** `restore ≠ base` (> 0 px at ΣRGB ≥ 4) on any chunk ⇒ every arm number in that boot void.
- **P-F5** **S1 negative on any day shot** ⇒ FAIL and revert. The wrap is a strictly additive warm
  term; a cooled deep-shade band means something other than the registered lever moved, and
  banda2's gains are what this protects.
- **P-F6** P7-fw ≠ 0 or P7-g ≠ 0 ⇒ **the candidate does not ship on this seal**, regardless of
  every day number. (banda2's discipline, unchanged.)
- **P-F7** emulation-exactness: live `nightAmount` ≠ exactly 1 at `night`/`guard` or ≠ exactly 0 at
  a day shot, **or** the readback shows a poked SkinnedMesh material, **or** fewer than 4
  architecture materials enrolled ⇒ that chunk **VOID** (not FAIL — the candidate was never on
  screen).

  > **AMENDED 2026-08-06, at this site, BEFORE the capture booted (§154.5).** Two changes, both
  > STRENGTHENING, recorded with their reasons rather than applied silently:
  >
  > 1. **The dispatch ships the candidate in src**, so there is no emulation to be exact about:
  >    `Architecture.js:209` now carries `sss: 0.30, sssNightPin: 0.0` and `ToonMaterial.js`
  >    carries the gate. The arms therefore poke **backwards** (`base` → 0.0) rather than forwards.
  >    Every registered quantity is a C-vs-base difference, so **no band moves**; what changes is
  >    that the night gate is now the *real shipped code path* being measured, not a poke standing
  >    in for it — which is strictly more than the seal asked for.
  > 2. **The population is `shading._sssPinned`**, not a walk of `engine.get('architecture')`.
  >    That array is *by construction* the exact set the shipped gate publishes to, so a runner
  >    cannot poke a material the ship would not have touched — the failure this falsifier was
  >    written against. The architecture-subtree walk is **kept as a cross-check** and its count is
  >    printed, and an **exhaustive scene-wide `isSkinnedMesh` test** now decides the SkinnedMesh
  >    clause (every material used by any skinned mesh anywhere, not just Sly's). The subtree walk
  >    is best-effort about ARCHITECTURE's internal field names, so a shortfall there is REPORTED,
  >    not fatal; the skinned test is exhaustive and is what VOIDs.
  >
  > Also: the frames land in `progress/records/litwarm1/` (the coordinator's dispatch names that
  > directory), and the scorer is `banda-diag.mjs score3`, **committed before the capture booted**
  > as §8 requires. `P-F9` (KBnull) and `P-F4` (restore) are both "re-poke to base ⇒ 0 px"; they
  > are captured as two independent instances in chunk A, with KBnull placed **after** KBover so
  > it also proves the known-bad arm left no residue.
- **P-F8** **the population falsifier.** If **W1 < +0.3 AND W2 < +0.3** — hero and courtyard being
  the two shots CRITIC says lose on this axis *and nothing else* — the lever is **REVERTED and the
  finding recorded**: the near-terminator, non-cast-shadow architecture population is too small on
  this level's geometry to matter, and the gap belongs entirely to lit-area **coverage**
  (→ LIGHTING/GEOMETRY) and to the §2.2 shadow-hue decision (→ coordinator). That outcome is a
  result, not a failure, and it is the one this seal is least confident about: **the population
  share is the one quantity that could not be measured offline** (there is no G-buffer in a
  committed PNG), so the bands' upper halves are geometry-derived, not measured — for a 22°
  sun, vertical faces within the wrap's reach are ≈ 14.5 % of azimuths *before* cast-shadow
  occlusion, which is where the ≈ +3 pp centre of W1/W2 comes from.

## 7. §17 look-change declaration

**Day:** every architecture surface that is **out of cast shadow** and turned within ~17° past the
terminator gains a warm wrap — display **L +8 to +19** and **R−B −52 → +15…+41** on the port's
cells, landing at hue 5–13 (the comparand's own warm hue). The key-lit register moves ≤ +2 L and
≤ +9 R−B; the fully-shadowed register (ndl ≤ −0.30, or any pixel with `sh = 0`) is **untouched by
construction** — `sssAmt` is exactly 0 below `−uSss`, and the term is multiplied by `sh`. In words:
**the terminator on stone stops being a hard step from warm sun into cool shade and gains a thin
warm shoulder**, which is what the reference frames have and §2.1's "coloured light, coloured
shadow" asks for. It does **not** brighten cast shadows and cannot invert the key.

**Night: explicitly unchanged, bit-identically, by construction** (§3). The night pin holds
architecture at today's `sss = 0.0`; Props, Vegetation and Sly's fur are not enrolled in the gate
and keep their authored wrap at every hour. pnightcal's sealed territory is not entered.

**Cost accepted and bounded:** T1 registers traversal's figure-to-surround contrast so this ship
cannot take a second bite out of what banda2 already cost it (`NOTE-traversal-contrast.md`).

Ships only through this A/B, on a PASS verdict, by the coordinator, with its own KNOWN_ISSUES
entry quoting this file.

## 8. Capture plan (§163/§164 chunked; arms are live pokes; runner `litwarm.mjs`)

Runner: `progress/records/litwarm.mjs` — banda2.mjs template (idempotent per-chunk resume, own
FIFO lock hold per chunk via `tools/harness.mjs` → `tools/lock.mjs`, settle = 10 frozen frames +
throwaway capture after every `setShot`, per-arm poke → `step(1,0)` → readback → capture), **plus**
the architecture-material enumeration and its readback (P-F7), and the per-shot arm poke table
(the C arm pokes 0.30 on day shots and 0.0 on night/guard — that is the gate emulation, §2).
Frames land incrementally at `progress/records/litwarm/<shot>.<arm>.png` + `readback-<chunk>.json`,
**committed per chunk**. Launched detached via `tools/launch.sh` (node at ppid 1 proven), ABSOLUTE
log path `progress/records/logs/litwarm.log`, pidfile in the scratchpad. No git — the coordinator
sweeps.

Chunks, in order — **night first, it is the decider** (ledger precedent, banda2's order):

- **N** `night`: base, C, restore — P7-fw, P-F4, P-F7.
- **N2** `guard`: base, C, restore — P7-g. (`guard` has been byte-identical for two rounds; a
  nonzero here is the loudest possible signal.)
- **A** `hero`: base, C, KBover, KBnull, restore — W1, H1, H5, S1, S2, S3, P-F9.
- **B** `courtyard`: base, C, restore — W2, H2, S1. (**W2 is half of P-F8; this chunk is not
  optional.**)
- **C1** `interior`: base, C, KBover, restore — W4, H4, S1, S3, KB.
- **C2** `temple`: base, C, restore — W3, H3, H6, S3.
- **D** `sly-closeup`: base, C, restore — S4, S5 (the character must not move).
- **E** `traversal`: base, C, restore — T1. (Optional only if the lock forbids it; if E is skipped,
  T1 is reported UNMEASURED and the ship decision must say so out loud.)

Scoring at the first wake after DONE (§163.2), before anything else:
`node progress/records/banda-diag.mjs score3 progress/records/litwarm` → table verbatim into
`RESULT-litwarm.md`. **Verdict: PASS = every gated band in-band on `C`, both KBs reading as their
own failures, P-F3–P-F9 clean, P7-fw = P7-g = 0.** The ship decision is the coordinator's; the
ship diff is §2's shape exactly — `Architecture.js:209` `sss: 0.0 → 0.30` plus `sssNightPin: 0.0`
(**ARCHITECTURE's ticket**), the `sssNightPin` plumbing and its `setKeyLight` publish line
(**SHADING's ticket**), and a drift-guard assertion for the publish line in `banda-diag.mjs` at
ship time — the same obligation banda2 left and this session discharged for it.

## 9. Files of this seal (coordinator sweep list — no git run by this task)

- `progress/records/PREREG-litwarm.md` — this file.
- `progress/records/NOTE-traversal-contrast.md` — the required regression attribution (banda2's
  L2, mechanism named, `uGraze` and the sparkle preroll eliminated by measurement), plus §4's
  luma-bin-migration hazard, which this seal's fixed-mask convention is built on.
- `progress/records/banda-diag.mjs` — **extended, not forked**: drift guard re-based onto banda2's
  shipped constants (`subjWarmShade` 0.65, `shadowTintPeak` 0.62) with `subjWarmShadeNightPin` and
  **the banda2 gate publish line now asserted** (RESULT-banda2's open ship obligation, discharged);
  `state` re-anchored on **six live per-shot readbacks from `banda2/readback-*.json`** (maxErr
  0.00000) with the pre-banda2 compose1 anchor kept at its own knob value; new **`lit`** mode with
  sub-modes `bins` / `pop` / `levers` / `sweep` (the last also prints the `sss` table and the
  all-knobs budget).
- Still to be written, on dispatch: `progress/records/litwarm.mjs` (the runner, committed before
  capture), `progress/records/litwarm/*.png` + `readback-*.json` per chunk,
  `progress/records/logs/litwarm.log`, `RESULT-litwarm.md`, and `score3` in `banda-diag.mjs`
  (BANDS-LW verbatim from §5, committed **before** the capture).
- Scratchpad only, never committed (§1.1 rule 3 / §162): `ref/` (4 Odyssey comparands on
  CRITIC-sbs3's pinned routes, byte-sizes matched), `litband.py`, the traversal probe.
