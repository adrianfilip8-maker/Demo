# ADDENDUM-attractor-run1 — VOID, all eight pairs: the swap resolved 'raw' by restoring the BOOT texture, and the boot texture is no longer raw

Run 1 of PREREG-attractor captured both boots cleanly — toggles echoed, C-DRIFT zero on both
shots — and every A/B pair rendered **byte-identical** (mask 0, `sha(A) = sha(B)`), so all
eight pairs voided on CAL-2 and the lattice scored VOID on both shots.

## The defect

`slySwapBodyTex('raw')` was written as "restore `original`", where `original` is the map the
model booted with. That was correct for its entire life — until `66fbe7f`, when
PREREG-bodyhue6's PASS flipped `bodyMode()`'s default to `'fix'`. From that commit on, the
boot map IS the fix texture, so:

    swap('raw')  →  bodyMat.map = original      = FIX
    swap('fix')  →  bodyMat.map = cache('fix')  = FIX

Both arms fix, delta zero, mask empty. Every capture instrument that uses the swap inherited
this the moment the default flipped — bodyhue5/6 did not hit it only because they ran *before*
the flip landed.

## What worked

CAL-2 is fail-closed and it closed: identical arms cannot masquerade as "the fix does nothing"
because the sha test voids the pair first — the exact misreading run 1 of bodyhue was designed
against. The toggle machinery (TUNE pokes, post-step readback, drift residue) all passed its
gates and needs no change.

## The fix (shipped with this addendum)

The swap now derives the boot mode from `BODY_MODE`, reuses the boot map only when it matches
the wanted mode, and lazily loads the OTHER file (`sly_body.png` for 'raw', `sly_body_fix.png`
for 'fix') through the same loader-and-sampler-copy path, cache keyed by mode. A source test
pins all three properties (`tests/slybody.test.mjs`, "mode-faithful under ANY boot default").

## Standing

PREREG-attractor's bars did not move and were never evaluated (no pair produced a number).
Run 2 recaptures the identical lattice on the repaired swap. Run 1's frames are dead pairs of
identical images; there is nothing in them to quarantine.
