# SPEC-sly3model — the Sly 3 reference, recorded before any geometry is written

**Status: reference observations. Committed immediately (§188.4/§194 — a thing that is not
committed does not survive a rollback, and this project loses its tree roughly every 40 minutes).**

## 0. Provenance, and the honest limit of it

Four reference images were supplied directly by the user in-conversation, after the environment's
egress policy was found to block every image host except `raw.githubusercontent.com`:

| # | what | why it matters |
|---|---|---|
| R-A | **the model's texture atlas** — panels labelled "Face and Mask", "Eye", "Back of Mask", "Body" | **flat albedo.** This is the one asset that answers colour without lighting baked in |
| R-B | Sly standing, front three-quarter, lit, on a wooden deck at night | costume layout, silhouette, proportions |
| R-C | Sly in an action pose, three-quarter, crystal cavern | tail, cane, limb proportions in motion |
| R-D | PCSX2 Venice rooftop frame (`zzamizz/weed-sheet`, the route CRITIC pinned) | rear three-quarter; the only one I have pixel access to |

**The limit, stated plainly.** R-A/R-B/R-C exist in conversation context, **not on disk**, so I
cannot run a pixel analysis on them. Everything below drawn from those three is **careful visual
reading, not measurement**, and is labelled `[read]`. Only R-D admits arithmetic, and it is dusk-lit
— the same shirt facet samples `#013e7e` and `#2f529f` in it, which is exactly why the atlas
matters and why I am not deriving albedo from R-D. Numbers marked `[read]` are starting values to
be **converged by rendering against the reference**, not constants to be trusted.

This distinction is the whole point. §190, §193 and §195 in the ledger are all one mistake —
reporting on a quantity as though it were something better-founded than it was.

## 1. Palette `[read]` — from the flat atlas (R-A), cross-checked against R-B/R-C

| slot | reading | where it appears |
|---|---|---|
| `blue` | strong medium royal blue | shirt, cap, gloves, boots — **one blue, used everywhere** |
| `blueDark` | near-black navy | atlas shading regions, inner sleeve, boot shadow side |
| `gold` | warm saturated amber-gold | belt, collar V, wrist cuffs, **the cane** |
| `cream` | warm off-white | trousers, light fur bands on the tail |
| `furLight` | light warm grey | muzzle, cheeks, brow, chest tuft |
| `furMid` | mid neutral grey | ear interior, tail dark bands, muzzle shading |
| `black` | true black | the mask, the nose, ink outlines |
| `red` | strong crimson | the hip sash |
| `eyeIris` | amber / orange | iris; black pupil on a white sclera |

**The single most important palette fact:** the blue is *one* colour across cap, shirt, gloves and
boots. Our current model must be checked for drift between those four.

## 2. Structure `[read]` — what the costume actually is

Recorded as a checklist because a silhouette is a list of decisions, and this is what the rebuild
is scored against.

- **Cap** — soft, blue, low crown with a short forward brim. Sits *on* the skull; the ears emerge
  beside it, not through it.
- **Ears** — large, tall, pointed, set high and wide. Grey outer, darker interior.
- **Mask** — **a fur marking, not cloth.** Black, spanning both eyes, drawn out to a point at each
  outer corner. The atlas has a separate "Back of Mask" panel, so it wraps.
- **Muzzle** — pronounced, tapers forward and slightly down, light grey/cream, black nose at the tip.
  This is the feature that most says "raccoon" in silhouette.
- **Eyes** — large, amber iris, black pupil, white sclera. Sit *inside* the black mask field, which
  is what gives the high-contrast read at distance.
- **Collar** — a gold **V** at the throat, over the blue.
- **Shirt** — blue, long-sleeved, close-fitting, ending at a gold belt.
- **Upper arm** — a grey/silver band near the shoulder on each arm.
- **Gloves** — blue, with a **gold cuff band** at each wrist.
- **Belt** — wide, gold, horizontal at the waist.
- **Trousers** — cream, loose, with a **ragged torn hem** at the calf. The tatter is a real
  silhouette feature, not a texture detail.
- **Hip sash** — crimson, wrapped across the right hip, reading as a bold diagonal/cross.
- **Boots** — blue, large, rounded toe, unambiguously cartoon-proportioned.
- **Tail** — very large and thick, **ringed** in alternating grey and cream, tapering, carried high
  and curling. It is roughly half the character's visual mass and must not be under-built.
- **Cane** — gold shaft, large hook. Held in the right hand.

## 3. Proportions `[read]` — from R-B (the standing three-quarter)

Ratios, not metres, so they survive a height change:

- head **including cap** ≈ **1/5.5** of total height — a large head, firmly stylised
- shoulders narrow; torso lean and slightly tapered
- legs long and thin relative to torso; **feet large**
- arms slender, hands large relative to forearm
- tail length ≈ torso + upper leg; thickness at root ≈ 0.55 × head width

## 4. What "a modern version" means here — the deliberate reading

The instruction is a *modern* version of the Sly 3 model, not a replica of a 2005 PS2 mesh. What is
kept versus modernised, decided in advance so it cannot be rationalised later:

**Kept (these ARE the character):** the one-blue costume; the black fur mask with pointed corners
and amber eyes; the gold belt/collar/cuffs/cane; the cream ragged trousers; the crimson hip sash;
the huge ringed tail; the large head and large feet; the strong ink outline.

**Modernised:** silhouette resolution (the PS2 mesh is visibly faceted — rounder limbs, cleaner
arcs); the muzzle and brow built as real form rather than a texture; ear and cap as separate
sprung forms; a tail with enough segments to carry the existing spring chain; cloth that reads as
cloth at the hem. **Not** modernised into realism — it stays cel-shaded and graphic.

## 5. Falsifiers for the rebuild, registered BEFORE any geometry exists

So the comparison at the end is not a matter of taste:

- **F1** any of cap / shirt / gloves / boots differing in hue from the other three ⇒ defect. It is
  one blue in the reference.
- **F2** the mask failing to read as a black field with pointed outer corners at 1/4 scale ⇒ defect.
  It is the primary identity cue at distance.
- **F3** the tail thinner at the root than 0.4 × head width ⇒ defect (under-built tail).
- **F4** trouser hem rendered straight ⇒ defect. The tatter is silhouette.
- **F5** a gold element (belt, collar, cuff, cane) reading as a different gold from the others ⇒
  defect.
- **F6** total height changing from the incumbent's `TUNE.height` ⇒ the A/B is confounded; the
  rebuild must be swappable at the same height or the comparison is not about the model.
