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
if OURS:
    o = load(OURS)
    m = {"file": OURS}
    # patches are registered against the fresh sbs1 capture; see CHAR-sbs1.md for the
    # annotated grid crops these coordinates were read from.
    m["PATCHES_TBD"] = "filled in by the run that measures the fresh capture"
    out["ours"] = m

print(json.dumps(out, indent=1))
