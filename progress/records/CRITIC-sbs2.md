# CRITIC-sbs2 — the second §7.4 blind side-by-side, measured against round 1's baseline

**STATUS: IN PROGRESS — written incrementally (§163/§164 rollback discipline). An abrupt end
means a rollback took the session, not that the review concluded.**

**Date:** 2026-08-05. **Critic:** adversarial visual review per `tools/CRITIC.md`; no `src/**`
touched. **Baseline:** `CRITIC-sbs1.md` (1 win / 9 losses, frames of 2026-08-01 across five trees).
**Method:** identical to round 1 — same pinned comparand routes re-fetched to the scratchpad, both
frames scaled to equal height, ours in randomised left/right position (SystemRandom, mapping
withheld until verdicts recorded per side), then rect-level measurement on the full-res frames.

**Our frames this round:** `progress/records/sbs2/*.png` — all ten canonical shots, 1280×720
quality=high, captured 2026-08-05 17:04/17:23 on ONE tree (report.json: commit 16a3817+dirty),
which removes round 1's five-trees-in-one-day caveat. The tree carries five ships the baseline
frames predated: the sky cloud-deck fix (skynoise: `TUNE.decks` scale/soft — courtyard/dunes/night),
eyesize 0.55 (sly-closeup), capYaw −10° (sly-closeup/combat), the gold-only prop hull
(interior/courtyard), and the §132.4 violet-pair (`shadowTeal 0.15` + `shadowBounceMix 0.05`)
plus the §130.4 chisel pass. It does NOT carry: banda's warm-restoration (scored, no-ship
decision pending at capture — cream/tail teal expected unchanged), goldlobe's glint (P-F1 REVERT,
`goldGlint 0.0` shipped), or fxcluster's cone/sparkle/flash candidates (not shipped). Movement
claims below credit only ships that happened.

---

## 1. Provenance — what was judged against what

| shot | our file (all 1280×720, 2026-08-05, one tree: 16a3817+dirty) | reference frame | source |
|---|---|---|---|
| hero | `progress/records/sbs2/hero.png` (17:04) | SMO Sand Kingdom vista (Tostarena, day) | [R1] `high/SandWorldHomeStage.jpg` |
| temple | `sbs2/temple.png` (17:04) | Sly 2 Cairo Museum hall (PCSX2) | [R2] `Unstretched HUD.jpg` |
| sly-closeup | `sbs2/sly-closeup.png` (17:04) | Sly 4: Thieves in Time still (600×600, letterboxed in pair) | [R3] |
| courtyard | `sbs2/courtyard.png` (17:04) | SMO Tostarena town, day | [R1] `SandWorldHomeStage_1.jpg` |
| dunes | `sbs2/dunes.png` (17:04) | SMO Sand Kingdom open dunes | [R1] `SandWorldHomeStage_4.jpg` |
| interior | `sbs2/interior.png` (17:23) | SMO Inverted Pyramid interior | [R1] `SandWorldPyramid001Stage.jpg` |
| night | `sbs2/night.png` (17:23) | SMO Tostarena night (moonlit) | [R1] `SandWorldHomeStage_2.jpg` |
| traversal | `sbs2/traversal.png` (17:23) | Sly 3 Venice rooftop run (PCSX2) | [R2] `Unstretched HUD sly 3.jpg` |
| combat | `sbs2/combat.png` (17:23) | Sly 4: Thieves in Time still | [R3] |
| guard | `sbs2/guard.png` (17:23) | Sly 2 bear guard, Nunavut night (PCSX2) | [R2] `Bear guards.jpg` |

Sources re-fetched through the agent proxy via round 1's pinned routes, scratchpad only (§1.1
rule 3), all successful on first try: **[R1]** `raw.githubusercontent.com/Amethyst-szs/`
`smo-thumbnail-database/main/high/<file>` (1280×720 Nintendo captures); **[R2]**
`raw.githubusercontent.com/zzamizz/weed-sheet/main/Media/Screenshots/<file>` (URL-encoded
spaces); **[R3]** `raw.githubusercontent.com/OldMcGroin/thegamingemporium/main/static/Images/`
`Games/sly-cooper-thieves-in-time-pc-patched.webp`. Comparand caveats unchanged from round 1:
[R2] are fan PCSX2 captures of 2004/2005 PS2 games (beating them is the floor, not the bar);
[R3] is 600 px letterboxed (its live game pixels span roughly a third of the pair height —
softness favours US in any texture read); [R1] are editor-staged but real Odyssey rendering.

**Framing note (affects two movement claims).** Our `courtyard` framing differs sharply from the
round-1 frame (that one looked across slab tops at architrave height; this one is ground-level:
obelisk + colossi + braziers) and `guard` differs from round 1's wedge1-staged frame (tod 0.89
staged vs this canonical staging). Round-1 rects were re-derived on the fresh frames where content
moved; every rect used is stated beside its number in §3.

---

## 2. Verdict table — with movement vs round 1

Verdicts were recorded per SIDE from the composites before `sbs/mapping.json` was read; the
transcript order was: view pair → write per-side verdict → next pair → … → unmask all ten.

| shot | round 1 | round 2 (this review) | movement |
|---|---|---|---|
| hero | THEIRS, decisive | **THEIRS**, decisive | none in verdict (sky fixed, figure still merges, stone still cool) |
| temple | OURS, clear | **OURS**, clear | held (comparand still 2004) |
| sly-closeup | THEIRS, decisive | **OURS**, narrow | **FLIP** — eyesize 0.55 + capYaw removed the disqualifier |
| courtyard | THEIRS, decisive | **THEIRS**, clear | narrowed — restaged subject + fixed sky; palette still loses |
| dunes | THEIRS, decisive | **OURS**, narrow | **FLIP** — sky fix + haze layering; per-pixel terrain still theirs |
| interior | THEIRS, narrow | **OURS**, narrow | **FLIP** — on composition; colour remains our weak half |
| night | THEIRS, decisive | **THEIRS**, clear | narrowed — moon staging + warm doorways; residual sky swirl |
| traversal | THEIRS, narrow split | **OURS**, narrow-to-clear | **FLIP** — swing arc now reads (attribution unresolved, §3) |
| combat | THEIRS, decisive | **THEIRS**, decisive | none — flash still erases the character (fxcluster unshipped) |
| guard | THEIRS, decisive | **THEIRS**, decisive | none, arguably worse — no guard figure locatable in frame |

**Round 1: 1 win / 9 losses. Round 2: 5 wins / 5 losses (three of the five wins narrow; the five
losses include the three decisive ones).** The four flips and two narrowings track the shipped
changes; the three unmoved losses track the no-ships (fxcluster) and the unshipped grade half
(hero/courtyard stone temperature) — the scoreboard moved exactly where work shipped, and did not
move where it did not.

**Blinding honesty note, as round 1 stated it:** the blinding is procedural — our ink style is
identifiable on sight, so randomised placement protects against filename-priming, not against
recognising our own render. Verdicts were nonetheless recorded per side before the mapping was
read, and the mapping matched the recognition in all ten cases.

---

*(§3 measurements, §4 leverage, §5 files — appended as the review executes)*
