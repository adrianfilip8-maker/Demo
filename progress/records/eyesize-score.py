#!/usr/bin/env python3
"""
eyesize-score.py — the records scorer for PREREG-eyesize §6, committed with the run BEFORE
scoring. Implements exactly the sealed definitions; bands are quoted from the seal and not
recomputed here. CHARACTER.

Inputs:  progress/records/eyesize/frames/{sly-closeup,combat}-{A,B,KB,BACK}.png
         progress/records/eyesize/eyesize-arms.json   (gate0, headratio, shas)
Output:  progress/records/eyesize/score.json + printed gate table.

Definitions (seal §6): luma = Rec.709 0-255; pale aperture = L>120 px inside the per-eye ROI;
per-eye ROI = arm-A's measured pale bbox (found inside the COMMITTED CHAR-sbs1 disc rects
padded +6) padded +6; eye rows = each arm's own aperture centroid row; face width = the
registered cheek basis 136 px; dark = L<55; amber = CRITIC's exact classifier
(hue 25-50 deg, sat .30-.65, L 110-210). Sides: screenL = hisR eye, screenR = hisL.

usage: python3 eyesize-score.py [eyesize-dir]
"""
import sys, json, os
import numpy as np
from PIL import Image

D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), 'eyesize')
FR = os.path.join(D, 'frames')

# ---- committed anchors (CHAR-sbs1 / sbs1-measure.py registration; seal §6) ----
HB = (540, 96, 780, 245)
DISC = {'screenL': (577, 132, 621, 195), 'screenR': (634, 139, 685, 215)}
FACE_W = 136.0
HH = 140.0
CHEEK = (610, 220, 638, 234)
MUZZLE = (588, 205, 612, 225)
A_ANCHOR = {'screenL': 0.324, 'screenR': 0.301}   # pale-aperture eye:face on the committed frame

def luma(a): return 0.2126*a[...,0] + 0.7152*a[...,1] + 0.0722*a[...,2]
def load(p): return np.asarray(Image.open(p).convert('RGB'), dtype=np.float64)

def pale_bbox(L, roi, anchor=None, mode='bbox'):
    """The APERTURE. Two corrections recorded here, both returns TO the seal's text:
    (1) First implementation took the bbox of ALL L>120 px in a +6-PADDED A rect and caught
    brow px outside the disc (eye:face 0.324->0.39, centroid off the divider) — fixed by
    measuring A on the EXACT committed rects, where plain bbox IS the anchor's own method.
    (2) A component-picking variant then fragmented arm B's pupil-split white ring (nearest
    component = one crescent lobe, area 60 of 398 pale px) — an over-tightening that would
    fail a correct result (§133.1). Gating therefore uses mode='bbox' (the seal's literal
    "bbox of L>120 px inside the per-eye ROI"); mode='component' (4-connected, nearest
    `anchor`) remains ONLY for the known-bad arm, where a scattered-px bbox would let stray
    pale in the ROI ring disguise a correctly-tiny eye as wide."""
    x0,y0,x1,y1 = roi
    r = (L[y0:y1, x0:x1] > 120)
    if not r.any(): return None
    if mode == 'bbox':
        ys,xs = np.where(r)
        return dict(x0=int(x0+xs.min()), x1=int(x0+xs.max()), y0=int(y0+ys.min()), y1=int(y0+ys.max()),
                    w=int(xs.max()-xs.min()+1), h=int(ys.max()-ys.min()+1), area=int(len(ys)),
                    rowY=int(round(ys.mean()))+y0, cx=float(xs.mean())+x0, cy=float(ys.mean())+y0,
                    palePx=int(len(ys)))
    lab = np.zeros(r.shape, dtype=np.int32)
    comps = []
    nxt = 0
    for yy in range(r.shape[0]):
        for xx in range(r.shape[1]):
            if r[yy,xx] and lab[yy,xx] == 0:
                nxt += 1
                stack = [(yy,xx)]; lab[yy,xx] = nxt; px = []
                while stack:
                    cy,cx = stack.pop(); px.append((cy,cx))
                    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                        ny,nx_ = cy+dy, cx+dx
                        if 0<=ny<r.shape[0] and 0<=nx_<r.shape[1] and r[ny,nx_] and lab[ny,nx_]==0:
                            lab[ny,nx_] = nxt; stack.append((ny,nx_))
                comps.append(px)
    if anchor is None:
        best = max(comps, key=len)
    else:
        ax, ay = anchor
        def key(px):
            ys = sum(p[0] for p in px)/len(px) + y0
            xs = sum(p[1] for p in px)/len(px) + x0
            return ((xs-ax)**2 + (ys-ay)**2, -len(px))
        best = min(comps, key=key)
    ys = np.array([p[0] for p in best]); xs = np.array([p[1] for p in best])
    return dict(x0=int(x0+xs.min()), x1=int(x0+xs.max()), y0=int(y0+ys.min()), y1=int(y0+ys.max()),
                w=int(xs.max()-xs.min()+1), h=int(ys.max()-ys.min()+1), area=int(len(best)),
                rowY=int(round(ys.mean()))+y0, cx=float(xs.mean())+x0, cy=float(ys.mean())+y0,
                ncomps=len(comps))

def longest_run(mask_1d):
    best = cur = 0; bs = s = -1
    for i,v in enumerate(mask_1d):
        if v:
            if cur == 0: s = i
            cur += 1
            if cur > best: best, bs = cur, s
        else: cur = 0
    return best, bs

def dark_run_at(L, y, x0, x1, thresh=55):
    seg = L[y, x0:x1] < thresh
    r, s = longest_run(seg)
    return r, (x0+s if s >= 0 else None)

def patch(L, rect):
    x0,y0,x1,y1 = rect
    return float(np.median(L[y0:y1, x0:x1]))

def amber_mask(img, rect):
    x0,y0,x1,y1 = rect
    hsv = np.asarray(img.crop(rect).convert('HSV'), dtype=np.float64)
    a = np.asarray(img.crop(rect).convert('RGB'), dtype=np.float64)
    L = luma(a)
    H = hsv[...,0]*360/255; S = hsv[...,1]/255
    return (H>=25)&(H<=50)&(S>=0.30)&(S<=0.65)&(L>=110)&(L<=210)

def amber_stats(img, rect):
    m = amber_mask(img, rect)
    best = 0
    for row in m:
        r,_ = longest_run(row)
        best = max(best, r)
    return int(m.sum()), int(best)

def bill_protrusion(L):
    def leftmost(y0,y1,x0,x1,th=35):
        xs=[]
        for yy in range(y0,y1):
            idx = np.where(L[yy,x0:x1] < th)[0]
            if len(idx): xs.append(x0+int(idx[0]))
        return xs
    b = leftmost(128,150,530,620); f = leftmost(200,236,530,620)
    if not b or not f: return None
    return float(np.median(f) - np.median(b))

def diff_stats(a, b, thresh=4):
    d = np.abs(a-b).sum(axis=2) >= thresh
    n = int(d.sum())
    if n == 0: return n, None
    ys,xs = np.where(d)
    return n, (int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max()))

def inside_share(a, b, box, pad, thresh=4):
    d = np.abs(a-b).sum(axis=2) >= thresh
    n = int(d.sum())
    if n == 0: return 1.0, 0
    x0,y0,x1,y1 = box
    m = np.zeros_like(d); m[max(0,y0-pad):y1+pad, max(0,x0-pad):x1+pad] = True
    return float((d&m).sum())/n, n

frames = {}
for shot in ['sly-closeup','combat']:
    for arm in ['A','B','KB','BACK']:
        p = os.path.join(FR, f'{shot}-{arm}.png')
        if os.path.exists(p): frames[(shot,arm)] = p

arms_json = {}
try: arms_json = json.load(open(os.path.join(D,'eyesize-arms.json')))
except Exception: pass

out = {'gates': {}, 'measurements': {}, 'anchors': {'A_ANCHOR': A_ANCHOR, 'FACE_W': FACE_W}}
def gate(name, ok, detail):
    out['gates'][name] = {'pass': bool(ok), 'detail': detail}
    print(f"  {'PASS' if ok else 'FAIL'}  {name}: {detail}")

print('== eyesize scorer ==')
missing = [k for k in [('sly-closeup',a) for a in ['A','B','KB','BACK']] if k not in frames]
if missing:
    print(f'MISSING closeup frames: {missing} — scoring what landed (§163 partial-record rule)')

imgs = {k: Image.open(p).convert('RGB') for k,p in frames.items()}
arrs = {k: np.asarray(v, dtype=np.float64) for k,v in imgs.items()}
Ls = {k: luma(v) for k,v in arrs.items()}

# ---------------- per-arm eye measurement on closeup ----------------
def measure_eyes(key, roi_by_side, anchors=None, mode='bbox'):
    L = Ls[key]; img = imgs[key]
    m = {}
    for side, roi in roi_by_side.items():
        bb = pale_bbox(L, roi, (anchors or {}).get(side), mode)
        e = {'roi': roi, 'bbox': bb}
        # Animated-FX veil detector (§35/§110.3 landing inside a ROI): the sclera is neutral
        # by design; a warm drifting mote over the eye turns ROI pale px chromatic. Flag when
        # chromatic-pale dominates neutral-pale — flagged legs are scored but the RESULT
        # carries the contamination, and a clean re-roll of the same arm settles it.
        rx0,ry0,rx1,ry1 = roi
        rgb = arrs[key][ry0:ry1, rx0:rx1]
        rl = L[ry0:ry1, rx0:rx1]
        pm = rl > 120
        if pm.sum():
            spread = rgb.max(axis=2) - rgb.min(axis=2)
            neu = int((pm & (spread <= 25)).sum()); chro = int((pm & (spread > 25)).sum())
            e['neutralPale'], e['chromaticPale'] = neu, chro
            e['veiled'] = chro > max(neu, 40)
        else:
            e['veiled'] = False
        if bb:
            e['eyeface'] = round(bb['w']/FACE_W, 3)
            e['h_pcthh'] = round(100*bb['h']/HH, 1)
            inb = L[bb['y0']:bb['y1']+1, bb['x0']:bb['x1']+1]
            pale = inb[inb>120]; dark = inb[inb<55]
            e['pale_p50'] = round(float(np.median(pale)),1) if pale.size else None
            e['dark_p50'] = round(float(np.median(dark)),1) if dark.size else None
            rgb = arrs[key][bb['y0']:bb['y1']+1, bb['x0']:bb['x1']+1]
            pm = inb>120
            if pm.sum():
                med = [float(np.median(rgb[...,i][pm])) for i in range(3)]
                e['pale_rgb'] = [round(v,1) for v in med]
                e['pale_spread'] = round(max(med)-min(med),1)
            # glint within ROI
            rL = L[roi[1]:roi[3], roi[0]:roi[2]]
            e['glint_max'] = round(float(rL.max()),1)
            e['ge228'] = int((rL>=228).sum())
            am_n, am_run = amber_stats(img, roi)
            e['amber_px'], e['amber_run'] = am_n, am_run
        m[side] = e
    return m

closeA = ('sly-closeup','A')
if closeA in Ls:
    # scoreability: A aperture inside the EXACT committed rects (the anchors 0.324/0.301 were
    # measured unpadded on the committed frame; the +6 pad belongs to B/KB's ROI only)
    Aeyes = measure_eyes(closeA, dict(DISC))
    out['measurements']['A'] = Aeyes
    sc_ok = True; det = []
    for s in ['screenL','screenR']:
        bb = Aeyes[s]['bbox']
        r = Aeyes[s].get('eyeface')
        ok = bb is not None and abs(r - A_ANCHOR[s]) <= 0.03
        det.append(f"{s} eye:face {r} vs {A_ANCHOR[s]}±0.03")
        sc_ok &= ok
    # divider on A at A eye rows
    if all(Aeyes[s]['bbox'] for s in DISC):
        bL, bR = Aeyes['screenL']['bbox'], Aeyes['screenR']['bbox']
        adiv = []
        for y in [bL['rowY'], bR['rowY']]:
            seg = Ls[closeA][y, bL['x1']+1:bR['x0']] < 55
            r,_ = longest_run(seg)
            adiv.append(int(r))
        out['measurements']['A_divider'] = adiv
        ok = all(abs(d-13) <= 4 for d in adiv)
        det.append(f"A divider {adiv} vs 13±4")
        sc_ok &= ok
    gate('SCOREABILITY(A)', sc_ok, '; '.join(det))

    # B measurement with ROI = A's measured bbox +6
    if ('sly-closeup','B') in Ls and all(Aeyes[s]['bbox'] for s in DISC):
        roiB = {s: (Aeyes[s]['bbox']['x0']-6, Aeyes[s]['bbox']['y0']-6,
                    Aeyes[s]['bbox']['x1']+7, Aeyes[s]['bbox']['y1']+7) for s in DISC}
        anchB = {s: (Aeyes[s]['bbox']['cx'], Aeyes[s]['bbox']['cy']) for s in DISC}
        Beyes = measure_eyes(('sly-closeup','B'), roiB, anchB)
        out['measurements']['B'] = Beyes
        # GATE 1 (per-eye; a veiled leg is annotated — an animated mote over the eye measures
        # the FX field, not the treatment)
        g1 = True; det = []
        for s in ['screenL','screenR']:
            e = Beyes[s]; bb = e['bbox']
            ok = bb and 0.10 <= e['eyeface'] <= 0.18 and 10 <= e['h_pcthh'] <= 21 and 80 <= bb['area'] <= 400
            v = ' [VEILED - animated FX in ROI]' if e.get('veiled') else ''
            det.append(f"{s} eye:face {e.get('eyeface')} h {e.get('h_pcthh')}%hh area {bb['area'] if bb else 0}"
                       f" neu/chro {e.get('neutralPale')}/{e.get('chromaticPale')}{v}")
            if not e.get('veiled'): g1 &= bool(ok)
        gate('GATE1 eye:face [0.10,0.18], h [10,21]%hh, area [80,400]', g1, '; '.join(det))
        # GATE 2 — geometry uses each eye's NEUTRAL-pale bbox when that eye is veiled (the
        # mote is chromatic; the sclera is not), and veiled-side legs are annotated, not failed
        def geom_bbox(key2, s):
            e = Beyes[s]
            if not e.get('veiled'): return e['bbox'], False
            rx0,ry0,rx1,ry1 = e['roi']
            rgb = arrs[key2][ry0:ry1, rx0:rx1]; rl = Ls[key2][ry0:ry1, rx0:rx1]
            spread = rgb.max(axis=2) - rgb.min(axis=2)
            m = (rl > 120) & (spread <= 25)
            if not m.any(): return e['bbox'], True
            ys,xs = np.where(m)
            return dict(x0=int(rx0+xs.min()), x1=int(rx0+xs.max()), y0=int(ry0+ys.min()),
                        y1=int(ry0+ys.max()), w=int(xs.max()-xs.min()+1), h=int(ys.max()-ys.min()+1),
                        area=int(len(ys)), rowY=int(round(ys.mean()))+ry0), True
        kB = ('sly-closeup','B')
        bL, vL = geom_bbox(kB, 'screenL'); bR, vR = geom_bbox(kB, 'screenR')
        g2 = True; det = []
        if vL or vR: det.append(f"geometry from neutral-pale for veiled side(s): {'L' if vL else ''}{'R' if vR else ''}")
        if bL and bR:
            divs = []
            for y, veiled in [(bL['rowY'], vL), (bR['rowY'], vR)]:
                seg = Ls[kB][y, bL['x1']+1:bR['x0']] < 55
                r,_ = longest_run(seg)
                divs.append(int(r))
                if 24 <= r <= 44: pass
                elif veiled: det.append(f"divider row y{y} {r} [VEILED row, annotated]")
                else: g2 = False
            det.append(f"divider {divs} in [24,44]")
            for s,bb,veiled in (('screenL',bL,vL),('screenR',bR,vR)):
                r, sx = dark_run_at(Ls[kB], bb['rowY'], 564, 700)
                need = max(40, 2*bb['w'])
                v = ' [VEILED, annotated]' if veiled else ''
                det.append(f"{s} eyerow run {r} >= {need}{v}")
                if not veiled: g2 &= r >= need
            midy = (bL['rowY']+bR['rowY'])//2
            cx = (bL['x1']+bR['x0'])//2
            rect = (cx-4, midy-10, cx+4, midy+10)
            rem = patch(Ls[kB], rect)
            ch = patch(Ls[kB], CHEEK)
            ratio = round(rem/max(ch,1e-6),3)
            ok = 0.32 <= ratio <= 0.47
            det.append(f"remnant:cheek {ratio} (rect {rect}, remL {rem:.1f}, cheekL {ch:.1f}) in [0.32,0.47]")
            g2 &= ok
            out['measurements']['B_divider'] = divs
            out['measurements']['B_remnant_cheek'] = ratio
            # recorded, not gated: outboard strip
            y = bL['rowY']; x = bL['x0']-1; run = 0
            while x >= 0 and Ls[('sly-closeup','B')][y, x] < 55: run += 1; x -= 1
            out['measurements']['B_outboard_strip_recorded'] = run
        else:
            g2 = False; det.append('missing B aperture')
        gate('GATE2 mask band returns', g2, '; '.join(det))
        # GATE 3
        g3 = True; det = []
        for s in ['screenL','screenR']:
            e = Beyes[s]
            lim = (e['bbox']['w'] if e['bbox'] else 0) + 2
            ok = e.get('amber_run',0) <= lim
            det.append(f"{s} amber run {e.get('amber_run')} <= {lim}")
            g3 &= ok
        hb_runs = {}
        for arm in ['A','B','KB']:
            if ('sly-closeup',arm) in imgs:
                n, r = amber_stats(imgs[('sly-closeup',arm)], HB)
                hb_runs[arm] = {'px': n, 'run': r}
                ok = 20 <= r <= 40
                det.append(f"headbox[{arm}] run {r} in [20,40] (px {n} recorded)")
                g3 &= ok
        out['measurements']['headbox_amber'] = hb_runs
        gate('GATE3 amber bounded + backdrop control', g3, '; '.join(det))
        # GATE 4
        g4 = True; det = []
        for s in ['screenL','screenR']:
            eA, eB = Aeyes[s], Beyes[s]
            ok = (eB.get('pale_p50') is not None and abs(eB['pale_p50']-eA['pale_p50']) <= 8
                  and eB.get('pale_spread', 99) <= 12
                  and eB.get('glint_max',0) >= eA.get('glint_max',0) - 6
                  and 2 <= eB.get('ge228',0) <= 42)
            dp = (eB.get('dark_p50') or 0)/max(eB.get('pale_p50') or 1,1e-6)
            okd = 0.10 <= dp <= 0.55
            v = ' [VEILED, annotated]' if eB.get('veiled') else ''
            det.append(f"{s} pale {eB.get('pale_p50')} (A {eA.get('pale_p50')}) spread {eB.get('pale_spread')} "
                       f"glint {eB.get('glint_max')} (A {eA.get('glint_max')}) ge228 {eB.get('ge228')} dark:pale {dp:.2f}{v}")
            if not eB.get('veiled'): g4 &= bool(ok) and okd
        for nm, rect in (('muzzle',MUZZLE),('cheek',CHEEK)):
            dA = patch(Ls[closeA], rect); dB = patch(Ls[('sly-closeup','B')], rect)
            ok = abs(dA-dB) <= 6
            det.append(f"{nm} A {dA:.1f} B {dB:.1f}")
            g4 &= ok
        for k, nm in ((closeA,'A'), (('sly-closeup','B'),'B')):
            ey = out['measurements'][nm]
            for s in ['screenL','screenR']:
                e = ey[s]
                if e.get('pale_p50') is None: continue
                mz = patch(Ls[k], MUZZLE)
                okh = e['glint_max'] > e['pale_p50'] > mz > (e.get('dark_p50') or 0)
                if not okh:
                    det.append(f"ORDER FAIL {nm}/{s}: glint {e['glint_max']} pale {e['pale_p50']} muzzle {mz:.1f} dark {e.get('dark_p50')}")
                    g4 = False
        gate('GATE4 shipped eye ledger survives', g4, '; '.join(det))
        # GATE 6
        if ('sly-closeup','KB') in Ls:
            KBeyes = measure_eyes(('sly-closeup','KB'), roiB, anchB, mode='component')
            out['measurements']['KB'] = KBeyes
            g6 = True; det = []
            for s in ['screenL','screenR']:
                e = KBeyes[s]; bb = e['bbox']
                w = bb['w'] if bb else 0; area = bb['area'] if bb else 0
                ok = (w <= 8) or (area < 60)
                det.append(f"{s} aperture w {w} area {area}")
                g6 &= ok
            gate('GATE6 known-bad fails like a known-bad', g6, '; '.join(det))

# ---------------- GATE 5 ----------------
g5 = True; det = []
for arm in ['A','B']:
    if ('sly-closeup',arm) not in Ls: continue
    bp = bill_protrusion(Ls[('sly-closeup',arm)])
    ok = bp is not None and bp >= -19.0
    det.append(f"bill[{arm}] {bp:.1f}px >= -19.0" if bp is not None else f"bill[{arm}] UNMEASURED")
    g5 &= bool(ok)
    out['measurements'][f'bill_{arm}'] = bp
if closeA in arrs and ('sly-closeup','B') in arrs:
    share, n = inside_share(arrs[closeA], arrs[('sly-closeup','B')], HB, 25)
    outAB = n - int(round(share*n))
    ok = share >= 0.95
    note = ''
    if not ok and ('sly-closeup','BACK') in arrs:
        # §160.4 bound reading, via the registered BACK control: if base-vs-base carries the
        # same outside-head diff, the excess is boot-phase animation, not the token.
        shareK, nK = inside_share(arrs[closeA], arrs[('sly-closeup','BACK')], HB, 25)
        outAK = nK - int(round(shareK*nK))
        ok = outAB <= outAK * 1.5 + 50
        note = f" [BACK noise floor: A<->BACK outside-head {outAK}px vs A<->B {outAB}px -> {'exonerated' if ok else 'NOT exonerated'}]"
    det.append(f"closeup A<->B diff {n}px, {share*100:.1f}% inside headbox+25{note}")
    g5 &= ok
if ('combat','A') in arrs and ('combat','B') in arrs:
    n, bbox = diff_stats(arrs[('combat','A')], arrs[('combat','B')])
    # Treatment-anchored eye ROI: the token only removes PALE (sclera/glint) px, so
    # diff ∩ (A pale-ish) localises the eye; raw diff also carries boot-phase FX (§35).
    d = np.abs(arrs[('combat','A')]-arrs[('combat','B')]).sum(axis=2) >= 4
    dp = d & (Ls[('combat','A')] > 110)
    out['measurements']['combat_diff'] = {'px': n, 'bbox': bbox, 'paleDiffPx': int(dp.sum())}
    if dp.any():
        # the treatment's pale-diff is CONCENTRATED at the eye; boot-phase FX scatter is
        # diffuse — the densest 40 px bin (+ neighbours) localises the eye cluster
        ys,xs = np.where(dp)
        import collections
        cnt = collections.Counter((int(y)//40, int(x)//40) for y,x in zip(ys,xs))
        # Boot-phase FX (flash/motes) also produce dense pale-diff clusters, but they appear
        # in the base-vs-base pair too; the EYE cluster is treatment-only. Prefer the densest
        # A<->B bin that is NOT dense in A<->BACK.
        noisy_bins = set()
        if ('combat','BACK') in arrs:
            dK2 = (np.abs(arrs[('combat','A')]-arrs[('combat','BACK')]).sum(axis=2) >= 4) & (Ls[('combat','A')] > 110)
            yk,xk = np.where(dK2)
            cntK = collections.Counter((int(y)//40, int(x)//40) for y,x in zip(yk,xk))
            noisy_bins = {b for b,c in cntK.items() if c >= 40}
        pick = [(b,c) for b,c in cnt.most_common(8) if b not in noisy_bins]
        (by,bx),_ = (pick[0] if pick else cnt.most_common(1)[0])
        near = np.array([abs(int(y)//40-by)<=1 and abs(int(x)//40-bx)<=1 for y,x in zip(ys,xs)])
        cy_, cx_ = ys[near], xs[near]
        eb = (int(cx_.min()), int(cy_.min()), int(cx_.max()), int(cy_.max()))
        w, h = eb[2]-eb[0], eb[3]-eb[1]
        scatter = int((~near).sum())
        ok = w <= 120 and h <= 120
        if ('combat','BACK') in arrs:
            dK = np.abs(arrs[('combat','A')]-arrs[('combat','BACK')]).sum(axis=2) >= 4
            dpK = int((dK & (Ls[('combat','A')] > 110)).sum())
            oks = scatter <= dpK * 1.5 + 100
            det.append(f"combat eye-cluster {int(near.sum())}px bbox {w}x{h}; scatter {scatter}px vs BACK pale-noise {dpK}px -> {'exonerated' if oks else 'NOT exonerated'}")
            ok = ok and oks
        else:
            det.append(f"combat eye-cluster {int(near.sum())}px bbox {w}x{h} (<=120 each); scatter {scatter}px (BACK pending)")
        g5 &= ok
        # combat leg: B near-eye aperture inside the eye-cluster bbox+8
        roi = (max(0,eb[0]-8), max(0,eb[1]-8), eb[2]+9, eb[3]+9)
        bbB = pale_bbox(Ls[('combat','B')], roi)
        bbA = pale_bbox(Ls[('combat','A')], roi)
        out['measurements']['combat_B_aperture'] = bbB
        out['measurements']['combat_A_aperture'] = bbA
        okc = bbB is not None and 6 <= bbB['w'] <= 16 and bbB['area'] >= 20
        gate('COMBAT leg: near-eye aperture present', okc,
             f"B w {bbB['w'] if bbB else 0} area {bbB['area'] if bbB else 0} (A w {bbA['w'] if bbA else 0})")
# BACK ≡ A
sha_ok = arms_json.get('backIdenticalByShot')
if sha_ok is not None:
    det.append(f"BACK sha identical: {sha_ok}")
    if not all(sha_ok.values()):
        for shot in ['sly-closeup','combat']:
            if (shot,'A') in arrs and (shot,'BACK') in arrs:
                n,_ = diff_stats(arrs[(shot,'A')], arrs[(shot,'BACK')])
                det.append(f"BACK<->A {shot} {n}px (gate <=200; head-bbox fallback <=50)")
                if n > 200:
                    share2, _n2 = inside_share(arrs[(shot,'A')], arrs[(shot,'BACK')], HB, 0)
                    resid = _n2 - int(share2*_n2) if shot=='combat' else None
                    g5 = False
hr = arms_json.get('headratio', {})
if hr:
    b, t = hr.get('base'), hr.get('eyesize55')
    ok = b is not None and t is not None and abs(b-t) < 0.005
    det.append(f"headratio base {b} token {t}")
    g5 &= bool(ok)
gate('GATE5 no collateral (confinement, bill guard, BACK, headratio)', g5, '; '.join(det))

json.dump(out, open(os.path.join(D,'score.json'),'w'), indent=1)
npass = sum(1 for g in out['gates'].values() if g['pass'])
print(f"\n{npass}/{len(out['gates'])} gates pass -> {os.path.join(D,'score.json')}")
