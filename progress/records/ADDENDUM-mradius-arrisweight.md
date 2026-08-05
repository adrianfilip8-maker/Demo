# ADDENDUM to PREREG-mradius.md — the arris-normal weight, corrected BEFORE any frame exists

Written 2026-08-05, before any mradius capture has started (the lock is currently held by
SKY's skyswirl run; no mradius frame, ticket, or src edit exists at this writing). This is
the §147 / PREREG-kerb-F1 amendment form: a defect in the seal's own model, found by
building the patch offline and measuring it, recorded before the frames it governs exist.
**No sealed gate, interval, arm value, or decision rule is changed by this file.**

## The defect in the seal

PREREG-mradius §3 claims: *"The arris row's own summed normal is unchanged (same adjacent
face planes), so the draft face and everything below shade identically."* **That is
arithmetically wrong.** `computeVertexNormals` is area-weighted; splitting the top annulus
shrinks the top-strip quad that shares the arris row, so the draft face's weight in the
arris row's summed normal RISES and the arris normal steepens. Measured on the built
geometry (offline, `verify-patch.mjs` run of the exact patch against a pristine Kit copy —
tc2 params):

| tree state | arris-row normal (mean tilt from +y) | split-row normal | null-default fidelity |
|---|---|---|---|
| pristine | 26.3° | — | — |
| patched, `arrisBand: null` | 26.3° | — | **BIT-IDENTICAL** buffers (pos/nor/uv/idx) |
| patched, `0.348` (cand) | **35.4°** | exactly (0,1,0) | — |
| patched, `0` (KB) | split: 75.1° (pure draft) / 0° (pure +y) | — | — |

(The two run-end vertices carry unequal normals — the strip is one quad end-to-end and the
triangulation weights its ends differently — so "mean" is the mid-run interpolated value;
the seal's uniform-strip estimate 24.4° was the same quantity to within 2°.)

## What follows from it, registered now, before data

1. **The window remaps.** The artefact window is fixed in TILT terms (~8–18°, bounded by
   rimBand onset and the approach to shading-normal perpendicularity — PREREG-mradius §C).
   With the arris tilt rising 26.3° → 35.4° at cand, the window occupies a smaller fraction
   of a narrower strip: corrected-model count ratio ≈ 0.42–0.45 of base, i.e. **n_cand
   point ≈ 710–760**, not the sealed linear-model 1,025. Bloom's fixed-px edge bleed grows
   relatively as the band narrows and pushes the count UP by an amount the model cannot
   pin; honest pre-frame uncertainty is roughly **n_cand ∈ [650, 900]**.
2. **The sealed P4 gate [769, 1,281] STANDS EXACTLY AS SEALED.** If n_cand lands below 769
   the sealed rule fires: the linear model is refuted → **revert and record** — and this
   addendum is the pre-frame record that the *corrected* model expected precisely that, so
   a sub-769 landing is a measured confirmation of the steepening mechanism, not a
   mystery. (For any future re-arm, the corrected model puts the sealed *intent* — a 0.60×
   count — at **s ≈ 0.435**, the seal's −25% row. Not armed here; recorded so a v2 does not
   re-derive it.)
3. **P3's confinement region, clarified to match the real mechanism** (a scope correction
   derived before frames, not a response to any frame): the arris-row normal change means
   cand/kb also move shading on the faces that SHARE the arris row — the 0.31 m draft face
   and lip under it — not only the top annulus. P3's region for "confined" therefore reads:
   **the treated cornices' full projected extents (top annulus + the fillet lip/draft rows
   sharing the arris) + the 6 px bloom/AA dilation**. Everything else in P3 is unchanged —
   in particular ZERO silhouette-edge movement (positions still never move) and ~0 px
   expected on `courtyard`'s distant slivers... with the note that courtyard's cornice
   draft faces are now legitimately inside the allowed region if they shade differently.
4. **The KB signature gains one named element**: the split at s=0 turns the draft face's
   top row to the pure draft normal (75.1°), so the draft face BRIGHTENS/hardens along its
   top edge in kb — part of the expected hard-edge reading at the registered crops, inside
   the treated region.
5. **The cand look, predicted before frames**: under the corrected model the narrowed band
   is accompanied by a DARK zone hugging the arris (the strip's outer portion crosses
   shading-normal perpendicularity sooner), so cand at 4× should read as a thinner bright
   line over a dark pre-arris line — an edge-like pair, not a wash. This is written down
   now so the P4 crop reading ("no doubling") is judged against the registered REJECT
   meaning (railroad/sticker artefacts, hullkerb P5 vocabulary) and not against this
   predicted, in-family light/dark edge pair. If the scorer cannot distinguish the two,
   the outcome is the seal's existing crops-rule arbitration, not a silent pass.

## Scaffold disposition (coordinator's question, answered from the seal)

The `arrisBand` opt-in row is **not a staying scaffold**: PREREG-mradius §5's ship rule
("Anything else: revert every arm byte-exactly") governs. Src is restored pristine before
every ticket release; on ACCEPT the coordinator ships the cand diff under its own ticket
(hullkerb precedent); on anything else the tree keeps zero bytes of this arm.

Files: this addendum; the verification lives in the scratchpad (patch fidelity table above
is its output, reproduced by `progress/records/mradius-run.mjs`'s own per-arm liveness
probes at capture time).
