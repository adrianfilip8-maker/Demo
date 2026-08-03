# PREREG — Task #28's call site: gated inverted-hull shells on hero props

Registered before the capture. Scored at `RESULT-propshull.md`.

## The decision being made

§132.5 priced Task #28 and made a recommendation but explicitly left the judgement open:

> **Recommendation taken: gate the call site on the accent/hero keys** (~6 draws, ~50 k tris)
> rather than all 11 … **And it needs one capture to judge, not zero:** a 2.5 px hull lands on
> top of a 1.5 px post-process line on the same silhouettes, so hero props will carry a visibly
> heavier line than architecture. That is the intended §2.1 distinction, but *"intended"* and
> *"looks right at this exposure"* are different claims, and no such weight has ever reached a
> frame.

So this capture is not asking "does the hull work". It is asking **whether the combined
2.5 px hull + 1.5 px PostFX line on hero props, against bare 1.5 px PostFX on the architecture
behind them, reads as a deliberate hierarchy or as a defect.**

## What shipped ahead of the capture, and why that is not a prejudged result

`Props.js` `HULL_KEYS = {stone, lime, gold, dark, lapis, carnelian}`, called per merged hero
mesh in `_flushBuckets()`. It is in the tree because the arms have to be *in one boot* to be
comparable, and because the null result is a one-line revert. **Shipping the mechanism is not
the same as accepting the look**, and this file is the record of which claim the capture tests.

Cost is settled and is not what is being judged. Priced offline against the real merged meshes
(`hullprice.mjs`): **+6 draws / +55 718 tris**, identical on every canonical camera — these
meshes are merged by material across the whole level, so frustum culling removes none of them.
Against the measured main-view worst case (71 draws / 0.572 M) that is 77 draws (31 % of 250)
and 0.628 M (52 % of 1.2 M).

## Arms — one boot, dt pinned to 0 on every step

Shells are toggled by **detaching them from their host**, not by `.visible`. That is deliberate:
`PostFX` calls `beginNormalPass()`/`endNormalPass()` every frame, and `setOutlinesVisible()`
rewrites `.visible` on every shell in `_shells` — so a per-shell `.visible = false` would be
silently reverted before the frame was drawn, and the "off" arm would not be off.

| arm | state | purpose |
|---|---|---|
| `base` | hulls detached | the shipped frame before this change |
| `base2` | hulls detached | **noise floor — must be 0 px vs `base`** |
| `hull` | hulls attached | the treatment |
| `restore` | hulls detached | **must re-equal `base`** |

Shots: `courtyard` (hero sculpture and architecture at comparable distance — the hierarchy
question) and `interior` (gilded Ra and tomb furniture against a wall a short distance behind —
the low depth/normal-contrast case that is the entire stated reason a hull earns its draw).

## Predictions, registered

- **P1.** `base` vs `base2` = **0 px**. If not, the clock pin failed and every number below is void.
- **P2.** `restore` vs `base` = **0 px**. If not, detach/attach is not a clean toggle.
- **P3.** The changed-pixel population in `hull` vs `base` is **confined to silhouette edges of
  the six hero keys**. Concretely: no changed pixel may sit on a surface interior. If the diff
  shows broad-area change, the shell is not doing what an inverted hull is supposed to do and
  the result is void rather than negative.
- **P4 (the actual question).** On `interior`, the gilded-Ra silhouette gains a legible dark
  edge where it currently merges into the wall behind it. **This is the prediction I most
  expect to be wrong**, because §132.5's own argument is that PostFX's depth+normal pass
  already handles most silhouettes, and the hull only earns its keep where that pass fails.

## Acceptance

**ACCEPT** requires all of: P1 and P2 clean; P3 clean; and, on looking at every frame, the hero
props reading as *more emphatically drawn* rather than *outlined*. A line that reads as a sticker
edge, doubles visibly against the PostFX line, or crawls at grazing angles is a **REJECT**.

**REJECT** ships as a revert of the `HULL_KEYS` call site, and the null gets written up — three
routes into §7.3's gold line have already returned null or regression (§137.2) and a fourth is
worth exactly as much as the three.

Explicitly **not** claimed by this capture: anything about `spec: 0.55` (§137.2's remaining
Architecture-side lever, upstream-blocked on SHADING's `diff`-assembly question), and anything
about the guard's unmasked `uMetal` (§137.1, routed to an owner-less module).

---

## Addendum, written while the run is still queued and before any arm frame exists

The capture is stuck behind five other agents' jobs on the single capture lock. While waiting I
realised the central question has **evidence already on disk that I had not thought to use**: the
2.5 px-hull-on-1.5 px-line stack is not new. `Architecture.js:80` has shipped `HULL_OUTLINE` at
0.85 on `gold_leaf`, `granite_pink` and `bronze_dark` all along, so every existing frame already
shows the stack — just on architecture instead of props.

Looked at, at 4× on the `courtyard` obelisk (`granite_pink`, hull 0.85), promoted to
`crops/hull-obelisk-085-courtyard.png`:

- the silhouette carries **one clean dark line of 2–3 source px** — no doubling, no halo, no
  sticker edge, which are the three named REJECT conditions;
- the chamfered arris between the lit and shadow faces reads as a **bright orange key line**,
  which is the geometry brief's stated purpose for chamfers, working;
- the `gold_leaf` hook ring in the same crop reads cleanly at a much smaller screen size.

The same frame also offers a free control I had not thought to use either: the **colossi are
`props_stone` with no hull**, at a similar distance to the obelisk, so `courtyard` already
contains hulled and un-hulled stone side by side. Cropped at the same 4× and region size
(`crops/`, `colossus-nohull` vs `hull-obelisk-085`), the un-hulled colossus **already carries an
adequate dark silhouette against the sky** — PostFX's depth+normal pass is doing its job there,
and the hull would add little. What actually hurts that crop is texture: blue lappet stripes over
brown mottling, reading as high-frequency noise rather than as carved stone (KNOWN_ISSUES §2,
unrelated to this change).

**That cuts against my own change, and it is the more useful half of this addendum.** It means the
hull's justification rests *entirely* on the low-depth-contrast case — a prop against a wall a
short distance behind it — exactly as §132.5 argued. So **`interior` is the decisive shot, not
`courtyard`**, and if `interior` shows no legible gain the honest verdict is REJECT even if
`courtyard` looks fine. Registered before the frames so the shot ordering cannot be re-weighted
after seeing them.

**This does not settle the registered question and I am not treating it as if it does.** It is
architecture at 0.85; the gate ships props at the table's 1.0 / 0.9, which is 6–18 % heavier, and
§132.5's concern was specifically about hero props reading heavier *than* architecture. What it
does establish is that the stack itself is sound at a nearby weight, so the plausible failure is
now a matter of degree rather than of kind. Recorded here, before the arms, so that if the frames
come back clean it is visible that I had reason to expect it — and if they come back doubled, that
expectation was wrong and the record says so.

## Rider: the `guard` cyan line, and where I have registered that I expect to find it

`guard` and `night` ride along in this boot at base/hull only, to answer §137's separate
never-verified-in-a-frame item. `kerbline.mjs` scans them offline for the artefact's signature.
That scanner carries a **positive control** — it synthesises critic pass 2's own measured run
(`wall 87 → ink 26 → 72 → #598aa2 129 → 34 → ground 65`) and aborts if it fails to detect it —
because a null from an instrument never shown to fire would be worthless. It fires at lift
+57.3 against pass 2's +57.

Registered before the frames exist, from `sliver.mjs`'s offline census: the narrowest
up-facing strip the `guard` camera can see is on **`arch:court:hieroglyph_gilded` at
(−14.1, 1.42, 28.5)** — 6.2 cm wide, ~3.4 m from the camera, projecting **~24 px**, the widest
of any candidate in that frame by a factor of six. `EgyptLevel.js:431` identifies it: the
**cornice fillet on the west colossus plinth**. That is the same object `Shots.js` names as the
original cause, seen from the camera that used to stand 5 cm above it.

**And if it does light up, the fix is probably not mine.** A cornice's top fillet is *supposed*
to be a narrow up-facing band — `corniceProfile()` builds it deliberately as the "walkable top,
back to the wall plane", and it is intended architecture rather than a modelling error. Burying
or widening it would damage the silhouette that is the whole point of an Egyptian cornice. So a
hit here routes to §137's third candidate (`uRimShadowFloorArch`, SHADING) rather than back
into `Kit.js`. I am registering that *now*, before the frame, so it cannot look like a
convenient reading afterwards.
