# ROUTE — a sighted read of `shots/char12/sly-closeup.png`, and what it is worth

Written by the coordinator, 2026-08-03, from the frame that landed at 10:22 today.

## Provenance, and the bias declaration that has to come first

`shots/char12/report.json`: commit **`52d4a43`, `dirty: false`**, 1280×720, quality `high`,
4 shots, 0 failed. The frame is **current** — findings from it are not the §80.6 error of quoting
a pre-fix build.

**But I am not a blind critic and this document must not be filed as one.** I know what shipped,
which is exactly the bias `BRIEF-critic7.md` is built to exclude: *"a harsh critic who knows where
the work went looks there and grades the effort."* Treat this as a **routing note from an
interested party** — useful for pointing owners at something, worthless as a verdict. Pass 7 still
has to be blind, and nothing here should be shown to it.

## What I got wrong before measuring, recorded first

My first read of the frame included *"the head is too small relative to the body."* Then I ran
`tools/headratio.mjs`:

```
HEAD:BODY = 5.03 heads   (cap+ears excluded, chin to cranium)
total skinned height 1.8538 m   head height 0.3688 m
```

**Target is 5.0 and the fail band is outside 4.5–5.5 (AGENTS.md §7.3). It passes, dead on.** The
proportion finding is withdrawn. It took one second to check and it was the finding I was most
confident about, which is the reason it is written down rather than quietly deleted.

Worth a thought for whoever picks up the eye item below: *something* in the frame made a correct
5.03 read as wrong to me. If the eyes are changing the apparent head shape, fixing them may
dissolve a complaint nobody could otherwise locate.

## Routed to CHARACTER — the eyes, and this is the one I would do first

The eyes are **two large circles with large round pupils**. Sly's are narrow, angled, heavy-lidded
lens shapes; the roundness reads startled rather than confident, and it is legible at any figure
size — it survives at `hero`'s 133 px, where almost nothing else about the face does.

**This is a shape claim, so it needs a shape statistic, not an adjective.** Before anything ships,
seal a measurement of the visible sclera's **aspect ratio (width ÷ height) and its major-axis
angle** off the skinned mesh, in `idle_confident`, with the reference target stated as a number and
its source named. `tools/eyeprobe.mjs` and `eyefacing.mjs` already reach this geometry.

Note the trap this shares with §80.6: the eye work that closed as task #15 was about **hierarchy** —
bloom and `scleraTint 0.15`, i.e. *how bright the eye is*. Nothing in that task touched the eye's
**outline**, so #15 being closed is not evidence about this, and re-opening it would be re-reading
the wrong result. This is a new item.

## Routed to CHARACTER — hands, and it is the one the critic already named

The cane hand is a flat mitten with no thumb separation; the raised hand is a dark mass whose
silhouette does not resolve into fingers. §79's rig measurement (thumb opposition 0.12) says the
rig **cannot** produce opposition from any viewpoint, so this is not a pose or camera problem and
no framing change will fix it.

## Routed to SHADING — a light halo on the figure's outline, not a dark ink line

Along the tail's upper edge and the shoulders the figure separates from the background by a
**pale fringe**, where the inverted-hull ink shell should be putting a dark line. Two candidates
worth distinguishing before either is touched, because they take opposite fixes: the ink shell
losing to a rim term at those pixels, or the shell's own colour being lifted by the tonemap.

`PREREG-inkfringe.md` already establishes that the ink pass runs **after** AgX and after the sRGB
encode with display-space uniforms, so this is computable offline — no lock needed to tell the two
apart, and it should be settled offline before any arm is spent.

## Routed to CHARACTER/SHADING jointly — hard dark patches read as artefacts, not as clothing

Discrete near-black shapes sit on the shoulder, forearm and thigh with edges that do not follow
garment seams or form. Could be a shadow-cascade seam, a cel band landing inside a smooth gradient,
or authored texture. **Nobody should touch this until it is attributed** — it is the exact shape of
the five pass-6 findings that were refuted on mechanism while the observation held.

## Not routed, and why

**"The background does not read as Ancient Egypt."** In this frame it does not — grey-blue panels
with an orange patch, no sandstone, no hieroglyph, no motif. But `sly-closeup` is a **character**
framing chosen for face lighting and figure size, its background is whatever is behind him at
`(0,0,30)`, and `guard-fix` from `wedge1` shows an Anubis-headed guard, stone paving and a brazier
in the same world. **One character close-up is not evidence about world art direction**, and this
is precisely §93.3's rule pointed back at me: a frame can only answer what its staging supports.

The question is real and worth asking against `temple`, `courtyard` and `dunes` — the frames
authored to answer it. It is not answerable here, and filing it from here would be filing a
character shot's opinion about the architecture.

## Contact shadow

No grounding shadow under the boots, so the figure reads as pasted onto the paving. This may
already be finding #12 (routed to LIGHTING/RENDER as shadowed paving) reaching the character;
check §55's open cascade-reach item before opening anything new — **§64.2: grep this file for the
thing being ruled on before ruling on it.**
