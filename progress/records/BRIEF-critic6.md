# Critic pass 6 — brief (written 2026-08-02 22:10Z, to run when the capture queue drains)

Prepared in advance so the capture can be scheduled the moment the tree is final, exactly as
pass 5's brief was. Pass 5 returned **REJECT, 2.88/10**, with **13 of 13 frames losing their
blind side-by-side**, against a passing floor of 8.

## What is deliberately NOT in this brief

**The change list.** The critic is not told what was fixed, what shipped since pass 5, or which
conditions the owners believe closed. A harsh critic who knows where the work went looks there
and grades the effort; a blind one looks at the frame and grades the result. Every owner's
claimed closure is a hypothesis about what the frames will show, and this pass is the test of
those hypotheses — so it must not be handed the answers.

`KNOWN_ISSUES.md` and `progress/records/` remain readable if the critic chooses. They are the
project's record and the method sections are legitimately useful. **But nothing will be pushed
at the critic, and no owner will brief it.**

## On the 2.88, and the one way this number can poison the pass

Pass 5's score is stated above because pass 5's brief stated pass 4's, and because a critic
that does not know the history can drift generous out of politeness. **It is also the single
most dangerous sentence in this document.**

> The failure mode is *anchoring*: awarding a 4 or a 5 because the last one was 2.88 and
> "some progress" feels proportionate. **Do not grade the delta. Grade the frame.**

If the frames still lose their side-by-side, the correct score is in the same range as last
time regardless of how much work happened in between — and saying so is the whole value of the
pass. Equally, if a frame now wins, it wins on its own merits and the prior score is irrelevant
to how far above the floor it lands. **A pass 6 that returns 2.9 because pass 5 returned 2.88
is as useless as one that returns 5.0 for the same reason.**

## Standing requirements, from the original mandate

1. **Score all FOURTEEN canonical shots**, not a subset — the roster has grown by one since
   pass 5. `SHOT_NAMES`: `hero temple sly-closeup sly-startle sly-perch courtyard dunes
   interior night traversal combat guard sly-profile sly-key`.
2. **Passing floor is 8/10**, and it is not negotiable downward by the critic or by me. The
   mandate is "utterly wowed when compared with the actual Sly Cooper, Mario, and Zelda games."
3. **Blind side-by-side comparison is the binding test.** Set each frame against the comparison
   title's equivalent shot type and answer the question the mandate actually asks: *which one
   looks better?* If ours loses, say so and say why, in terms a modeller or shader author can
   act on. A number that does not survive "would a player pick this frame" is not the verdict;
   the picked frame is.
4. **Provenance before pixels.** State the commit and dirty flag from the manifest, confirm no
   `src/` mtime falls inside the capture window, and quote frame mtimes. A run that straddles
   two builds is void and must be re-shot, not caveated.
5. **Every claim carries its instrument.** Bands partition, no sealed adjectives without
   thresholds, and any falsifier on an FX-bearing shot is written as a duplicate-arm bracket
   rather than a bit-identity bar.

## Two requirements new to pass 6, both earned the hard way this session

**6. State how every ROI was derived, before quoting anything measured inside it.**
Three separate instruments this session returned confident numbers from a window that was in
the wrong place: an auto-located boot sole that landed on open floor and returned +17.2 L — a
number that reads exactly like "the defect is fixed"; an ROI calibrated on one framing and
reused on another, where it measured empty background; and a scan that ran off a silhouette
into sky and would have produced a false transition *in the direction of a pass*. All three
were caught by their own authors. **An ROI inherited, auto-located, or assumed is an ROI that
has not been checked** — so derive it, say how, and where practical show that it contains what
it claims to contain.

**7. Look hardest where nothing is instrumented.**
Pass 5's most valuable findings — an unreliable mask, hard-plate tail segments, missing contact
shadow, chromatic pixels crowding two hue windows — were things **no seal in the project was
watching**. The measured items were mostly in decent shape; the unmeasured ones lost the
comparison. That is the pass's job and it is worth stating explicitly: **the frames' worst
problems are, by construction, the ones nobody has built a number for yet.** Do not restrict
attention to what the record discusses.

## Sequencing

The capture must be the LAST thing to render on a final tree. Order: capture queue drains →
every in-flight verdict is adjudicated and its winning value shipped or explicitly withheld →
tree committed and clean → **then and only then**, one fourteen-shot capture for the critic.

A critic pass on a tree that is about to change is a pass that will have to be repeated, and
each one costs 40–60 minutes of exclusive lock. At the measured pace of this session's runs
(~7 minutes per shot after a ~7.5 minute one-time boot) a fourteen-shot pass is roughly 105
minutes of held lock. Budget it as such; do not interleave it.

## What a REJECT means here

It means the loop continues: findings route to owners, owners seal preregs, fixes ship, another
pass runs. Five rejections so far are the process working, not failing.

**The one thing a critic must never do is soften a verdict because the work has been long.**
That line is carried verbatim from pass 5's brief, and after this session it needs a companion:
*and never harden one because the record is full of careful method.* The ledger now runs to
sixty sections of instruments, controls and self-corrections. **None of that is visible in a
frame, and none of it should earn a single point.** Grade the pixels.
