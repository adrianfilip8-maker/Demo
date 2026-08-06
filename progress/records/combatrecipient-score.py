#!/usr/bin/env python3
"""Scorer for PREREG-combatrecipient.md.

Every band below is copied from the sealed prereg §2 and is NOT a parameter of this script:
if a number here disagrees with the prereg, the prereg wins and this file is wrong.

Instrument provenance (§13): this scorer reproduces SEVEN of CRITIC-sbs3's seven published
`combat` numbers EXACTLY on progress/records/sbs3/combat.png — figure-box medL 119.98,
medSat 0.435, chalk 9,122 px / 9.05%, blue 22 px, flash-core median RGB [178,120,87],
medL 129.8 / mean R-B +88.2, frame L>200&sat<0.15 131 px. `--selftest` re-runs that check.

  python3 combatrecipient-score.py --selftest
  python3 combatrecipient-score.py            # scores whatever arms are on disk
"""
import json
import os
import sys
import numpy as np
from PIL import Image

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'combatrecipient1')
SBS3 = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sbs3', 'combat.png')
W, H = 1280, 720
FRAME = W * H

# ---- sealed constants (PREREG-combatrecipient §2) ---------------------------------------
FLASH_C, FLASH_R = (452, 433), 24
RECIPBOX = (307, 308, 543, 743)
SLYBOX = (470, 315, 690, 700)
DIFF_T = 4                      # ΣRGB ≥ 4 — stated with every count (§122.1)
P1_AREA, P1_CENTRE, P1_TOL = 20000, (425, 525), 60
P1B_BOX = (237, 238, 613, 813)
P2_MIN, P2_KB_MAX = 0.80, 0.15
P2B_MIN = 0.04
P3_MAX, P3B_MIN = 0.30, 3000
P4_MAX_PX = int(0.005 * FRAME)  # 4,608
P4B_MAX_CC = 3000
B1_BAND, B2_BAND = (112.0, 128.0), (78.0, 98.0)
B3_MAX_OUTSIDE = 0.04
STAND = (0.102, 0.0, 29.035)
PF8_MAX = 0.30


def load(p):
    return np.asarray(Image.open(p).convert('RGB')).astype(np.int32)


def luma(im):
    return 0.2126 * im[..., 0] + 0.7152 * im[..., 1] + 0.0722 * im[..., 2]


def sat(im):
    mx, mn = im.max(-1), im.min(-1)
    return np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-9), 0.0)


def hue(im):
    f = im / 255.0
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    mx, mn = f.max(-1), f.min(-1)
    c = mx - mn
    h = np.zeros_like(r)
    m = (c > 0) & (mx == r); h[m] = ((g - b)[m] / c[m]) % 6
    m = (c > 0) & (mx == g); h[m] = ((b - r)[m] / c[m]) + 2
    m = (c > 0) & (mx == b); h[m] = ((r - g)[m] / c[m]) + 4
    return h * 60


def diffmask(a, b, t=DIFF_T):
    return np.abs(a - b).sum(-1) >= t


def disc(c=FLASH_C, r=FLASH_R):
    yy, xx = np.mgrid[0:H, 0:W]
    return (xx - c[0]) ** 2 + (yy - c[1]) ** 2 <= r * r


def boxmask(bx):
    x0, y0, x1, y1 = bx
    m = np.zeros((H, W), bool)
    m[max(0, y0):min(H, y1), max(0, x0):min(W, x1)] = True
    return m


def components(mask, min_area=200):
    """4-connected components by iterative flood fill. No scipy in this container; written
    plainly rather than cleverly because a component labeller that is subtly wrong would
    silently change P1 and P4b, which are the two gates that decide the seal."""
    lab = np.zeros(mask.shape, np.int32)
    out, n = [], 0
    ys, xs = np.nonzero(mask)
    for sy, sx in zip(ys, xs):
        if lab[sy, sx]:
            continue
        n += 1
        stack = [(sy, sx)]
        lab[sy, sx] = n
        px = []
        while stack:
            y, x = stack.pop()
            px.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] \
                        and mask[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n
                    stack.append((ny, nx))
        if len(px) >= min_area:
            a = np.array(px)
            out.append(dict(area=len(px),
                            y0=int(a[:, 0].min()), y1=int(a[:, 0].max()),
                            x0=int(a[:, 1].min()), x1=int(a[:, 1].max()),
                            cy=float(a[:, 0].mean()), cx=float(a[:, 1].mean())))
    out.sort(key=lambda d: -d['area'])
    return out


def slymask(base):
    """Sly's own warm body population, computed on the BASE arm where no guard exists, so it
    cannot be contaminated by the recipient's own linen (which is warm too)."""
    hu, sa, lu = hue(base), sat(base), luma(base)
    m = boxmask(SLYBOX) & (hu >= 8) & (hu <= 48) & (sa > 0.25) & (lu >= 35) & (lu <= 205)
    return m


def selftest():
    if not os.path.exists(SBS3):
        print('SELFTEST SKIPPED — sbs3/combat.png absent'); return False
    im = load(SBS3)
    lu, sa, hu = luma(im), sat(im), hue(im)
    fig = (slice(390, 670), slice(360, 720))
    core = (slice(280, 400), slice(300, 520))
    checks = [
        ('figure medL', round(float(np.median(lu[fig])), 2), 119.98),
        ('figure medSat', round(float(np.median(sa[fig])), 3), 0.435),
        ('chalk px', int(((lu[fig] > 150) & (sa[fig] < 0.30)).sum()), 9122),
        ('blue px', int(((hu[fig] >= 200) & (hu[fig] <= 250) & (sa[fig] > 0.35) & (lu[fig] > 60)).sum()), 22),
        ('core medR', int(np.median(im[core][..., 0])), 178),
        ('core medG', int(np.median(im[core][..., 1])), 120),
        ('core medB', int(np.median(im[core][..., 2])), 87),
        ('core meanR-B', round(float(np.mean(im[core][..., 0] - im[core][..., 2])), 1), 88.2),
        ('frame L>200 sat<.15', int(((lu > 200) & (sa < 0.15)).sum()), 131),
    ]
    ok = True
    print('--- SELFTEST vs CRITIC-sbs3 published combat numbers ---')
    for name, got, want in checks:
        good = abs(got - want) <= (0.01 if isinstance(want, float) else 0)
        ok &= good
        print(f'  {name:22s} got {got!s:>10s}  want {want!s:>10s}  {"ok" if good else "MISMATCH"}')
    print(f'  => instrument {"CALIBRATED" if ok else "NOT CALIBRATED — do not score"}')
    return ok


def png(shot, arm):
    return os.path.join(DIR, f'{shot}-{arm}.png')


def have(shot, arm):
    return os.path.exists(png(shot, arm))


def tele(arm):
    p = os.path.join(DIR, f'telemetry-{arm}.json')
    return json.load(open(p)) if os.path.exists(p) else None


def gate(name, val, ok, band):
    print(f'  {name:8s} {str(val):>28s}   band {band:<26s} {"PASS" if ok else "**FAIL**"}')
    return ok


def main():
    if '--selftest' in sys.argv:
        sys.exit(0 if selftest() else 1)
    cal = selftest()
    print()
    arms = sorted({f.rsplit('-', 1)[1][:-4] for f in os.listdir(DIR)
                   if f.endswith('.png')}) if os.path.isdir(DIR) else []
    print(f'arms on disk: {arms or "(none)"}\n')
    if not have('combat', 'base'):
        print('base combat frame absent — nothing to score.'); return

    base = load(png('combat', 'base'))
    lu, sa = luma(base), sat(base)
    fig = (slice(390, 670), slice(360, 720))
    core = (slice(280, 400), slice(300, 520))
    b1 = float(np.median(lu[fig]))
    b2 = float(np.mean(base[core][..., 0] - base[core][..., 2]))
    print('--- BASE GATES (VOID, not FAIL, if out) ---')
    gate('B1', f'figure medL {b1:.2f}', B1_BAND[0] <= b1 <= B1_BAND[1], f'[{B1_BAND[0]}, {B1_BAND[1]}]')
    gate('B2', f'core meanR-B {b2:+.1f}', B2_BAND[0] <= b2 <= B2_BAND[1], f'[+{B2_BAND[0]}, +{B2_BAND[1]}]')
    tb = tele('base')
    if tb:
        hits = tb['shots'].get('combat', {}).get('derived', {}).get('spawnHits', {})
        md = tb['shots'].get('combat', {}).get('derived', {}).get('minDistToStand')
        print(f'  B3 tele  base minDist(stand) = {md} m   (no guard should be near the stand)')
    SM = slymask(base)
    print(f'  SLYMASK_A = {int(SM.sum())} px  (P3b needs >= {P3B_MIN})')
    D = disc()

    for arm in ('cand', 'norestore', 'kbside'):
        if not have('combat', arm):
            continue
        print(f'\n--- combat: base vs {arm} ---')
        a = load(png('combat', arm))
        dm = diffmask(base, a)
        tot = int(dm.sum())
        print(f'  frame-wide differing px (SumRGB>=4) = {tot}  ({100*tot/FRAME:.2f}% of frame)')
        cc = components(dm, min_area=500)
        if cc:
            c = cc[0]
            print(f'  largest component: area {c["area"]} bbox ({c["x0"]},{c["y0"]})-({c["x1"]},{c["y1"]})'
                  f' centroid ({c["cx"]:.0f},{c["cy"]:.0f})')
        p2 = float(dm[D].mean())
        ink = float((luma(a)[D] < 45).mean())
        if arm == 'cand':
            ok1 = bool(cc) and cc[0]['area'] >= P1_AREA and \
                abs(cc[0]['cx'] - P1_CENTRE[0]) <= P1_TOL and abs(cc[0]['cy'] - P1_CENTRE[1]) <= P1_TOL
            gate('P1', f'area {cc[0]["area"] if cc else 0}', ok1,
                 f'>= {P1_AREA}, centre +-{P1_TOL}')
            ok1b = bool(cc) and cc[0]['x0'] >= P1B_BOX[0] and cc[0]['y0'] >= P1B_BOX[1] \
                and cc[0]['x1'] <= P1B_BOX[2] and cc[0]['y1'] <= P1B_BOX[3]
            gate('P1b', 'bbox inside RECIPBOX+70', ok1b, str(P1B_BOX))
            gate('P2', f'flash-disc changed {p2:.3f}', p2 >= P2_MIN, f'>= {P2_MIN}')
            gate('P2b', f'flash-disc ink {ink:.3f}', ink >= P2B_MIN, f'>= {P2B_MIN} (weak, reported)')
            n = int(SM.sum())
            p3 = float((dm & SM).sum()) / max(1, n)
            gate('P3b', f'|SLYMASK_A| {n}', n >= P3B_MIN, f'>= {P3B_MIN}')
            gate('P3', f'Sly changed share {p3:.3f}', p3 <= P3_MAX, f'<= {P3_MAX}')
        elif arm == 'kbside':
            gate('KB-P1', f'area {cc[0]["area"] if cc else 0}',
                 bool(cc) and cc[0]['area'] >= P1_AREA, f'>= {P1_AREA} (a guard IS present)')
            gate('KB-P2', f'flash-disc changed {p2:.3f}', p2 <= P2_KB_MAX,
                 f'<= {P2_KB_MAX} (must NOT be on target)')
        if arm == 'norestore' and have('combat', 'cand'):
            c2 = load(png('combat', 'cand'))
            d0 = int(diffmask(c2, a).sum())
            gate('P-F5', f'cand vs norestore {d0} px', d0 == 0, '== 0 (Edit 2 inert on combat)')

    if have('combat', 'restore'):
        r = load(png('combat', 'restore'))
        d0 = int(diffmask(base, r).sum())
        gate('P-F6', f'base vs restore {d0} px', d0 == 0, '== 0 (boot determinism)')

    # ---- P4: the residue leg -------------------------------------------------------------
    if have('sly-profile', 'base'):
        pb = load(png('sly-profile', 'base'))
        for arm in ('cand', 'norestore'):
            if not have('sly-profile', arm):
                continue
            print(f'\n--- sly-profile: base vs {arm} (residue) ---')
            pa = load(png('sly-profile', arm))
            dm = diffmask(pb, pa)
            tot = int(dm.sum())
            cc = components(dm, min_area=500)
            top = cc[0]['area'] if cc else 0
            print(f'  differing px {tot} ({100*tot/FRAME:.2f}%)  largest component {top}'
                  + (f' bbox ({cc[0]["x0"]},{cc[0]["y0"]})-({cc[0]["x1"]},{cc[0]["y1"]})' if cc else ''))
            if arm == 'cand':
                gate('P4', f'{tot} px', tot <= P4_MAX_PX, f'<= {P4_MAX_PX} (0.5% of frame)')
                gate('P4b', f'largest cc {top}', top < P4B_MAX_CC, f'< {P4B_MAX_CC}')
            else:
                gate('KB-P4', f'{tot} px', tot > P4_MAX_PX,
                     f'> {P4_MAX_PX} (known-bad MUST regress)')

    # ---- P4c / P4d / P-F8: telemetry (PLUMBING CHECKS, not results — see prereg P-F9) -----
    print('\n--- telemetry (plumbing checks; pixels win any disagreement) ---')
    for arm in ('base', 'cand', 'norestore', 'kbside', 'restore'):
        t = tele(arm)
        if not t:
            continue
        print(f'  [{arm}] srcTree {t.get("srcTree")}')
        for shot, s in t.get('shots', {}).items():
            d = s.get('derived', {})
            hits = {k: len(v) for k, v in (d.get('spawnHits') or {}).items() if v}
            lp = d.get('lockPos')
            extra = ''
            if shot == 'combat' and lp:
                off = ((lp[0] - STAND[0]) ** 2 + (lp[2] - STAND[2]) ** 2) ** 0.5
                extra = f'  stand {lp} off-prediction {off:.3f} m ' \
                        f'{"(P-F8 ok)" if off <= PF8_MAX else "**P-F8 FIRES**"}'
            print(f'    {shot:12s} lock={s.get("guards",{}).get("lock")} '
                  f'minDist(stand)={d.get("minDistToStand")} spawnHits={hits or "none"}{extra}')
            if shot == 'sly-profile' and arm in ('cand', 'norestore'):
                md = d.get('minDistToStand')
                gate('P4c' if arm == 'cand' else 'KB-P4c', f'minDist(stand) {md} m',
                     (md is not None and md >= 2.0) if arm == 'cand'
                     else (md is not None and md <= 0.5),
                     '>= 2.0 m' if arm == 'cand' else '<= 0.5 m')
                gate('P4d' if arm == 'cand' else 'KB-P4d', f'spawnHits {hits or "none"}',
                     (not hits) if arm == 'cand' else bool(hits),
                     'no viewport overlap in any of 5' if arm == 'cand' else 'overlaps expected')
    if not cal:
        print('\n!! instrument did not calibrate — treat every number above as unverified')


if __name__ == '__main__':
    main()
