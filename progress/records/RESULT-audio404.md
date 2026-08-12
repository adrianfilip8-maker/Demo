# RESULT-audio404 — NO STEM 404s: §292's routing to AUDIO is refuted by the repo's own record; the boot 404 is the favicon request, now suppressed

§292 sent this lane to find "which stem 404s at boot" from `Audio.js:394`'s
`` `assets/audio/${STEM_FILES[name]}` `` fetch, with `footstep.mp3`'s §265 move to
`staging/assets/audio/` as the likely break. The enumeration was done as asked, and it
exonerates the audio path entirely — three independent ways, all grep-level, no boot taken
(this lane holds no capture lock and needed none).

## 1. The enumeration: requested ⊆ present, today and at the r10 commit

Stems `Audio.js` can request — `STEM_FILES` (src/audio/Audio.js:38-42) is the only table the
fetch reads, and both call sites (`_loadTrack`'s `STEM_FILES[name] || STEM_FILES.explore`,
line 394, fed by `SECTION_STEM[…] || 'explore'` at lines 378/547) can only produce its values:

```
requested:  bc-explore.mp3   bc-sneak.mp3   bc-chase.mp3
present:    bc-explore.mp3   bc-sneak.mp3   bc-chase.mp3   museum-of-natural-history.mp3
            (public/assets/audio/, verified on HEAD 0fffdac and via git ls-tree at r10's 58e3f49)
```

Every requested stem exists. `museum-of-natural-history.mp3` is present-but-unfetched by the
owner's standing background-music exception (asset register, `KNOWN_UNSHIPPED_PAYLOAD`), exactly
as the record says. Nothing requests a file that is absent.

**`footstep.mp3` was never the break.** Nothing fetches it — not before §265, not after. The
word `footstep` in `Audio.js`/`Particles.js`/`Clips.js` is an animation EVENT name feeding the
synthesised `buildStep` in `Sfx.js`; §265.1 correction 4 nailed this exact confusion when the
register was built, and both PROVENANCE records (public and staging) state "no code path loads
this file". The move's contract in `tests/bundle.test.mjs` (`MOVED_OUT_OF_PUBLIC` line
`['audio/footstep.mp3', 'staging/assets/audio/footstep.mp3']`) is intact and asserted in both
directions. Restoring it, or "removing its fetch", would each contradict the record: there is
no wiring to restore and no fetch to remove.

## 2. The fetch cannot even run in the boots that logged the error

The 404 lives in capture manifests (`?shot=1` boots). On that path `unlock()` is never called:
`main.js:287-303` binds it to `pointerdown`/`keydown` only in the NON-headless branch, and no
tool calls it (`grep -rn unlock tools/` → only `lock.mjs`'s prose). `_loadTrack` is gated on
`unlock()` (`Audio.js:197-198, 332, 378`) and skipped under the offline harness besides. A
critic capture literally cannot execute `Audio.js:399`.

## 3. The timeline: the 404 predates the audio fetch by eight days and ignores the move

Every manifest/report with a `consoleErrors` field was swept (31 of them). The identical single
error — `Failed to load resource: the server responded with a status of 404 (Not Found)` —
appears in **every capture back to 2026-07-31** (`shots/pass1`, `shots/g1`) and in every one
since, always exactly once per boot:

```
2026-07-31  pass1, pass2, g1        404 present   — no audio asset or fetch exists yet
2026-08-01  char6..char10, r3, r4…  404 present
2026-08-08  bb97a61/9aa0cd3         first audio fetch code lands
2026-08-09  212b454 (§265 move)     footstep.mp3 leaves public/
2026-08-12  r10, guardfix           404 present   — same error, same count
```

A constant, boot-invariant, exactly-once error across five weeks of commits, characters and
configs is not a content fetch. Every URL the app's own code can request resolves on disk
(all six runtime literals: `tex/textures.bin`, three `bc-*.mp3`, `carmelita-guard.glb`,
`sly-godot.glb`; plus `src/assets/sly-dl/*` served from source in dev) — and the r10 manifest
itself shows all of them loading (textures "23 baked / 0 generated", KayKit "0 failed", DLRig
warnings present, garrison rendering per RESULT-guardfix).

## 4. What it is: the favicon

The one URL a boot requests that no code in this repo names. `index.html` declared no icon and
`public/` has never contained `favicon.ico`; Chromium requests `/favicon.ico` on navigation.
The harness launches `/opt/pw-browsers/chromium` — the **full** Chromium 141 build (the
no-favicon headless *shell* sits beside it, unused, as `chromium_headless_shell-1194`), and
full-build headless fetches favicons like a headed browser. Vite dev answers 404. One request,
one error, every boot, no game-side symptom — the observed signature exactly.

## 5. The fix (mandate-shaped: nothing new shipped, nothing fetched outside the copy path)

- `index.html`: `<link rel="icon" href="data:image/svg+xml,…">` — a 16×16 inline SVG in the
  title card's palette. A declared `data:` icon is answered from the page itself, so the
  `/favicon.ico` request is never made: the 404 disappears WITHOUT adding an unregistered
  binary to `public/` (the register scans `public/assets/`; a root favicon would ship unseen).
- `src/audio/Audio.js`: **untouched** — the record supports no change, so none was made.
- `public/`, `staging/`: **untouched** — `footstep.mp3` stays retired at
  `staging/assets/audio/`, `museum-of-natural-history.mp3` stays put per the owner exception.
- `tests/bundle.test.mjs`, same commit: (a) the §292 proof made standing — the stem set is now
  DERIVED from `STEM_FILES` in `src/audio/Audio.js` and each value asserted to exist under
  `public/assets/audio/`, so a future stem added without its file goes red in the suite instead
  of 404ing in a capture; (b) the favicon suppression pinned, so deleting the icon line brings
  the test down rather than quietly bringing the 404 back.

## Verification

- `node --test "tests/*.test.mjs"` — **468/468** (466 baseline + the two new tests), 0 fail.
- Grep-level proof required by the lane: `STEM_FILES` = {`bc-explore.mp3`, `bc-sneak.mp3`,
  `bc-chase.mp3`}; `ls public/assets/audio/` contains all three (plus the owner-excepted museum
  track). Requested ⊆ present. No boot was taken and none was needed.

What this does NOT claim: that a capture manifest now shows zero console errors — proving that
needs a boot, which is the next critic round's free by-product. If r11's manifest still carries
a 404, §295's attribution is wrong and the favicon line is trivially revertible; the derived-stem
test stands either way.
