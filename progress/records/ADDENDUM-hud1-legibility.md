# ADDENDUM to PREREG-hud1 — M6, a legibility floor

Registered BEFORE the fix, AFTER looking at the first render. Stating that plainly because it
matters for how much this measurement is worth: M1–M5 were registered blind, M6 was prompted by
seeing `scratchpad/v1.png` and `v3.png`. It is a NEW defect found by looking, not a re-derivation
of an existing criterion to make a failing candidate pass (§141.1) — no M1–M5 threshold moves.

## What looking found

Rendering the real `src/ui/*` markup and stylesheet over `shots/courtyard.png` at 1280×720 (no
WebGL, no game boot, no capture lock) showed the guard alert badge labels — `SEARCHING`,
`LOST YOU`, `SPOTTED` — set at `calc(var(--u) * .58)`. At the minimum supported viewport `--u`
resolves to its 11 px clamp floor, so those labels render at **6.4 px**. The lock-on label is
`.62` → 6.8 px.

## The criterion

An absolute pixel floor would be arbitrary, so this is deliberately a *relative* one:

> **No gameplay-critical text run may be set smaller than the smallest reference text run.**

- *Gameplay-critical* = read while play continues: the HUD proper, world markers, the Binocucom.
- *Reference* = read only while the game is paused: the control menu.

Setting the most urgent information in the game — which guard has seen you — smaller than a
pause-menu footnote is incoherent at any absolute size, which is why the comparison needs no
magic number. The reference minimum is `.sly-row .dsc small` at `.68`.

**CALIBRATION ARM (must fire)**: the pre-fix values must FAIL this assertion and must name
`.sly-alert-lbl` and `.sly-mark .lbl` specifically.

**§211.1**: the test asserts a non-zero, exactly-pinned count of parsed font-size declarations, so
a regex that stops matching fails loudly instead of passing having measured nothing.

## Also found by looking, fixed without a new threshold

The Binocucom's corner brackets overlap its own corner readouts — the top-left `BINOCUCOM MK-IV`
line collides with the `tl` bracket's horizontal arm, and the same at bottom-right. Pure layout
arithmetic: the bracket occupies `.55u … 3.15u` from each corner, the readouts start at `1.15u`.
Corrected by moving the readouts clear. Asserted in the test as an inset comparison rather than a
judgement.
