# CHAR-sbs1 — character-side blind side-by-side on the FRESH sly-closeup (AGENTS §7.4)

**Owner:** CHARACTER. **Date:** 2026-08-05. **Status: COMPLETE** (§1 fetches, §3–§4 blind
verdicts recorded before unmasking, §5 measurements, §6 capbill projection at the capture tree).

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

## 5. Rect measurements on the fresh frame — named quantities with owners

Numeric record: `progress/records/sbs1/sbs1-measure-out.json` (regenerate with
`python3 sbs1-measure.py <SP> sbs1/sly-closeup.png`). Ours-side registration passed through two
overlay-verification rounds; two first-pass rects and one interpretation were refuted by their own
medians and corrected at the site (recorded in the script's comments — a "mask" rect that read
L150 had landed on sclera; a "cheek" rect that read L19 had landed on ink; "the eyes fuse into one
band" was refuted by the inter-eye divider reading L37.6 dark). Head basis: crown-top ink y102 to
chin y242, HH = 140 px; face width cheek-to-cheek 136 px (to-ear 148, both stated in JSON).

### 5.1 HEADLINE — the eyes, on a current tree (CHARACTER, mine)

| quantity | fresh frame | reference | verdict |
|---|---|---|---|
| single eye-disc : face width | **0.324 / 0.375** (44 & 51 px of 136) | canon ≈ 0.10–0.15; R2's whole eye opening is 6 px in a 36 px head | **CONFIRMS CRITIC's stale-frame 0.25–0.37, at the top of the band** |
| eye-disc height, %hh | **45.0 / 54.3 %hh** (63 & 76 px) | R2 eye opening **16.7 %hh** | 2.7–3.3× canon |
| both-eyes span : face | **0.794** (108 px of 136) | R2: mask band + two slivers | the eye row is discs, edge to edge |
| amber-iris px (CRITIC's exact classifier, head box) | **947 px**, longest run 30 px | stale eye1 frame: 1,864 px, run 35 px | still goggle-scale; the *count* halved because on this frame the discs are ~50% dark pupil (`eye_dark_share_pct` 49.8) and the amber is shadowed — the count is lighting-dependent, the **disc geometry is the stable number**; do not read 947 as "eyes shrank" |

**The eye:face finding is confirmed on the fresh tree, not inherited from the stale frame.** The
rest-state discs are ~2.5× canon width. Owner: **CHARACTER** (rest-state eye geometry + iris/sclera
albedo). `SPEC-startle-pupils.md` remains orthogonal — that is a *pupil dynamics* mechanism; this
is rest-state disc size.

### 5.2 Mask-band legibility (CHARACTER, mine)

- **R2 (canon):** the mask is the darkest coherent shape on the head — mask:cheek luma **0.256**,
  mask:muzzle 0.198, and the longest dark run at the eye row is **17 px of a 39 px face = 44%**,
  starting at the face edge: a *band*.
- **Ours:** the mask survives as slivers — a 10 px strip left of the L eye (L53) and a **13 px
  inter-eye divider (L37.6)**; remnant:cheek **0.540** (half as dark, relative, as canon's band).
  The longest dark runs at the eye rows are **27–28 px = 20% of face**, and their start-x
  (606, 580) places them **inside the eye bboxes: they are pupils, not mask**. A share statistic
  was tried first and dropped as non-discriminating (it measured face lighting in R2 vs disc size
  in ours); the JSON keeps both under `eye_band_*` with that caveat.
- Verdict: **the mask does not read as a mask because the discs consume its area** — same defect
  direction as CRITIC's stale read, now with shape-level numbers. Owner: **CHARACTER** — this is
  the same lever as 5.1; fixing disc size returns the band automatically (the divider and strip
  are already authored and dark).

### 5.3 Cap bill at 33° (CHARACTER — the PREREG-capbill question, measured in-frame)

**Bill protrusion −22.5 px = −16.1 %hh** (bill-row left edge x574 sits *behind* the muzzle-front
x551.5) vs R2's **+11.1 %hh**. §151.4/§153.6 confirmed on the fresh tree: at this bearing the bill
contributes no silhouette event — it wraps the brow. This is the defect PREREG-capbill's yaw
candidate targets (§6 below). No `capCock`/`capTip` re-litigating — both are measured nulls/fixes.

### 5.4 Items measured, NOT mine — routed with numbers, not verdicts

- **Tail/cream grade (SHADING's settled Band A):** fresh light bands are **WARM** — median RGB
  [138,119,115], R−B **+23**, medL 122.8 — where CRITIC's Aug-1 frame measured R−B **−34.2**
  (blue-white windsock). The authored warm accent now renders warm in this frame; ring contrast
  light:dark **3.09** vs R1's 1.41 (higher contrast than PS2 canon — bolder, not wrong). I am NOT
  reopening the settled albedo item; recording that the frame-side number moved warm-ward across
  trees. If SHADING shipped Band A work between Aug-1 and `8640769`, this is its confirmation at
  `sly-closeup`; if not, the delta is unattributed and worth one look by **SHADING**.
- **Chip population (OPEN, bias verdict pending — §141.5/§151):** the §151.3 wedge shape is live
  on the fresh frame: a **28 px black wedge** crosses the lit tail band at y=345 (`tail_wedge_run_px`);
  jaw/trouser patches visible in the pair view (§3). No chest-clump row exists by design; nothing
  here pre-judges the bias verdict. Owner: **CHARACTER, blocked on the registered A/B**, not new.
- **Ink weight:** our stroke median **5.7 %hh** vs R1 10 %hh / R2 19.4 %hh — our line is *finer*
  per head height than PS2 canon. Matches the modern-AAA target rather than PS2 line weight; noted
  for the coordinator's taste pass, no defect claimed.
- **Figure/backdrop value separation:** ours **0.90** (figure barely darker than wall) vs R3's
  0.78 — weaker value separation than even the PS2 interior. At closeup scale the read survives;
  consistent with CRITIC's hero-scale "star does not separate" (**SHADING** rim/staging cluster,
  already routed there — this adds the closeup number).

## 6. Cap-bill projection at the capture tree (Task D record)

`capbill-proj.mjs` re-run 2026-08-05 (offline, no lock, no `src/**` edit). **srcTree at re-run:
`3fea650a4d645857` — bit-identical to PREREG-capbill's registration tree**, so the prereg's §5
table and this run are the same measurement; the fresh sbs1 capture (`report.json` commit
`8640769`, clean) was taken at this same src tree. Zero control passed (nobill vs itself = 0 px);
sign control passed (+10° yaw toward cameras → 33° bill 0.0%, 0 px).

**The registered decision, numerically, per candidate** — "does any yaw candidate move the bill
out of the crown's projection at 33° while keeping the 45° read":

| candidate | 33.2° outline / contrib / protr | 44.9° outline / contrib / protr | moves 33° out? | keeps 45°? |
|---|---|---|---|---|
| base | 2.6% / 50 px / 1.6 cm | 8.5% / 2336 px / 13.3 cm | — | — |
| −6° | 5.8% / 377 px / 3.3 cm | 9.2% / 2784 px / 14.7 cm | partially (below base-45° level) | yes, improves |
| **−10°** | **8.1% / 648 px / 4.1 cm** | **9.4% / 2941 px / 14.7 cm** | **yes — reaches base-45°'s 8.5% read level** | **yes, improves** |
| −14° | 9.0% / 881 px / 4.5 cm | 9.6% / 3088 px / 14.7 cm | yes | yes, improves |
| −18° | 9.6% / 1095 px / **3.9 cm** | 10.0% / 3243 px / 14.7 cm | outline yes, **protrusion regresses** (4.5→3.9 vs −14) | yes |
| +10° (sign ctl) | 0.0% / 0 px / 0.0 cm | 7.0% / 1543 px / 9.3 cm | no — zeroes it | no — degrades |

**Answer: YES — −6°, −10° and −14° all do it with no 45° trade; −10° is the registered candidate
inside the plateau, and −18° confirms the stated plateau edge (33° protrusion regresses as the
bill crosses the crown's near side). The bearing sweep reproduces the dead-band relocation as
declared (base dead band on +5..+35 — i.e. on the scored 33°; −10° parks it on −5..+10 where no
scored camera sits).** Every figure matches PREREG-capbill §5 to the printed digit, so **no premise
is contradicted and no amendment to the prereg is made** (§34/§41: corrections attach at the
declaration site only when a stated premise fails — none did). The in-frame counterpart of the
33° premise is §5.3's measured −16.1 %hh protrusion on the fresh capture. The A/B/BACK capture
remains queued behind pnightcal and fx22-c2 per the coordinator's queue; GATE 0 (`occlude.mjs`
both sclera rays CLEAR under the token) is still to be run by whoever stages that capture.
**No capture was run and no ticket was filed by this task.**

## 7. Files this task wrote (sweep list)

- `progress/records/CHAR-sbs1.md` (this file)
- `progress/records/sbs1/sbs1-measure-out.json` (instrument output, fresh frame)
- `progress/records/sbs1-measure.py` (ours-side registration filled in; reference side untouched)
- Scratchpad only, never committed (§1.1 rule 3): 4 reference images (§1), `sbs-char/` composites
  + `mapping.json`, `compose_char.py`, `gridcrop.py`, overlay crops, `capbill/` projection PNGs +
  `capbill-proj.json`, `capbill-run.log`.
