# Audio — provenance

## `museum-of-natural-history.mp3`

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
