# PREREG-capbill — a yaw offset for the bill, projected at both bearings before any capture

**Owner:** CHARACTER. **Tree at registration:** HEAD `1858d5d`, srcTree `3fea650a4d645857`
(`find src -name '*.js' | sort | xargs sha256sum | sha256sum`, run from the repo root —
repo-relative paths, because `sha256sum` hashes the paths too and an absolute-path invocation
gives a different digest for a bit-identical tree). **No `src/**` edit has been made.** This file
registers the candidate, the gates and the falsifiers; the frame rules.

**Question** (KNOWN_ISSUES §151.4, §153.6; DIGEST CHARACTER): the cap fails at `sly-closeup`'s
33° bearing — the bill foreshortens to nothing and the crown alone reads as skull — and reads at
`combat`'s 45°. It is a yaw problem; `capCock` is a roll and a measured null; it is not to be
fixed by moving the shot. Is there a bill-geometry change that keeps a readable bill silhouette
across 33°–45° without contradicting any measured record?

---

## 1. The candidate

**`capYaw = −0.175 rad (−10°)`: yaw the whole cap about the vertical head axis through the cap
pivot `(0, 1.640, 0)`, bill toward his RIGHT.** Both scored cameras sit on his LEFT
(`sly-closeup` φ +33.2°, `combat` φ +44.9°, shotsil convention, positive = his left), so a yaw
away from them increases the bill's effective bearing at both — this is the one candidate that
does not trade one bearing against the other, and §5's projection confirms it improves both.

Exact edit shape in `_buildCap` (`SlyModel.js:2540`), as a `CHAR_AB` token arm per §153.5
(default-off token, never edit-and-revert):

```js
const capYaw = CHAR_AB('capyaw10') ? -0.175 : 0;
const tilt = new THREE.Matrix4().makeRotationX(TUNE.capTip)
  .premultiply(new THREE.Matrix4().makeRotationZ(TUNE.capCock))
  .premultiply(new THREE.Matrix4().makeRotationY(capYaw));
```

**Treated population, measured rather than inferred (§153.3):** everything routed through
`place()` — crown tube, hem band, brim tube, gold button. Counted in the built geometry by
`capbill-proj.mjs`: **944 vertices, of which 327 are the brim tube** (group `clothDark` with
dominant bone `capBrim`). No body-loft vertex, no fur card, no mask vertex moves. The projector
applies exactly this transform (yaw in head space about the pivot, composed after tilt,
including the anisotropic `hw`/`hx` map), so the projection below is of the proposed edit, not
of an approximation of it.

## 2. Why yaw, when §153.6 said "not a rotation of any kind"

§153.6's diagnosis — the bill wraps the brow instead of projecting, so the fix "needs projected
extent that survives a near-axis view, which is a shape change, not a rotation of any kind" —
generalised from two measured rotations: `capCock` (roll, 0.086→0.160 null, 0.230 regresses into
the brim-over-eye defect) and `capTip` (pitch, 0.062→0.018 was itself a fix). **Roll and pitch
move the bill within the crown's projection; neither changes the angle between the bill's own
axis and the view axis. A yaw does** — it is the one rotation that makes a near-axis view no
longer near-axis. The sign control in §5 (yaw *toward* the cameras zeroes the bill at 33°:
2.6% → 0.0%) demonstrates the mechanism is the bill-to-view angle and nothing else. So this
prereg treats §153.6's sentence as correct about the rotations it measured and tests the one it
did not. If the frame refutes the candidate, §153.6's generalisation stands confirmed for all
three rotation axes and geometry has no rotation lever left (§8, outcome C).

## 3. The other levers, closed against records before spending anything

- **Forward reach.** The crown's projected half-extent at bill height at 33° is ~0.234 m
  (semi-axes 0.230/0.244 m about a centre 0.056 m behind the pivot). Break-even needs bill reach
  `(R + 0.056)·sin 33° ≥ 0.234` ⇒ **R ≥ 0.374 m**, and a readable ~2 cm lip needs **R ≈ 0.41 m**
  — past the measured lampshade defect at 0.400 (`SlyModel.js:2679`: cap owned 51% of the head,
  face 10%, 272 brim verts in front of the mask plane; cut to 0.320 off a real capture).
  Re-opening reach contradicts a measured record; closed.
- **Droop.** To clear the crown's widest band (rings 1.600–1.680) the tip must descend below
  head-space y ≈ 1.680 — which is *below* the mask's top edge at 1.700 and 7 cm into the band
  above eye centres at 1.612. That is the navy-bar-across-the-eyes defect `brimLift` 0.112
  exists to prevent (`SlyModel.js:2672`; `occlude.mjs` both rays CLEAR is load-bearing). The
  droop that would work sits inside the eye band by arithmetic; closed.
- **Wrap width.** Measured at `TH` 1.24: a 142° visor ring that owned the entire top-front edge
  at both 33° and 70° with the crown hidden behind it — the exact opposite failure
  (`SlyModel.js:2699`). Widening contradicts that record; closed.
- **Crown slimming** (shrink the occluder instead of moving the bill): needs ~13% off the crown
  shelf whose two hard direction changes are the measured reason the cap reads at 45 px at all
  (`SlyModel.js:2559`). Trades the crown's own read for the bill's; not proposed.

## 4. Instrument

`progress/records/capbill-proj.mjs` (committed at `418bb93`) — adapted from `tools/shotsil.mjs`
(CPU skin + scan-convert; its header's caveats inherited: authored pose, no foot IK, no level
occlusion, no shader, no ink hull, no PostFX — **read for shape; the frame rules**). It renders
the real shot cameras (bearing AND elevation AND the shot's own pose — `combat` is scored in
`cane_combo_3`, whose head pose changes the effective bearing, so it is measured, not assumed)
on a 420×420 head-focus crop and reports:

- `billOutline%` — share of head-outline boundary px owned by the brim tube (separated from the
  hem by dominant bone; PART_COL's `clothDark` lumps them, so the recorded 3.3% is not
  definitionally identical to this figure);
- `billSil px / maxProtr` — the bill's silhouette *contribution*: figure px present with the
  brim tris drawn that vanish with them deleted, same frozen framing; max horizontal run in px
  and body-cm.

**Controls, run and passed before this file was written:**
- **Zero:** nobill arm vs itself = 0 px contribution, exact.
- **Sign:** +10° (toward the cameras) at 33° → billOutline 0.0%, contribution 0 px — *worse*
  than base, as the mechanism requires. A candidate direction that improved both signs would
  have meant the instrument was not measuring bill-to-view angle.
- **Calibration:** base at 33.2° reads 2.6% against the recorded 3.3% (`Shots.js` `sly-bill`
  note) — same order, definition differences stated above; base at 45° reads (8.5%) and base at
  33° does not, reproducing §151.4's finding in this instrument.

## 5. The projection (the argument the capture is being asked to confirm)

Head-crop measurements at the two real shot cameras, per candidate (px at 420-crop scale; cm
are body-cm and survive rescaling):

| arm | 33.2° billOutline | 33.2° contribution | 33.2° maxProtr | 44.9° billOutline | 44.9° contribution | 44.9° maxProtr |
|---|---|---|---|---|---|---|
| base | 2.6% | 50 px | 1.6 cm | 8.5% | 2336 px | 13.3 cm |
| −6° | 5.8% | 377 px | 3.3 cm | 9.2% | 2784 px | 14.7 cm |
| **−10°** | **8.1%** | **648 px** | **4.1 cm** | **9.4%** | **2941 px** | **14.7 cm** |
| −14° | 9.0% | 881 px | 4.5 cm | 9.6% | 3088 px | 14.7 cm |
| −18° | 9.6% | 1095 px | 3.9 cm | 10.0% | 3243 px | 14.7 cm |
| +10° (sign ctl) | 0.0% | 0 px | 0.0 cm | 7.0% | 1543 px | 9.3 cm |

At −10° the 33° bill share (8.1%) reaches what the 45° view gets today (8.5%) **and 45°
improves** — no trade. −10° is chosen inside the plateau (−18° already regresses 33°'s
protrusion as the bill starts crossing the crown's near side), not at a cliff.

Bearing sweep (`idle_confident`, maxProtr cm), the dead-band relocation stated as a property,
not discovered later:

| bearing | −10° | −5° | 0° | +5° | +10° | +15° | +20° | +30° | +33° | +35° | +45° | +60° | +70° | +90° |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| base | 8.1 | 5.7 | 3.6 | 1.4 | 0 | 0 | 0 | 1.4 | ~1.5 | 1.8 | 6.9 | 13.9 | 12.0 | 10.4 |
| −10° | 4.5 | 2.0 | 0 | 0 | 0.8 | 2.7 | 4.5 | 4.7 | ~4.2 | 3.9 | 8.3 | 12.6 | 10.7 | 10.5 |

- A ~30° dead band is **conserved** — some azimuth always looks down the bill; no geometry
  removes it. Base parks it on +5..+35, i.e. *on the scored 33°*. −10° parks it on −5..+10.
- **Every canonical bearing checked** (all 15 staged shots enumerated from `Shots.js`): the only
  camera inside the new dead band is `sly-startle` at +8.6° — which is bill-dead in BOTH arms
  (base ≈ 0.5 cm there) and is a pupil diagnostic, not a cap condition. `temple` (35.3°) goes
  1.8 → 3.9 cm; `hero`-band shots (59–77°) give back ~1.3 cm off 12–14 cm — far above read
  threshold; `sly-profile` (95°) unchanged. **Named cost:** the dead-on 0° frontal loses its two
  symmetric 3.6 cm bill lips; no scored camera sits there.
- Style: `front-yawR10-parts.png` (scratchpad `capbill/`) reads as a deliberately turned
  newsboy cap, consistent with the existing `capCock` asymmetry ("the cock is most of what
  makes it read as *his* cap"); the coordinator's critic pass is the arbiter of taste, not a
  gate here.

## 6. Registered gates for the capture (all four must hold; bands, not points — §133.1)

Arms in ONE lock hold, `tuftbias.mjs` harness pattern (per-arm `srcAtArm`/`srcAfterArm`,
`armsByTree`, navigation per arm so §124.4 does NOT apply — §159.3): **A** = base, **B** =
`VITE_CHAR_AB=capyaw10`, **BACK** = base again. Shots per arm: `sly-closeup` + `combat`,
1280×720 `--q high` (the char-capture standard). Before any capture: `occlude.mjs` with
`globalThis.__CHAR_AB='capyaw10'` — **both sclera rays CLEAR or the arm is abandoned unrun**
(GATE 0).

In-frame quantity: **E(arm, shot) = max outboard excursion, in px, of the head outline at the
registered bill rows relative to the straight interpolation of the outline between the crown
band above and the cheek band below** — the "silhouette event" a bill is. Scored by a
records scorer implementing exactly this definition (to be committed with the run before
scoring), rows and outboard side taken from `capbill-proj.mjs`'s projection at the capture
tree, padded ±25 px for pose/IK offsets the projector cannot see. Outline extracted at the
sky boundary; **scoreability check first** (§141: "unscoreable" is a registered outcome): in
arm A the 40 px outboard of the projected bill region must be sky at both shots (luma > 120),
else the gate is UNSCOREABLE and is reported as such, not converted.

Predictions at 1280×720 (289.6 px/m at `sly-closeup`, 168.3 px/m at `combat`, from fov and
staged distance):

- **GATE 1 — closeup gains a bill.** E(A, closeup) ∈ [1, 7] px (instrument calibration:
  projection says 4.6 px; outside the band = instrument suspect, do not score B against it).
  **E(B, closeup) ≥ 8 px AND E(B) − E(A) ≥ 5 px** (projection: 11.9 px; 8 px ≈ 3 ink-line
  widths — below that the lip is ink, not shape).
- **GATE 2 — combat must not pay for it.** E(A, combat) ∈ [15, 30] px (projection: 22.4).
  **E(B, combat) ≥ E(A, combat) − 3 px.** A fix that trades combat's read for sly-closeup's
  FAILS on this gate regardless of GATE 1.
- **GATE 3 — validity.** BACK ≡ A: same `srcTree` at both navigations AND whole-frame diff
  (threshold stated per §122.1: any-channel, ΣRGB ≥ 4) ≤ 200 px on both shots. If the tree
  moved: apply §160.4's bound reading — the verdict may stand ONLY if the A↔BACK residual
  inside both registered bill ROIs is 0 px; otherwise VOID, re-queue.
- **GATE 4 — no collateral.** ≥ 90% of A↔B differing px (ΣRGB ≥ 4) lie inside the head bbox
  + 25 px pad on each shot (the treatment is 944 cap verts; anything else moving means the
  token gated more than the cap). `tools/headratio.mjs` skull ratio unchanged to 2 decimals
  (cap is excluded from the skull measure by `CAP_GROUPS`; a change means vertex leakage).

## 7. Falsifiers — revert, not defend

- GATE 1 fails (bill still absent at 33° in the frame) → **the yaw mechanism is refuted in the
  graded frame** (shader/ink/PostFX ate what the projection promised — the exact gap shotsil's
  header names). Revert: token off is already the shipped state; do not ship, do not re-tune ψ
  inside the same window, record RESULT-capbill as refuted with the E table.
- GATE 2 fails (combat lost read) → the no-trade premise is wrong in frame; same revert path.
  **Do not** argue elevation/pose differences after the fact — combat's pose and elevation are
  in the projection already.
- GATE 1 passes only at a wider yaw (would need −14°/−18°): NOT grounds to swap the value
  mid-run. −10° is the registered candidate; a different value is a new prereg (the −18°
  closeup regression in §5 is why value-shopping after the frame is not safe here).
- Sign-control logic in frame: if B *reduces* closeup E, the projector's sign convention or the
  token wiring is wrong — VOID, fix the instrument, do not interpret.
- If the scoreability check fails (no sky behind the bill rows) → UNSCOREABLE, registered as
  such; the fallback is a re-registration against whatever backdrop the frame actually has,
  not a silent threshold change.

## 8. Outcomes

- **A (both gates pass):** ship `capYaw: −0.175` as a real TUNE constant (token retired), record
  in RESULT-capbill with the E table, and §151.4's item closes as "model fixed at 33–45°;
  residual dead band relocated to −5..+10 where no scored camera sits" — with §5's sweep as the
  honest statement that a bill dead band is conserved, not eliminated.
- **B (closeup passes, combat fails / vice versa):** the no-trade claim dies in frame; revert,
  and the coordinator decides whether a per-shot condition change is worth more than geometry.
- **C (closeup fails):** §153.6's "not a rotation of any kind" is confirmed for all three axes;
  with reach, droop and width closed by records (§3), **the bill is not deliverable at 33° by
  geometry within the measured records**, and the projection tables here are the proof — the
  remaining routes are outside CHARACTER's file (shot roster or crown redesign, coordinator's
  call).

**This prereg spends zero capture.** The A/B/BACK run (~35–40 min hold, 2 shots × 3 arms) is
queued only when the coordinator wants the frame verdict; nothing in `src/**` changes until
then, and the token path means the shipped build is byte-identical either way until a ship
decision.
