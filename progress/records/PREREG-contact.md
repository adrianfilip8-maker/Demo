# PREREG — the contact term (critic finding #3, "no contact shadow at all")

**Sealed before any line of the term is written.** SHADING/POSTFX. Instruments and bands fixed
here; no code exists yet. Tree at sealing: `6122e2d`, working tree dirty in `src/world/**` and
`src/player/**` (other agents), clean in my three files.

---

## 1. The finding, and it stands

`RESULT-critic5.md` §4.3 (M12), `sly-closeup`. Median L of a 13-px-wide column below the left
boot's sole, against two controls on the same rows:

```
d(px):          3     6    10    15    20    30    40    55
under boot:  72.0  74.2  73.8  73.8  72.2  74.7  75.4  74.6
control A:   75.3  74.1  73.2  72.3  72.2  71.1  84.4  73.1
control B:   73.3  73.0  73.6  75.7  76.2  72.9  72.7  73.3
```

Under-boot at d = 3 is 1.3–3.3 L darker than control; **the two controls differ from each other
by 2.0 L**, so the effect is inside its own null. Sly 2, Odyssey and BOTW all put a hard
darkening under the character. The condition fails.

---

## 2. Three mechanisms eliminated by measurement, which is why this seal can be narrow

| candidate | verdict | number |
|---|---|---|
| AO strength / depth / radius retune | **dead** | contact is **+0.6 L at the system's absolute ceiling** — below the 2.0 L null |
| cast-shadow bias (peter-panning) | **dead at this sun angle** | grounding A/B returned **FLAT**: under-boot box **pixel-identical 754/754** between arms and against the critic's own frame, while the same toggle moved **18,299 px (2% of frame)** elsewhere |
| baked `aoMap` not reaching the key term (`uAoKey = 0`) | **not a blocker — corrected here** | see §4 |

**The grounding result does not overturn the critic, and this seal must not be read as saying it
does.** There genuinely is no contact darkening; M12 measured that correctly. What was eliminated
is one *explanation* for its absence. The geometry is the reason: the sun sits at **20.97°** and
throws ~**4.7 m of shadow nearly sideways in screen space**, while the probe samples straight down
from the sole — *that column contains no cast shadow in any arm, at any bias.* Cast shadow was
never a candidate mechanism here.

With those gone there is no competing hypothesis left to design around: the darkening the critic
asks for **has to come from a contact term**.

---

## 3. Why the AO pass cannot produce it — mechanism, read out of source this session

Not remembered, not quoted from the ledger. `src/render/passes/AO.js`, current tree:

- `tune.radius = 1.35` m, and the march is **quadratic**: `off = sampleDir * radius * f * f` with
  `f = (j + jitter) / AO_STEPS`, `jitter ∈ [0.5, 1.0]`. At `high` (`AO_STEPS = 5`) the five step
  offsets are **1.4–5.4 cm · 12–22 cm · 34–49 cm · 66–86 cm · 109–135 cm**. A contact shadow is a
  2–10 cm feature, so **exactly one of five steps per direction lands inside it**, and where it
  lands inside it is jittered per pixel.
- The pass runs at **half resolution**, so the ~6 px contact band is ~3 AO texels wide.
- The blur is a 9-tap Gaussian, `g = exp(-0.5 * i² / 4)` → **σ = 2 half-res texels = 4 full-res
  px**, radius 4 texels = **8 full-res px**. A 3-texel band under a σ = 2 kernel retains roughly
  half its peak and spreads. **The bilateral gate does not protect it**: `uSharpness` rejects taps
  across *depth discontinuities*, and the floor under a boot is depth-continuous, so all nine taps
  are accepted.

One of five march steps × ~0.55 blur retention × `aoStrength 0.62` is the +0.6 L ceiling, and it
reconciles. **The AO pass is not broken — it is correctly built for 1.35 m crevices, and one
radius cannot serve 1.35 m and 0.03 m.** That is the argument for a *separate* term rather than a
retune, and it is the reason `AOPass.tune.radius` is declared out of scope below: moving it trades
§7.3's crevice-AO condition for §7.3's contact condition, which is §12's "paid for out of a
neighbouring feature's budget" exactly.

---

## 4. A dependency I was about to assert, checked, and withdrawn

I nearly sealed "the contact term is blocked until `uAoKey` lands". **It is not, and the
distinction matters for where the term goes.** There are two different occlusion paths:

- `toon.glsl.js:425` — the **baked** `aoMap`, inside the material: `alb * keyRad * key * mix(1.0,
  ao, uAoKey)` with `TUNE.aoKey = 0.0`, so baked AO genuinely does not multiply the direct key
  term. That is §8's open item and it is a *material-side* question.
- `PostFX.js:863` — the **screen-space** AO from `AOPass`, applied in the composite:
  `occ = (1 - ao) * uAOStrength; scene *= mix(vec3(1), uAOTint * uAODepth, occ)`. This multiplies
  the **final scene radiance**, so it reaches key-lit pixels regardless of `uAoKey`.

A contact term composited on the **PostFX** path therefore darkens a sunlit floor with no
dependency on the `aokey` A/B. The two items are independent and must not be bundled.

---

## 5. Design constraints, sealed before the code

1. **Full resolution.** Half-res plus an 8 px blur is precisely where the signal dies; a term that
   inherits either reproduces the failure it exists to fix.
2. **Tight world-space radius, target 2–10 cm**, with its own uniform. `AOPass.tune.radius` is
   **out of scope and must not be touched** (§3).
3. **No blur, or a ≤1 px depth-gated one.** The feature is ~6 px; any kernel comparable to it
   removes it.
4. **Composited on the AO path**, so it darkens toward `uAOTint` per §2.1.3 — never toward grey —
   and so it inherits whatever the §38.4 shadow-hue fix does rather than fighting it.
5. **Independent of the shadow map.** Designed as if the bias question does not exist; it now
   provably cannot help here (§2), and the term must work at any sun angle.

---

## 6. Instrument — the critic's own M12, already validated. Do not build a second one.

`scratchpad/m12.mjs` reproduces critic5's published table to **0.12 L mean abs error**, with the
sole `(617, 638)` and both control offsets `−95 / −145 px` *recovered by reproduction* rather than
assumed (control A reproduces including its distinctive 84.4 outlier at d = 40). `--validate`
gates every scoring run and exits non-zero on fidelity failure.

Re-locate the sole on this run's own baseline — `SlyModel.js` has changed since critic5. **If the
baseline column is no longer flat, the frame has moved under the finding and the run reports NOT
COMPARABLE rather than a number.**

### 6.1 Applied-state readback — mandatory, from §40

The grounding A/B's decisive arm **never ran**: a bias clamp silently floored two arms to the same
value on the cascade that mattered, and the only reason anyone knows is that its seal required
reading back *the value the shader received*, not the value requested.

A contact term has exactly this failure surface — a radius clamped to a texel floor, a strength
clamped to [0,1], a world radius quantised to a half-res texel if the buffer choice slips. So:

> **Every arm must read back, from the live uniform on the GPU-side material, the applied radius
> (m and px), strength, and the render-target dimensions the term actually sampled, and print them
> next to its score. An arm whose applied state equals another arm's is reported as COLLAPSED and
> scores nothing.**

A collapsed arm produces a null indistinguishable from a decisive one. This is the cheapest line
in the seal and it is the one that would have saved the previous run.

---

## 7. Bands, pre-registered

**Primary — CONTACT.**
`ΔL = median(under[d = 3,6,10])_base − median(under[d = 3,6,10])_treated`.
Null from critic5: controls differ by 2.0 L at d = 3.

- **CONFIRMED** — `ΔL ≥ 8.0 L` (4× null) **and** both control columns move `< 3.0 L`.
- **INSUFFICIENT** — `3.0 ≤ ΔL < 8.0`. Connected, not doing the job.
- **NULL** — `|ΔL| < 3.0`. Before concluding anything about the design, prove the term reached the
  frame at all (§6.1 readback + a deliberately absurd `radius`/`strength` arm that must visibly
  wreck the frame). A term that is not composited and a term that is badly designed produce the
  same number.

**Binding counter-risk 1 — HALO / BLOB.** A tight-radius term under a character trivially produces
a dark ring that reads as a sticker, which is a different §7.3 failure, not a win.
- Score d = 20, 30, 40, 55 (outside the intended 2–10 cm band). **PASS requires |ΔL| < 2.0 L at
  every one.** A term that darkens the floor 20 cm out is a blob shadow and §7.3 does not ask for
  one.

**Binding counter-risk 2 — ARCHITECTURE CONTAMINATION.** The term must not reappear where two
walls meet, or it is an AO term in disguise and belongs in the AO pass after all.
- Score the `guard` wall/ground contact ROI — the one the rim gate took **655 → 4**. **PASS
  requires the count to stay < 20.**

**Null control.** A `contactStrength = 0` arm must be **bit-identical** to base. Captured in the
same boot at the same frozen clock per §28; §19's `renderFrame(0)` ×3 settle.

---

## 8. Predictions — what a successful fix would and would not move

**WOULD move**
- under-boot `d = 3, 6, 10` darker by ≥ 8 L on `sly-closeup`, `interior`, `combat` — the three
  shots with the largest subject scale (`interior` 27.2%, `sly-closeup` ~large, `combat` at 45°).
- the same columns on `hero` (18.8%) and `traversal` (19.4%) by a smaller, still-detectable
  amount — these are the falsifier for "it only works at close range".

**WOULD NOT move**
- `d ≥ 20 px` columns (counter-risk 1).
- the lit side away from the character, at all.
- the `guard` frame's under-character columns — **he is behind the camera there by design (§7)**,
  which makes `guard` a free null: any movement in its M12 columns means the term is firing on
  something that is not the character.
- the whole-frame statistics. This is a ≤10 cm band under one figure; it is a few hundred pixels.
  **Stated in advance so a small frame-wide number is a prediction confirmed, not a disappointment**
  — the discipline §38.4 used.

**WOULD NOT fix**
- peter-panning, and there is nothing to fix: at 20.97° the cast shadow is thrown 4.7 m sideways
  and is not in this column at all. The contact term adds a correct dark band under the boot; the
  cast shadow's placement is a separate question with a separate owner. **The two results must not
  be merged into one story.**

**Falsifiers (any one voids the fix)**
- controls move ≥ 3.0 L (the term is darkening the floor, not the contact).
- any `d ≥ 20` column moves ≥ 2.0 L (blob).
- `guard` contact ROI > 20 px (architecture contamination).
- the `contactStrength = 0` arm is not bit-identical to base (§28 clock or a second cause).
- any arm reports COLLAPSED applied state (§6.1).
