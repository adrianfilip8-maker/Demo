#!/usr/bin/env python3
"""goldgap — measure the four §7.4 'losing quantities' on a gold ROI of any frame.

Written for PREREG-goldtraversal.md: the same instrument runs on our captures (matmask ROI) and
on downloaded reference frames (rect + filter ROI), so 'their gold vs our gold' is one code path.
Offline, no lock. Usage: python3 goldgap.py <jobs.json>   (list of measure() kwargs per ROI)

Per ROI it reports:
  1. highlight luma span: L p05/p50/p95/p99/max inside the gold ROI; span = p99-p50; p99/p50
  2. specular lobe: largest 4-connected component of L >= 0.92*ROImax, area px + bbox + centroid
  3. occlusion beside the highlight: percentiles of gold pixels within 14 px of the lobe bbox
     (excluding the lobe), and lobe-max over ring-p05 contrast
  4. bloom halo: 1-D march from the lobe centroid in a stated direction; width = px past the
     ROI edge where L > bg_p50 + 15; tint = mean(R-B) of those px minus bg median (R-B)

SCOPE — what this does NOT do, each learned the hard way in the 2026-08-05 run:
  - THE MASK IS ARCHITECTURE-ONLY (matmask.mjs). Character and FX pixels inside the mask are
    counted as the material unless excluded: the first run's "157 px gold lobe" was a white FX
    glow sprite behind Sly at (594,254). Pass `exclude` rects over the figure and any glow/sparkle
    FX, re-derived per capture from a >=0.92max cell map + a visual crop. `lobe_min_rmb` further
    guards the lobe against blue sparkle cores (R-B >= -5 keeps warm/neutral, drops #8fd8ff).
  - THE CHROMA FILTER CANNOT SEPARATE GOLD FROM WARM GROUND. Odyssey dirt measured R-B 124 vs
    lit gold 135 — for reference frames use geometric ROIs (rect + exclude strips), not the filter.
  - A LOBE IS RELATIVE TO ITS OWN FRAME (0.92 * ROI max): PS2-era frames never reach 255, and a
    200 floor silently returned "no lobe" on a dome whose lit crescent is plainly there. Absolute
    luma is NOT comparable across frames from different games/exposures; compare within-frame
    ratios (lobe share of object, gild/ref p50, ring-p05/body-p50) only.
  - The bloom march is a single ray: it reports 34 px of "halo" if it exits into a lit character
    or fascia (rim2 run). Point `direction` at genuine adjacent background and sanity-check the
    number against the lobe size; a halo wider than the lobe is suspect, read the crop.
  - PROVENANCE: mask from the CURRENT tree, PNG from whatever tree captured it. A camera or
    architecture change between them voids every number silently — the r3-traversal 11.09 % tail
    was sunset sky through a post-camera-move mask. Verify registration with a tinted-mask crop
    over the exact capture being scored, every time, before quoting anything.
"""
import sys, json
import numpy as np
from PIL import Image

def luma(a): return a[...,0]*0.2126 + a[...,1]*0.7152 + a[...,2]*0.0722

def largest_cc(mask):
    from collections import deque
    seen = np.zeros_like(mask, dtype=bool); best = None
    H, W = mask.shape
    for sy, sx in zip(*np.nonzero(mask)):
        if seen[sy, sx]: continue
        q = deque([(sy, sx)]); seen[sy, sx] = True; comp = []
        while q:
            y, x = q.popleft(); comp.append((y, x))
            for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                ny, nx = y+dy, x+dx
                if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        if best is None or len(comp) > len(best): best = comp
    return best or []

def measure(png, rect, bgrect, direction, name, maskbin=None, maskid=None, gold_filter=True, exclude=None, lobe_min_rmb=None):
    im = np.asarray(Image.open(png).convert('RGB'), dtype=np.float64)
    H, W = im.shape[:2]
    L = luma(im)
    x0, y0, x1, y1 = rect
    roi = np.zeros((H, W), dtype=bool); roi[y0:y1, x0:x1] = True
    if maskbin is not None:
        m = np.fromfile(maskbin, dtype=np.uint8).reshape(H, W)
        roi &= (m == maskid)
    elif gold_filter:
        r, g, b = im[...,0], im[...,1], im[...,2]
        # warm-gold: red leads blue; green sits between (kills red cloth, grass, blue sky).
        # bright near-white spec cores pass via the L clause so the lobe is not cut out of its own ROI.
        warm = (r - b > 35) & (g > 0.5*r) & (g < 0.97*r)
        roi &= (warm | (L >= 210))
    for ex in (exclude or []):
        ex0, ey0, ex1, ey1 = ex
        roi[ey0:ey1, ex0:ex1] = False
    n = int(roi.sum())
    Lr = np.sort(L[roi])
    p = lambda q: float(Lr[min(n-1, max(0, round(q*(n-1))))])
    stats = {'px': n, 'p05': round(p(.05),1), 'p50': round(p(.5),1), 'p95': round(p(.95),1),
             'p99': round(p(.99),1), 'max': round(float(Lr[-1]),1)}
    stats['span_p99_minus_p50'] = round(stats['p99'] - stats['p50'], 1)
    stats['ratio_p99_over_p50'] = round(stats['p99'] / max(1, stats['p50']), 2)
    thr = 0.92*stats['max']
    lobe_mask = roi & (L >= thr)
    if lobe_min_rmb is not None:
        lobe_mask &= (im[...,0] - im[...,2]) >= lobe_min_rmb
    comp = largest_cc(lobe_mask)
    out = {'name': name, 'png': png, 'roi_rect': rect, 'gold': stats, 'lobe_thr': round(thr,1)}
    if comp:
        ys = [c[0] for c in comp]; xs = [c[1] for c in comp]
        cy, cx = int(np.mean(ys)), int(np.mean(xs))
        out['lobe'] = {'area_px': len(comp), 'w': int(max(xs)-min(xs)+1), 'h': int(max(ys)-min(ys)+1),
                       'centroid': [int(cx), int(cy)]}
        # occlusion ring: gold pixels within RING of the lobe, excluding the lobe
        RING = 14
        near = np.zeros((H, W), dtype=bool)
        ry0, ry1 = max(0,min(ys)-RING), min(H,max(ys)+RING+1)
        rx0, rx1 = max(0,min(xs)-RING), min(W,max(xs)+RING+1)
        near[ry0:ry1, rx0:rx1] = True
        ring = roi & near & ~lobe_mask
        if ring.sum() > 20:
            Lg = np.sort(L[ring]); m = len(Lg)
            out['occlusion_beside_highlight'] = {
                'ring_px': int(m),
                'p05': round(float(Lg[max(0,round(0.05*(m-1)))]),1),
                'p25': round(float(Lg[max(0,round(0.25*(m-1)))]),1),
                'contrast_lobe_over_ring_p05': round(stats['max']/max(1.0,float(Lg[max(0,round(0.05*(m-1)))])),1)}
        # bloom halo: march from lobe centroid in `direction` until off the gold ROI edge,
        # then measure how far L stays above bg floor
        dx, dy = direction
        bx0, by0, bx1, by1 = bgrect
        bgL = L[by0:by1, bx0:bx1]
        bg_p50 = float(np.median(bgL))
        bg_rb = float(np.median(im[by0:by1, bx0:bx1, 0] - im[by0:by1, bx0:bx1, 2]))
        yq, xq = cy, cx
        # step to the gold edge first
        while 0 <= yq < H and 0 <= xq < W and roi[yq, xq]:
            yq += dy; xq += dx
        halo, rbs = 0, []
        while 0 <= yq < H and 0 <= xq < W and not roi[yq, xq]:
            if L[yq, xq] > bg_p50 + 15:
                halo += 1; rbs.append(float(im[yq, xq, 0] - im[yq, xq, 2]))
                yq += dy; xq += dx
            else:
                break
        out['bloom'] = {'halo_px_past_edge': halo, 'bg_p50': round(bg_p50,1),
                        'halo_tint_RmB_minus_bg': round((np.mean(rbs) - bg_rb),1) if rbs else None,
                        'direction': [dx, dy]}
    print(json.dumps(out))
    return out

if __name__ == '__main__':
    cfg = json.load(open(sys.argv[1]))
    for job in cfg: measure(**job)
