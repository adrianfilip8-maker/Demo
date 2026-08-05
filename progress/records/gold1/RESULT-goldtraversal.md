# RESULT-goldtraversal — gate run + band scoring on the fresh `gold1` capture

Scored by TEXTURES, 2026-08-05, per `progress/records/PREREG-goldtraversal.md` **exactly as
sealed** (gates 0a/0b/0c as void conditions on the arm's own fresh base capture; four frame
quantities; bands B1–B5 revert-not-defend). Written incrementally per §163–§164 rollback
discipline — every number lands here as it is measured.

Instruments, all offline, no lock, no `src/**` edit: `progress/records/matmask.mjs` (fresh
current-tree masks), `progress/records/gildlit.mjs` (gates 0a/0b, B2, B3),
`progress/records/goldgap.py` with `progress/records/gold1/goldgap-jobs-gold1.json` (B1, B4, B5),
occluder map re-derived per capture per prereg §6.

## 0. Evidence and provenance

First fresh `traversal` since the `c7e51c5` camera move (6 m west, Aug 1 15:57) — the first
capture that can see the current tree's gilded surface (`c54e41f` chisel albedo, `d8a1134` arris
ring relocation, `61a4c9e` beadRoll all post-date every prior capture).

| file | sha256 (12) | stamps |
|---|---|---|
| `progress/records/gold1/traversal.png` | `37f0545db3e9` | 1280x720, q=high, 251 draws, 1.739 M tris |
| `progress/records/gold1/combat.png` | `b613c959b603` | same boot, 221 draws, 1.531 M tris |
| `progress/records/gold1/report.json` | `ce96bab3af7d` | captured 2026-08-05T06:42Z, commit `36d9b90` (dirty) |

Provenance caveats, recorded not argued:

- `report.json` stamps the **git SHA**, not the `src/**/*.js` tree hash the prereg §6 asked for,
  and carries **no `tod`/camera/uniform stamps** (rim2/fx5 did). The registered adjudicator for
  registration is GATE 0c (the look), which is run below on the exact capture being scored.
- Scoring-time src tree hash (find-based over `src/**/*.js`, relative paths from repo root —
  NOT comparable to `tuftbias.mjs`'s git-ls-files convention): `0ac0479e279468e3`.
- Masks are rebuilt fresh from the scoring-time tree by `matmask.mjs` (traversal + combat,
  1280x720). Mask bins are scratchpad-only (regenerable); sidecar shares recorded here.

## 1. Gates (void conditions, run before scoring)

### GATE 0a — share re-measure (VOID if |Δ| > 20 % relative to 12.94 %) — **PASS, Δ = 0.0 %**

Fresh `matmask.mjs` at scoring tree `0ac0479e279468e3`, 1280x720: `arch:hieroglyph_gilded`
**14.00 % raw** (mask sidecar), **12.94 % eroded-2 / 119,251 px** (`gildlit.mjs`) — identical to
the registered 12.94 %. Architecture and camera have not moved between registration and scoring.

### GATE 0b — luminance (gild p50 / sandstone_worn p50 ≥ 0.85 AND share > L160 ≥ 3 %) — **FAIL on the tail clause → seal VOID**

`gildlit.mjs` on `gold1/traversal.png` (sha `37f0545db3e9`), erode 2:

| clause | registered floor | measured on gold1 | verdict |
|---|---|---|---|
| gild L p50 / same-frame `sandstone_worn` L p50 | ≥ 0.85 | **1.35** (86.3 / 64.0) | PASS |
| gild share over L160 | ≥ 3 % | **2.10 %** | **FAIL** |

Full gild row: p01 21.1 / p05 28.2 / **p50 86.3** / p95 131.7 / p99 187.7 / max 255; tail
over160 **2.10 %**, over200 0.64 %, over230 0.17 %; chroma p50 20; RmB p50 −16.
Reference row (`sandstone_worn`, 23,347 px): p50 64.0, tail over160 1.66 %.

This is the registered honest expectation (prereg §0.4/§7: "on today's evidence the likeliest
outcome is a 0b tail-clause failure at ~2 %") landing where it was predicted: **2.10 % vs the
Aug-1 2.11 %** — the chisel albedo (`c54e41f`), arris ring relocation (`d8a1134`) and beadRoll
(`61a4c9e`) that post-date every prior capture moved the tail by **−0.01 pp**, i.e. nothing.
The tree change did not lift the tail past the floor.

Observed drift vs the Aug-1 fx5/rim2 pair, recorded not adjudicated (same camera, same mask,
same instrument): gild p50 78.3 → 86.3, sandstone p50 55.4 → 64.0 (ratio 1.41 → 1.35), gild
chroma p50 24 → 20, gild RmB p50 +6 → **−16** (sandstone −12 → −32). The bodies brightened and
cooled together — a frame-wide grade/lighting shift, not a gild-specific one; the tail did not
move. `report.json` stamps no `tod`, so the staging cannot be confirmed from the capture side
(noted in §0).

### GATE 0c — registration look (tinted-mask crop over the exact base capture, saved) — **PASS**

Tinted overlay (gild magenta, `sandstone_worn` green) over `gold1/traversal.png` itself, eyeballed
at overview and at 1:1 in three places spanning the gilded bbox (x139–1279, y0–414):

- the magenta lands exactly on the gilded beams/cornices — the beadRoll molding is visible
  *through* the tint on the main beam's top arris, and the tint stops at the beam silhouette
  against the pyramid backdrop with no spill;
- the green sits exactly on the sandstone door jambs/trim, boundaries pixel-tight;
- **no tinted patches on sky anywhere** — the §0.3 misregistration signature is absent.

Saved: `reg-tinted-overview.png` (960×540), `reg-crop-1to1.png` (420×320 at x860,y223 — gild/
sandstone/doorway triple boundary). This is a look, as the prereg registers it — no numeric form.

## 2. Occluder map, re-derived on this capture (prereg §6 procedure)

Cell map of ≥ 0.92·max pixels inside the raw gild mask (128,997 px), then a visual crop per hot
cell. The Aug-5 worked-example rect was **not** reused.

- **Pass 1 (no excludes):** max L 255.0, thr 234.6 → **178 hot px, all in one cell x480-640
  y240-360**. Cropped: they sit on the **white FX glow sprite behind Sly**, brightest at
  ~(588–603, 245–262) — same class, near-same place as the registered Aug-1 control lobe at
  (594,254). Sly hangs mid-frame with cane + banded tail over the second beam; a rooftop guard
  (light headwrap) stands through the top-right beam edge at ~(875–935, 5–95).
- **Exclusion rects, stamped into the jobs file:** `[500,190,740,400]` (Sly + FX glow + tail +
  cane hook), `[870,0,940,100]` (rooftop guard). Saved: `occluder-fxglow-excluded.png`.
- **Pass 2 (excludes applied):** ROI 104,379 px, max L 230.4, thr 211.9 → 200 hot px spread
  x183–1174, y133–214 across six cells. Cropped: a **thin 1–2 px rim-lit line along the beams'
  top arris** — genuine architecture highlight, kept (saved: `occluder-surviving-arris.png`).
  This is §0.3's decomposition visible in the fresh frame: the hottest gild pixels are a rim
  line on an arris, not a specular lobe.
- **Lobe-detector positive control on this capture (prereg §4 pattern):** exclusion lifted, the
  detector returns the **173 px (17×16) FX glow lobe at (594,255)** (Aug-1: 157 px at (594,254));
  exclusion applied, **5 px**. The instrument finds a lobe when one exists and the exclusion
  removes exactly the known non-gold one.

## 3. The four registered frame quantities and bands B1–B5

`goldgap.py` with `goldgap-jobs-gold1.json` (mask ROI, occluder-excluded, `lobe_min_rmb -5`)
plus `gildlit.mjs`, on the same capture that passed 0a/0c. **GATE 0b failed, so these are NOT a
seal scoring** — the seal only scores bands on a capture that passed gates 0a–0c. They are
recorded because the prereg's routing needs them as targets (§5.3) and B4 needs its guard
reading on the current tree.

Gold ROI (104,379 px): p05 28.5 / p50 85.9 / p95 134.5 / p99 185.1 / max 230.4;
span p99−p50 99.2; ratio p99/p50 2.15.

| band | quantity | pass interval | measured on gold1 | position |
|---|---|---|---|---|
| **B1** | largest warm lobe area px, bbox ≥ 5 px both dims | [30, 400] | **5 px, 5×1, at (885,157)** | **below-interval — the defect stands** |
| **B2** | gild share over L160 | [3 %, 20 %] | **2.10 %** | **below-interval — the defect stands** |
| **B3** | gild p50 / sandstone_worn p50 | [0.85, 1.8] | **1.35** (86.3 / 64.0) | in-interval (no body wash) |
| **B4** | ring p05 / gold body p50 | ≤ 0.65 | **0.32** (27.6 / 85.9), contrast 8.4 | in-interval — the winning half held |
| **B5** | bloom halo px past lobe edge | [0, 40] | **0 px** (march [0,1] into bg p50 80.5) | in-interval (no grey wash) |

The four §1 quantities in prereg terms: (1) **hard spec: absent** — the largest connected warm
lobe across 104k gold pixels is five pixels in a 5×1 line (0.005 % of the gold ROI; the
references carry 84–146 px, 1–12 % of their object), and it is the rim-lit arris line, not a
specular lobe; (2) **highlight tail 2.10 %** — the metal never reaches toward clip (max 230.4,
p99 185.1 vs reference p99 239–244); (3) **dark occlusion present and strong** — ring p05 at
0.32 of body, contrast 8.4 vs the references' 3.3–4.6; (4) **bloom 0 px** — a guard, satisfied.

## 4. Combat same-boot calibration re-anchor (prereg §7)

`gildlit.mjs` on `gold1/combat.png`, fresh combat mask (gilded 5.81 % raw / 5.43 % eroded-2,
50,019 px): gild tail over160 **41.99 %**, p95 195.7, p50 147.8, gild/ref p50 **2.42**
(147.8 / 61.0). Aug-1 figures: 39.78 % / 198.7 / 2.86.

**B2's calibration holds on the current tree in the same boot:** traversal 2.10 % vs combat
41.99 % — the known no-tail carrier and the known blown frame still sit on opposite sides of
B2's [3, 20] band, with the band strictly between. The tail metric still separates the defect
from its opposite.

## 5. VERDICT

```
GATE 0a  PASS   12.94 % eroded-2 (14.00 % raw), Δ = 0.0 % vs registered 12.94 %
GATE 0b  FAIL   clause 1 PASS 1.35 ≥ 0.85; clause 2 FAIL 2.10 % < 3 %
GATE 0c  PASS   registration confirmed on the exact capture, crops saved
```

**SEAL VOID by GATE 0b's tail clause — the gate report is the registered result of this
capture** (prereg §2: "Either clause failing = seal VOID"). Not scored: no band verdict, no
PASS, no FAIL. Bands B1–B5 above are recorded as routing measurements only.

**The recorded result, as the prereg words it (§7): the gold condition's premise fails on its
best framing at the current tree.** The tail sits at 2.10 % against the 3 % floor — within
0.01 pp of the Aug-1 2.11 % — so the chisel albedo (`c54e41f`), arris ring relocation
(`d8a1134`) and beadRoll (`61a4c9e`) did not move it. This routes the defect to the
lobe-forming levers per §6: **SHADING's shader assembly and GEOMETRY's per-recipe
`metalAmount`/`spec` (§136)** — TEXTURES stages no src edit under this prereg — with the
reference gaps of §5.3 as their targets:

- **specular lobe area: 5 px (5×1) vs 84–146 px on real gold** (Odyssey flag 84 px on a 28 px
  ball, Sly 2 dome 95 px, Sly 3 hook 146 px; 1–12 % of the object vs our 0.005 %);
- **highlight ceiling: max 230.4 / p99 185.1, never approaching clip** vs reference p99 239–244;
- and per §0.3's decomposition (re-confirmed visually on this capture), roughly two-thirds of
  even the thin existing tail is **rim on arrises, not spec** — the hottest gild pixels form a
  1–2 px rim line, which is what the 5×1 "lobe" is.
- **B4 is the winning half (0.32, contrast 8.4) and stays guarded**: whatever brings the lobe
  must not wash the darks (revert regardless of B1–B3 if > 0.65).

Known GEOMETRY state for the routed levers (§136, measured): `metalAmount` 0.45-vs-0.85 arm
already ran and lowering it was a **regression** (gild bluer, R−B −4.62 → −9.79); the remaining
Architecture-side lever is `spec: 0.55`, upstream-blocked on SHADING's `diff`-assembly question
(§136.3). The lobe therefore most plausibly needs a SHADING-side term first.

**This prereg re-arms unchanged once a candidate exists** (§7). "Unscoreable" is a registered
outcome (§141, §155.2); the frames bought the gate report, the registration crops, the occluder
map, the fresh positive control, and the same-boot B2 calibration re-anchor recorded here.

---

Files of this scoring (all under `progress/records/gold1/`): `RESULT-goldtraversal.md` (this),
`RESULT-goldtraversal-raw.json` (raw gildlit/goldgap outputs + occluder derivation),
`goldgap-jobs-gold1.json` (registered scorer config incl. positive control),
`reg-tinted-overview.png`, `reg-crop-1to1.png`, `occluder-fxglow-excluded.png`,
`occluder-surviving-arris.png`. Mask bins are scratchpad-only (regenerable from the tree by
`matmask.mjs`; shares recorded above).
