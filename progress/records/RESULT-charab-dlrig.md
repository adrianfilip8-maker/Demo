# RESULT-charab-dlrig — blind round, seed 11: the procedural rebuild is preferred 8–6

Round run 2026-08-07 under PREREG-charab. Both arms captured **this evening, after §201 shipped the
guard camera** (dlrig 20:51–21:08, model3 21:17–21:34), identities verified `slydlrig`/39,963 and
`sly3`/2,801, zero arm mismatches. Pairs built at seed 11 and the **key committed at `869ed67`
before the critic was spawned**. The critic received the brief verbatim, the four composites and the
real Sly 3 reference — no source, no records, no key.

## The critic's verdicts, BY SIDE LETTER (recorded before the reveal)

| pair | identity | silhouette | fidelity | craft |
|---|---|---|---|---|
| sly-closeup | B | B | A | neither |
| sly-profile | A | B | A | A |
| sly-perch | B | B | A | neither |
| traversal | B | B | B | A |

Its own arithmetic: **A 6 — B 8 — neither 2** of 16.

## The key, and the translation

```
sly-closeup    A=model3  B=dlrig
sly-profile    A=model3  B=dlrig
sly-perch      A=model3  B=dlrig
traversal      A=dlrig   B=model3
```

| pair | by build |
|---|---|
| sly-closeup | dlrig 2 — model3 1 — neither 1 |
| sly-profile | model3 3 — dlrig 1 |
| sly-perch | dlrig 2 — model3 1 — neither 1 |
| traversal | model3 3 — dlrig 1 |

**model3 8 — dlrig 6 — neither 2.**

**Blinding verified, tenth consecutive round.** The critic never learned which build was which, but
it *did* notice the side assignment flips on traversal — from the ringed tail alone, without any
lookup — and regrouped its own totals by the feature rather than the letter: *"the ringed-tail build
scored 8; the big-head / large-cane / blob-tail build scored 6."* Translated through the key, the
ringed-tail build **is** model3 at 8 and the imported build **is** dlrig at 6. Its independent
regrouping matches my translation exactly. That is the strongest blinding check in the series so
far: it reconstructed the grouping from the images and still could not name the builds.

## By question, which is where the result is actually informative

| question | model3 | dlrig |
|---|---|---|
| identity | 2 | 2 |
| **silhouette** | 1 | **3** |
| **reference fidelity** | **4** | **0** |
| craft | 1 | 1 (2 neither) |

**dlrig wins silhouette 3–1. model3 wins fidelity 4–0.** Identity and craft are level. The 8–6 is
narrow and comes almost entirely from one question.

## The fidelity sweep needs a caveat I should state rather than bury

The brief describes **Sly 3 (2005)**. The supplied model is Sly as he appears in **Ratchet & Clank:
Rift Apart (2021)** — a different canonical design by a different studio, sixteen years apart. Some
of what the critic scored as infidelity is a design difference, not a defect: the red thigh wraps it
objected to three times are that design's costume. Judging a Rift Apart Sly against a Sly 3 brief
loads question 3 against it before anyone looks. **This does not invalidate the round** — the brief
was sealed, the project's stated target IS the Sly 3 look, and a 4–0 sweep is a real signal about
which model matches that target. But "fails fidelity" here partly means "is a different official
design", and the work list below separates the two.

## Real defects, distinguished from design difference

**On dlrig — genuine bugs:**
1. **The tail shows no rings in any of the four frames** — the critic calls it *"a solid dark-brown
   lobe with zero ring pattern"*, and this cost it identity twice and fidelity four times. The
   supplied `sly_tail.png` **is** a banded stripe texture. Sly's tail is ringed in every design,
   including Rift Apart. So this is a texture-mapping fault on the tail material, not a costume
   difference — the highest-value single fix available and directly actionable.
2. **The gloves read as five-to-six long splayed rake fingers**, oversized against the head and
   centre-frame in three shots. The critic names this the loudest craft artefact in the set. The
   asset's hands carry 20 finger bones each, all folded onto our single `hand` bone; the splay is
   plausibly that fold plus our clip's hand pose.

**On model3 — its own systematic failure, which the critic flagged unprompted:** *"its cane hook is
detached from the hand in all four frames"*. That is a build error, and it is the same cane-pose
defect four judges have now named across this series.

**On both:** *"neither model matches the brief's flat cel shading — both use soft painterly gradient
ramps on the blue"*. That is a SHADING finding, not a model finding, and it applies to the renderer.
It is the first time a judge has named it about both builds at once, which makes it a real item
rather than a model preference.

## Decision — a verification, not a gate

PREREG-charab's machinery governs decisions *I* make about work *I* am invested in. **This default
moved because the project's owner instructed it** ("use this new character model and proceed"), and
§200 records that plainly. So this round does not fire a revert, and I am not treating 8–6 as
authority to undo an owner's choice.

**The default stays on `dlrig`. The finding is reported, not acted on.** What the owner now has that
they did not have before: an independent blind judge, on frames from the current build, preferring
the procedural model 8–6 — narrowly, on fidelity to a Sly 3 brief the imported model is not a Sly 3
model, and against a 3–1 silhouette loss in the other direction. `?char=model3` remains one token
away if they want it back.

Independent of the aesthetic verdict, `dlrig` carries the complete 39,963-vertex mesh, its authored
normals, artist skin weights, and a tail that holds volume where the auto-skinned build's collapsed.
Those are not aesthetic claims and the round does not touch them.

## Work list, in priority order

1. **dlrig tail rings** — texture mapping on the tail material. Highest value, clearly a bug.
2. **dlrig gloves** — finger splay from the 20-bone fold onto one hand bone.
3. **model3 cane hook detachment** — named by five judges now, still unfixed.
4. **Flat cel shading on both** — a renderer item: the blue reads as a painterly gradient where the
   target is banded. First time named against both builds simultaneously.
