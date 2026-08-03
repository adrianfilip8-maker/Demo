# PREREG-hgrelief — sealed before the capture boots

TEXTURES, against critic pass 6 finding #6 ("the hieroglyph walls are printed, not carved — no
bevel, no chisel highlight, no recess occlusion, ~42 px mechanical grid pitch, reads as a
keypad") and the routed `interior` item ("the hieroglyph band tiles with a visible ~90 px
repeat").

Sealing tree: `src/textures/**` as of this file's mtime. Baseline frames:
`shots/critic6/{traversal,interior}.png` at `1bc8938`.

## The change

1. **`carve()` gains a symmetric albedo arris** — a lip lighter than the field, taken from the
   bevel-scale blur of the cut mask so it spans ~`2 x rb` texels. Enabled: `hieroglyph_wall`
   0.22, `hieroglyph_gilded` 0.16 toward `PAL.goldLight`, `relief_figures` 0.20,
   `column_papyrus` 0.18. Nothing else in the catalogue is touched.
2. **Register cells are no longer uniform** — `columnRegister`/`rowRegister` jitter the quadrat
   weights ±10 % and renormalise, off a *derived* RNG stream so the sign sequence is unchanged.

   **Amended from ±18 % before the capture booted, and the reason is a census the change was
   about to fail.** A sign is fitted to its cell by `min(bw/g.w, bh/g.h)`, so a *taller* cell
   grows only the height-limited signs while a shorter cell shrinks everything — the jitter is
   symmetric in cell height and asymmetric in sign area, which pulls the median down and pushes
   §13's rarest-and-largest ratio up. Measured at ±18 %: `hieroglyph_gilded` **3.10 → 4.04x**,
   past the **3.86x** that was measured and rejected when `cols = 10` was tried, on a recipe that
   is 29 % of `hero`. At ±10 % it is **3.33x**, `relief_figures` 2.26 → 2.54x, and
   `hieroglyph_wall` (2.31 → 2.12x) and `column_papyrus` (2.05 → 1.92x) are *better* than the
   state they replace. The de-registration is unaffected because it is the column-width jitter
   that carries it: ACF at lag 42/84 is 0.079/0.054 at ±10 % against 0.080/0.053 at ±18 %.
   Timestamped against the boot: the capture was still queued behind pid 31706 at 430 s when
   this landed, so the frames carry ±10 %.
3. **Text-column widths jitter ±14 %**, renormalised to the tile.
4. **Cartouche placement is irregular** — gaps drawn from {2, 3} forced to sum to `cols`, with
   per-cartouche height and lead-in variation.

## Already measured, texture-side (not evidence about the frame)

| quantity | before | after |
|---|---|---|
| `hieroglyph_wall` ring: texels changed | — | 21.6 % |
| ring mean luma | 0.4844 | 0.5168 (+6.7 %) |
| ring width p50 | — | 6 texels = **61 mm = 1.5–3.0 px** at temple/traversal/interior |
| tile sd at `interior` scale (arris isolated) | 0.0624 | 0.0647 (**+3.7 %**) |
| squint sd at 1/8 (arris isolated) | 0.0440 | 0.0426 (**−3.2 %**) |
| ACF of the tall register, top peak | **lag 84 = 0.799** | no structural peak (max non-trivial 46 = 0.211) |
| ACF at lag 42 / 84 / 168 / 252 | 0.678 / 0.799 / 0.723 / 0.767 | 0.080 / 0.053 / −0.048 / −0.033 |
| catalogue invariants | 44 recipes, 0 joint violations, `darkTail` 0.0000 on every stone recipe (`ceiling_stars` 0.0005 unchanged) | same |

## In-frame predictions, with falsifiers

Statistic definitions are `cov1`-family, restricted to the `arch:hieroglyph_wall` mask eroded
3 px (`matmask` architecture-only mask; FX/character pixels are invisible to it and appear as
drift).

- **P1 — primary, relief.** Band-passed local contrast relative to local base, 1.6–3 px band,
  inside the hieroglyph mask: **+6 % to +25 %**. Registering an upper bound as well as a lower
  one, because this recipe's last measured texture→frame transfer was ~0.45 and a full-size
  gain would itself be suspicious.
  **Falsifier: < +3 % ⇒ the arris did not reach the frame in an amount worth its risk. Report
  it as a null and revert, do not defend it with the +3.7 % texture number.**
- **P2 — busy guard, and it overrides P1.** Squint sd at 1/8 of the same ROI must not rise more
  than **+5 %**. The historic ashlar blotching state moves the equivalent number +49 %.
  **If P2 fails, revert regardless of P1** — the busy condition is the one this recipe's history
  says gets broken while fixing the flat one.
- **P3 — tiling.** Horizontal NCC autocorrelation of `interior`'s back-wall hieroglyph band,
  computed at the frame's own measured px/repeat: the peak at `2 x column pitch` (84 px at
  `interior`'s 504 px/repeat) must fall **below 0.35**, and no lag between 30 and 300 px may
  exceed **0.45**.
- **P4 — null / instrument control.** `paving_courtyard`, `granite_pink` and `sandstone_worn` in
  the same frames must move less than **±2.5 %** on P1's statistic. The pass-6 tree also carries
  SHADING, FX and GEOMETRY changes plus the reverted column mottle, so if the nulls move the
  frame moved for outside reasons and **P1 is unquotable, not passed**.
- **P5 — the image, and it is not subordinate to the numbers.** At 4× the glyphs must read as
  cut — a lighter lip around a darker recess — and at squint the masses must stay clean and the
  wall must still read as one shape. Both, or it fails. A number on target with a wrong frame is
  this project's most repeated failure.

## Not claimed

- Nothing here addresses recess *occlusion* through the AO map: KNOWN_ISSUES §8 establishes that
  `ao` never multiplies the key term and SHADING has ruled `aoKey = 0` final, so the authored
  occlusion gradient (floor 0.158 against face 0.863) cannot appear on a sunlit wall whatever
  this file does. The arris is the albedo substitute for it, and that is the whole reason it is
  in albedo rather than in the height field.
- Nothing here addresses §68.1/§70.2's tone-curve crush (`G` ratio 0.390 through AgX), which is
  larger than anything authoring can move and is routed to SHADING/POSTFX.
