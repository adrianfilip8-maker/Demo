# RESULT-critic8 — blind pass on the post-wave-3 build. **3 / 10.**

Four canonical shots (`hero`, `temple`, `sly-closeup`, `courtyard`, 1280×720) captured against the
restored tree with every wave-2 and wave-3 change live. Critic given the frames, the brief and
nothing else — no change list, no ledger, no design docs. It declared its one source grep.

## The verdict, in its own framing

> "A smooth PBR renderer with an edge-detect ink pass over it, lit by no sun, in a teal palette,
> starring a raccoon with no rings on his tail."

Best frame `courtyard` **4/10** on composition. Worst `sly-closeup` **2/10** — "it is a character
beauty shot, so it is judged on the character."

## What I verified myself, and what I could not

**CONFIRMED — the image is a continuous gradient, not bands.** On `sly-closeup`'s back wall,
scanline y=60, x 40…460: **largest adjacent step 3.79 luma across 420 px**, mean step 0.497. The
critic reported 3.8 independently. A 3-band ramp cannot produce that.

**CONFIRMED — there is no highlight range.** Frame p50 **64.5**, p99 **172.2**, max 233.5, and
**0.000%** of pixels above luma 230. Golden-hour sunlit stone should sit 215–245.

**CAVEAT the critic did not state, and it matters:** a cel ramp quantises the *lighting* term, not
albedo. A detailed sandstone texture yields many distinct levels under a perfect ramp, so its "164
distinct levels on a flat wall" is not by itself proof the ramp is absent. The *gradient* measurement
above is the load-bearing one, and it stands.

**NOT CONFIRMED — the cylinder test.** The critic's decisive instrument was a lit column, reporting
sd 7.49 with no plateaus. My attempt on `temple` x 950–1150 returned sd 10.6–26.6 with adjacent steps
of 73–116 luma — but those are ink lines and silhouette boundaries, not terminators. **I could not
isolate a clean lit column face, so I neither confirm nor refute it.** Same ROI-isolation failure that
voided cel1 twice; a proper answer needs the geometry projected through the camera, not an eyeballed
rect.

**Its "28 MeshStandardMaterial vs 3 MeshToonMaterial" grep proves less than it thinks:**
`Shading.toon()` returns a *patched* MeshStandardMaterial — the cel path works by splicing
`meshphysical`, so counting the class name cannot distinguish toon from PBR. The pixel evidence is
what carries the claim, and the critic said as much ("the pixels came first").

## Confirmed by the frames, and already known

- **The tail** — no rings, one flat lobe, 209 × 219 px, **1.17× his own body width**. §226: the
  rebuild went into `SlyModel3`, which is not what ships.
- **The cane hook is a correct shepherd's crook.** The critic named it unprompted as one of four
  things that would survive next to a shipped title. That is defect #6 closed, blind.

## What it found that we did not have

- **Sly is 5.1 heads; the model sheet is 6.5–7.** Measured cap crown to sole against the neck pinch.
  He reads as a stocky bruiser rather than a lanky thief. Nobody here had measured proportion at all.
- **The character's key light disagrees with the scene's sun.** Sun is screen-right (lit floor x>900),
  but his face-left is 128 against face-right 76, and thigh-left 113 against 93. Two lighting systems
  in opposition — a bug, not a taste call.
- **Both gloves have no thumb.** Four fingers on both hands.
- **Ink width varies 1 px → 29 px on a single character in one frame**, and tracks depth-discontinuity
  magnitude — "the signature of an edge detector, not an art-directed line." `Outline.js` documents
  itself as one width. At 76 px tall in `courtyard`, median ink is 5 px = **6.6% of his height**, so
  a 12 px arm is 100% ink and the silhouette is an asterisk.
- **The contact shadow is inverted where it exists.** Floor under his boots reads **+5.5 luma
  brighter** than floor 250 px away, and the courtyard vase decal is **+2.9 luma brighter** than the
  floor — a shadow that lightens. The decals landed; their sign is wrong.
- **The hieroglyphs are not glyphs** — rounded rectangles, ovals and pills, no bird, eye, ankh or
  cartouche. "A circuit board or an aircraft overhead-bin panel."
- **The ceiling stars are darker than the ceiling**, so they read as rivets in steel plate.
- **God-ray quads are not depth-tested** — they draw over near column faces at full opacity and do not
  originate at the lit apertures.
- **Palm fronds have dissolved** to ~40 stray black pixels on two bare trunks — alpha-tested foliage
  at minification with no mip or alpha-to-coverage handling.
- **Two lamp shades float in the sky** with no wire, no hook, no support.
- **String lights in Ancient Egypt.** Electric pendant shades on catenary cable.

## The palette number

Share of saturated pixels that are warm vs cool:

| frame | warm | cool | mean luma |
|---|---|---|---|
| `sly-closeup` | **15.5%** | **78.8%** | 68.3 |
| `temple` | 19.4% | 66.1% | 78.8 |
| `hero` | 28.4% | 52.7% | 74.0 |
| `courtyard` | 39.0% | 50.6% | 89.3 |

Every frame is majority blue-cyan in an Ancient Egypt game.

## What this reframes

Most of this session went into instruments, ledger corrections and one-defect fixes. Two of those
fixes — the cane hook and the grip — a blind critic picked out unprompted. The rest of the effort went
into a ramp whose output **is measurably not banded**, a contact shadow that **brightens**, and an ink
system documented as one width that **varies 29×**.

The three defects to lead with, in order: no highlight range (p99 172, nothing above 230), the tail on
the shipped model, and the ink not scaling with screen size. None of the three needs a new instrument.
