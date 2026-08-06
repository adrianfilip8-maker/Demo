#!/usr/bin/env python3
"""Materialise / install / revert the arm variants of `src/ai/Guard.js` for
PREREG-combatrecipient.md.

    python3 combatrecipient-arms.py build   [outdir]     write Guard.<arm>.js for inspection
    python3 combatrecipient-arms.py install <arm>        write that arm over src/ai/Guard.js
    python3 combatrecipient-arms.py revert               put src/ai/Guard.js back, byte-exact
    python3 combatrecipient-arms.py check                report the tree's current state

Arms: `cand` (Edit 1 + Edit 2), `norestore` (Edit 1 only), `kbside` (Edit 1 with
`screenSide: -1`, + Edit 2), `restore` (== base).

**Why this exists rather than a hand-edit.** The src edit has to happen inside a held lock
ticket and be reverted before release, under a container that rolls back roughly every 45
minutes. A hand-edit under that pressure is how an arm ends up differing from base by something
nobody registered — and the whole value of `kbside` is that it differs from `cand` by exactly
one token (the `screenSide` sign), so it reads as its own failure rather than as a second
candidate.

**Revert carries no snapshot and cannot drift.** It is the exact inverse string replacement, and
it asserts the result's sha256 equals BASE_SHA below. `build`/`install` refuse unless the tree is
already at BASE_SHA, so an arm can never be built on top of another arm. If any assertion fires,
the tree is not what this seal was written against and nothing is written.
"""
import hashlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, '..', '..', 'src', 'ai', 'Guard.js'))
BASE_SHA = '350dece5a1b13fb7b6b80b896cc430721508ecd054afb3bd42044160cbb06fef'

# ---------------- Edit 1: SHOT_POSE.combat -----------------------------------------------
ANCHOR1 = """    towardCamera: 0.35, screenSide: -1,
    minDist: 4.5, maxDist: 17,
  },
};
"""

COMBAT_TMPL = """    towardCamera: 0.35, screenSide: -1,
    minDist: 4.5, maxDist: 17,
  },

  /* The combo's third hit needs somebody to land on. `Particles._stageShot()` fires
     cane_flash/ring/spark/debris at a HARDCODED point — Sly's chest + 1.05 m along
     normalize(0.30, 0.10, 0.95) = (0.3146, 1.3849, 28.996) — with no target lookup, no guard
     query and no raycast, so the arc terminates on a *coordinate* 0.89 m NEARER the lens than
     Sly's own chest (CRITIC-sbs3 3.10: "the combo still hits air"; KNOWN_ISSUES 181).

     Nothing below aims at that point. The shipped solver already arrives at it: with
     screenSide +1 the d-walk rejects d = 4.5 (feet at ndc -1.095, past the -0.96 gate), takes
     d = 5.0, and stands him at (0.102, 0, 29.035) — 0.216 m from the anchor, i.e. inside a
     temple guard's 0.42 m body radius, at y 1.385 m, his upper chest. The two quantities agree
     because _stageShot's 1.05 m offset and _solveShotPose's 0.34 lateral fraction independently
     encode "a body-length in front of the lens, a third of the way off centre".

     The sign is load-bearing: screenSide -1 mirrors him to (1.523, 0, 27.355) and misses by
     2.038 m. `stunned`, not `look_around` — `guard` stages a sentry, this stages a recipient —
     and t = 0 is the authored key rather than an interpolated pose, so the frame does not
     depend on where the sampler lands between keys.

     No x/z/yaw: they have no reader (grep "spec\\." — index, look, clip, t, screenSide,
     minDist, maxDist, towardCamera and nothing else). The "fallback for when COLLISION isn't
     up" in the header above describes code that does not exist.

     PREREG-combatrecipient.md 1. */
  combat: {
    index: 0, clip: 'stunned', t: 0.0,
    towardCamera: 0.35, screenSide: %s,
    minDist: 4.5, maxDist: 17,
  },
};
"""

# ---------------- Edit 2: the restore ----------------------------------------------------
ANCHOR2 = """  _poseForShot(name) {
    this._shot = name;
    this._shotLock = null;
    const spec = name ? SHOT_POSE[name] : null;
    if (!spec) {
      for (const g of this.guards) g.anim.unfreeze();
      return;
    }
    const g = this.guards[spec.index];
    if (!g) return;
    g.senses.reset();
"""

RESTORE = """  _poseForShot(name) {
    this._shot = name;
    this._shotLock = null;
    /* Put back whoever the LAST staged shot teleported, before staging this one. Staging
       mutates g.position and nothing has ever undone it, so the stand leaked into every shot
       captured afterwards in the same boot: a guard parked at combat's stand
       (0.102, 0, 29.035) projects INTO the frame of all five shots that stage the player at
       (0, 0, 30) — in `sly-profile` as a 272x498 px body standing 1 m behind the character.
       `guard`'s stand never showed this because (-15.5, 0, 27.5) is off-frame left in
       `sly-profile` and behind the lens in `sly-key`, the only two shots that follow it;
       combat's stand is 0.97 m from the spawn. PREREG-combatrecipient.md 0.2 / 1. */
    this._restoreStagedGuard();
    const spec = name ? SHOT_POSE[name] : null;
    if (!spec) {
      for (const g of this.guards) g.anim.unfreeze();
      return;
    }
    const g = this.guards[spec.index];
    if (!g) return;
    this._staged = {
      g, pos: (this._stagedPos || (this._stagedPos = new THREE.Vector3())).copy(g.position),
      yaw: g.yaw, u: g.u, dwell: g.dwell, dwellAction: g.dwellAction,
      state: g.state, hadGround: g.hadGround,
    };
    g.senses.reset();
"""

ANCHOR3 = """    g.senses.blockedLength = g.vision.coneLength;
    this._shotLock = g;
  }
"""

METHOD = """    g.senses.blockedLength = g.vision.coneLength;
    this._shotLock = g;
  }

  /**
   * Undo a previous `_poseForShot` teleport. Idempotent, and safe when nothing is staged.
   *
   * `Debug.setShot` applies each shot TWICE, so this runs restore -> stash -> solve twice per
   * staging; `_solveShotPose` is a pure function of (camera, spec, ground), so the second pass
   * returns the identical stand and the treated frame is unchanged by this method's existence.
   * That is a registered prediction, not an assumption — PREREG-combatrecipient.md P-F5
   * measures `cand` against `norestore` on `combat` at 0 px.
   *
   * It restores position/yaw/u/dwell/state. It CANNOT restore the frames he did not live
   * through while frozen, so he resumes ~0.28 s behind an unstaged boot; that confound is
   * registered in the prereg's P4 commentary rather than left to be discovered.
   */
  _restoreStagedGuard() {
    const s = this._staged;
    if (!s) return;
    this._staged = null;
    const g = s.g;
    g.position.copy(s.pos);
    g.yaw = s.yaw; g.u = s.u;
    g.dwell = s.dwell; g.dwellAction = s.dwellAction;
    g.state = s.state; g.hadGround = s.hadGround;
    g.forward.set(Math.sin(g.yaw), 0, Math.cos(g.yaw));
    g.speed = 0;
    g.root.position.copy(g.position);
    g.root.rotation.set(0, g.yaw, 0);
    g.root.updateMatrixWorld(true);
  }
"""


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def edit1(src, side):
    assert src.count(ANCHOR1) == 1, 'Edit 1 anchor not unique'
    return src.replace(ANCHOR1, COMBAT_TMPL % side, 1)


def edit2(src):
    assert src.count(ANCHOR2) == 1, 'Edit 2 anchor not unique'
    assert src.count(ANCHOR3) == 1, 'Edit 2b anchor not unique'
    return src.replace(ANCHOR2, RESTORE, 1).replace(ANCHOR3, METHOD, 1)


def unedit(src):
    """Exact inverse of both edits. Applied unconditionally; each replace is a no-op if that
    edit is not present, so it reverts any arm (or a clean tree) to base."""
    for side in ('+1', '-1'):
        src = src.replace(COMBAT_TMPL % side, ANCHOR1, 1)
    return src.replace(RESTORE, ANCHOR2, 1).replace(METHOD, ANCHOR3, 1)


def arms(base):
    return {
        'cand': edit2(edit1(base, '+1')),
        'norestore': edit1(base, '+1'),
        'kbside': edit2(edit1(base, '-1')),
        'restore': base,
    }


def read_src():
    return open(SRC).read()


def require_base(txt):
    got = sha(txt)
    if got != BASE_SHA:
        sys.exit(f'REFUSING: src/ai/Guard.js is {got[:16]}, not base {BASE_SHA[:16]}.\n'
                 f'  Run `revert` first, or the tree is not what this seal was written against.')
    return txt


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'check'
    cur = read_src()

    if cmd == 'check':
        rev = unedit(cur)
        which = [n for n, t in arms(rev).items() if t == cur] if sha(rev) == BASE_SHA else []
        print(f'src/ai/Guard.js sha {sha(cur)[:16]}  ({"BASE" if sha(cur) == BASE_SHA else "modified"})')
        print(f'  reverts to base cleanly: {sha(rev) == BASE_SHA}')
        print(f'  matches arm: {which or "(none / base)"}')
        return

    if cmd == 'revert':
        out = unedit(cur)
        if sha(out) != BASE_SHA:
            sys.exit(f'REFUSING: inverse edit gives {sha(out)[:16]}, not base {BASE_SHA[:16]}. '
                     'Something else changed this file; revert it by hand.')
        open(SRC, 'w').write(out)
        print(f'reverted {SRC} to base ({BASE_SHA[:16]})')
        return

    base = require_base(unedit(cur) if sha(cur) != BASE_SHA else cur)
    A = arms(base)
    assert A['restore'] == base, 'restore arm must be byte-identical to base'

    if cmd == 'install':
        arm = sys.argv[2]
        if arm not in A:
            sys.exit(f'unknown arm "{arm}" (have {list(A)})')
        open(SRC, 'w').write(A[arm])
        print(f'installed arm "{arm}" -> {SRC}  sha {sha(A[arm])[:16]}')
        return

    if cmd == 'build':
        outdir = sys.argv[2] if len(sys.argv) > 2 else HERE
        os.makedirs(outdir, exist_ok=True)
        for n, t in A.items():
            p = os.path.join(outdir, f'Guard.{n}.js')
            open(p, 'w').write(t)
            print(f'{n:10s} {len(t)-len(base):+6d} bytes  '
                  f'{t.count(chr(10))-base.count(chr(10)):+4d} lines  sha {sha(t)[:16]}  -> {p}')
        return

    sys.exit(f'unknown command "{cmd}" (build|install|revert|check)')


if __name__ == '__main__':
    main()
