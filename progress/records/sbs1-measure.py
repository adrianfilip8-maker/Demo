#!/usr/bin/env python3
"""
sbs1-measure.py — measured quantities for the first real blind side-by-side (AGENTS.md 7.4),
CHARACTER, CHAR-sbs1.md. All reference frames live in the scratchpad and are NEVER committed;
this script and the numbers are the durable record.

References (real frames, provenance in CHAR-sbs1.md):
  R1  Sly 3 (Venice rooftop), PCSX2 widescreen frame 1151x647, back three-quarter,
      head (incl cap) y 333..393 = 60 px         [weed-sheet Media/Screenshots/]
  R2  Sly 3 (USA) libretro in-game snap 512x384, front three-quarter run,
      head (incl cap) y 155..191 = 36 px         [libretro-thumbnails PS2]
  R3  Sly 2 interior, PCSX2 widescreen frame 1151x647, behind view (value/palette only)

Ours: shots/sbs1/sly-closeup.png (1280x720, fresh capture at current tree).

Measurement definitions, stated with their thresholds (KNOWN_ISSUES 122.1):
  luma       = 0.2126R + 0.7152G + 0.0722B
  ink run    = along a registered scanline segment, the longest run with luma < 60;
               width is that run length in px
  edge trace = per column (or row) in a registered band, first crossing where luma
               passes the registered figure/background threshold; scallop amplitude is
               peak-to-peak of the residual after removing a linear fit over the band
  patch      = median RGB / luma over a registered rectangle
All cross-image comparisons are quoted at EQUAL HEAD HEIGHT: px figures are also given
as % of that frame's head height ("%hh"), which is the scale-free number.

usage: python3 sbs1-measure.py <scratchpad-dir> [ours.png]
"""
import sys, json
from PIL import Image
import numpy as np

SP = sys.argv[1]
OURS = sys.argv[2] if len(sys.argv) > 2 else None

def luma(a): return 0.2126*a[...,0] + 0.7152*a[...,1] + 0.0722*a[...,2]
def load(p): return np.asarray(Image.open(p).convert("RGB"), dtype=np.float64)

def patch(a, x0, y0, x1, y1):
    r = a[y0:y1, x0:x1]
    return dict(luma=float(np.median(luma(r))), rgb=[float(np.median(r[...,i])) for i in range(3)])

def ink_width(a, y, x0, x1, thresh=60):
    L = luma(a[y, x0:x1]); best = cur = 0
    for v in L:
        cur = cur + 1 if v < thresh else 0
        best = max(best, cur)
    return int(best)

def edge_bottom(a, x0, x1, ysearch0, ysearch1, thresh):
    """Per column, last row (scanning down) where luma > thresh (bright figure over dark bg).
    Detrended with a QUADRATIC (a jaw is curved; a linear fit reads the curve as amplitude —
    that error was caught on this frame: linear p2p 19.5 px was mostly jaw curvature).
    Returns residual p2p and RMS in px, plus lobe count (sign changes of residual > 1px)."""
    cols, ys = [], []
    L = luma(a)
    for x in range(x0, x1):
        col = L[ysearch0:ysearch1, x]
        idx = np.where(col > thresh)[0]
        if len(idx) == 0: continue
        cols.append(x); ys.append(ysearch0 + idx[-1])
    if len(cols) < 8: return None
    cols = np.array(cols, float); ys = np.array(ys, float)
    fit = np.polyval(np.polyfit(cols, ys, 2), cols)
    res = ys - fit
    sgn = np.sign(np.where(np.abs(res) < 1.0, 0, res))
    nz = sgn[sgn != 0]
    lobes = int(np.sum(nz[1:] != nz[:-1]) + 1) if len(nz) else 0
    return dict(n=len(cols), p2p=float(res.max()-res.min()),
                rms=float(np.sqrt((res**2).mean())), lobes=lobes)

def edge_side(a, y0, y1, xsearch0, xsearch1, thresh, from_left, bright_figure):
    """Per row, boundary column of the figure. bright_figure: figure luma > thresh, else <."""
    rows, xs = [], []
    L = luma(a)
    for y in range(y0, y1):
        seg = L[y, xsearch0:xsearch1]
        hit = (seg > thresh) if bright_figure else (seg < thresh)
        idx = np.where(hit)[0]
        if len(idx) == 0: continue
        rows.append(y); xs.append(xsearch0 + (idx[0] if from_left else idx[-1]))
    if len(rows) < 6: return None
    rows = np.array(rows, float); xs = np.array(xs, float)
    fit = np.polyval(np.polyfit(rows, xs, 1), rows)
    res = xs - fit
    return dict(n=len(rows), p2p=float(res.max()-res.min()), rms=float(np.sqrt((res**2).mean())))

out = {}

# ---------------- R1: Sly 3 Venice, head 60 px --------------------------------
r1 = load(f"{SP}/weed-sheet/Media/Screenshots/Unstretched HUD sly 3.jpg")
HH1 = 60.0   # head incl cap, y 333..393
m = {}
m["headHpx"] = HH1
# ink stroke widths. CAVEAT recorded: this frame is dusk-lit jpeg; only crossings with
# BOTH sides bright measure a stroke rather than a shadow region. Two qualify.
m["ink_runs_px"] = [ink_width(r1, y, x0, x1) for (y, x0, x1) in [
    (340, 528, 546),   # crown top outline against lit deck behind
    (392, 545, 575),   # jaw bottom outline between bright jaw and lit street
]]
m["ink_median_px"] = float(np.median(m["ink_runs_px"]))
m["ink_pct_hh"] = 100 * m["ink_median_px"] / HH1
# jaw fur edge scallop: bright jaw (luma>110) over dark street, columns 532..566
m["jaw_edge"] = edge_bottom(r1, 532, 566, 372, 400, 110)
# bill: NOT MEASURABLE on R1 and recorded as such rather than converted — the bill sits in
# ink shadow at this dusk lighting (sampled px luma 24-35, blueness B-max(R,G) < 8), so no
# colour classifier can separate bill from ink outline against a dark street. The bill
# quantity is carried by R2 (clean PNG, frontal). (KNOWN_ISSUES 141: "unscoreable" is an
# outcome; a measurement that cannot fail its subject is not converted into one that can.)
m["bill"] = "UNMEASURABLE: ink-shadowed against dark backdrop; see R2"
# tail rings: light band vs dark band patches (registered from 3x crop)
m["tail_light"] = patch(r1, 610, 480, 640, 500)
m["tail_dark"]  = patch(r1, 648, 508, 672, 528)
m["tail_ring_ratio"] = m["tail_light"]["luma"] / max(1e-6, m["tail_dark"]["luma"])
out["R1_sly3_venice"] = m

# ---------------- R2: Sly 3 frontal run, head 36 px ---------------------------
r2 = load(f"{SP}/ref/Named_Snaps-Sly 3 - Honor Among Thieves (USA).png")
HH2 = 36.0   # head incl cap, y 155..191
m = {}
m["headHpx"] = HH2
m["mask"]   = patch(r2, 155, 171, 164, 179)   # dark mask band left of eye
m["cheek"]  = patch(r2, 147, 166, 155, 173)   # grey brow/cheek fur above mask
m["muzzle"] = patch(r2, 150, 179, 162, 186)   # cream muzzle below mask
m["mask_to_cheek"]  = m["mask"]["luma"] / max(1e-6, m["cheek"]["luma"])
m["mask_to_muzzle"] = m["mask"]["luma"] / max(1e-6, m["muzzle"]["luma"])
m["sclera"] = patch(r2, 164, 173, 167, 178)
m["iris"]   = patch(r2, 167, 172, 172, 178)
m["eye_h_px"] = 6.0          # visible eye opening y 172..178 (registered on grid)
m["eye_pct_hh"] = 100 * m["eye_h_px"] / HH2
# bill: blue reaches x 185 at rows 166..172; muzzle front x 181 at rows 179..186
m["bill_tip_x"] = 185; m["face_front_x"] = 181
m["bill_protrusion_px"] = 4.0
m["bill_protrusion_pct_hh"] = 100 * 4.0 / HH2
m["ink_runs_px"] = [ink_width(r2, y, x0, x1) for (y, x0, x1) in [
    (158, 152, 166),   # cap top outline
    (183, 176, 188),   # muzzle front outline
    (190, 150, 170),   # chin outline
]]
m["ink_median_px"] = float(np.median(m["ink_runs_px"]))
m["ink_pct_hh"] = 100 * m["ink_median_px"] / HH2
out["R2_sly3_frontal"] = m

# ---------------- R3: Sly 2 interior (value only) -----------------------------
r3 = load(f"{SP}/weed-sheet/Media/Screenshots/Unstretched HUD.jpg")
m = {}
m["figure"]  = patch(r3, 530, 360, 610, 520)     # Sly, whole figure region
m["backdrop"] = patch(r3, 300, 300, 500, 500)    # mid wall/floor
m["figure_vs_backdrop"] = m["figure"]["luma"] / max(1e-6, m["backdrop"]["luma"])
out["R3_sly2_interior"] = m

# ---------------- Ours --------------------------------------------------------
# Registered 2026-08-05 against progress/records/sbs1/sly-closeup.png (1280x720, commit
# 8640769 clean). Coordinates were placed on 4x NEAREST grid crops and then VERIFIED by
# drawing each rect on the crop and re-viewing (first-pass eyeballed rects were off-feature;
# the overlay iteration is the registration record, scratchpad head-rects-v1.png ff.).
# Where a hand rect would be fragile, a pixel CLASSIFIER over a verified bbox does the work;
# every classifier states its thresholds (KNOWN_ISSUES 122.1).
if OURS:
    o = load(OURS)
    m = {"file": OURS}
    HB = (540, 96, 780, 245)          # head box incl cap + ears
    CAPTOP_Y, CHIN_Y = 102, 242       # ink outer edge of crown top; chin bottom
    HH = float(CHIN_Y - CAPTOP_Y)     # 140 px, same basis as R1/R2 (incl cap)
    m["headHpx"] = HH
    m["head_box"] = HB
    Lo = luma(o)

    # ---- eyes (headline). Disc bboxes = outer dark rim of each eye unit, registered on a
    # 4x overlay in TWO passes: first-pass RDISC (643,135,706,216) was refuted by its own
    # median ([47,56,83] = ear fur blue; the box overran the eye by ~21 px of ear) and the
    # v2 overlay re-registered both. "Disc" = the whole eye unit (amber iris + sclera +
    # pupil) inside the ink ring; canon comparand is R2's 6 px eye opening in a 36 px head.
    LDISC = (577, 132, 621, 195)      # his right eye (screen left)
    RDISC = (634, 139, 685, 215)      # his left eye (screen right)
    m["eye_disc_bboxes"] = {"L": LDISC, "R": RDISC}
    m["eye_disc_w_px"] = [LDISC[2]-LDISC[0], RDISC[2]-RDISC[0]]        # 44, 51
    m["eye_disc_h_px"] = [LDISC[3]-LDISC[1], RDISC[3]-RDISC[1]]        # 63, 76
    m["eye_disc_h_pct_hh"] = [100*(LDISC[3]-LDISC[1])/HH, 100*(RDISC[3]-RDISC[1])/HH]
    # inter-eye divider: registered expecting sclera-pale ("eyes fuse"); the median refuted
    # that reading (L37.6 dark) — a ~13 px mask remnant SURVIVES between the eye units.
    # Kept with its measured meaning; the eyes are two discs, not one fused band.
    m["inter_eye_divider_patch"] = patch(o, 623, 160, 633, 188)
    m["both_eyes_span_px"] = RDISC[2] - LDISC[0]                 # 108 incl the divider
    # classifier medians inside the eye units (thresholds stated):
    eL = Lo[LDISC[1]:LDISC[3], LDISC[0]:LDISC[2]]
    eR = Lo[RDISC[1]:RDISC[3], RDISC[0]:RDISC[2]]
    both = np.concatenate([eL.ravel(), eR.ravel()])
    m["eye_pale_share_pct"] = 100*float((both > 120).sum())/both.size   # sclera+specular
    m["eye_dark_share_pct"] = 100*float((both < 55).sum())/both.size    # pupil+ring
    # amber-iris classifier, CRITIC-sbs1's exact basis (hue 25-50, sat .30-.65, L 110-210),
    # counted over the head box so the two numbers are directly comparable:
    hsv = np.asarray(Image.open(OURS).convert("RGB").crop(HB).convert("HSV"), dtype=np.float64)
    hbL = Lo[HB[1]:HB[3], HB[0]:HB[2]]
    Hdeg = hsv[...,0]*360/255; Sat = hsv[...,1]/255
    amber = (Hdeg >= 25) & (Hdeg <= 50) & (Sat >= 0.30) & (Sat <= 0.65) & (hbL >= 110) & (hbL <= 210)
    m["amber_iris_px_headbox"] = int(amber.sum())
    runs = []
    for yy in range(amber.shape[0]):
        cur = best = 0
        for v in amber[yy]:
            cur = cur+1 if v else 0
            best = max(best, cur)
        runs.append(best)
    m["amber_longest_run_px"] = int(max(runs))
    # face width at eye rows, TWO bases stated: cheek-to-cheek (CRITIC-sbs1's basis;
    # left silhouette ink edge x564 to face-fur/ear-pink boundary x700) and to-ear x712.
    m["face_w_cheek_px"], m["face_w_toear_px"] = 700-564, 712-564     # 136, 148
    FW = float(m["face_w_cheek_px"])
    m["eye_face_ratio_single_disc"] = [round((LDISC[2]-LDISC[0])/FW, 3),
                                       round((RDISC[2]-RDISC[0])/FW, 3)]
    m["eye_face_ratio_both_eyes_span"] = round((RDISC[2]-LDISC[0])/FW, 3)

    # ---- mask-band legibility, two instruments:
    # (a) value patches. First-pass rects were refuted by their own medians (a "mask" rect
    #     reading L150 pale had landed on sclera; a "cheek" rect reading L19 had landed on
    #     ink) and re-registered on the v2 overlay.
    m["mask_remnant_patch"] = patch(o, 566, 148, 576, 186)  # dark strip left of L eye (mask+fur, mixed)
    m["cheek_patch"]  = patch(o, 610, 220, 638, 234)  # lit jaw/cheek fur below muzzle
    m["muzzle_patch"] = patch(o, 588, 205, 612, 225)  # cream chin/lip (verified warm, L~109)
    m["mask_to_cheek"]  = m["mask_remnant_patch"]["luma"] / max(1e-6, m["cheek_patch"]["luma"])
    m["mask_to_muzzle"] = m["mask_remnant_patch"]["luma"] / max(1e-6, m["muzzle_patch"]["luma"])
    # (b) SHAPE: longest dark run (L<55) along the eye-centre row, with its start-x. In R2
    #     the run is the mask BAND spanning most of the face; in ours any long run can only
    #     be a pupil or ring segment. (A share statistic was tried first and dropped as
    #     non-discriminating: "pale share" measures face LIGHTING in R2 but disc size in
    #     ours — a number that does not depend on the thing it claims to measure.)
    def dark_run_at(L, y, x0, x1, thresh=55):
        seg = L[y, x0:x1]; best = cur = 0; bs = s = -1
        for i, v in enumerate(seg):
            if v < thresh:
                if cur == 0: s = i
                cur += 1
                if cur > best: best, bs = cur, s
            else: cur = 0
        return dict(y=y, run_px=int(best), start_x=int(x0+bs) if bs >= 0 else None)
    m["eye_row_dark_run_ours"] = [dark_run_at(Lo, 163, 564, 700), dark_run_at(Lo, 177, 564, 700)]
    r2L = luma(r2)
    m["eye_row_dark_run_R2"] = dark_run_at(r2L, 175, 146, 185)
    m["R2_face_w_px"] = 185 - 146

    # ---- bill protrusion at this bearing (33 deg). R2 basis: bill tip x beyond face front.
    # Ours: leftmost ink-boundary (L<35) per row, bill rows vs muzzle rows; protrusion =
    # median(face_front) - median(bill_tip) in px along +x toward the camera side.
    def leftmost_dark(L, y0, y1, x0, x1, thresh=35):
        xs = []
        for yy in range(y0, y1):
            idx = np.where(L[yy, x0:x1] < thresh)[0]
            if len(idx): xs.append(x0 + int(idx[0]))
        return xs
    bill_xs = leftmost_dark(Lo, 128, 150, 530, 620)
    face_xs = leftmost_dark(Lo, 200, 236, 530, 620)
    m["bill_rows_leftedge_med_x"] = float(np.median(bill_xs)) if bill_xs else None
    m["face_rows_leftedge_med_x"] = float(np.median(face_xs)) if face_xs else None
    m["bill_protrusion_px"] = (float(np.median(face_xs) - np.median(bill_xs))
                               if bill_xs and face_xs else None)
    m["bill_protrusion_pct_hh"] = (100*m["bill_protrusion_px"]/HH
                                   if m["bill_protrusion_px"] is not None else None)

    # ---- ink stroke widths, both-sides-bright crossings only (R1's caveat honoured)
    m["ink_runs_px"] = [ink_width(o, y, x0, x1) for (y, x0, x1) in [
        (115, 555, 600),   # left crown edge: backdrop -> ink -> crown blue
        (210, 545, 592),   # muzzle/chin left edge: backdrop -> ink -> cream
        (300, 533, 578),   # cane shaft: backdrop -> ink -> gold (first crossing)
    ]]
    m["ink_median_px"] = float(np.median(m["ink_runs_px"]))
    m["ink_pct_hh"] = 100 * m["ink_median_px"] / HH
    # the fused mask+ink left-of-disc crossing, reported separately (not a stroke):
    m["eye_row_left_dark_crossing_px"] = ink_width(o, 165, 545, 580)

    # ---- tail rings, classifier over the verified tail region (620,290,920,410):
    # light band = warm (R>B) & L>80; dark band = navy (B>R+15) & L<60.
    tr = o[290:410, 620:920]; trL = Lo[290:410, 620:920]
    lightM = (tr[...,0] > tr[...,2]) & (trL > 80)
    darkM  = (tr[...,2] > tr[...,0]+15) & (trL < 60)
    m["tail_light"] = dict(luma=float(np.median(trL[lightM])),
                           rgb=[float(np.median(tr[...,i][lightM])) for i in range(3)],
                           px=int(lightM.sum()))
    m["tail_dark"] = dict(luma=float(np.median(trL[darkM])),
                          rgb=[float(np.median(tr[...,i][darkM])) for i in range(3)],
                          px=int(darkM.sum()))
    m["tail_ring_ratio"] = m["tail_light"]["luma"] / max(1e-6, m["tail_dark"]["luma"])
    # black wedge width across the light bands (the 151.3 chip shape), one registered line:
    m["tail_wedge_run_px"] = ink_width(o, 345, 742, 810)

    # ---- jaw fur edge scallop: cannot use R1's bright-over-dark bottom-edge basis here --
    # the chin is dark-on-dark at this staging. Left face edge (dark ink over lit backdrop)
    # measured instead with edge_side, stated as a DIFFERENT basis than R1's jaw_edge:
    m["left_face_edge"] = edge_side(o, 150, 235, 530, 600, 45, True, False)

    # ---- figure vs backdrop (R3 basis)
    m["figure"]  = patch(o, 575, 280, 655, 450)
    m["backdrop"] = patch(o, 80, 260, 420, 440)
    m["figure_vs_backdrop"] = m["figure"]["luma"] / max(1e-6, m["backdrop"]["luma"])
    out["ours"] = m

print(json.dumps(out, indent=1))
