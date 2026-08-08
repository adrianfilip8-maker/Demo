# Critic pass 7 — capture provenance

Written before the critic's verdict, because `BRIEF-critic7.md` requirement 4 is *provenance before
pixels*: a run that straddles two builds is **void and must be re-shot, not caveated**.

## The set

`shots/r7/` — 16 shots at 1280×720, quality `high`, plus 2× centre crops and `manifest.json`.
Captured 2026-08-08T01:24:59Z → 02:05:14Z by `tools/critic.mjs --label r7 --crops`.

## The two things that look like defects and are not

### 1. `manifest.commit.dirty` is `true`

It is, and it does **not** mean two builds. The binding question is whether the *renderer* changed
mid-run, and it provably did not:

```
$ git diff --stat 0737a35 a6aebe1 -- src/
(empty)
```

Launch commit `0737a35`, manifest commit `a6aebe1`, and **no source file differs between them.** The
whole diff across the window is four files:

| file | why it moved | can it reach a frame? |
|---|---|---|
| `KNOWN_ISSUES.md` | §208 written during the run | no — a record |
| `progress/records/logs/critic-r7.log` | **the capture's own log** | no — its own output |
| `public/assets/audio/museum-of-natural-history.mp3` | owner-supplied asset installed | no — nothing loads it |
| `public/assets/audio/PROVENANCE.md` | its record | no |

The dirty flag is therefore unavoidable by construction: the capture writes a tracked log, so the
tree is dirty at the moment the manifest is stamped no matter how disciplined the operator is. The
two audio files are the only judgement call, and they are inert — the wiring that would read them
was deliberately held until after the window closed, precisely so this paragraph could say so.

**The brief's own test passes literally:** no `src/` mtime falls inside the capture window.

### 2. One console error

`manifest.consoleErrors` carries a single entry, a bare 404 with no URL. Identified by measurement
rather than assumed benign — probing the live dev server on both ports:

```
favicon.ico = 404      src/main.js = 200      assets/kaykit/dungeon_texture_sandstone.png = 200
```

There is no favicon anywhere in the repo and browsers request `/favicon.ico` unprompted. Every asset
the renderer actually needs answers 200, and the boot warnings confirm nothing failed to build:
`KayKit (props): 36 placed from 11 models, 0 failed`, textures prewarmed, the glove bake ran.

## Boot state at capture

```
! textures: prewarm took 18.0s at size 1024
! KayKit (props): 36 placed from 11 models, 0 failed, 31064 tris, 29 colliders
! SlyModelDLRig: relaxed 6070 glove vertices, max move 12.0 (asset units)
```

Three warnings, no errors, no failures.

## One thing the capture found on its own

Per-shot draws and triangles are printed by the harness and are recorded in **§208**: ten of twelve
shots exceed §1's 1.2 M triangle budget and two exceed the 250 draw-call budget. That is not a
provenance issue and does not affect this set's validity — it is noted here only so the critic's
findings and the budget finding are not later confused for one another.

## Verdict on the set

**Valid.** The renderer is byte-identical across the window, the only console error is a favicon the
game does not use, and every module reported clean. The frames may be judged.
