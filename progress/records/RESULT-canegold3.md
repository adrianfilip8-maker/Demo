# RESULT-canegold3 — DO NOT SHIP (the seal's registered outcome 2): the dielectric cell produces no highlight at all, but two protection bars failed, so this is evidence, not a clean refutation

Scored against `PREREG-canegold3.md` (acf3973) via the seal's own re-score path
(`node tools/canegold3.mjs --score-only`), which **reproduced the logged verdict** — the run's
own anti-drift condition. Three shots as registered (gate `sly-closeup`, replication `sly-key`,
DIAG `sly-profile`); 4.5 h of lock.

## Verdict

```
P1_backs PASS · P2_null PASS · P3_control PASS · P4_reshow PASS · P5_others PASS
P6_environment FAIL · P7_geometry FAIL          <-- protections, see below
G1a_ping FAIL · G1b_sep PASS · G2_gold FAIL · G3_value FAIL · G4_bloom FAIL · R1_replicate FAIL
==> DO NOT SHIP (PREREG-canegold3 §6 outcome 2 — values stay as they ship)
```

## The headline number, and what it does and does not prove

`ping` is G1a's own bar: `count(L >= 248) >= 200 px` in the hook ROI. It reads **0 on every
candidate arm of both gate shots** (fillonly, speconly, hardgold, hardgold2 — closeup and key
alike), against a base that also reads 0. The dielectric cell — the one cell every previous gold
attempt never tested, since they all carried metal 0.80–1.0 — **does not put a specular highlight
on the cane at all.** G2 (saturation, 0.204 vs bar 0.44) and G3 (value) fail with it; only G1b
(separation) passes, and it passes in the base too, so it is not evidence of the candidate.

**The limit on that claim:** `P6_environment` and `P7_geometry` both FAILED at base level. These
are the seal's protections — the environment-unchanged check and the geometry fingerprint that
enforces the owner's shape lock (§294(2)). Their failure means the measurement context was not
the one registered, most plausibly the same cause as §315 (this run booted at 01:35, while six
sibling lanes were still committing mechanisms into the shared tree). **Therefore: the
DO-NOT-SHIP verdict stands on the seal's own outcome table and nothing ships; but the "no
highlight exists" finding is EVIDENCE-GRADE, not a clean refutation of the dielectric
hypothesis.** A re-run on today's stable tree would settle it — and is NOT queued, because a
4.5 h lock to re-confirm a no-ship is not worth the queue while seven other runs wait.
**P7's failure is also why no shape claim is made in either direction here** — the fingerprint
that would have proven geometry untouched is exactly the bar that did not evaluate cleanly.

LOOK gate (§7): binding **before a ship-write only**; there is no ship-write, so it was not
performed, and this RESULT claims nothing about the hook's appearance.

## Free finding worth more than the seal (DIAGNOSTIC, no bars)

The run's tail diagnostic measured in-frame ring contrast against DIAG-charmat13's published
albedo ratios: `sly-key` michelson **0.617** (p90/p10 3.05) but `sly-profile` **0.291** (1.22) —
on the same texture, whose albedo carries rings at 0.415–0.495 at every yaw. That is direct
support for CHARMAT's routed render-side seal: the tail's additive `sss 0.228` + `rim 0.62`
**compress the ring contrast at some yaws**, which is why r11/r12 saw "no rings" from behind
while the texture has them. The fix is render-side, not a texture repaint — already routed, now
with in-frame numbers behind it.

## Disposition

Nothing ships; `slydlrig:cane` values stay exactly as they are. The gold-cane defect returns to
the queue **unsolved**, with the dielectric cell now measured (weakly) as a dead end and the
metal cell already refuted by §266. Whoever takes it next should suspect the highlight is not
being produced at all rather than being produced and lost — and should budget a SHORT run: three
shots x four arms at ~9 min/arm was 4.5 h of exclusive lock (§316).
