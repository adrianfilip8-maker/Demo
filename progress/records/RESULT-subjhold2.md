# RESULT-subjhold2 — SHIP. The subject holds its own hue in shade, and the mid-range half of D2 closes at the mechanism

Sealed `PREREG-subjhold2.md` (5157df4; everything verbatim from PREREG-subjhold 88d522a except
the delta-form face gate). Fresh five-boot capture `shots/subjhold2`, tree `df399742aaeb94e8`,
scored by `tools/subjholdscore.mjs` with `SANDS_SEAL=2`.

## The scoreboard — 22/22 numeric bars, plus the LOOK gate

```
P2-MID   hero      hueB 216.2°  |Δref| 2.7   PASS     (base 223.9°)
P2-MID   interior  hueB 217.4°  |Δref| 3.9   PASS     (base 224.2°)
PROT-CLOSE         hueB 217.0°               PASS     (base 218.9°)
PROT-FACE(Δ)       Δcream 1, Δrings 1        PASS     (|Δ| ≤ 7; n 1086/872, 349/351)
PROT-ARCH temple   139 px, corners 0, Sly's bbox      PASS
PROT-NIGHT         brMed +47, corners 0      PASS
LOOK (prose, binding): run-2's own base|hold night crop — the subject reads fully moonlit
  in both arms; the hold DEEPENS the costume's blue in night shade; world identical.  PASS
CAL-FULL −9.5 vs −9.0±2.0 · CAL-FACE-N all ≥ 200 · C-DRIFT 0 px × 5 · readbacks live
joint arm (report): fill leg adds 0.2° with the hold in

OUTCOME: SHIP — TUNE.subjShadowHold 0.0 → 1.0 in this commit, test pin updated with it.
```

Run 2 reproduced run 1 to the decimal on every shared number — same tree, dt = 0, full
determinism — so the re-capture confirms rather than merely repeats: the mis-sealed face
corridor was the only thing between run 1 and shipping.

## What ships, and its scope

`subjShadowHold: 1.0` — in shade, every skinned draw (Sly and the guards) carries its own
albedo hue through §269's luminance-renormalised hold band instead of taking the saturated
blue shade light's hue. Architecture is out of scope by arithmetic and verified by frame
(139 changed pixels on temple, all inside the subject's bbox). The forecast registered SHIP:
**right for once — 3/13.**

## The D2 ledger closes (pending the blind round)

- **Close range** (albedo governs): fixed at the texture — bodyhue6's PASS, −11.3° rotation,
  §283.
- **Mid range** (shade light governs): fixed at the mechanism — this ship. hero and interior,
  the two shots that carried §281's compression, now land 216.2° / 217.4° against the
  reference 213.5 ± 6.0°.
- **What remains open on the chain:** §277's saturation half (the render still destroys
  authored saturation — untouched by both fixes); D1 (architecture shade hue — the hold
  stays 0.0 there and holdscope's scoping question stands); D3 (value structure); and the
  standing verification debt — a blind-critic round on fresh canonical frames, which is the
  project's bar for calling any of this "done".
