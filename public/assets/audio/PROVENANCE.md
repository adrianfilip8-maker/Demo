# Audio — provenance

## `bc-explore.mp3`, `bc-sneak.mp3`, `bc-chase.mp3`

The three music cues the game actually plays, loaded lazily by `src/audio/Audio.js`.
MPEG-1 Layer III, 112 kbps CBR, 44.1 kHz stereo. Measured from the committed bytes rather than
copied from a filename — a frame-header scan (`mp3Scan` in `tests/webaudio.mjs`) and a Chromium
`decodeAudioData` agree on all three to under a millisecond:

| file | duration | frames | peak | RMS |
|---|---|---|---|---|
| `bc-explore.mp3` | 168.046 s | 6433 | 1.011 | 0.2526 |
| `bc-sneak.mp3`   | 172.591 s | 6607 | 0.865 | 0.0357 |
| `bc-chase.mp3`   | 167.262 s | 6403 | 1.018 | 0.1705 |

**Origin.** Installed by commit `6f03a03`, whose message calls them *"the three Black Chateau
loops … 2.24/2.30/2.23 MB from 97 MB of WAV"*, encoded in-container by driving `lamejs` through
`vm` because this machine has no `ffmpeg`, `lame` or `sox`. "The Black Chateau" is the first
episode of *Sly 2: Band of Thieves* (2004), whose score is by **Peter McConnell**. **Where the
97 MB of source WAV came from is not stated anywhere in the repository, and is recorded here as
unstated rather than guessed.**

**Licence: unstated.** No licence is asserted in the installing commit or anywhere else. These
are not covered by the explicit instruction recorded below for `museum-of-natural-history.mp3` —
that instruction names that file and the `Sly_Cooper` model, not these. If they are in fact
episode music from the same commercial soundtrack then the same considerations apply to them,
but nobody has said so, so nothing is claimed here on their behalf.

### Raised, escalated, and ruled on by the owner — 2026-08-22

**This was decided, not overlooked**, and that is the only reason this heading exists: a decision
that leaves no trace is indistinguishable from nobody having looked.

The question above was put to the project owner during the §548 audio audit, with the facts as
they are recorded here and nothing added to them — that these three cues were installed by commit
`6f03a03` from *"97 MB of WAV"* whose origin the commit does not state, that the same commit's
message names *"the three Black Chateau loops"*, that no licence is asserted anywhere in the
repository, and that the standing instruction recorded below names the museum track and the
`Sly_Cooper` model rather than these files.

**The owner's ruling: leave the music as it is.** In their words, *"Leave the music, ignoring the
others instead of synthesizing."* Concretely, and all three parts are theirs rather than inferred:

- the three `bc-*.mp3` cues **stay**, unchanged and unmoved;
- the standing instruction below is **not** extended to cover them;
- original synthesised replacements are **not** wanted.

**Nothing is claimed on their behalf in either direction.** The ruling is a decision about what
this project does with these files. It is not a statement about their licence, their origin, or
anyone's rights, and it should not be read as one — everything above this heading still stands
exactly as written, including that the origin is unstated and that no licence is asserted.

See `KNOWN_ISSUES.md` §548.1 for the audit that raised it and §549 for the ruling as ledgered.

**They are three separate pieces, not three mixes of one.** `Audio.js` used to state the
opposite as fact and build its cross-fade on it. Decoded and cross-correlated on their
short-time energy envelopes, `explore` scores **0.122** against `sneak` and **0.013** against
`chase` at zero lag (best lag anywhere in ±5 s: 0.225 and 0.091); the calibration arm, the same
measure against a time-reversed copy of `explore`, scores 0.163. Tempo autocorrelation puts
`explore` at 120 BPM and the other two at 80. See `KNOWN_ISSUES.md` §233.

## `footstep.mp3` — MOVED to `staging/assets/audio/footstep.mp3`

0.576 s, MPEG-1 Layer III, 48 kHz stereo, 9 kB, carrying a Xing/LAME tag (encoder delay 576,
padding 1522). **Nothing in the project references it.** Every footstep in the game is
synthesised by `buildStep` in `src/audio/Sfx.js`; no code path loads this file.

It no longer ships. `public/` is copied into `dist/` verbatim (§265), so an unwired file staged
here was buying download for nothing; it now lives in `staging/assets/audio/`, which git keeps and
Vite does not copy. It was **moved, not deleted** — `tests/bundle.test.mjs` asserts it is absent
from here and present there, so the two cannot be confused.

**Origin: unstated. Licence: unstated.** It arrived alongside the supplied soundtrack in commit
`9a8a06e` with no note of its own, which is precisely why it is kept rather than discarded.

## `museum-of-natural-history.mp3`

**Not loaded by any code path either.** `STEM_FILES` names only the three `bc-*.mp3` cues, so
this 6.94 MB file is copied verbatim into `dist/` and never fetched — over half the shipped
audio payload, for audio nothing plays. It is left in place rather than deleted because the
owner's standing instruction (below) was that it be used as the game's background music, and
reversing that is the owner's call, not an agent's. Recorded here so the choice is visible.

**It also stayed here when the rest of the unwired assets moved to `staging/` (§265).** That was
deliberate. Moving it out of the copy path would save the 6.94 MB and would not honour the
instruction any better — it would put one more step between this file and somebody wiring it, and
an agent looking for the music would find it missing from the directory this record names. The
outstanding work is to wire it. Until then it is the one entry in
`KNOWN_UNSHIPPED_PAYLOAD` held back on a judgement rather than on the rule the other moves
followed, and that is written down in `tests/bundle.test.mjs` so it reads as a decision.


**"The Museum of Natural History"**, composed by **Peter McConnell**, from *Sly 2: Band of Thieves —
Original Soundtrack* (2004). 14:27, MPEG-1 Layer III, 64 kbps, 44.1 kHz stereo, 6.94 MB. ID3 tags
read from the file itself rather than inferred from the filename.

**Supplied directly by the project owner**, who instructed that it be used as the game's background
music. The same standing instruction covers the supplied `Sly_Cooper` character model: the owner has
stated that copyright is not a legal obstacle for this project for reasons they have not disclosed.
That is their call to make and it is recorded here plainly, so that anyone reading this repository
can see exactly what the asset is and where it came from rather than having to work it out from a
filename. This is a commercial soundtrack recording; it is not CC0, and it is not equivalent to the
KayKit pack next door in `assets/kaykit/`, which carries an explicit public-domain grant.

**Why `public/` and not `src/assets/`:** vite hashes anything imported through `src/`, and the audio
path is resolved at runtime rather than at build time. `public/` is copied verbatim, so the build
stays self-contained — the file is served from the app's own origin and nothing is fetched from an
external host, which is the owner's standing requirement.

## What this displaces, and what it does not

`src/audio/Music.js` writes an **adaptive procedural score**: five sections (`menu`, `explore`,
`sneak`, `alert`, …) across seven layers (`bass`, `kit`, `perc`, `vibes`, `lead`, `oud`, `pad`),
switching automatically on game state. `Audio.js`'s header states the original constraint plainly —
*"Everything is synthesised (AGENTS.md §1): no files, no CDN, no decodeAudioData."*

A 14-minute recording cannot do what that system does: it has no sections to cross-fade and no
layers to remix when Sly goes from walking to sneaking to spotted. So the procedural score is
**retained rather than deleted**, and the recording is routed through the existing `musicBus` so
everything built around it still applies — the duck, the colour filter, and the Thief-o-Vision
music level (`TUNE.thiefMusic` 0.34).

The adaptive section machinery is therefore repurposed rather than discarded: it can no longer
change *what* is playing, but it can still change how the track is filtered and levelled as the
game's state changes.
