# CHAR-sbs1 — character-side blind side-by-side on the FRESH sly-closeup (AGENTS §7.4)

**Owner:** CHARACTER. **Date:** 2026-08-05. **Status: IN PROGRESS — sections land incrementally
(rollback cadence §163–§164); a section below its own heading is complete, an empty heading is not.**

**Ours:** `progress/records/sbs1/sly-closeup.png` — 1280×720 `--q high`, captured 2026-08-05T04:27Z
at commit `8640769` (clean per `progress/records/sbs1/report.json`). This is the FIRST character
scoring on a current-tree frame: every number in `CRITIC-sbs1.md`'s sly-closeup section was measured
on the STALE Aug-1 `shots/eye1/` frame (tree `6f1d1f4+dirty`). This file confirms or refutes those
numbers on the fresh frame.

**Instrument:** `progress/records/sbs1-measure.py` (committed). Reference imagery per §1.1 rule 3:
scratchpad only, never committed — the script and its numbers are the durable record.

## 1. Reference fetches (Task A record)

All four fetches succeeded via the CRITIC-sbs1 §1 route (raw.githubusercontent.com; every other
host CONNECT-403s at the egress proxy). Scratchpad layout as `sbs1-measure.py` expects:

| file (scratchpad-relative) | source | got |
|---|---|---|
| `weed-sheet/Media/Screenshots/Unstretched HUD sly 3.jpg` | zzamizz/weed-sheet @main | 1151×647 JPEG (R1, Sly 3 Venice, head 60 px) |
| `weed-sheet/Media/Screenshots/Unstretched HUD.jpg` | zzamizz/weed-sheet @main | 1151×647 JPEG (R3, Sly 2 interior) |
| `ref/Named_Snaps-Sly 3 - Honor Among Thieves (USA).png` | libretro-thumbnails/Sony_-_PlayStation_2 @master, Named_Snaps/ | 512×384 PNG (R2, frontal run, head 36 px) |
| `ref/sly-tit-closeup.webp` | OldMcGroin/thegamingemporium @main (CRITIC's [R3]) | 600×600 WebP (Thieves in Time closeup — the pair comparand) |

No fetch failures; the committed head-box fallback constants were not needed. Reference-side dry
run of `sbs1-measure.py` reproduces sane registered values (R2 mask luma 32.7 vs cheek 127.7 vs
muzzle 165.0; R1 ink median 6 px = 10 %hh), so the fetched bytes are the frames the rects were
registered on.

## 2. Blind pairs — method

Per §7.4: both frames scaled to equal height (560 px), ours in a SystemRandom left/right position,
mapping withheld in `sbs-char/mapping.json` (scratchpad), verdict per SIDE recorded in §3 below and
committed BEFORE the mapping was read. Honesty note carried over from CRITIC-sbs1: the blinding is
procedural — our ink style is identifiable on sight — so this protects against filename-priming,
not against recognising our own render.

Pairs (comparands matched to the shot's staging — a character closeup wants character closeups):

- **pair-tit:** ours vs Thieves in Time 600×600 closeup (CRITIC's comparand — apples-to-apples
  with the Aug-1 verdict; caveat: 600 px source upscaled ~0.93×→560, ours downscaled 1.29×, any
  softening favours the upscaled side on texture detail).
- **pair-r2:** ours vs Sly 3 libretro frontal in-game snap (512×384; PS2-era floor, not the bar).

## 3. Blind verdicts, per side, recorded before unmasking

Written from the composite viewing; `mapping.json` NOT yet read at the time this section was
committed. (Honesty note from §2 applies: the render styles are mutually identifiable; the sides
are what the record is keyed to.)

**pair-tit** — LEFT: a large character closeup, raccoon with cane on a stone floor with a warm
sun pool. RIGHT: a smaller in-world gameplay frame with HUD, two characters in a village street.

- **An art director picks: RIGHT**, decisive on the character head despite LEFT's overwhelming
  resolution and material advantage.
- LEFT's face: **two huge pale discs dominate the head; the dark mask survives only as an
  outline ring around each disc**. The face reads "goggles/owl", not "masked burglar". RIGHT's
  raccoon heads carry **no resolvable iris at all** at their scale — the read is done entirely by
  the dark coherent mask band plus muzzle, and it is instant.
- LEFT's head-top: rounded crown blob; no bill silhouette event at this bearing. RIGHT's blue cap
  reads bill+crown at a fraction of the size.
- LEFT's figure: black chip-wedges break the trousers, jaw and chest into patches; RIGHT's figures
  hold single coherent colour masses per part.
- Where LEFT wins, clearly: floor/wall material detail, AO, the warm/cool floor composition, cane
  authoring (gold crook + shaft), tail ring boldness. The losing side of the pair is the HEAD.

**pair-r2** — LEFT: same closeup staging. RIGHT: a night street gameplay frame, moon and teal sky,
a raccoon character sprinting toward camera with a gold-hooked cane, two enemies at right.

- **Character read: RIGHT.** At a head that is a fraction of LEFT's, RIGHT carries the three
  signature shapes at once: a bill visibly projecting past the brow, a black mask band that is the
  darkest coherent shape on the head with **tiny** eye slivers inside it, and the gold crook held
  clear of the body. LEFT, at ~10× the head resolution, has the mask consumed by the discs and no
  bill projection at its bearing.
- RIGHT's pose is a full-sprint diagonal with a leg kicked back — more line-of-action in a 2005
  frame than LEFT's (perfectly acceptable, weight-shifted) idle.
- **Rendering/environment: LEFT, decisively** — RIGHT is flat-textured, chunky low-poly, fogless.
  Stated in §2: the PS2 frame is the floor, not the bar. The pair is split exactly as CRITIC-sbs1
  split `traversal`: environment ours, character read theirs.

## 4. Unmasking

`mapping.json` read AFTER §3 was committed: **pair-tit ours=LEFT, pair-r2 ours=LEFT.** Both
RIGHT sides are the references (Thieves in Time closeup; Sly 3 libretro frontal). So both §3
verdicts are **losses for ours on the character head**, wins for ours on environment/material.
The §7.3 last-checkbox verdict on the fresh frame: **sly-closeup still fails**, same direction as
CRITIC-sbs1's Aug-1 verdict — now recorded against a current-tree frame.

## 5. Rect measurements on the fresh frame

(pending — `sbs1-measure-out.json` is the numeric record; this section names losers with owners)

## 6. Cap-bill projection at the capture tree (Task D record)

(pending — `capbill-proj.mjs` re-run at tree `8640769`)
