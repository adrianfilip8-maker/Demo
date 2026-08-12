# PREREG-guardfix — the black-mannequin guard: a missing attribute at the Carmelita merge seam

Sealed **before** the fix exists. `shots/guardfix/` does not exist at the time of writing.

## 1. The diagnosis (tools/guardmat.mjs, two runs; offline build check)

Critic 10's worst shot (guard, 2/10: "glossy untextured black body… forearms glowing
blue-white"). Probe: **9 of 11 guard meshes have NO `color` attribute** while both guard
materials are `vertexColors: true`; an unbound colour attribute reads (0,0,0), so albedo =
map × black — only spec and the #7fd4ff rim survive, which is exactly the frame. The nine are
the roster's temple/heavy guards wearing the **Carmelita import's geometry** (Guard.js:1110
splices `loadCarmelitaGuard()` over the procedural assets; CarmelitaGuard.js:253's sanitizer
deletes every attribute off its keep-list, `color` included — correct for a textured import).
The two healthy meshes are the procedural scarabs (build-time check: every procedural asset
carries full colours — temple 4527/4527, heavy 4706/4706, scarab 832/832). The import is
deliberate (IMPORT-slyrepos-movement.md); the break is the seam between its geometry contract
and the garrison's material contract.

## 2. The candidate

At the merge site in `Guard.js` (after `assets[t] = { ...assets[t], ...carmelita }`): if the
merged geometry lacks a `color` attribute, synthesize one — all-ones, position-count — so the
vertex-colour multiply is the identity. Linen and bronze render from their maps; the
procedural accents (lapis/carnelian bands) are absent on the import body, accepted for this
fix and left for the critic to re-rank. No material, sanitizer, or procedural path changes.

## 3. Bars

- **B1 (mechanical, must all hold):** re-run `tools/guardmat.mjs` — 11/11 guard meshes report
  `hasColorAttr: true`; the nine import bodies report colour mean [1.00, 1.00, 1.00]; the two
  scarab meshes report means unchanged from today's dump (body [0.20, 0.25, 0.18], metal
  [0.15, 0.07, 0.02], ±0.02 per channel) — the fix must not touch procedural colours.
- **B2 (frame, prose, binding):** one fresh capture of the `guard` shot; the guard must read
  as a lit, clothed figure — linen body, readable head — not a black-gloss mannequin. Eyeball
  verdict recorded like PROT-NIGHT's LOOK. (The aesthetic score is round 11's job, not
  this seal's.)
- **B3 (suite):** full test suite green, plus a source test pinning the synthesis at the
  merge site.

Outcomes: **FIXED** (all bars) → keep; **NOT-FIXED** (B2 fails with B1 green) → the diagnosis
was incomplete, revert nothing, RESULT records what the frame shows; VOID on probe failure.

## 4. Expected outcome, in advance

**FIXED.** The mechanism is arithmetic (map × 0 → map × 1) and the probe verifies the exact
quantity that was wrong. The residual risk is a second simultaneous defect hiding behind the
black (e.g. the head submesh's own binding) — which B2 exists to catch. Ledger: 3/13.
