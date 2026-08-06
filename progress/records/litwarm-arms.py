#!/usr/bin/env python3
"""
litwarm-arms.py — rebuild PREREG-litwarm's candidate as an INSTALLABLE ARM, not a tree edit.

§194 is why this file exists. The seven-edit ship shape was applied once, as an uncommitted
working-tree edit, captured against at 03:53, and destroyed by a rollback. `git log -S'_sssPinned'`
on ToonMaterial.js returns nothing: it was never in a commit, so it never survived one. A change
becomes permanent at the commit, not at the edit (§188.4) — and this generator IS that commit.

It also fixes the delivery mechanism, not just the loss. The original dispatch put the candidate
in `src/` for the duration of the capture, which is §186's contamination hazard: the FIFO runs
20–60 minutes deep and the bundler reads the tree at boot, so every other owner's capture in that
window would have silently rendered an unscored candidate. This generator follows
`combatrecipient-arms.py`'s proven contract instead — the runner does
`acquire → install → boot → capture → revert → release`, so the candidate exists only while the
lock is held, and `revert` runs from a `finally`.

RECONSTRUCTION PROVENANCE — this is not written from memory. Four of the seven edits are recovered
VERBATIM from `banda-diag.mjs`'s committed drift guard, which asserts the shipped lines by exact
string (that guard was written to catch drift and turned out to be the backup):
    needLine('toonMat', 'sssNightPin: clamp(num(opts.sssNightPin, num(opts.sss, TUNE.sss)), 0, 1),')
    needLine('toonMat', 'd.slyUniforms.uSss.value = d.slySss + (d.slySssNightPin - d.slySss) * n;')
    needLine('toonMat', 'for (let i = 0; i < this._sssPinned.length; i++) this._publishSssPin(this._sssPinned[i]);')
    needLine('toonMat', 'r3(o.sss), r3(o.sssNightPin), o.wrapColor')
    need('arch', /sss:\\s*(0\\.30),\\n\\s*sssNightPin/) and /sssNightPin:\\s*(0\\.0),/
The remaining three (the `_sssPinned` field, the enrolment, the method body) are reconstructed from
`RESULT-litwarm`'s ship-shape table, which gives file, line and intent for each. Installing an arm
and running `banda-diag.mjs` re-asserts all of them — if this reconstruction is wrong anywhere the
guard says so by name, which is the check that makes the reconstruction safe to trust.

ARMS
  base      byte-identical to the shipped tree (the seal's `base` arm)
  cand      the full seven-edit candidate: arch sss 0.30 + sssNightPin 0.0, and the gate
  KBover    arch sss 0.45 — BANDS-LW's over-wrap known-bad (must fail S3 on its own)
  KBnull    arch sss 0.0 WITH the gate present — the poke-exactness calibration; must be
            bit-identical to base in every frame, since the wrap term multiplies by exactly 0
  restore   byte-identical to base; P-F4's determinism control

usage: litwarm-arms.py [check|install <arm>|revert|build [outdir]]
"""
import hashlib
import os
import sys

ROOT = '/home/user/Demo'
TOON = os.path.join(ROOT, 'src/render/ToonMaterial.js')
ARCH = os.path.join(ROOT, 'src/world/Architecture.js')
HERE = os.path.dirname(os.path.abspath(__file__))

# Base shas, taken from the tree at reconstruction time (2026-08-06, srcTree 4c83af2068ab9936).
BASE_SHA = {
    TOON: '38db1c1e0d8e81b7037274cabfab48bfffb35c2dc2186ff1b150b05d16c9dfc2',
    ARCH: 'fc7b6b2737ed3192a82be8a42edc8a48c0a4aab93efd4b6371cdf140f59746c9',
}


def sha(t):
    return hashlib.sha256(t.encode()).hexdigest()


def read(p):
    return open(p).read()


def sub1(txt, old, new, what):
    """Replace exactly once, or fail loudly. A silent 0- or 2-hit replace is how a generator
       ships a candidate that is not the one its seal describes."""
    n = txt.count(old)
    if n != 1:
        sys.exit(f'ANCHOR FAIL [{what}]: expected exactly 1 occurrence, found {n}\n  {old[:90]}')
    return txt.replace(old, new, 1)


# ── the seven edits ────────────────────────────────────────────────────────────────────────────

A_SSS_OLD = '          sss: 0.0,\n'
T_OPT_OLD = '      sss: clamp(num(opts.sss, TUNE.sss), 0, 1),\n'
T_OPT_NEW = (
    '      sss: clamp(num(opts.sss, TUNE.sss), 0, 1),\n'
    '      /* litwarm G — defaults to `sss`, so a caller that does not ask for a pin is NOT\n'
    '         enrolled and nothing is written per frame. The gate is opt-in by construction. */\n'
    '      sssNightPin: clamp(num(opts.sssNightPin, num(opts.sss, TUNE.sss)), 0, 1),\n')
T_KEY_OLD = '      r3(o.sss), o.wrapColor, r3(o.ao), r3(o.haze),\n'
T_KEY_NEW = '      r3(o.sss), r3(o.sssNightPin), o.wrapColor, r3(o.ao), r3(o.haze),\n'
T_CTOR_OLD = '    this._inkNight = 0;            // see setInkNight(); 0 = ink is bit-identical to shipping\n'
T_CTOR_NEW = (
    '    this._inkNight = 0;            // see setInkNight(); 0 = ink is bit-identical to shipping\n'
    '    this._sssPinned = [];          // litwarm G — only materials that DECLARED a night pin\n')
T_ENROL_OLD = '    mat.userData.slyUniforms = own;\n'
T_ENROL_NEW = (
    '    mat.userData.slyUniforms = own;\n'
    '    /* litwarm G: enrol only when the caller declared a pin different from `sss`, and publish\n'
    '       once here so a material built while it is already night is correct on its FIRST frame\n'
    '       rather than on the first setKeyLight after it. */\n'
    '    mat.userData.slySss = o.sss;\n'
    '    mat.userData.slySssNightPin = o.sssNightPin;\n'
    '    if (o.sssNightPin !== o.sss) { this._sssPinned.push(mat); this._publishSssPin(mat); }\n')
T_PUB_OLD = '  setKeyLight({ direction, color, intensity, ambient, rim, shadowMatrix, nightAmount } = {}) {\n'
T_PUB_NEW = (
    '  /* litwarm G — the night gate. `_inkNight` is set from `nightAmount` at the top of\n'
    '     setKeyLight, so at nightAmount 1 this returns `slySssNightPin` exactly (a + (b-a)*1 === b\n'
    '     in IEEE754 for finite a,b) and at 0 it returns `slySss` exactly. */\n'
    '  _publishSssPin(mat) {\n'
    '    const d = mat.userData, n = Math.min(1, Math.max(0, this._inkNight));\n'
    '    d.slyUniforms.uSss.value = d.slySss + (d.slySssNightPin - d.slySss) * n;\n'
    '  }\n'
    '\n'
    '  setKeyLight({ direction, color, intensity, ambient, rim, shadowMatrix, nightAmount } = {}) {\n')
T_LOOP_OLD = (
    '      u.uSubjWarmShade.value = TUNE.subjWarmShade +\n'
    '        (TUNE.subjWarmShadeNightPin - TUNE.subjWarmShade) * Math.min(1, Math.max(0, nightAmount));\n')
T_LOOP_NEW = (
    '      u.uSubjWarmShade.value = TUNE.subjWarmShade +\n'
    '        (TUNE.subjWarmShadeNightPin - TUNE.subjWarmShade) * Math.min(1, Math.max(0, nightAmount));\n'
    '      /* litwarm G rides banda2\'s own nightAmount slot. One length check on a shipped frame;\n'
    '         the array is empty unless some caller declared a pin. */\n'
    '      for (let i = 0; i < this._sssPinned.length; i++) this._publishSssPin(this._sssPinned[i]);\n')


def gate(toon):
    """The six ToonMaterial edits — present in every arm except `base`/`restore`."""
    t = sub1(toon, T_OPT_OLD, T_OPT_NEW, 'sssNightPin option')
    t = sub1(t, T_KEY_OLD, T_KEY_NEW, 'cache key')
    t = sub1(t, T_CTOR_OLD, T_CTOR_NEW, '_sssPinned field')
    t = sub1(t, T_ENROL_OLD, T_ENROL_NEW, 'enrolment + build-time publish')
    t = sub1(t, T_PUB_OLD, T_PUB_NEW, '_publishSssPin method')
    t = sub1(t, T_LOOP_OLD, T_LOOP_NEW, 'publish loop in setKeyLight')
    return t


def arch_at(arch, value):
    return sub1(arch, A_SSS_OLD,
                f'          sss: {value},\n          sssNightPin: 0.0,\n', f'Architecture sss {value}')


def arms(toon, arch):
    g = gate(toon)
    return {
        'base':    (toon, arch),
        'restore': (toon, arch),
        'cand':    (g, arch_at(arch, '0.30')),
        'KBover':  (g, arch_at(arch, '0.45')),
        'KBnull':  (g, arch_at(arch, '0.0')),
    }


def unedit(toon, arch):
    """Inverse of the edits, so `revert` works from any installed arm without stashing base."""
    t = toon
    for new, old in ((T_LOOP_NEW, T_LOOP_OLD), (T_PUB_NEW, T_PUB_OLD), (T_ENROL_NEW, T_ENROL_OLD),
                     (T_CTOR_NEW, T_CTOR_OLD), (T_KEY_NEW, T_KEY_OLD), (T_OPT_NEW, T_OPT_OLD)):
        t = t.replace(new, old, 1)
    a = arch
    for v in ('0.30', '0.45', '0.0'):
        a = a.replace(f'          sss: {v},\n          sssNightPin: 0.0,\n', A_SSS_OLD, 1)
    return t, a


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'check'
    cur_t, cur_a = read(TOON), read(ARCH)
    at_base = sha(cur_t) == BASE_SHA[TOON] and sha(cur_a) == BASE_SHA[ARCH]

    if cmd == 'check':
        rt, ra = unedit(cur_t, cur_a)
        clean = sha(rt) == BASE_SHA[TOON] and sha(ra) == BASE_SHA[ARCH]
        which = [n for n, (t, a) in arms(rt, ra).items()
                 if t == cur_t and a == cur_a] if clean else []
        print(f'ToonMaterial.js  sha {sha(cur_t)[:16]}  ({"BASE" if sha(cur_t) == BASE_SHA[TOON] else "modified"})')
        print(f'Architecture.js  sha {sha(cur_a)[:16]}  ({"BASE" if sha(cur_a) == BASE_SHA[ARCH] else "modified"})')
        print(f'  reverts to base cleanly: {clean}')
        print(f'  matches arm: {which or "(none / base)"}')
        return

    if cmd == 'revert':
        rt, ra = unedit(cur_t, cur_a)
        if sha(rt) != BASE_SHA[TOON] or sha(ra) != BASE_SHA[ARCH]:
            sys.exit('REFUSING: inverse edit does not land on base. Something else changed these '
                     'files; revert by hand.\n'
                     f'  ToonMaterial {sha(rt)[:16]} want {BASE_SHA[TOON][:16]}\n'
                     f'  Architecture {sha(ra)[:16]} want {BASE_SHA[ARCH][:16]}')
        open(TOON, 'w').write(rt)
        open(ARCH, 'w').write(ra)
        print(f'reverted to base (Toon {BASE_SHA[TOON][:16]}, Arch {BASE_SHA[ARCH][:16]})')
        return

    if not at_base:
        rt, ra = unedit(cur_t, cur_a)
        if sha(rt) != BASE_SHA[TOON] or sha(ra) != BASE_SHA[ARCH]:
            sys.exit('REFUSING: tree is not base and does not invert to base. Run `revert` first.')
        cur_t, cur_a = rt, ra
    A = arms(cur_t, cur_a)
    assert A['restore'] == (cur_t, cur_a), 'restore arm must be byte-identical to base'
    assert A['base'] == (cur_t, cur_a), 'base arm must be byte-identical to base'

    if cmd == 'install':
        arm = sys.argv[2] if len(sys.argv) > 2 else ''
        if arm not in A:
            sys.exit(f'unknown arm "{arm}" (have {list(A)})')
        t, a = A[arm]
        open(TOON, 'w').write(t)
        open(ARCH, 'w').write(a)
        print(f'installed arm "{arm}"  Toon sha {sha(t)[:16]}  Arch sha {sha(a)[:16]}')
        return

    if cmd == 'build':
        outdir = sys.argv[2] if len(sys.argv) > 2 else HERE
        os.makedirs(outdir, exist_ok=True)
        for n, (t, a) in A.items():
            open(os.path.join(outdir, f'ToonMaterial.{n}.js'), 'w').write(t)
            open(os.path.join(outdir, f'Architecture.{n}.js'), 'w').write(a)
            print(f'{n:8s} Toon {len(t)-len(cur_t):+6d}B sha {sha(t)[:16]}   '
                  f'Arch {len(a)-len(cur_a):+4d}B sha {sha(a)[:16]}')
        return

    sys.exit(f'unknown command "{cmd}" (check|install <arm>|revert|build)')


if __name__ == '__main__':
    main()
