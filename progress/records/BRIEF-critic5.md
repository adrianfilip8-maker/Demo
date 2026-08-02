# Critic pass 5 — brief (written 2026-08-02, to run when the verification batch drains)

Prepared in advance so the capture can be scheduled the moment the tree is final. Pass 4
(`ed67555`) returned **REJECT, 3.50/10** on four shots and 4.29 across seven, against a
passing floor of 8. The tree has moved roughly a hundred commits since.

## What is deliberately NOT in this brief

**The change list.** The critic is not told what was fixed, what shipped this session, or
which conditions the owners believe closed. A harsh critic who knows where the work went looks
there and grades the effort; a blind one looks at the frame and grades the result. Every
agent's claimed closure is a hypothesis about what the frames will show, and this pass is the
test of those hypotheses — so it must not be handed the answers. `KNOWN_ISSUES.md` and
`progress/records/` remain readable if the critic chooses (they are the project's record, and
method lessons like §26 are legitimately useful), but nothing will be pushed at it.

## Standing requirements, from the original mandate

1. **Score all ten canonical shots**, not a subset. Prior passes scored what existed; the full
   set now renders reliably (bud35: ten rows, zero errors).
2. **Passing floor is 8/10**, and it is not negotiable downward by the critic or by me. The
   mandate is "utterly wowed when compared with the actual Sly Cooper, Mario, and Zelda games."
3. **Blind side-by-side comparison is the binding test.** Set each frame against the
   comparison title's equivalent shot type and answer the question the mandate actually asks:
   *which one looks better?* If ours loses, say so and say why in terms a modeller or shader
   author can act on. A number that does not survive "would a player pick this frame" is not
   the verdict; the picked frame is.
4. **Provenance before pixels.** State the commit and dirty flag from the manifest, confirm no
   `src/` mtime falls inside the capture window, and quote frame mtimes. Pass 4's own
   provenance section is the house standard; a run that straddles two builds is void and must
   be re-shot, not caveated.
5. **Every claim carries its instrument.** §26 binds here as everywhere: bands partition, no
   sealed adjectives without thresholds, and any falsifier on an FX-bearing shot is written as
   a duplicate-arm bracket rather than a bit-identity bar (§25's amendment).

## Sequencing

The capture must be the LAST thing to render on a final tree. Order: verification batch drains
→ the A/B verdicts ship their winning values (goldonset's onset, creamfix's `subjWarmShade`,
whatever the tail verdict routes) → tree committed and clean → then and only then, one ten-shot
capture for the critic. A critic pass on a tree that is about to change is a pass that will
have to be repeated, and each one costs 40–60 minutes of exclusive lock.

## What a REJECT means here

It means the loop continues: findings route to owners, owners seal preregs, fixes ship,
another pass runs. That is the mandate — "keep going until each sub-agent is utterly wowed" —
and four rejections so far are the process working, not failing. The one thing a critic must
never do is soften a verdict because the work has been long.
