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
- **Use `tools/launch.sh`.** §14's `setsid nohup` form is struck (§131): it leaves `node` parented
  to a wrapper that then orphans — the tree detaches, the process does not. The launcher proves
  `node` at ppid 1 from `/proc` and refuses rather than warns. It has now caught the hazard
  **three times automatically** in one recovery sequence (§140.1, §141.5).
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
- **OPEN, and it is a gap in your own seal:** P-night moved 2.1 % warm-ward with **no registered
  threshold**. Someone other than the person looking at the number must draw that line. (§133.2)
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

- **OWED: the chisel frame half.** Three checks registered, and P2's clause matters — squint sd
  rising >10 % **forfeits P1** and brings `HG_SIGN.sink` down. Your own honest read was +35.7 %
  against a known-bad's +49 %. `__TEX_AB=hgchisel` is a bit-exact control in the same boot, so it
  is one boot, not two.
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
  see**; and band squint sd is **+35.7 %** against a known-bad's +49 %.

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
- **LIVE: gold is yours.** `Architecture.js:179` is `metal: r.metal ? 0.85 : 0` — one constant
  behind a boolean, so solid leaf and leaf-over-gesso are indistinguishable. **Measure the rim share
  of the gild mask first**; the effect is entirely conditional on rim/spec/env being present, and on
  the 98.6 % of `hero`'s gild with no rim, opening metalness makes gold *less* saturated. (§132.2)
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

## FX — `src/fx/**`, `Atmosphere.js`, `Lighting.js`

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
