# RESULT-caneswap2 — VERIFIED: the §294 cane swap holds on pixels, inside the derived window

Sealed `PREREG-caneswap2.md` (a1ca254), candidate unchanged since 5ecc80b, ONE boot via
`tools/caneswap2.mjs`, frame `shots/caneswap2/sly-closeup.png` (1280x720 high, SwiftShader).

## Bars

```
I1   boot: __GAME.ready, ZERO console errors, no CaneAsset warnings          PASS
     restore diff 0 px; cane-side tree stable across both stamps            PASS
B1a  cane mesh 306 verts / 774 indices (the glb Cane primitive)              PASS
B1b  warn line: "sly-cane.glb (§294) socketed to handR (grip 22.2 mm)"       PASS
B1c  live slydlrig:cane map decoded at 1024                                  PASS
B2'  mask sly-closeup 41084 px in (200, 55000) — the derived window          PASS
B3   LOOK on the fresh frame: open C crook, daylight through it, curling
     forward off the right hand; dark textured shaft under a pale-gold
     hook (the asset's two-tone albedo, not flat gold); ONE ink line, no
     double outline; tip planted by the left boot; reads as Sly's cane.      PASS
B4   suite green at the seal (475/475)                                       PASS
OUTCOME: VERIFIED
```

Run-to-run: 41084 px against run 1's 40982 on the same shot — 0.25% drift, an order of
magnitude inside §269's 2.7% cross-boot figure. The two runs agree on what the cane paints;
only the ceiling changed, and this one was derived (PREREG §1), not borrowed.

## Tree stamps (eeccb0a discipline)

Launch: HEAD a1ca254, dirty = `M src/render/PostFX.js` + two untracked records files (the
critic10postfx lane's in-flight candidate — render-side, not cane-side). Teardown: HEAD
04d7b768 (that lane committed mid-run), PostFX.js clean. `I1_cane_tree_stable` checked that
no `src/player/**` or `src/assets/sly-cane/**` path appeared in either dirty list and PASSED —
the run measured 5ecc80b's cane byte-for-byte. HEAD movement is reported here, as registered:
it was other lanes' work, outside this run's subject, and the frame was captured in one boot
with the world clock frozen per snap.

## The chain, closed

`PREREG-caneswap` (b795b40) → run 1 NOT-VERIFIED on one borrowed constant, everything else
passing (`RESULT-caneswap.md`) → `PREREG-caneswap2` (a1ca254) reseals the constant with its
derivation → run 2 **VERIFIED** with no bar reinterpreted after the fact. The §294 owner
instruction is executed and pixel-verified: the downloaded cane is Sly's cane in the shipped
build, shape untouched, licence recorded UNKNOWN where it ships (`src/assets/sly-cane/
PROVENANCE.md`). Forecast: VERIFIED, and it was — ledger note for whoever keeps count: the
caneswap pair went 0/1 then 1/1, and the miss was an instrument constant, not the candidate.
