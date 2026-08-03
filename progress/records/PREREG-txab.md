# PREREG-txab — sealed before either arm boots

TEXTURES. Supersedes **PREREG-hgrelief**'s comparison arm and adds two more treatments to the
same capture pair. Sealing tree: working tree at `db785bd` + this session's `src/textures/**`
edits, uncommitted. Both arms are **that one tree**; nothing in `src/` is edited between them.

## Why the arm changed, and why the new one is stronger

`PREREG-hgrelief` named `shots/critic6/{traversal,interior}.png` at `1bc8938` as its baseline.
Those PNGs were destroyed by the 03:53 rollback (KNOWN_ISSUES §83.2) and cannot be recovered —
frames are not tracked. The seal itself survives and was written before any frame existed, so it
is still a valid preregistration; only its control is gone.

Re-running it against `critic6`'s *numbers* is not available either: the P1/P4 baselines were
`matflat` output on those PNGs, and matflat needs the image.

So the control is rebuilt as a **same-commit A/B arm** (`Canvas2D.abOff`, fed by
`VITE_TEX_AB`), and this is a better instrument than the one it replaces rather than a
concession:

- `critic6` was 21 commits and three other agents away from the candidate tree. That is exactly
  why PREREG-hgrelief needed clause P4 ("if the nulls move, the primary is **unquotable, not
  passed**"), and §74.1 is the case where the nulls moved as much as the treatment and the claim
  had to be withdrawn. Two arms of one commit have no such interval.
- An untouched recipe in this design is bit-identical between the arms **by construction**, so
  its residual is the instrument's own noise floor — a number no previous seal in this project
  has ever had.
- The arm is stamped into the frames: `Textures.init()` pushes
  `textures: A/B CONTROL BUILD — treatments disabled: …` into `window.__GAME.warnings`, which
  `shot.mjs` writes into `report.json`. **A run whose `report.json` lacks that line is not the
  control**, whatever the directory is called.

Cost of the change: the comparison is no longer against the tree the critic scored, so it
answers "what do these four texture edits do" and **not** "is `interior` better than it was at
pass 6". The second question is not answerable any more and nothing below claims it.

## Arms

| run | `VITE_TEX_AB` | out |
|---|---|---|
| control | `base` | `shots/txab-off/` |
| shipped | *(unset)* | `shots/txab-on/` |

Shots: `traversal`, `interior` (PREREG-hgrelief's own two) and `sly-key` (finding #12 only).

## Treatments

1. **`hgrelief`** — the sealed change, unmodified: `carve()`'s albedo arris on
   `hieroglyph_wall` 0.22 / `hieroglyph_gilded` 0.16 / `relief_figures` 0.20 /
   `column_papyrus` 0.18, plus ±10 % register-cell jitter, ±14 % text-column widths, and
   irregular cartouche spacing. The control restores uniform cells, constant column pitch and
   every-other-column cartouches — the "keypad" plus the "~90 px repeat" state — **consuming the
   same number of `rnd()` draws**, so the two tiles carry the same signs and differ only in
   layout and lip. Texture-side, re-measured today at `interior`'s 20.6 mm/px: fineMed +8.1 %,
   cov1 +2.3 points, **squint sd 1/8 exactly 0.0 %**, `darkTail` 0.0000 both arms.
2. **`granite`** — `granite_pink`'s low-passed wind scour, folded multiplicatively into
   `shadeK` at −0.26. Texture-side at 20.6 mm/px: **coarseMed +18.4 %, covC2 +9.0 points**,
   fineMed +1.7 %, cov1 +0.5, squint sd +9.9 %, mean albedo +0.1 %, `darkTail` 0.0000.
3. **`pavecrack`** — **a diagnostic arm, not a candidate.** `paving_courtyard`'s crazing term
   zeroed. Nothing here proposes shipping it.

Catalogue invariants re-checked on the candidate tree before sealing (`texlab --all`): 44
recipes, **0 joint-sign violations**, `darkTail` 0.0000 on every stone and carved recipe
(`ceiling_stars` 0.0005, unchanged).

## Predictions and falsifiers

Statistics are `matflat`'s, inside the architecture mask eroded 3 px, per material.
**Control → shipped**, same resolution, same commit.

- **P1 — hgrelief relief.** `hieroglyph_wall` fineMed and `cov1` on `interior` and `traversal`:
  **+3 % or better on fineMed**, with `cov1` not falling.
  *Falsifier: < +3 % ⇒ report as a null and revert the arris; do not defend it with the texture
  number.* Carried over verbatim from PREREG-hgrelief, and it is a real risk: the texture-side
  figure is +8.1 % and this recipe's last measured texture→frame transfer was ~0.45, which puts
  the expectation at ~+3.6 % — i.e. **on top of the falsifier, not comfortably past it.**
- **P2 — busy guard, overrides P1.** Squint sd at 1/8 of the `hieroglyph_wall` ROI must not rise
  more than **+5 %**. The historic ashlar blotching state moves it +49 %. Fail ⇒ revert
  regardless of P1.
- **P3 — tiling.** Horizontal NCC autocorrelation of `interior`'s back-wall hieroglyph band at
  the frame's own px/repeat: the peak at 2 × column pitch (84 px at 504 px/repeat) below
  **0.35**, and no lag in 30–300 px above **0.45**. The control arm is expected to *fail* this —
  it is the state the critic scored — and a control that passes it means the toggle did not
  reach the frame.
- **P4 — granite.** `granite_pink` coarseMed on `interior` **+8 % or better**, with fineMed
  rising **less than +5 %** and `cov1` not falling. *Falsifier: coarseMed under +4 %, or fineMed
  over +8 % ⇒ null or busy respectively; revert either way.* `interior` is the frame that
  decides it (43.3 % of it); `traversal` is a weak second read.
- **P5 — nulls.** `sandstone_block`, `sandstone_worn`, `limestone_polished`, `mudbrick`,
  `ceiling_stars` and `gold_leaf` are untouched by all three treatments and must move **< ±2.5 %**
  on fineMed. Unlike every previous seal, a violation here is *not* "the tree moved" — it cannot
  have — it is boot-to-boot render noise, and whatever it reads is the error bar every delta
  above has to clear.
- **P6 — finding #12, and its answer is registered in advance in both directions.** In
  `sly-key`, the short curved high-contrast marks on the courtyard paving either survive the
  `pavecrack` control or they do not.
  - *They vanish* ⇒ they are `paving_courtyard`'s crazing, TEXTURES owns finding #12, and the
    mechanism argument in §81.4 (long straight connected boundaries, 86 % of the crack in the
    height field) was **wrong about its own recipe**.
  - *They survive* ⇒ TEXTURES is excluded by test rather than by mechanism. **This still does not
    make them FX's**, and §81.4 already registered that: two owners excluding themselves leaves
    the item unattributed, not assigned. The next candidate is whatever draws in front of the
    paving, and naming it is not this seal's job.
- **P7 — the image, and it is not subordinate to any number above.** At 4× the glyphs must read
  as cut (a lighter lip round a darker recess) and the tomb granite must read as weathered stone
  rather than as camouflage; at squint the masses must stay clean and each wall must still read
  as one shape. Both, or the change fails. *A number on target with a wrong frame is this
  project's most repeated failure* (§67.2 killed the highest-scoring candidate for reading as
  wood grain; §3's "after" column is on the record as lavender).

## Not claimed

- Nothing here addresses recess **occlusion**: §8 establishes `ao` never multiplies the key term
  and SHADING has ruled `aoKey = 0` final, so the authored gradient (floor 0.158, face 0.863)
  cannot reach a lit wall whatever this file does. The arris is the albedo substitute for it.
- Nothing here addresses §68.1/§70.2's tone-curve crush (`G` ratio 0.390 through AgX), which is
  larger than anything authoring can move and is routed to SHADING/POSTFX. `granite_pink`'s
  largest dead area in `interior` — a 4923 px blob at luma 0.659, measured on `shots/tx7` — sits
  in that regime, and P4 does **not** predict it moves.
- Nothing here is a claim about pass 6's score. See "why the arm changed".
