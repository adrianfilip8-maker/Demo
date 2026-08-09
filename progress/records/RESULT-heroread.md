# RESULT-heroread run 1 — **VOID**, on two independent instrument defects, both caught by the arms that exist to catch them

Scored against `PREREG-heroread.md`, sealed at `310bef2` before any candidate frame existed.
Runner `tools/heroread.mjs` at `a581d27`; artefacts in `progress/records/heroread/`.

```
==> DO NOT SHIP — C1 FAIL, C2 FAIL, F1 VOID, F2 VOID, F3 VOID,
                  H1 FAIL, H2 VOID, H3 VOID, H4 VOID, H5 VOID, H6 VOID
```

**Nothing about the candidate is established by this run, in either direction.** VOID is not
FAIL and it is certainly not PASS. What the run established is that two of its own instruments
were wrong, and both were caught before they could publish a number.

---

## 1. Defect one — the two face arms were two trees (provenance). Declared before it rendered.

`?face=` is read at module-load time, so run 1 used two `withGame` calls; each takes the capture
lock separately, so the arms sat on opposite sides of a FIFO wait. `progress/records/heroread/
srctree-run1.txt`, the watcher armed while the run was still queued:

```
19:54:25 … 19:57:55   5576b417…   boot A's tree (git src tree 0aefc47e, unchanged since 4997f88)
19:58:25              7655b1d7…
19:58:55              dec6cbc2…
19:59:25              5df19aa4…
19:59:55 … onward     84a05968…   boot B's tree
```

Four `src/` edits from other lanes in ninety seconds. **VOID was declared at 20:05 in
KNOWN_ISSUES §272.3, with boot B still queued and not one pixel of it rendered.** The gates then
printed exactly that: `C2` (background must be near-identical between arms) measured **2.42**
against a bar of ≤ 1.5 — the tree drift, showing up on a patch of wall that has nothing to do
with the character, which is what that null arm is for.

`C1` (the head must differ between arms) measured **3.22** against ≥ 4.0, i.e. it also failed.
Note what that does and does not mean: it is a *combined* number over a tree change and a texture
change and cannot be attributed to either. It is not evidence that the texture failed to switch —
see §3.

## 2. Defect two — the character mask was the sky. `H1` caught it.

Registered population: `debugTerm(8)`'s **B channel > 127**, `vSlySkin`, "1.0 on a SkinnedMesh and
0.0 otherwise, so it quantises to 255/0". The second half of that sentence is only true **on toon
pixels**. The sky is not drawn by the toon shader, keeps its own colour, and its blue channel is
comfortably over 127 — so the largest 4-connected component came back as the sky:

| shot | arm | component bbox | area | centroid x |
|---|---|---|---|---|
| `hero` | old | x 0..216, y 41..205 | 24 588 | 82 |
| `hero` | new | x 0..216, y 41..205 | 24 588 | 82 |
| `courtyard` | old | x 0..1254, y 0..235 | 139 902 | 631 |
| `courtyard` | new | x 0..1254, y 0..235 | 139 899 | 631 |

Bit-identical between arms, because the sky does not move when the character does. **`H1` — the
must-fire calibration, "the staging poke took" — FAILED, and it was right to.** Every gate
downstream of it is VOID by the seal's own falsifier: *"H1 fails → VOID."*

**The lever was never in doubt, and the same run says so.** `skinTotal`, the full `B > 127` count,
moved **44 845 → 54 991** on `hero` (+10 146) and 204 482 → 205 412 on `courtyard`. The sky is
constant, so that delta is the character growing. It is not scored — an unregistered population is
not a gate — but it is why the defect is in the mask and not in the change.

**Fixed in the runner, not by widening anything.** `vSlySkin` is 0.0 or 1.0 and the debug path
writes it unmodified, so on a toon pixel it is exactly 0 or 255: the predicate is now `B >= 254`,
which is not a tuned threshold but the quantisation the channel already has. Run 2 also saves the
mask PNGs — run 1's population defect had to be reconstructed from a bounding box in the JSON
because its masks were never written out, which cost more than the disk would have.

## 3. What the run shows that is NOT scored, labelled as such

These are observations off the saved frames with the ruler that produced the seal's baseline. They
are **not** the sealed instrument, they are read after seeing the candidate, and they decide
nothing. They are here because they say where run 2 should land.

- **Both staging arms rendered, from one boot and one tree.** `hero-old.png` vs `hero-nw.png`
  differ on **30 309 px** in a bbox y 35..549, x 313..830; `courtyard` on 9 593 px. The in-page
  poke of `SHOTS` worked; only the mask predicate was broken.
- **`hero-old.png` shows the float.** The boot tip ends in air with the architrave receding
  behind it — the 3.80 m the downward ray predicted, now visible at 1×.
- Ruler read, crown to boot: **old 114 px (15.8 %)**, agreeing with the r9 read of 113 px across
  ~120 commits of other lanes' work; **new 203 px (28.2 %)** against the projection's predicted
  202 px / 28.1 %. `H2`'s bar was 180.
- Face, from the two arms: `CHEEK` R/B **1.685 → 1.532** (−9.1 %), direction as designed, bar
  ≤ 1.517 missed by 1 %; `CHEEK` L 133.2 → 132.2, i.e. value held. `NOSE` dark count **153 → 153,
  exactly unchanged** — the one number that looks like a real negative rather than tree noise, and
  the first thing run 2 must resolve: either that ROI does not contain the muzzle tip at this
  framing, or the nose is not reaching the frame.

## 4. What changes for run 2, and what does not

**Not one threshold moves (§141.1).** `C1` 4.0, `C2` 1.5, `F1` +100, `F2` ×0.90, `F3` 12, `H1`
20 px / 30 px, `H2` 180 px, `H3` 8/712, `H4` 2.2×, `H5` 65 px, `H6` 2.2× all stand exactly as
sealed. The instrument changes; the bars do not. Registered in `ADDENDUM-heroread-run2.md`.

1. **One lock, one tree.** Both face arms load in the same browser against the same vite server
   via `page.goto`, so the run takes the FIFO once instead of twice.
2. **`G-TREE`, a new must-fire gate.** The working tree of `src/` is hashed at every arm; the run
   VOIDs rather than scores when they differ. It hashes the tree and not `HEAD`, because vite
   compiles files and an uncommitted edit is in the render but not in a commit.
3. **`B >= 254`** for the character mask, and the mask PNGs are written.

`G-TREE` cannot make a contended container quiet. If other lanes commit to `src/` during run 2 it
will VOID again — correctly. That is a cost of the shared tree, not of this change, and the answer
is a shorter run, which is what one lock instead of two buys.

## 5. Corrections to the seal's own descriptive table

`sly-perch` is entered in the seal §1 as "~500 px / ~69 %" with a tilde, unread. Ruler-read
afterwards — crown y 104 to boot y 570 — it is **466 px = 64.7 %**. No gate depends on it; the
correction is recorded here rather than edited into a sealed document.

## 6. Still open in this lane

- **The contrast half of D4 is untouched and unmeasured.** Critic 9's `hero` complaint is two
  things and this work addresses only the size. As a lock-free forecast on r9 pixels, the screen
  box the new stand occupies read mean L **58.1** where the old one read **79.8** against a wall
  at 88.8 — so the backdrop is darker, but that is a prediction on a stale frame and no more.
- **`night` (12.5 %) and `temple` (12.4 %)** remain under the reference band. `night`'s defect is
  D8's duotone; `temple`'s camera pitches up, so moving the subject toward it drives his feet off
  the bottom edge. Both need a camera, which is a larger baseline move than this lane took.
- **The hands.** No claw geometry exists. At 9× on `sly-perch` the "four to five long tapered
  claws" resolve as four splayed glove fingers, each with a full ink outline and a warm rim strip
  at a size where the hull is thick relative to the finger, plus D2's violet cast on what is a
  blue glove with a gold cuff. A hand POSE and a grade, not a glove asset.
