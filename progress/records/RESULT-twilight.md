# RESULT-twilight — NO-SHIP: the hemisphere-leg violet device is falsified by its own bars; it removes the fill's hue split instead of adding one, and it leaks (faintly) into the protected staging

Scored against `PREREG-twilight.md` (51d185c). Run 2 (run 1 died at 10/36 renders to the
container restart; §298.3 stranded-install recovery executed — cand sha verified, restored).
37 files + `run.json` in `shots/twilight1/`; scorer log
`progress/records/logs/twilight-score-run2.log`; candidate restored post-run, sha == orig.

## Scoreboard

```
V0–V3      clean grant · single tree {ea0fe49942e4} == lock head 8c6d682 ·
           readbacks OK on every arm · back==base 0 px on all 12 blocks          VALID
B4 golden  hero/temple/courtyard/interior: 0 px at |d|≥1, full frame             PASS
B5 scope   perch-80: 710 px ≥2L (need 0) FAIL   [≥1L census: 73,583 px]
           arm-80:   594 px ≥2L (need 0) FAIL   [≥1L census: 46,657 px]          FAIL
B1 disp    perch: 26.1° → 22.9° (need ≥34.1 and ≥×1.5)                           FAIL
           arm:    8.6° →  8.5° (need ≥16.6)                                     FAIL
B2 sep     perch: VOID-degenerate (p65−p35 = 6.7 L — the seal's NAMED RISK,
           single-population all-shade wall, exactly as registered)
           arm: non-degenerate, ΔSEP −0.2° (need ≥+15° on ≥1 shot)               FAIL
B3 costume perch: hue 212→221 ∈ window, S 92%, ΔL 0.6                            PASS
           arm: hue 43.1→33.2 — BASE ALREADY OUTSIDE [190,285]: the subject
           bbox is warm stone, not costume — instrument mis-aim, recorded        (mis-aim)
B6 look    done (below)                                                          DONE
Outcome    bar FAILs on a valid instrument → NO-SHIP, constants untouched
```

## The looking (B6, binding)

perch-TWI1 wall at 2×: the el-2.01 scene is **already cool and dark** — the candidate adds a
faint uniform violet cast to the shadowed undersides; the key stayed warm, but the shade did
not "go violet" as a separate population — everything tinted together, nothing diverged.
arm-TWI1 wall at 2×: base and cand indistinguishable — warm key-lit sphinx stone where the
fill barely registers. dunes ×8 diffmap: black with sparse sub-threshold speckle (mean |ΔL|
0.173 over the ≥1 census; the disclosed 28% spillover is invisible). tod-0.9026 pair:
report-only, same convergence direction.

## The mechanism, convicted by its own numbers

The base fill was already hue-SPLIT: cool-blue hemiSky (#5a86bd, ~210°) against warm
hemiGround (#d08a48, ~30°). That split is where perch's base dispersion (26.1°, above the
seal's own 6–14° forecast) came from. The candidate replaced both legs with violets
(#8578d2 / #a988c6, ~249°/~290°) — i.e. it REMOVED the fill's two-hue structure and
substituted one violet family. Hue dispersion therefore went DOWN on both ROIs, and
separation stayed flat: a hemisphere leg is ambient — it lights lit and shaded surfaces
alike — so at el ≤2°, where fill dominates everything, recoloring it shifts the whole frame
uniformly. Monochrome in, monochrome out. The BotW Gerudo-dusk device needs a **shade-scoped**
leg: in this engine that surface is the toon pipeline's shadow tint/hold family (shade-scoped
by construction), not the atmosphere hemispheres.

B5's surprise is the second finding: a ≤1-hex resolved anchor delta still moved 710/594 px
by ≥2 display-L at el 20.97 (W = 0.0078) — grade nonlinearity amplifies sub-LSB anchor
shifts across a large warm wall. "One hex step, zero ≥2L pixels" was arithmetic, and it was
wrong on pixels. Faint (sub-1L over ~73k px, invisible in the census sense) but a hard-0 bar
is a hard-0 bar.

Forecast: registered **SHIP** — wrong. Ledger 4/16. The named risk (degenerate wall) fired
on perch precisely as written; the B1 cand ≥22° never materialized for the reason above.

## Routing

1. **Twilight candidate 2 (new seal, new file):** violet the SHADOW leg, not the fill —
   toon-side shadow tint at the ≤2° anchors (shade-scoped by construction; environment only,
   the subject is already held by subjShadowHold 1.0/§289). Re-seal aims B1/B2 at a
   mixed-population ROI using this run's archived histograms, and replaces bbox costume
   stats with the c10postfx2 mask instrument (B3-arm's mis-aim).
2. **The r10 framings themselves live at el 21 (late golden)** — no twilight device reaches
   them by design (B4/B5 prove the scoping); fixing THOSE frames is the deferred **Option A
   staging decision** (tod 0.80 → 0.74–0.76), owner call, unchanged by this run.
3. §298's owner decision stands as intent; this run falsifies one implementation of it, not
   the direction.
