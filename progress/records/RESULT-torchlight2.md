# RESULT-torchlight2 — VOID again (PF4), and this time it is dispositive: cross-boot [0,0] is unachievable on this renderer; the A/B must move into one boot

Scored against `PREREG-torchlight2.md` (c85106c) per its branches. One session, warm-up
boot, ref-pinned arms — every run-4 instrument defect fixed, and the fixes all PASSED:
V1-v2 (guard slot tracked, 2.0 cm A2-vs-A stand delta), F2 (guard torch 15.03 m ≥ 8.5 from
the FAR surface), F1 +2.14 L / +11.96 R−B and F1b +0.16/+1.27 inside the DERIVED bands,
trees exact {ecac37…/80ca39…}. Frames `progress/records/torchlight2/`; log
`torchlight2-score-run1.log`.

## The dispositive numbers

```
same-boot   R1 restore-vs-cand: 0 px            (and every per-shot back today: 0 px)
cross-boot  D1 base2-vs-base: interior 28,123 px · hero 51,286 px   (bar [0,0] ⇒ PF4)
            B_* cand-vs-base: 30k–582k px across all 15 shots        (VOID under PF4)
            N1 null0-vs-base: 42,870 px                              (VOID under PF4)
POOL        +24.3 L, +92.4 R−B, warm% 2.3 → 89.2 · KO ×1.64 · V2 2.5 live   (again)
```

Run 4 measured D1 = 49k/80k across a 3 h session gap and we attributed it to the gap. This
run measured 28k/51k with NO gap, warm boots, one session — the attribution is dead.
**Boot identity, not session identity, is the drift boundary** (§296-f3's luma-sag samples
at a different process age per boot). Within a boot, this renderer is byte-exact; across
boots, never. A cross-boot [0,0] bar is an unachievable bar (§296.3 class), now measured
twice under two escalating disciplines. PF4 fired both times exactly as registered —
fail-closed working as designed.

## Disposition — PREREG-torchlight3, the same-boot design

The candidate has a runtime lever (`uLocalToon`, R1-proven exact under poke/restore), so the
entire A/B fits in ONE boot on the CAND tree:

- Arms per shot: poke 0.0 (base-equivalent) → poke 2.5 (candidate) → poke 0.0 back
  (validity), {dt:0} — the c10postfx2/twilight pattern that held 0 px on every block today.
- B-bars become same-boot [0,0] diffs (0.0-arm vs 2.5-arm) on the 15 protected shots.
- The one irreducibly cross-tree claim — "CAND tree at 0.0 ≡ BASE tree" — leaves the frame
  bars: it is the IEEE argument (term × 0.0 = 0 for finite inputs, stated in the TUNE
  comment) plus N1's semantics, and it is RECORDED as an analytic premise, not measured as
  an unachievable pixel bar.
- D1 disappears: no cross-boot comparison remains. One boot ≈ 80 min, POOL/FAR/KO/V/F bars
  carried verbatim from v2 (their derivations were just validated).

localToon stays at the registered fallback 0.0 until torchlight3's verdict. The mechanism's
effect evidence is now twice-replicated (+24.3 L pool, dose-monotone, 89% warm coverage) —
what is missing is only a valid protection instrument, and the same-boot design is the one
this environment has proven it can score.
