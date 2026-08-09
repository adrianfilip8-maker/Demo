# ADDENDUM to PREREG-heroread — run 2's instrument, registered before run 2 exists

Run 1 is VOID (`RESULT-heroread.md`) on two instrument defects, not on anything about the
candidate. This addendum changes the **instrument** and adds one gate. It is written and committed
before run 2 is queued.

## Not one threshold moves

`C1` ≥ 4.0 · `C2` ≤ 1.5 · `F1` ≥ +100 · `F2` ≤ 0.90 × A with premise A ≥ 1.40 · `F3` |Δ| ≤ 12 ·
`H1` ≥ 20 px and ≥ 30 px · `H2` ≥ 180 px · `H3` 8 ≤ top, bottom ≤ 712 · `H4` ≥ 2.2× ·
`H5` ≥ 65 px · `H6` ≥ 2.2×.

All identical to the seal. §141.1 holds: run 1 produced no scoreable number, so there is no
candidate to have moved a bar toward.

## Three changes, all to how the number is taken

1. **The character mask predicate is `B >= 254`, was `B > 127`.** Not a tuned threshold — `vSlySkin`
   is 0.0 or 1.0 and the debug path writes it unmodified, so on a toon pixel it quantises to
   exactly 0 or 255. At 127 the population admitted the sky, which is not a toon pixel and keeps
   its own blue; the largest component came back as the sky and was bit-identical in both staging
   arms. Run 1's `H1` caught it.
2. **One lock, one tree.** Both face arms load in the same browser against the same vite server by
   `page.goto`, instead of two `withGame` calls with a FIFO wait between them.
3. **`G-TREE`, a new MUST-FIRE gate.** The working tree of `src/` is hashed at every arm and the
   run returns VOID rather than a score when they differ. Hashes the tree, not `HEAD`: vite
   compiles files, so an uncommitted edit is in the render and not in any commit.
   - Falsifier: `G-TREE` differs → whole run **VOID**, both halves, no exceptions and no
     partial credit for the D4 half even though its arms are seconds apart.

## One prediction, registered because run 1 raised it and I do not want to explain it afterwards

Run 1's `NOSE` ROI counted **153 dark pixels in both arms, exactly unchanged**, while `CHEEK` R/B
moved 1.685 → 1.532 in the same pair. If the texture switched (and the cheek says it did), an
unchanged nose count is a real signal, not noise. Two candidate causes, and run 2 distinguishes
them without a new threshold:

- the ROI `(582,165)-(622,205)` does not contain the muzzle tip at this framing; or
- the black nose is not reaching the frame.

Run 2 writes the mask PNGs and the `sly-closeup` frames for both arms, so the ROI can be checked
against the rendered muzzle **after** `F1` is scored, not instead of it. **`F1`'s bar stays at
+100 either way.** If `F1` fails and the ROI turns out to be misplaced, that is reported as a
FAILED gate plus a misplaced ROI — not as a pass, and not re-scored on a moved box.

## Artefacts run 2 must write, because run 1 could not be re-diagnosed from its own

`<shot>-<arm>-mask.png` for all four staging frames. Run 1's population defect had to be
reconstructed from a bounding box in the JSON because the masks were never saved.
