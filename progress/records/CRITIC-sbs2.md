# CRITIC-sbs2 — the second §7.4 blind side-by-side, measured against round 1's baseline

**STATUS: IN PROGRESS — written incrementally (§163/§164 rollback discipline). An abrupt end
means a rollback took the session, not that the review concluded.**

**Date:** 2026-08-05. **Critic:** adversarial visual review per `tools/CRITIC.md`; no `src/**`
touched. **Baseline:** `CRITIC-sbs1.md` (1 win / 9 losses, frames of 2026-08-01 across five trees).
**Method:** identical to round 1 — same pinned comparand routes re-fetched to the scratchpad, both
frames scaled to equal height, ours in randomised left/right position (SystemRandom, mapping
withheld until verdicts recorded per side), then rect-level measurement on the full-res frames.

**Our frames this round:** `progress/records/sbs2/*.png` — all ten canonical shots, 1280×720
quality=high, captured 2026-08-05 17:04/17:23 on ONE tree (report.json: commit 16a3817+dirty),
which removes round 1's five-trees-in-one-day caveat. The tree carries five ships the baseline
frames predated: the sky cloud-deck fix (skynoise: `TUNE.decks` scale/soft — courtyard/dunes/night),
eyesize 0.55 (sly-closeup), capYaw −10° (sly-closeup/combat), the gold-only prop hull
(interior/courtyard), and the §132.4 violet-pair (`shadowTeal 0.15` + `shadowBounceMix 0.05`)
plus the §130.4 chisel pass. It does NOT carry: banda's warm-restoration (scored, no-ship
decision pending at capture — cream/tail teal expected unchanged), goldlobe's glint (P-F1 REVERT,
`goldGlint 0.0` shipped), or fxcluster's cone/sparkle/flash candidates (not shipped). Movement
claims below credit only ships that happened.

---

*(sections below are appended as the review executes; an absent section was not reached)*
