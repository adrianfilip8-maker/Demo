# `footstep.mp3` — staged, not shipped

Moved out of `public/assets/audio/` because nothing in the project references it (§265). The full
audio record — the three `bc-*.mp3` cues, the supplied soundtrack, and the licence position on each
— is `public/assets/audio/PROVENANCE.md`.

**`footstep.mp3`** — 0.576 s, MPEG-1 Layer III, 48 kHz stereo, 9 kB, carrying a Xing/LAME tag
(encoder delay 576, padding 1522). Every footstep in the game is synthesised by `buildStep` in
`src/audio/Sfx.js`; no code path loads this file.

**Origin: unstated. Licence: unstated.** It arrived alongside the supplied soundtrack in commit
`9a8a06e` with no note of its own. That is the reason it is kept rather than deleted — an asset
whose origin nobody recorded is not one to throw away on an agent's judgement.

## What did NOT move, and why that is deliberate

`museum-of-natural-history.mp3` (6.94 MB) is still in `public/assets/audio/` and still ships
unfetched. It is the single largest unreferenced file left in the build, and it stays because the
**owner instructed that it be used as the game's background music** and it has not been wired yet.
Moving it out of the copy path would not honour that instruction, it would just put another step
between the file and somebody honouring it — and an agent wiring the music would find it missing
from the directory its own provenance names.

The outstanding work is to wire it, not to hide it. Until then it is listed in
`KNOWN_UNSHIPPED_PAYLOAD` in `tests/bundle.test.mjs`, which is where a decided-about exception
belongs.
