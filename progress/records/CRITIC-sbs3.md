# CRITIC-sbs3 — the third §7.4 blind side-by-side, measured against round 2's baseline

**STATUS: IN PROGRESS — written incrementally under §163/§164 rollback discipline. §5 lists every
file produced. If this line still says IN PROGRESS, the container rolled back mid-review and
everything above this line is nonetheless valid and final for the sections it covers.**

**Date:** 2026-08-06. **Critic:** adversarial visual review per `tools/CRITIC.md`; no `src/**`
touched, no git run (the coordinator sweeps). **Baseline:** `CRITIC-sbs2.md` — 5 wins / 5 losses
(wins: temple, sly-closeup, dunes, interior, traversal; losses: hero, courtyard, night, combat,
guard). **Method:** identical to rounds 1 and 2 — the same pinned comparand routes re-fetched to
the scratchpad (never committed, §1.1 rule 3 / §162), both frames scaled to equal height,
ours in randomised left/right position (SystemRandom, mapping withheld in `sbs/mapping.json`
until the per-side verdicts were written), then rect-level measurement on the full-res frames.

**Our frames this round:** `progress/records/sbs3/*.png` — all ten canonical shots, 1280×720
quality=high, captured 2026-08-06 02:30–03:08 (report.json: commit 167c508+dirty). The tree
carries round 2's ships (eyesize 0.55, capYaw −10°, the gold-only prop hull, the sky cloud decks,
the §132.4 violet pair) **plus four new ones this round is measuring**:

- **banda2** — day shade-warmth restored (`subjWarmShade` 0.50→0.65, `shadowTintPeak` 0.52→0.62)
  with a night gate pinning night to the old value. Predicts movement on day shots' shadow
  warmth; night/guard unchanged **by design**.
- **uGraze** — grazing-elevation sky dissolves to haze (dunes/night skies below ~17.5° elevation;
  courtyard proven bit-exact null).
- **sparkle preroll** — the blue hook-diamond markers now render in staged captures (traversal is
  the hook shot).
- **c3 carnelian cane** — combat impact flash/arc/sparks recoloured and de-gained (its own
  measurement: chalk share 13.6%→2.2%, figure medSat 0.370→0.435).

**What this round must NOT credit:** `uGoldGlint` and `uAtmoWire` are committed but **INERT
scaffolds at zero gain** — they change nothing visually. The atmowire dose, the gold lobe, the
mradius band and the cone heading did **not** ship. Any movement in those areas is measurement
noise or capture phase, and is reported as such.

---

## 1. Provenance — what was judged against what

| shot | our file (all 1280×720, 2026-08-06, tree 167c508+dirty) | reference frame | source |
|---|---|---|---|
| hero | `progress/records/sbs3/hero.png` (02:30) | SMO Sand Kingdom vista (Tostarena, day) | [R1] `high/SandWorldHomeStage.jpg` |
| temple | `sbs3/temple.png` (02:30) | Sly 2 Cairo Museum hall (PCSX2) | [R2] `Unstretched HUD.jpg` |
| sly-closeup | `sbs3/sly-closeup.png` (02:30) | Sly 4: Thieves in Time still (600×600, letterboxed in pair) | [R3] |
| courtyard | `sbs3/courtyard.png` (02:30) | SMO Tostarena town, day | [R1] `SandWorldHomeStage_1.jpg` |
| dunes | `sbs3/dunes.png` (02:30) | SMO Sand Kingdom open dunes | [R1] `SandWorldHomeStage_4.jpg` |
| interior | `sbs3/interior.png` (03:00) | SMO Inverted Pyramid interior | [R1] `SandWorldPyramid001Stage.jpg` |
| night | `sbs3/night.png` (03:00) | SMO Tostarena night (moonlit) | [R1] `SandWorldHomeStage_2.jpg` |
| traversal | `sbs3/traversal.png` (03:03) | Sly 3 Venice rooftop run (PCSX2) | [R2] `Unstretched HUD sly 3.jpg` |
| combat | `sbs3/combat.png` (03:08) | Sly 4: Thieves in Time still | [R3] |
| guard | `sbs3/guard.png` (03:08) | Sly 2 bear guard, Nunavut night (PCSX2) | [R2] `Bear guards.jpg` |

Comparands re-fetched through the agent proxy on round 1's pinned routes, all successful first
try, all scratchpad-only:

- **[R1]** `https://raw.githubusercontent.com/Amethyst-szs/smo-thumbnail-database/main/high/<file>`
  — real Super Mario Odyssey v1.0.0 stage captures, **1280×720, exactly our resolution**
  (`SandWorldHomeStage.jpg` 197,584 B; `_1.jpg` 250,114 B; `_2.jpg` 195,806 B; `_4.jpg` 140,946 B;
  `SandWorldPyramid001Stage.jpg` 221,625 B).
- **[R2]** `https://raw.githubusercontent.com/zzamizz/weed-sheet/main/Media/Screenshots/<file>`
  (URL-encoded spaces) — real Sly 2/3 PCSX2 captures: `Unstretched HUD.jpg` 1151×647,
  `Unstretched HUD sly 3.jpg` 1151×647, `Bear guards.jpg` 862×647.
- **[R3]** `https://raw.githubusercontent.com/OldMcGroin/thegamingemporium/main/static/Images/`
  `Games/sly-cooper-thieves-in-time-pc-patched.webp` — real Thieves in Time still, 600×600.

Comparand caveats, unchanged and restated because they bound every verdict below: [R2] are fan
PCSX2 captures of 2004/2005 PS2 games — **beating them is the floor, not the bar**; [R3] is 600 px
letterboxed into a 560-px-tall pair (its live game pixels span roughly a third of the pair height,
so softness favours US in any texture read); [R1] are editor-staged stage-file captures but real
Odyssey rendering at full lighting. Round 1's egress finding still holds: every host except
`raw.githubusercontent.com` CONNECT-403s through this proxy, so a TotK- or Sly-4-HD-class
comparand remains unobtainable and the temple/traversal/combat/guard pairs are all judged against
either 2004-era hardware or a 600-px still.

---

## 2. Verdict table — with movement vs round 2

Verdicts were recorded per SIDE from the composites and written to the scratchpad
(`blind-verdicts.json`, with the reasoning for each side) **before** `sbs/mapping.json` was read.
Transcript order: build composites → view all ten pairs → write all ten per-side verdicts →
unmask. The mapping placed OURS on the left in hero/temple/night/combat/guard and on the right in
sly-closeup/courtyard/dunes/interior/traversal.

| shot | round 1 | round 2 | round 3 (this review) | movement vs round 2 |
|---|---|---|---|---|
| hero | THEIRS, decisive | THEIRS, decisive | **THEIRS**, decisive | none in verdict; warm arrived on rust/sand but not on the lit beam |
| temple | OURS, clear | OURS, clear | **OURS**, clear | held (comparand still 2004) |
| sly-closeup | THEIRS, decisive | OURS, narrow | **OURS**, narrow | held; new cost noted (off-model extended leg) |
| courtyard | THEIRS, decisive | THEIRS, clear | **THEIRS**, clear | narrowing inside "clear" — warm left plane + warm colossus flank now read blind |
| dunes | THEIRS, decisive | OURS, narrow | **OURS**, narrow-to-clear | **STRENGTHENED** — horizon dissolves cleanly; no streak class visible at pair scale |
| interior | THEIRS, narrow | OURS, narrow | **OURS**, clear | **STRENGTHENED** — composition gap widened; palette still our weak half |
| night | THEIRS, decisive | THEIRS, clear | **THEIRS**, clear | held; the "oily" sky that read blind last round is gone |
| traversal | THEIRS, narrow split | OURS, narrow-to-clear | **OURS**, narrow | **WEAKENED** — this staging puts the figure small, dark and on the top edge |
| combat | THEIRS, decisive | THEIRS, decisive | **THEIRS**, narrow | **BIGGEST MOVE OF THE ROUND** — the character survives the flash and reads |
| guard | THEIRS, decisive | THEIRS, decisive | **THEIRS**, decisive | none; a new framing defect (a black glossy wedge eats the lower-right third) |

**Round 1: 1 win / 9 losses. Round 2: 5 wins / 5 losses. Round 3: 5 wins / 5 losses — headline
unchanged, margins moved on five of ten shots and the decisive-loss count halved from three
(hero/combat/guard) to two (hero/guard).** No shot flipped, and the reason is legible: the four
new ships were a *margin* wave, not a *flip* wave. c3 took combat from decisive to narrow but did
not put an opponent in the frame; banda2 warmed the shade registers of the day shots but did not
reach the lit sandstone that decides hero and courtyard; uGraze cleaned the two skies that were
already not the deciding defect; sparkle preroll delivered its markers on a shot we already won.

**Blinding honesty note, restated verbatim in spirit from round 1:** the blinding is procedural —
our ink style is identifiable on sight, so randomised placement protects against filename-priming,
not against recognising our own render. Verdicts were nonetheless recorded per side, with written
reasoning, before the mapping was read, and the mapping matched the recognition in all ten cases.
Two of this round's calls (combat, courtyard) were close enough that I wrote the losing side's
strengths into the record before unmasking, which is the only real protection available here.
