# DIGEST — what changed since §15, by owner

**Why this file exists.** `KNOWN_ISSUES.md` was ~1120 lines when the current owners read it at
session start and is now ~11,500, growing ~1500 a session. Five owners out of five have reported
a brief anchored to a superseded tree (§128.6), and one of them was one step from spending an
hour of contended lock re-deriving a published result. **The fix is not "read the ledger."** It is
this: a short, per-domain list of what a resumed owner would *act differently* because of.

**Scope rule.** Only entries that change what someone would DO. Not a summary of the ledger — a
list of retractions, closed items, and new hazards. If an entry is only interesting, it is not here.

**Maintenance.** The coordinator updates this when a section lands that retracts something or
closes an item. If you find it stale, say so — a stale digest is worse than none, which is the
same defect it exists to prevent (§39/§43/§50).

Last updated: §143.

**How to use it.** The coordinator pastes the relevant section into the resume message. Leaving it
in the tree does not work — §143.3 is the record of an owner receiving a stale brief *twice* while
this file sat committed, because **a resumed agent reads its transcript, not the repo.**

---

## Wave outcome (sbs2, 2026-08-05): blind score vs real references moved 1–9 → 5–5.
Flips: sly-closeup, dunes, interior, traversal (+ temple held); every flip traces to a named
ship (eyesize, sky decks, hull, capYaw, violet pair), every unmoved loss to a no-ship (banda
warm half, fxcluster, goldlobe). Remaining top gaps: the warm half (SHADING), the FX cluster
(combat/guard), residual dunes/night sky streaks (new SKY prereg). Details: CRITIC-sbs2.md.

## Everyone — READ FIRST: the container rolls back every ~45 minutes (§163–§164)

Six rollbacks so far, found by check-ins, uncorrelated with our actions. Operating consequences:
**anything not pushed does not exist**; `/tmp`, `shots/`, agent transcripts and the task board are
already lost the moment they matter; captures run **chunked** (≈ 10-minute boots, whole registered
pairs per chunk) with frames **committed per chunk** to `progress/records/`; a landed capture is
scored at the first wake after DONE, before anything else (§163.2); brief every new agent from
committed files only. The FIFO lock protocol is unchanged.

## Everyone — READ FIRST: two hard constraints changed (§162)

**Both are user decisions, not findings. `AGENTS.md` §1 has been rewritten; every ledger section
before §162 was written under the old rules and quotes them accurately for its own date.**

- **You may now download external assets while working.** The ban is lifted. Reference photography,
  material scans, HDRIs, source imagery to derive a palette or normal map from — and **actual
  screenshots of Sly Cooper / Mario Odyssey / Zelda for the blind side-by-side**. Outbound HTTPS goes
  through the agent proxy; never disable TLS verification to make a fetch work.
- **What ships still fetches nothing.** The test is operational: *pull the cable after `npm install`
  and not one pixel changes.* No runtime fetch, no CDN, no download step in `npm run build`. An
  external asset reaches the build **by being committed or not at all** — `derive` (extract the
  number, write code, leave the source out) stays the default; `bake` (commit bytes under
  `src/assets/`, let the bundler inline them) is now legitimate where derivation would be dishonest
  work. **Reference imagery is a working input**: scratchpad only, never committed, never shipped.
  Determinism is the reason — every A/B in this file needs two arms differing only by the thing under
  test, and a build that fetches cannot give you that. See `AGENTS.md` §1.1.
- **NEW `AGENTS.md` §7.4 — the blind comparison can now hold the real frame.** §7.3's last checkbox
  has been scored *from memory* for this entire project. Fetch comparands matched to your shot's
  staging, equal height, randomised order, look before reading filenames — and **name the losing
  quantity, not the verdict.** "Theirs wins" is not routable; *"their terminator carries three hues
  across 40 px and ours carries one"* is.
- **Target frame rate is 30 fps at 1080p, and the budget numbers did NOT move.** ≤ 250 draws,
  ≤ 1.2 M tris, ≤ 350 MB are unchanged, because they are the denominator of every budget figure in
  this ledger and in `scenebudget.mjs` — moving them silently rewrites what past measurements meant
  (§144's hazard). **30 fps is the acceptance bar for frame time; a lower target buys headroom
  against fixed limits.** Do not read it as licence for double the geometry. See `AGENTS.md` §1.2.
- **AUDIO only:** `src/audio/Audio.js:10` cites §1 for a rule that has changed. What it says about its
  own behaviour is still right; the citation is yours to fix.

## Everyone — hazards that have each cost real work

- **`tools/launch.sh` is the launch recipe.** §14's `setsid nohup … &` is **struck** (§131): it
  leaves `node` parented to a bash wrapper that then orphans — *the tree detaches, the process does
  not*. `launch.sh` proves `node` itself at ppid 1 from `/proc` and **refuses (exit 3, killing the
  process) rather than warning**. Never use `pgrep -f`; it matches the wrapper.
- **Check the `src/**/*.js` tree hash, not the git SHA** (§121.4). Five owners commit concurrently;
  all three arms of one A/B stamped different SHAs on a byte-identical source tree.
- **But the bundler reads the tree at BOOT, not at capture** (§124.4). `SANDS_NO_HMR=1` gives
  `hmr:false` + `watch:{ignored:['**/*']}` and the harness navigates once. **A mid-run edit is
  harmless; a between-runs edit is fatal.** Do not void a good run over an mtime.
- **State the threshold with every differing-pixel count** (§122.1). Two independent scorings of the
  same PNGs disagreed **1.86×** on every absolute count and agreed to 0.1 pp on every ratio — one
  counted any channel differing, the other `ΣRGB ≥ 4`. Neither was a bug. Harmless for ratios;
  decisive for a count against a floor.
- **Count your ROI's denominator before quoting a share** (§128.2, §129.4). Two failures: a
  denominator drawn from the frustum *volume* rather than camera-visible geometry was wrong by 7×;
  and two registered sky controls turned out to be **3 samples** and **227 samples**.
- **"Was the subject even in the frame?"** (§122.3). A scoring answered every registered band on a
  run whose artefact was simply absent. Cheapest question a null raises.
- **Validate a tracer against a control before trusting it** (§128.3). One failed its control
  (paving 2.5 % lit against a known ~43 %) because `lvl.mjs` **builds no terrain** — the hazard in
  that module's own header.
- **Register a band, not a point** (§133.1). A tighter interval around a correctly-reasoned point
  prediction would have falsified a correct result.
- **After a rollback: sweep the lock queue against `/proc` before believing it is busy** (§140.2).
  Tickets survive the restore naming pids that died with it. And **a missing `shots/` directory is
  not evidence about whether a run happened** (§14, §139.3) — the committed `RESULT` is the record.
- **"Uncontaminated arbitrary is still arbitrary"** (§141.1). If a metric has never been run across
  a known-bad, it has no scale, and no amount of disinterest in the person choosing fixes that.
  §13's remedy is a **calibration**, not a more neutral chooser.
- **A guard can bless the broken thing** (§143.1). SHADING's shell-count guard would have printed a
  healthy `6` for an A/B that could not work, because it counted shells *touched* rather than
  shells *rendered*. Caught by reading another owner's header — so **write headers that carry the
  mechanism, not the usage.**

**The recurring defect shape, five instances, five owners:** *a number that does not depend on the
thing it claims to measure.* `void.mjs` counting front-facing stone as seal leaks with the facing
test written in prose directly above the omission; `scenebudget.mjs` triple-counting vegetation;
`chipscore.mjs` printing `0.00 %` for both arms; an `hf` scalar scoring a frieze *above* its own
legible control; a hue statistic structurally blind to the green it was chasing. **Run a control
first.** The three caught in time were caught that way.

**And its sibling:** *authored intent present and legible, route to the frame absent.* A comment
asserting a chisel pass the code never performed (§125.1); a constant hardcoded inside a helper
that absorbed three generations of tuning (§127.1); twenty `outline:` weights read by a walker
nobody runs (§129.2).

---

## SHADING — `src/render/**`

- **P-night is registered, not scored** (`PREREG-pnight.md`, §141): the instrument was the larger
  defect, and a threshold on frame-wide Δb−r *"would have been unjustified at any value."* Two
  known-bads neither of them nominated by you, and **"unscoreable" is a registered outcome** if
  they fail to separate.
- **Never A/B a hull by toggling `shell.visible`** (§143): `setOutlinesVisible` rewrites it on
  every shell every frame via `beginNormalPass`/`endNormalPass`.
- Do not borrow the ≤226° hue line for `night` — daylight-shadow-light spec, moonlit frame, §8's
  category error.

- **WITHDRAWN: §8's `ao` item.** The figures it was sized on (`AO p5 0.247 / p50 0.408`) were
  retracted at **§34** — `texlab` emits `aoP: [1, 5, 50]`, so those are p1/p5 and the authored median
  is **0.992**. `uAoKey` already ships at 0; at the authored median it scales the key term by
  0.9956, i.e. invisible. **It cannot deliver a value span the input does not have.** (§122.2)
- **WITHDRAWN: gold is not `diff *= mix(1.0, 0.20, slyMetal)`.** That is one scalar on a `vec3` —
  it cannot change chromaticity (§132). Gold is re-routed to GEOMETRY as a per-recipe metalness
  question. **Do not spend an arm on the multiply.**
- **CLOSED: §119.4 composition.** Additive within noise (factor 0.976–0.981), all three shots inside
  their bands. §115.1's 0.776 subadditivity was a six-leg artefact. (§133.1)
- ~~**OPEN:** P-night moved 2.1 % warm-ward with no registered threshold; someone other than the
  person looking at the number must draw that line. (§133.2)~~ — **superseded by §141: that framing
  was mine and it was wrong.** See the P-night entry at the top of this section.
- **Your ink arm's group list was stale (8 of 11)** and the run's own probe printed `mats 11` beside
  it. Patched with a hard assertion. The 26.3/28.8 % figures measure body-fur ink against a partial
  floor — they are **not** a score of B.3. (§133.3)
- **`Shading.applyOutlines()` has no call sites.** §2.1's "hulls on characters *and hero props*" has
  never shipped. GEOMETRY has priced it: ~6 draws for the accent/hero subset, and **it needs one
  capture, not zero**, because a 2.5 px hull lands on PostFX's existing 1.5 px edge line. (§129.2,
  §132.5)
- **`slyNormal` welds the *biased* normal** (`Outline.js:100-120`), so `Body.addTuft`'s 82 % bias
  reaches the hull and a fur card's shell **translates instead of inflating**. Decoupling is one
  option on one function. **Wait for CHARACTER's capture.** (§127.5, §129.5)
- Corrections that post-date your brief: the **`norim` bracket is global, not combat-shaped**, so
  every unbracketed rim number in rim1/rim2/rim3 carries that error; and **§61.2's "the screen-space
  gate is inert" was overstated and self-corrected at §80.5** — `rimPlanar` moves 3–7 % of every
  frame at max delta 381, so it is *unmeasured*, not inert. (§133.5)
- Unclaimed and yours: **the surface rim's scene-space colour handling**, named in `PostFX.js`'s own
  note as the lever for the courtyard plinth lip, now implicated in the AgX-shoulder asymmetry
  behind §130.5's paving-vs-gold split. (§132.1)

## TEXTURES — `src/textures/**`

- ~~**OWED: the chisel frame half.**~~ — **SCORED at §155, both halves.** **P2 passed the clause you
  said you would fail yourself on**: +0.42 % against the +10 % forfeit line, a **14× attenuation**
  from your own +35.7 % pre-frame read, so `HG_SIGN.sink` stands. **P3 failed a gate you wrote**:
  identical in both arms, and a box-300 trend carrying 54.9 % of the profile — a luminance ramp down
  a receding fascia, not a repeat. The pre-frame squint number was not predictive of the frame; do
  not quote it as a live risk.
- **P3 moved before the frames existed** (§142.4): `hero` carries two gilded populations at a 5×
  depth ratio, and **0 % of the near mass's pixels have a repeat inside the 30–300 lag band**. P3
  scores on `hero` rows 24–140. Elsewhere *a low ρ is arithmetic, not a result.*

- **CLOSED NULL: gilded's specular route.** Measured at the shipped notch and at 8.5×; the
  calibration arm passed *on the limestone*, not the gold. (§121)
- **REFUTED: §121.10's landmark.** The `sun` disc is absent from 7 of 16 framings and is 3 blobs of
  5 px on `courtyard`. **Do not remove it.** (§125)
- **SHIPPED, unscored in frame: the chisel pass.** §125's missing relief is cut; control passes 9/9,
  band luma span 1.549 → 2.275. **Not inert** — live albedo on 29.5 % of `hero`. (§130.4)
- **`arrisPolish` is 0.** GEOMETRY decided `gloss` stays at 64, discharging §121.7's conditional.
- Gold's remaining gap is **not** authoring: in albedo the gild is *more* saturated than paving
  (0.787 vs 0.549) and in frame *less* (0.335 vs 0.559). (§130.5)
- **`PAL.goldSpec` reaches nothing.** `ToonMaterial.js` declares its own private palette copy. Do
  not spend an arm there.
- Your own open risk, registered by you: the seam row now carries a 3.01×-median `bee` and 2.85×
  `falcon` per repeat where **before the change the tiling condition passed by having nothing to
  see**. ~~and band squint sd is +35.7 % against a known-bad's +49 %~~ — the squint half is
  discharged in frame at +0.42 % (§155); the per-repeat seam half is still yours.

- **CLOSED: `granite_pink`'s inline relief.** All four addends live, each moving ≥17.3 % of texels
  past 1°; null arm reads exactly 0.000 and the known-bad falls 2.996° → 0.320°, so **89 % of the
  shipped tilt is the inline relief**. Reconstruction gated against the recipe first (corr 0.999941,
  max residual 1.50e-3 = exactly the grain amplitude). No recipe edit was needed or made.
  Do not re-open, and **do not read `wind scour`'s small tilt (0.733°) as weakness** — it carries 6×
  the height amplitude of any other term; a 55 cm hollow on a 4.4 m repeat is a gentle slope.
- **VOID: the `guard` gilded seal, by its own proposer.** Share reproduces to the digit (23.18 %) and
  **that was the wrong gate.** `guard` holds the *darkest* gilded population of the nine framings
  that have one: median luma 17.2 at **0.23×** the sandstone beside it in the same frame, stable
  across three trees, 76.2 % of pixels under L30, 0.34 % over L160. It is a `tod 0.10` night frame
  and the near gilded mass is a featureless near-black slab. **Routed instead: `traversal`** —
  12.94 % of frame, 11.09 % over L160, gild/ref 1.04, the only row with both a real share and a real
  tail. Not `combat` (40 % over L160 on the frame §9 records as blown — that measures the tonemap),
  not `hero` (28 % of frame, 0.26 % of it lit — that measures shadow).
- **Register GATE 0b on any gold seal, and it is reusable:** *gate zero must be luminance, not
  share.* `gild p50 / same-frame reference p50 ≥ 0.85` **and** `share over L160 ≥ 3 %`, measured with
  `gildlit.mjs` on the arm's own base capture before scoring. Share alone passes `guard` and would
  have licensed a void capture. Third dress of one error: **a geometric availability measure is not
  a visibility measure** (`gilduv.mjs`'s own header, §121.8, §158.5).
- **The §34 AO triple appeared a fourth time — in your `NOTE-gildguard-void` §5, struck at the site.**
  `aoP` is **p1/p5/p50**; `hieroglyph_gilded` is 0.247 / 0.416 / **0.992**, so "authored p50 0.412"
  is the 5th percentile and **the authored median equals the frame figure it was being contrasted
  with**. There is no measured dark-base loss and it is not routed to SHADING. What survives is one
  shader fact (`ao` misses the direct key term) sized ~5× too large, reaching 1.4 % of gilded pixels
  on `hero`. **An in-frame AO instrument does not exist in this repo** — nothing reads an AO channel
  back from a rendered frame.

## GEOMETRY — `src/world/**`

- **Task #28 is wired and live** (§141.5): `HULL_KEYS` = six accent keys, calling `outline()` per
  hero mesh rather than `applyOutlines()` over the group, because the walker would shell the set
  dress too. Shells tagged `propsHull`. Registered in `PREREG-propshull.md` with `hullscore.mjs`.
- **`sliver.mjs`'s count is not a defect count** (§142.1). 11 913 strips, and the majority are the
  chamfer work this project deliberately added — `paving:court` alone is 2 744 at a 5.6 cm median.
  It cannot separate an intended chamfer from a kerb defect. **Generate suspects with it; settle
  them in a frame. Do not score with it.**
- The apron clearance is now **extremal over built geometry**, not nominal: worst apron vertex
  against worst paving vertex is still 2.4 cm below (§143.4).

- **ANSWERED: rounded arris.** `beadRoll` on seven gilded beams, 0.69 → 0.87 % area-in-lobe, ~1 k
  tris, zero extra draws. **It does not fix gold.** (§128)
- **§123.4's tolerance table needs its second clause:** arc *magnitude* is not sufficient, **arc
  placement** is an independent requirement. A down-and-out quadrant moved `hero` by nothing.
- **`gloss` stays 64** — your decision, and the reasoning (it multiplies a term the `sh` gate has
  already zeroed) is better than the rule required.
- ~~**LIVE: gold is yours.** `Architecture.js:179` is `metal: r.metal ? 0.85 : 0` — measure the rim
  share of the gild mask first. (§132.2)~~ — **CLOSED at §136, and I routed it as live anyway.**
  The arm ran: metal 0.45 vs 0.85, one boot, `base`/`base2` and `base`/`restore` both **0 px**, and
  the verdict is **regression** — lowering metal made the gild *bluer* (R−B −4.62 → −9.79), not
  warmer. The mechanism shipped as per-recipe `metalAmount` (`Architecture.js:207`,
  `Props.js:600`), absent = 0.85, so **no recipe declares one today and that is a measured result,
  not an omission.** The remaining Architecture-side lever is `spec: 0.55`, upstream-blocked on
  SHADING's `diff`-assembly question (§136.3).
- **The budget is not breached.** Counted 1.73 M is the all-pass column (three cascades + AO +
  outline + composite); the scored main-view line is 0.675 M = **44 % headroom**. Same digits,
  opposite meaning. (§130.3)
- **Seal is intact: 0 leaks in 144,000 rays.** `void.mjs` is fixed and its headline is now the leak
  count. (§130.1)
- Task #28 is yours to finish: **gate the call site on accent/hero keys**, ~6 draws.

## CHARACTER — `src/player/SlyModel.js` (+ `Body.js`, `Cane.js`)

- **There is no chest clump row, and it was deliberately not added** — the named rows are head,
  arm, leg, boot, tail. At these framings the chest is on-face, on-face cards are exactly the chip
  population, so adding it *before* the bias verdict would deepen the defect it is meant to fix.
  First thing to revisit if arm B says the bias is the lever (§141.5).
- `sha256sum` **hashes the paths too** — a relative `find` path gives a different digest than an
  absolute one for a bit-identical tree.

- **REFUTED: §121.9's curvature claim** — by you. *A constant cannot explain a varying outcome.*
- **The fur lever is `Body.addTuft`'s normal bias, not the hull weight** — 56× the effect. Deletion
  is retired: without cards the figure is a smooth plastic capsule. (§127.1, §131.4)
- **`tuftInk` is probably near-inert** (105 px), as you predicted before measuring. My commit called
  it "NOT INERT"; that was written from intent rather than effect. (§127.2)
- **Proportions pass** at 5.03 / 5.11. §9's 5.53 "before" came from an instrument that filed the cap
  crown as skull and was never comparable. (§131.5)
- **`guard` does not frame Sly** — he is behind the camera by design. Three framing shots, not four.
- **The mask cannot read in a pure-black silhouette** by construction; the condition is unpassable
  as worded, and the mask does its job in the shaded render.
- **NEW: at `hero`'s real size the torso, arms and cane shaft merge into one mass.** Extremities
  read; the body does not. Culprit is the cane shaft crossing the torso — `perch_idle`'s aim,
  **ANIMATION's**. (§131.6)
- Any pose number you quote must **name its plane** — the line-of-action measure is lateral only and
  reads `cane_combo_3`'s sagittal lunge as near zero.
- **POSE PASSES, measured in both planes** (§151). `perch_idle` hips/chest/head **0.045 / 0.082 /
  0.045** plus a 7.7 cm forward sagittal lean — any "zero lateral line of action" reading is
  superseded. `idle_confident` stance 23 cm lateral × 30 cm depth, weight on the right foot.
  `cane_combo_3` is an **88 cm sagittal stride** that a lateral-only measure reads as stiff.
- **`tuftInk` is confirmed near-inert and the hull-share mechanism is WRONG, not mistuned** (§151) —
  by the note's own registered wording, because the chips did not visibly shrink. ~~The lever is
  `TUNE.tuftShadeMix`~~ — **that lever is now measured dead too (§160).** `tuftShadeMix` 0.82 → 0.40
  is real (100× the control) and **12.6× smaller than predicted**: −1.5 % of figure ink against the
  flat-albedo instrument's −42 %, and **the silhouette does not move at all** at 8× on the cheek row,
  the viewing condition the prereg named. Do not ship 0.40. §7.3's fur condition is a *silhouette*
  condition and **a shading bias cannot serve it** — which is that file's own registered caveat,
  confirmed.
- **A failed control can still bound the confound, and that is worth more than the binary.** Three
  `src/world` edits landed inside the tuftbias run, so BACK ≢ A and the registered gate failed. Read
  as a bound instead: BACK spans *every* tree change in the run, and at ×24 the whole A-vs-BACK
  residual is 110 px in background architecture — cap, mask, muzzle, ears, cane, chest, tail
  bit-identical — against the token arm's 11,281 px tracing fur cards. **Confound bounded at ~1 % of
  the effect**, plus a structural argument (`src/world` cannot shade a fur card). A clean re-run
  would upgrade provenance on a verdict it cannot change.
- **Silhouette: MET at `sly-closeup` and `combat`, WEAK at `hero`.** At 699 px / 33° the cap, tail
  mass, tufted edge and cane hook each read unshaded; at 185 px / 70° (`perch_idle`) the cap and hook
  read but body and tail merge into a lumpy blob. **`hero` is the money shot and the weakest of the
  four conditions** — and the open question is mine, not yours: whether `hero` should carry character
  conditions at all at ~100 px of Sly.
- **The harness is fixed for anyone reusing it** (`progress/records/tuftbias.mjs`): `renderTree`
  renamed **`srcTree`** with `SRC_DIRS` hoisted so the name cannot stand in for the contents, plus
  per-arm `srcAtArm`/`srcAfterArm`, an `armsByTree` grouping, `comparablePairs`, and a 120 s
  tree-quiet settle gate before arm A. **§124.4 does not apply to this harness** — it navigates per
  arm, so a mid-run tree edit is not "probably nil"; that was my error, relayed and retracted.
- **The cap fails at `sly-closeup`'s 33° bearing and reads at `combat`'s 45°** — the bill
  foreshortens to nothing and the crown alone reads as skull. It is a **yaw** problem; `capCock` is
  a **roll** and is a measured null. **Not fixed by moving the shot** — see §151.4.

## FX — `src/fx/**`, `Atmosphere.js`, `Lighting.js`

- **Candidate 1 (backdropGate) REJECTED by the sealed fx22 scoring and REVERTED** — the shipped
  `Particles.js` is back to its pre-candidate state. `RESULT-fx22.md` is the decision: D2's disc
  removal genuinely worked, but D1 leaked 258 out-of-population px on `courtyard`, D3 stripped
  temple's legitimate haze/glow, and D4 logged 53 violations including deleting `night`'s entire
  haze field (47,108 |ΔL| — comparable to the disc itself). Findings for the next design: the
  night sky blob is a candidate SECOND instance of the artefact class (A1.5's re-test clause);
  §145.2's "no dark-blue exterior class" was boot-local, not a level property; the gate reached
  every particle batch, not just sand haze. A next candidate needs a narrower population or a
  per-batch scope, and its own prereg.
- **§124.1's near-plane guard is falsified before build** (§138): the guard already ships at
  `nearFade [0.28, 0.95]`, the disc sits at 4–28 m, and a size ceiling removes the **larger
  invisible** blob2 (70×71, −0.71 L) before the disc (58×61, +17.28).
- **The discriminator is the backdrop, not the sprite.** `Emitters.js:624-630` says sand_haze's
  invisibility is by design and conditional on a sand backdrop — so the defect is the *pairing*,
  and no property of the sprite can express it. The artefact sprite is an ordinary member of the
  field.
- The `temple` pink disc is **`sandHigh`** (§135).

- **CLOSED MET: `fx9`** — `courtCap` 0.259 against a pre-registered 0.2564.
- **`fx19` is "premise absent"**, not a null: the artefact is not in the frame. The run measured
  ordinary ground haze. (§122.3)
- **The `dunes` haze is not court-family** — the dominant blob is unchanged by a 4× cut. *"Record,
  do not chase"* must not be read as evidence that court blades drive it. (§124.1)
- **`Particles.js:616` is a `min()`.** The ceiling clamps; the clamp-vs-cull arm is unnecessary.
- **§110.3 reads narrowly.** Two boots seven minutes apart differ by 0 px outside the treated
  material — that finding was about an animated bird, not the renderer. Cross-boot bit-identity
  controls *are* available in framings with nothing animated.
- Every probe stamps `tod` and the staged camera now — the defect that leaves `fx19` unable to
  answer its own question retroactively.
