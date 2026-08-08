import * as THREE from 'three';
import { eulerDeg } from './Rig.js';

/**
 * Clips.js — every animation in the game, authored by hand as keyframe data.
 *
 * There are no downloadable clips (AGENTS.md §1), so this file *is* the animation. It is
 * written the way an animator blocks a shot, not the way a programmer writes a procedural
 * wiggle:
 *
 *   · Poses are **key poses**. Contact / down / passing / up for cycles; anticipation /
 *     action / overshoot / settle for actions. Nothing here is driven by a sine wave —
 *     sine-driven limbs read as robotic instantly and there is no fixing that downstream.
 *   · Every action clip **anticipates before it acts and overshoots before it settles**.
 *     A punch that starts at the target and ends at the target is a slideshow.
 *   · Every key pose has one readable **line of action**: a single curve from the planted
 *     foot through the hips and spine to the head or the cane. Squint at any frozen frame
 *     and the curve should still be there.
 *   · Sly is a smug master thief. He leads with the chest, his chin is up, his weight is on
 *     one leg, and the cane is a prop he is showing off, not a tool he is carrying.
 *
 * ── Format ────────────────────────────────────────────────────────────────────────────
 * ```
 * def('name', {
 *   dur,  loop,  hold,          // seconds · looping? · which frame freezePose() shows
 *   stride,                     // metres of ground travel per cycle. Present ⇒ the clip's
 *                               // playback rate is driven by real speed, so feet never skate.
 *   keys: [ { t, e, P, pos, sc, cane } ],
 *   events: [ { t, n, d } ],
 * })
 * ```
 * `P` is a bone → `[x, y, z]` **degrees**, Euler XYZ, on top of bind. A bone that a key does
 * not mention holds its previous keyed value, so only key 0 has to be a full pose — that is
 * what `P(...)` below is for. Sign conventions are documented at the top of Rig.js.
 *
 * `pos` is a hips offset in metres (character space: +X his left, +Y up, +Z forward).
 * `sc` is non-uniform bone scale — squash and stretch. `cane` re-aims the cane in the hand.
 */

/* ========================================================================== */
/*  easing                                                                    */
/* ========================================================================== */

/**
 * Segment shapes, chosen per key. The important ones are `in` (slow leave, accelerate — an
 * anticipation uncoiling) and `snap` (violent attack, long settle — an impact).
 */
const EASES = [
  (t) => t,                                            // 0 lin
  (t) => t * t * (3 - 2 * t),                          // 1 smooth
  (t) => t * t * t * (t * (t * 6 - 15) + 10),          // 2 soft
  (t) => t * t * t,                                    // 3 in
  (t) => 1 - (1 - t) * (1 - t) * (1 - t),              // 4 out
  (t) => 1 - Math.pow(1 - t, 6),                       // 5 snap
  (t) => (t >= 1 ? 1 : 0),                             // 6 hold
];
const EASE_ID = { lin: 0, smooth: 1, soft: 2, in: 3, out: 4, snap: 5, hold: 6 };

/* ========================================================================== */
/*  the base pose everything is authored against                              */
/* ========================================================================== */

/**
 * A relaxed, weight-on-one-leg stand. Not a neutral pose — SlyModel's bind is a 40°
 * A-pose and §7.3 fails any frame that reads as one, so *nothing* in this file is ever
 * allowed to leave a limb at bind. Every clip's first key is built from this.
 */
const STAND = {
  hips: [0, 0, 0],
  spine: [-2, 0, 0],
  chest: [4, 0, 0],
  neck: [-6, 0, 0],
  head: [-4, 0, 0],
  jaw: [3, 0, 0],
  capBrim: [2, 0, 0],
  earL: [-9, 5, -12],
  earR: [-6, -5, 14],
  browL: [0, 0, 6],
  browR: [0, 0, -4],

  // Arms hang: bind is 40° below horizontal, so ~40° more of drop reads as "at his sides".
  shoulderL: [0, 3, -8],
  upperArmL: [-8, 3, -33],
  lowerArmL: [-26, -12, -8],
  handL: [6, -10, -6],
  shoulderR: [0, -3, 8],
  upperArmR: [-8, -3, 33],
  lowerArmR: [-26, 12, 8],
  handR: [6, 10, 6],

  upperLegL: [-5, 3, 2],
  lowerLegL: [10, 0, 0],
  footL: [-5, -3, 0],
  toeL: [2, 0, 0],
  upperLegR: [-5, -3, -2],
  lowerLegR: [10, 0, 0],
  footR: [-5, 3, 0],
  toeR: [2, 0, 0],

  // Down off the hips, sagging, then the tip flicks up — the raccoon S.
  tailA: [-8, 0, 0],
  tailB: [-14, 0, 0],
  tailC: [8, 0, 0],
  tailD: [26, 0, 0],
};

/** Full pose = STAND with overrides. Every clip's key 0 goes through this. */
const P = (over) => Object.assign({}, STAND, over);

/**
 * Mirror a pose left↔right. Cycles are authored for the left lead and mirrored for the
 * right, exactly like a real walk cycle — but the cane channel is never mirrored, because
 * the cane lives in his right hand and swapping it into the left would be a continuity bug.
 */
function mir(p) {
  const out = {};
  for (const k in p) {
    const v = p[k];
    const last = k[k.length - 1];
    const n = last === 'L' ? `${k.slice(0, -1)}R` : last === 'R' ? `${k.slice(0, -1)}L` : k;
    out[n] = [v[0], -v[1], -v[2]];
  }
  return out;
}
const mirPos = (p) => [-p[0], p[1], p[2]];

/* ========================================================================== */
/*  cane aiming presets                                                       */
/* ========================================================================== */

/**
 * The cane hangs off `handR` through a pivot CHARACTER owns, and in bind it points straight
 * out of the fist along +Z. These deltas are applied in *hand space* (pre-multiplied), so
 * +X pitches the shaft down toward his feet and −X swings it up over the shoulder.
 */
const CANE = {
  down: [78, 0, -6],        // carried, tip toward the ground
  trail: [104, -14, -6],    // dragged back, running
  /* The signature idle. This used to be [-116,-18,6], which is genuinely "over the shoulder"
     — and from every camera in `Shots.js` that put the crook directly behind his head, where
     it foreshortened into a stub and the §7.3 silhouette test lost the one prop in the series
     nobody could mistake. Chosen by sweeping the aim against three measurable things: the C's
     plane facing the camera, the shaft lying across the view rather than along it, and the
     crook clearing both the head and the body outline. */
  /* Kept as a named aim although nothing references it any more: it is the correct answer to
     "where does the crook go when the forearm is folded to the shoulder", and a clip that
     wants that arm will want this. `idle_confident` no longer does — see `plant`. */
  shoulder: [-62, -56, 28],
  /* The standing idle. `shoulder` above is a fine *aim* and a bad *pose*: with the forearm
     folded up it lays the shaft diagonally across the torso, and a prop drawn across a figure
     stops reading as a prop. `plant` stands the shaft vertical at his right side with the
     crook out at head height and open sky inside the C — chosen by sweeping aims against the
     arm pose `IDLE_A` actually holds and keeping the ones where hook and tip are both clear of
     the body outline on the same side. Re-sweep it if that arm moves; it is measured against
     the hand, not against the world. */
  plant: [-10, 40, -45],
  fwd: [16, 0, 0],          // levelled, pointing where he is looking
  up: [-96, 0, 0],          // shaft vertical: hook overhead, swinging
  back: [128, 10, 0],       // wound up behind him, cocked to swing
  out: [58, -34, 0],        // held out for balance
  tuck: [96, 26, 0],        // pulled in against the body, rolling / crawling
};

/* ========================================================================== */
/*  registry                                                                  */
/* ========================================================================== */

const RAW = Object.create(null);
function def(name, o) { RAW[name] = o; }

/** Clip names §4.7 demands. Compile fails loudly (into engine.warnings) if any is missing. */
export const REQUIRED = `
idle_confident idle_bored idle_look perch_idle balance_idle
walk run run_fast sneak_idle sneak_walk crouch_idle crouch_walk crawl
turn_l turn_r skid_stop roll
jump_rise jump_apex jump_fall double_jump land_soft land_hard land_roll
wall_run_l wall_run_r wall_jump wall_cling
ledge_hang ledge_shimmy_l ledge_shimmy_r ledge_climb
hook_grab hook_swing hook_release
rail_slide rail_walk pole_climb pole_slide pole_swing
spire_land spire_balance
cane_combo_1 cane_combo_2 cane_combo_3 dive_attack dive_impact
pickpocket paraglide hurt ko victory
`.trim().split(/\s+/);

/* ========================================================================== */
/*  1. idles                                                                  */
/* ========================================================================== */

/**
 * `idle_confident` — the character sheet pose (`sly-closeup` freezes here), so it carries the
 * whole read on "is this Sly". Contrapposto: weight on his right leg, right hip high, shoulders
 * counter-tilted, hips turned one way and chest the other, chin up, cane slung over the
 * shoulder, tail arcing up behind. The line of action runs from his planted right foot,
 * through the S of the spine, out along the cane.
 */
const IDLE_A = P({
  /* The contrapposto was authored here before and did not read, and the reason is worth
     recording because it is a general one: the *pelvis* was rotated but the *legs* were not,
     so both feet stayed under the hips, 4 cm apart and vertical, and the silhouette came out
     as two parallel sticks. A weight shift is only visible when the free leg visibly stops
     carrying anything — knee folded, thigh turned out, foot pushed away from the weight line.

     Sign conventions (Rig.js): hips −Z roll raises his RIGHT hip; upperLeg +Z swings the foot
     toward his LEFT. So +Z on both legs walks the right foot in under his centre of mass and
     the left foot out from it, which is the stance, not just the tilt. */
  /* **Second correction, and the missing ingredient was translation, not rotation.**
     Measured on the held frame: ankle-mid x 0.003 → hips −0.026 → chest −0.010 → head −0.042.
     That is **4.5 cm of lateral travel on a 1.8 m figure**, i.e. the centre line is straight
     to within 2.5% of height, and a rendered frame reads it as a column no matter how much
     counter-*roll* is stacked on top — the roll tips the segments without ever moving their
     centres off the axis, so the outline stays a vertical bar with tilted detail inside it.

     A line of action is a *displaced* centre line: the pelvis rides out over the weight leg,
     the ribcage falls back across it, the head returns over the foot. So the pelvis now shifts
     5.5 cm onto his right (−X) via the key's `pos`, and the counter-roll is opened up to
     carry the ribcage back the other way rather than being the whole effect. */
  hips: [2, 21, -19],
  spine: [-3, -11, 15],
  chest: [7, -23, 24],        // shoulders roll opposite the hips: the S
  neck: [-9, 12, -10],
  head: [-9, 21, -16],
  jaw: [4, 0, 0],
  capBrim: [3, 0, -3],
  earL: [-13, 6, -18],
  earR: [-4, -7, 24],
  browL: [0, 0, 9],
  browR: [0, 0, -6],

  /* Left hand on the hip. Two jobs: it closes a triangle of open sky between the arm and the
     ribs, which is worth more in silhouette than any amount of surface detail, and it stops
     the arm outline melting into the torso outline the way a hanging arm does. */
  /* Reverted an attempt to open the elbow further (upperArmL Z -52 -> -34) after measuring it:
     at `sly-closeup`'s 13 degree azimuth the tail sits exactly where that triangle of sky would
     be, so the silhouette was bit-for-bit unchanged and the hand ended up more hidden, not
     less. The gap this comment wants is not available from this camera at this tail aim. */
  shoulderL: [3, 7, -16],
  upperArmL: [-14, 16, -52],
  lowerArmL: [-74, -36, -26],
  handL: [22, -28, -14],

  /* **Right arm down, cane planted, not slung.** It was `CANE.shoulder` with the forearm
     folded up to the shoulder, and the resulting silhouette is the thing to look at rather
     than the label: the shaft ran diagonally from his lower left to his upper right straight
     across the torso, passing within a few pixels of the free left hand, and every capture of
     it reads as a two-handed staff held at port arms. A prop that crosses the body cannot be
     read as a prop — it becomes a line drawn over the figure.

     Down at his side the cane owns one half of the frame and the tail owns the other, the
     torso is left clear between them, and the crook sits out at head height with open sky
     inside its C. That is the Sly pose, and it is also the only arrangement in which §7.3's
     silhouette test can pass on all four cues at once. */
  shoulderR: [-4, -7, 11],
  upperArmR: [-4, -12, 20],
  lowerArmR: [-52, 18, 12],
  handR: [-6, 16, 10],

  /* Weight right. The leg Z angles look large because they are measured against the *hips*,
     which are already rolled -19: that roll tips the whole lower body toward his right, so a
     leg authored at +13 nets a few degrees in world and both feet stay under the pelvis. This
     is exactly why a previous contrapposto measured correct and rendered as parallel sticks.

     The free leg has to visibly stop carrying anything, or the stance is just a wider column.
     Right leg (weight) is straight and near-vertical under the shifted pelvis; the left takes
     a folded knee, a turned-out thigh and a foot set forward and *inboard past the weight
     line*, heel off the ground — so the two legs cross in silhouette and read as two different
     shapes rather than as two spread sticks. Crossing is what a standing-at-ease pose actually
     does, and it is the cheapest thing on this rig that reads as weight. */
  /* **Third correction, and this is the one the critic was seeing.** The two above fixed the
     pelvis *shift* and the leg *rotations*, and pass 3 still scored the pose as failing —
     "both feet are planted, hips and shoulders are level and the weight is evenly distributed.
     There is no contrapposto." The hips and shoulders were not level (measured: right hip 4.5
     cm high, left shoulder 3.6 cm high, counter-tilted correctly), so that half of the
     observation was wrong. The "weight evenly distributed" half was exactly right, and it is
     measurable: the pelvis sat at x −0.058 while the weight foot sat at **−0.191**, so the
     weight foot was 13.3 cm *outboard* of the pelvis and the vertical through the pelvis fell
     in the gap **between** the two feet. That is the definition of weight evenly distributed,
     and it is what a viewer reads — no amount of hip roll on top of it makes a figure look
     like it is standing on one leg when its centre of mass is visibly between both.

     Contrapposto is one geometric fact: **the pelvis rides over the weight foot.** Measured
     now — pelvis −0.078, weight foot −0.076, i.e. 2 mm apart. Everything else here serves
     that. `upperLegR` +Z swings the right foot inboard until it is under the shifted pelvis
     (15 → 24); the free leg then has to go somewhere visible, so `upperLegL` opens out (36 →
     44) and the knee *unfolds* (42 → 30) to stop the abduction lifting the foot — abducting
     about the hip swings the foot out and up together, and a free foot dangling 10 cm off the
     floor reads as standing on one leg, not as resting.

     The free foot keeps its ground contact through the toe: heel at y 0.149 against a 0.082
     bind, toe at **0.036 against a 0.033 bind**. Toe down, heel up, knee soft — the free leg
     is visibly carrying nothing while still touching the floor. `footIK` preserves each
     foot's x, z and clip lift and only snaps y, so all three survive to the frame as authored. */
  upperLegR: [-2, -7, 24],
  lowerLegR: [3, 0, 0],
  footR: [-3, 6, -2],
  upperLegL: [-19, 15, 44],
  lowerLegL: [30, 0, 0],
  /* **Fourth correction, and this one was invisible to every bone-space check.** The free foot
     was authored `footL [20,-12,-18]` / `toeL [14,0,0]` — 34° of toe-down — and the *bones* sat
     comfortably above the floor (ankle 0.149, toe 0.036) so `poseprobe` reported it as fine.
     Skinning the mesh on the CPU and asking for vertices below y=0 tells a different story:
     **82 of them, the lowest 7.4 cm under the ground plane.** The toe bone cleared the floor;
     the boot hanging off it did not, so a quarter of the free boot was buried in every frame
     that shows his feet — seven of the ten shots do.
     Nothing upstream was going to catch it: `footIK` drives the *ankle* to groundY + ikAnkle
     and preserves the clip's lift, so it never inspects the boot, and on flat ground the
     contact roll is skipped entirely (`nrm.y < 0.9995` is false).
     Solved against the vertices rather than the bones: this pitch pair rests the sole on the
     floor (lowest vertex +0.002) and, because it is no longer driving the toe underground, it
     actually lifts the *heel* further clear than the old pose managed — 0.053 against 0.036.
     Toe down, heel up, and now both on the correct side of the floor. */
  footL: [-4, -12, -18],
  toeL: [0, 0, 0],

  /* Tail as counterweight, and - this is the part that is easy to get wrong - on the opposite
     side of the frame from the cane. Swept to his right it folded in behind the torso and left
     the silhouette entirely, which costs one of §7.3's four identity cues outright. Out to his
     left it balances the crook, and the two of them frame the body between them.

     Down and out of the hips first, then a long sweep to his left, then a hard curl up and
     over - a C that opposes the cane's vertical, so the two of them close a shape around the
     body instead of both pointing the same way. The old set left it a level horizontal
     sausage at shoulder height, which is the one shape a big tail must not make: it reads as
     a wing, it flattens the figure, and it puts the heaviest mass on the frame's mid-line. */
  /* **The `perch_idle` tail fix does NOT transfer here, and it was tried and reverted.**
     Measured the same way (`scratchpad/tailsweep2.mjs`), this aim scores like the one that was
     wrong on the perch: chord 20° at `sly-closeup`, 16° at `sly-profile`, tip below head height
     at both. Lifting it to chord 27/40 improves every number and makes the picture worse — at
     `sly-profile`'s 95° the raised tail **welds to the head**, closing the one gap that was
     separating the two heaviest masses in the frame, and at `sly-closeup` it trades the arc for
     a straight diagonal (reach 0.846 → 0.777) for no visible gain.

     The reason the metric misleads here and not on the perch: it reads *joint positions*, and
     this tail's arc is carried by the loft and the tufts hanging past `tailD`, which no joint
     metric can see. On `perch_idle` the chain itself was sagging (world Y falling through the
     middle), so the joints and the picture agreed. Here they do not. Left as authored. */
  tailA: [-6, -30, 6],
  tailB: [16, -34, 0],
  tailC: [40, 14, 0],
  tailD: [30, 24, 0],
});

/* `hold: 0` on purpose. This clip is what `sly-closeup` and `dunes` freeze on, so the held
   frame has to be the *designed* pose, not an in-between. It used to hold at 0.9, where a
   partial key overrode hips / chest / head / tail — which meant every character frame ever
   captured was a breath drift of the pose, not the pose. Anything authored into IDLE_A that
   those four bones carried never reached a single screenshot. */
def('idle_confident', {
  dur: 3.6, loop: true, hold: 0,
  keys: [
    { t: 0, e: 'soft', P: IDLE_A, pos: [-0.078, -0.018, 0], cane: CANE.plant },
    // weight rocks a couple of centimetres and the chest drifts open — a drift off IDLE_A,
    // never a different pose
    /* These two are a *drift off IDLE_A* and nothing else, so they have to be re-authored
       whenever IDLE_A moves — they carry absolute angles, not deltas. Left at their old values
       after the contrapposto and tail rewrite they were 40–60° away from the base pose on the
       tail, so the clip's "breath" would have swung the tail from the new curl back down to
       the old level sweep twice a cycle. `hold: 0` hides that from every screenshot, which is
       exactly why it is worth stating: the held frame being right is not evidence the clip is. */
    /* The cane aims here were `[-59,-58,28]` and `[-65,-52,28]` — the *old* `CANE.shoulder`
       family, left behind when the base pose moved to `CANE.plant`. That is precisely the trap
       the note above describes, and it had been fixed for the tail and missed for the cane: the
       breath was swinging the crook from planted-at-his-side up over his shoulder and back,
       twice every 3.6 s, on a cane whose butt is supposed to be resting on the ground.
       A planted cane does not move while he breathes — his hand slides a little on it instead —
       so both keys now hold `CANE.plant` and only the body drifts. `hold: 0` hides all of this
       from stills, which is exactly why it survived: the held frame being right has never been
       evidence that the clip is. */
    { t: 0.9, e: 'soft', P: { hips: [1, 21, -19], chest: [4, -22, 23], head: [-9, 22, -17], tailA: [-11, -24, 6], tailB: [-3, -36, 0], tailD: [34, 30, 0] }, pos: [-0.044, -0.008, 0.004], cane: CANE.plant },
    { t: 1.9, e: 'soft', P: { hips: [3, 16, -15], chest: [7, -17, 19], head: [-4, 15, -12], tailA: [-18, -15, 6], tailB: [-10, -27, 0], tailD: [26, 21, 0] }, pos: [-0.058, -0.020, -0.004], cane: CANE.plant },
    // a slow blink-and-smirk beat: head cocks a little further over, ears flick
    { t: 2.6, e: 'smooth', P: { head: [-8, 22, -19], earL: [-19, 8, -24], earR: [-2, -9, 29], jaw: [6, 0, 0] } },
    { t: 3.6, e: 'soft', P: IDLE_A, pos: [-0.078, -0.018, 0], cane: CANE.plant },
  ],
});

/** Bored: cane spun on the ground, weight dumped onto one hip, tail sweeping. */
def('idle_bored', {
  dur: 4.4, loop: true, hold: 2.0,
  keys: [
    { t: 0, e: 'soft', P: P({
      hips: [2, 8, -11], spine: [-4, -4, 7], chest: [6, -9, 8], neck: [2, 5, -4], head: [8, 10, -12],
      shoulderL: [2, 6, -4], upperArmL: [-4, 10, -22], lowerArmL: [-52, -22, -18], handL: [14, -20, -16],
      shoulderR: [2, -4, 4], upperArmR: [12, -6, 26], lowerArmR: [-18, 14, 16], handR: [10, 12, 4],
      upperLegR: [-1, -9, 5], lowerLegR: [3, 0, 0], footR: [-2, 5, -2],
      upperLegL: [-8, 18, 6], lowerLegL: [20, 0, 0], footL: [-8, -10, 2],
      tailA: [-4, -14, 0], tailB: [-10, -20, 0], tailC: [6, -14, 0], tailD: [22, 6, 0],
    }), pos: [0.01, -0.03, 0], cane: CANE.down },
    // he leans on the cane and lets his head loll
    { t: 1.3, e: 'soft', P: { hips: [3, 6, -13], chest: [8, -7, 10], head: [12, 6, -16], jaw: [9, 0, 0],
      tailA: [-6, 12, 0], tailB: [-12, 18, 0], tailC: [4, 14, 0], tailD: [20, -4, 0] }, pos: [0.016, -0.042, -0.006], cane: [82, 8, -10] },
    { t: 2.4, e: 'soft', P: { hips: [1, 10, -9], chest: [4, -11, 6], head: [4, 14, -8], jaw: [2, 0, 0],
      neck: [-4, 7, -2], tailA: [-2, -12, 0], tailB: [-8, -18, 0], tailC: [8, -12, 0], tailD: [24, 8, 0] }, pos: [0.004, -0.024, 0.004], cane: [74, -10, -4] },
    // a yawn: jaw drops, chest lifts, ears fold back
    { t: 3.2, e: 'out', P: { jaw: [22, 0, 0], head: [-12, 8, -6], chest: [-4, -8, 4], neck: [-10, 5, 0],
      earL: [-22, 10, -26], earR: [-16, -10, 30] }, sc: { chest: [1.02, 1.05, 1.03] } },
    { t: 3.7, e: 'smooth', P: { jaw: [3, 0, 0], head: [6, 12, -12], chest: [6, -9, 8], neck: [0, 6, -3],
      earL: [-9, 5, -12], earR: [-6, -5, 14] }, sc: { chest: [1, 1, 1] } },
    { t: 4.4, e: 'soft', P: P({
      hips: [2, 8, -11], spine: [-4, -4, 7], chest: [6, -9, 8], neck: [2, 5, -4], head: [8, 10, -12],
      shoulderL: [2, 6, -4], upperArmL: [-4, 10, -22], lowerArmL: [-52, -22, -18], handL: [14, -20, -16],
      shoulderR: [2, -4, 4], upperArmR: [12, -6, 26], lowerArmR: [-18, 14, 16], handR: [10, 12, 4],
      upperLegR: [-1, -9, 5], lowerLegR: [3, 0, 0], footR: [-2, 5, -2],
      upperLegL: [-8, 18, 6], lowerLegL: [20, 0, 0], footL: [-8, -10, 2],
      tailA: [-4, -14, 0], tailB: [-10, -20, 0], tailC: [6, -14, 0], tailD: [22, 6, 0],
    }), pos: [0.01, -0.03, 0], cane: CANE.down },
  ],
});

/** Look: he scans the rooftops for the next thing worth stealing. Big head leads, body follows. */
def('idle_look', {
  dur: 4.0, loop: true, hold: 1.4,
  keys: [
    { t: 0, e: 'soft', P: IDLE_A, pos: [-0.078, -0.018, 0], cane: CANE.plant },
    // anticipation: a small counter-turn before the head whips the other way
    { t: 0.55, e: 'in', P: { head: [-4, 4, -4], neck: [-6, 1, -1], chest: [3, -8, 5] } },
    { t: 0.95, e: 'out', P: { head: [-12, 54, -16], neck: [-8, 22, -6], chest: [2, 6, 2], spine: [-3, 4, 2],
      earL: [-20, 10, -24], earR: [-2, -8, 26], hips: [1, 6, -6] }, pos: [-0.01, -0.01, 0.008], cane: [-108, -30, 6] },
    { t: 1.4, e: 'soft', P: { head: [-10, 48, -14], earL: [-9, 5, -12], earR: [-6, -5, 14] } },
    { t: 2.1, e: 'in', P: { head: [-11, 52, -15] } },
    { t: 2.7, e: 'out', P: { head: [-2, -34, 6], neck: [-4, -16, 4], chest: [5, -22, 8], spine: [-2, -10, 6],
      hips: [1, 18, -10], earL: [-6, 4, -8], earR: [-14, -8, 24] }, pos: [0.012, -0.016, -0.006], cane: [-124, -8, 6] },
    { t: 3.3, e: 'soft', P: { head: [-4, -28, 4] } },
    { t: 4.0, e: 'soft', P: IDLE_A, pos: [-0.078, -0.018, 0], cane: CANE.plant },
  ],
});

/**
 * `perch_idle` — the `hero` shot. Crouched on a ledge like a gargoyle: knees folded up, one
 * glove braced on the stone in front, cane hooked out behind for counterweight, tail streaming
 * off the back of the ledge, chin up and scanning. The line of action is one long diagonal from
 * the braced hand up through the spine to the cane tip.
 */
const PERCH = P({
  /* Lateral line of action (ledger #17). poseprobe measured this pose dead straight across
     the frontal axis — hips x 0.000, chest x 0.006, head x -0.007 — so from any azimuth off
     the 70° profile the figure read as a mannequin on a plumb line. The sagittal diagonal
     (braced hand -> spine -> cane) was always here; this adds the missing axis, authored as
     roll opposition rather than translation: pelvis rolled 9° further (-4 -> -13) so the
     torso base leans toward the braced glove, chest counter-rolled +10 against it, neck and
     head +10/+9 re-levelling past centre, legs counter-rolled so the feet hold their stance
     (footL/footR within 8 mm of the old plant). Measured after (poseprobe): hips +0.045 ->
     chest +0.082 -> head +0.046 — +3.7 cm out on the lower segment, -3.6 cm back on the
     upper, a genuine S against the old plumb line, with the pelvis/shoulder tilt opposition
     carrying the read even where the projection forecloses lateral offsets. The braced glove
     follows the lean (+3.6 cm toward its own side) and stays planted at y 0.704. */
  hips: [26, 10, -13],
  spine: [-6, -5, 3],
  chest: [-14, -11, 14],
  neck: [-16, 8, 6],
  head: [-18, 15, 2],
  jaw: [3, 0, 0],
  capBrim: [5, 0, -4],
  earL: [-14, 6, -18],
  earR: [-4, -6, 24],

  // braced left glove: arm reaches down and forward, elbow nearly straight
  shoulderL: [6, 8, -14],
  upperArmL: [-46, 12, -34],
  lowerArmL: [-36, -14, -10],
  handL: [34, -12, -8],

  // right arm swept back, cane trailing off behind the hip
  shoulderR: [-2, -10, 10],
  upperArmR: [34, -14, 22],
  lowerArmR: [-22, 22, 14],
  handR: [4, 14, 8],

  upperLegL: [-96, 12, 10],
  lowerLegL: [104, 0, 0],
  footL: [-14, -6, 2],
  toeL: [10, 0, 0],
  upperLegR: [-84, -14, -3],
  lowerLegR: [96, 0, 0],
  footR: [-10, 8, -2],
  toeR: [8, 0, 0],

  /* A tail authored to "stream off the back of the ledge" lies along the view axis for any
     camera behind him, and foreshortens into the torso — the same defect the critic logged in
     `night` as "a striped scarf across his chest". Lifted and swept hard to his left it arcs
     clear of the back and reads as the one shape in the frame that says raccoon.

     **Stale number corrected:** this note used to say the `hero` camera looks from 172°,
     almost dead behind, and at 55 px. `Shots.js` was reframed since (KNOWN_ISSUES §7) and
     `tools/charview.mjs` now measures `hero` at **view 70°, 166 px** — a three-quarter, not a
     back view. The sweep here still reads well from 70°, so the pose stands; but anything
     re-derived from "172°" is being derived from a camera that no longer exists. */
  /* **Re-aimed off a silhouette render at the real `hero` azimuth.** The sweep above put the
     tail out to his left, and from 70° round that projects as a level horizontal sausage
     running off the side of the frame — the "giant croissant" / "horizontal sausage tail" the
     critic has logged in three separate shots. A tail this big is not a detail that can be
     mis-aimed: it is half the outline, and lying flat it both flattens the figure and drops
     the heaviest mass on the frame's mid-line.
     Arced up over the back instead, so from a three-quarter camera it climbs across the body
     and its curl reads against the sky rather than along the horizon. */
  /* Re-aimed after the tail gained 26% of its length (`TUNE.tailScale`). The arc itself is
     right — up and over the back so it reads against sky from a three-quarter camera — but at
     the new length it came out level with his own head and the two masses welded into one blob
     in the silhouette test. Dropping the first joint starts the C *below* the hip line, so the
     same curve now sweeps up past the shoulder instead of across the skull. */
  /* **The arc was right in model space and still projected as a bar, because "up over the
     back" is not a screen-space claim.** Every fix above was aimed by reasoning about world
     axes; none was measured at the camera that frames the pose. Projected through `hero`'s own
     view (70°, `scratchpad/tailproj.mjs`, shotsil's exact transform) the previous angles put
     the two segments carrying the tail's mass at **-8.1° and +7.2° from horizontal** — dead
     level — with the entire rise crammed into the last segment, and world Y *sagging* through
     the middle of the chain (0.764 → 0.707 → 0.750 → 1.075). That is an L, not a C, and at the
     185 px `hero` actually gives him it reads as a spiky horizontal log welded to the body:
     `hero-tiny.png` was a quadruped, not a perched thief. tailD also sat 2.9 cm *below* head
     height on screen, so tail and skull fused into one band across the frame's mid-line.

     Now the chain climbs monotonically (sag +0.010 m, i.e. no joint drops below its parent) and
     the chord runs at **35°** instead of 20°, with the tip clearing the head by 12 cm on screen.

     **The reach is the constraint that stops this going further, and it is a real one.** Pitch
     the chain up harder and the numbers all improve while the shape gets worse: at tailB +40
     the chord hits 49° but horizontal reach collapses 0.833 → 0.409, and a tail with no width
     is a vertical plume, not a raccoon C. These angles sit at reach 0.632 — 76% of the old
     spread — which is the most lift the silhouette takes before the C closes up. Verified by
     rendering, not by the table: the table cannot see it, because tailD's own rotation moves
     no joint at all (it is the last bone) and the tail geometry continues past it.

     Re-aim with `scratchpad/tailsweep.mjs`, which patches the compiled quaternions in memory,
     and then LOOK at `hero-tiny.png`. Never re-aim this in model space again. */
  tailA: [-18, -30, 0],
  tailB: [26, -34, 0],
  tailC: [26, 16, 0],
  tailD: [8, 26, 0],
});

/* `hold: 0` for the same reason as `idle_confident`: `hero` freezes this clip, and holding at
   0.8 meant the money shot rendered a breath drift whose partial key silently reverted the
   tail to its old aim. The held frame is now the authored pose.
 *
 * **The cane aim changed off a real `hero` capture, and the reason generalises.** It was
 * `[122,-46,8]` — trailing down behind the hip — which renders a textbook open crook in a
 * browser-free silhouette and *nothing at all* in the frame. The hook sits at model-space
 * y −0.10, i.e. **below his own feet**, and he is perched on a ledge: the crook is inside the
 * stone. `canesweep.mjs` scores that aim near the top of its list because its scorer has no
 * world in it — only broadside, shaft-across-view and screen gaps to the head and body. Every
 * one of its top twelve aims for this clip puts the hook under the ledge line.
 *
 * Re-swept with a floor on hook height and with the finalists *rendered and looked at*, which
 * eliminated two more that scored well and drew nothing: `[-174,50,30]` (score 4.14, top of
 * the list) hides the cane inside the body outline entirely, and `[162,20,30]` lays it along
 * the tail so the crook is swallowed by the one mass it must not touch. `[-30,30,-30]` puts an
 * open C clear of the body on the screen-left, mid-height, above the ledge and away from the
 * tail — and it still reads at the 166 px he actually occupies in that frame.
 *
 * Re-aimed `[-30,30,-30]` → `[-40,40,80]` (task #19 item 3, from the hook diagnosis): same
 * screen-left placement, crook rolled +110 about the shaft so the hook's opening faces the
 * camera as a C instead of edge-on as a J. Every breath key's aim moves by the same delta —
 * these are absolute angles, and §9's orphaned-key trap is exactly a base aim moving under
 * keys that still carry the old family.
 *
 * Re-aimed again `[-40,40,80]` → `[-20,30,130]`, delta (+20,−10,+50) — seal `PREREG-heroline.md`.
 * §7.3's silhouette condition was failing on the cane hook and it was failing by *position*:
 * measured at the 120 px `hero` really delivers, the crook sat in the middle of the torso mass
 * owning 5.5% of the union outline with 41.2% of its own boundary buried. Two plausible causes
 * were tested and killed first — the aim *does* move the hook (42 px of a 134 px canvas, so the
 * `CANE.plant` tip-height invariance does not generalise to screen position), and the right arm
 * is not the lever (all five variants made burial worse). The tail is deliberately NOT touched:
 * a joint sweep says tail+cane together drives hook outline ownership to 1.5%, worse than
 * baseline, because the tail swings into the region the hook was just moved into. Sealed as one
 * cane-only change for that reason. Same delta on all four breath keys, preserving the ±4°
 * swing about the new centre. */
def('perch_idle', {
  dur: 3.2, loop: true, hold: 0,
  keys: [
    /* Cane aim was `[-20, 30, 130]` and it failed §7.3's silhouette condition on the one shot
       that freezes this clip. Rendered as a pure black silhouette at `hero`'s own 70°/1°, the
       crook curled back against the hip and its tip closed on the torso, so the C read as a
       ring hanging off him rather than as a hook — the most recognisable prop in the series,
       fused into the body mass. `tools/canesweep.mjs` scores exactly this, and could not have
       found it: its `z` grid is -30..+30 while the shipped aim was z = 130, i.e. **the aim in
       the file was outside the tool's search domain**, and its top-12 all sat on the z = +30
       boundary — an optimum outside the box (§3's clamped-knob shape). Re-scored over the full
       domain with the shipped aim included as a control (`scratchpad/canebase.mjs`), it ranked
       **5927 of 10351**, bodyGap 0.12, across 0.52 — the shaft half-aligned with the view axis,
       foreshortened into a stub. This aim is rank 1: broad 1.00, across 1.00, bodyGap 0.53.

       **The score shortlisted it; the silhouette chose it, and they disagreed.** `[-124,45,-180]`
       scores 3.455 against this one's 3.475 — a tie — and renders as a ring fused into the tail.
       canesweep measures crook clearance against `head` and `chest` only, and in this pose the
       tail is the largest mass in the frame and is not in its model at all. Shortlist with the
       score, never select with it.

       All four keys move together by the same deltas (+[4,-4,0] at 0.8, -[4,-4,0] at 1.7) so the
       breath drift is unchanged and only its centre moves — §9's orphaned-key trap, which the
       tail keys below already document, applies identically to the cane and is why these are not
       left at their old absolute angles.

       Verified offline only (shotsil: no ink hull, no scene). **What a capture still has to
       confirm is the one thing no offline probe here can see: he is perched on a ledge and the
       hook now swings low and outboard, so `hero` must show it over open air rather than through
       the ledge.**

       ── ANSWERED, and it did not need a capture: it needed two existing probes composed.
       Projecting the posed cane into the shot's own camera and raycasting the LEVEL through the
       same pixels (`scratchpad/perchpix.mjs` + `tools/pixat.mjs`) gives depth on both sides of
       every pixel, which is exactly the "no offline probe can see this" gap above — neither
       tool can answer it alone and the pair answers it in seconds.

       **Most of the crook is over open air, and the bottom of it is buried in the deck.**
       At `hero`, along the crook (cane depth vs level depth, m):

           (679,297)  11.174 vs 40.78   open air behind it — the intent, achieved
           (660,309)  11.181 vs 11.33   clearing the deck by 0.15
           (670,310)  11.182 vs 11.18   grazing
           (670,314)  11.214 vs 10.83   *** 0.38 m BEHIND the deck plane (y = 9.00) ***

       The same crossover is in `sly-perch` at (718,532): cane 4.061 against paving 3.81. That
       is KNOWN_ISSUES §82.4's open "floating brown prop at (747,477)" — which this probe
       confirms is the cane at 4.121 m, in front of the paving at 4.58 m, exactly as GEOMETRY's
       raycast implied. **The floor cuts the crook, and the arc that survives above the cut
       reads as a rod lying detached in front of him.** It is not a detachment: projected alone,
       the character is ONE connected component.

       Root cause is the whole cane mesh, not the tip. `tools/caneall.mjs` reports "0 clips with
       the tip through the floor" and is right — the TIP is at y 1.172 here. A crook is a swept
       tube and its lowest surface is neither the tip nor the `hook` point (y 0.143): the arc
       swings ~20 cm below the hook reference. Measured over the whole mesh
       (`scratchpad/canelow.mjs`), **12 clips put cane geometry under the floor** — `crawl`
       −0.517, `land_hard` −0.444, `land_roll` −0.402, `dive_impact` −0.366, `rail_slide` −0.210,
       `sneak_walk` −0.208, `ko` −0.152, `crouch_idle` −0.118, `crouch_walk` −0.099,
       `sneak_idle` −0.096, **`perch_idle` −0.062**, `pickpocket` −0.060. Another instrument
       measuring two named points on a swept tube and returning a confident zero (§11).

       **NOT fixed here, deliberately, and the cost is why.** Sweeping this aim's X against
       ground clearance (`scratchpad/caneaim.mjs`) the crook does not clear until **x = 132**,
       i.e. **+16°** off the 116 above, for 6.2 cm — 0.004 m/deg. That aim is the one the note
       above selected as rank 1 of 10351 on broad/across/bodyGap AND chose by silhouette over a
       scoring tie, on the single most recognisable prop in the series. Trading a measured
       rank-1 hook read for 6 cm of floor clearance is not a trade to make without a frame, and
       the two levers that would not touch the aim — shaft length and grip height — are global
       across all 52 clips and would shrink the hook everywhere. Handed over with the numbers
       rather than guessed at. */
    /* ── x 116 → 140 (+24° on all four keys, drift untouched). THE FRAME THE NOTE ABOVE ASKED
       FOR NOW EXISTS, and it went against the aim. `shots/char12/hero.png` at 5× and
       `shots/char12/sly-perch.png` both render the crook CUT BY THE FLOOR: on `sly-perch` the
       surviving arc is a gold crescent lying beside his boot — KNOWN_ISSUES §82.4's "floating
       brown prop", finally seen rather than inferred — and on `hero` it is a dark detached rod.
       §86.6 says `hero` "carries on tail and cane-hook silhouette alone"; the tail carries and
       the hook does not.

       So the trade the note declined is no longer rank-1-vs-6cm. The rank-1 hook read is scored
       by `tools/canesweep.mjs`, which builds the model against `new THREE.Scene()` — **no level
       geometry at all** — so its "is the crook high enough to be against open background" is
       measured against a void. In a void a crook at ankle height IS against open background;
       with a deck under him it is buried. Rank 1 of 10351 was rank 1 in a room with no floor.
       (§11's instrument family, and the fifth instance in this ledger.)

       Δ chosen against the breath, not just the frozen key: `scratchpad/canelow.mjs` (which
       reproduces the destroyed probe exactly — shipped aim decodes to [116,-30,45] and gives
       lowest cane vertex −0.0621, matching the −0.062 recorded below) puts first clearance at
       x = 132, but that is +1.7 mm, which is grazing rather than clearing, and the drift dips
       to base−4 at t=1.7. Base 140 clears by 3.7 cm frozen and 2.0 cm at the drift trough.
       All four keys move by the same +24 so only the centre moves — §9's orphaned-key trap,
       which this clip's own tail and cane notes already document.

       SELECTED BY SILHOUETTE, not by score, which is the rule the note above states: canesweep
       models the crook against `head` and `chest` only and the tail is the largest mass in this
       pose. Checked on `shotsil` at `hero`'s own 70°/1° — crook clear of tail and body.

       **FRAME VERIFICATION PENDING — do not read this as closed.** Everything above is offline:
       `canelow.mjs` for the clearance and `shotsil` for the read, and neither has the ink hull,
       the level, or the lighting. The capture that closes it was queued as `shots/char13/`
       (sly-closeup, sly-perch, hero) behind two other agents' runs and may not have landed.
       The control is `shots/char12/` — same three framings, this clip at x = 116. What to check:
       the crook is over open air along its whole arc in `hero`, and the gold crescent beside the
       boot in `sly-perch` is gone. If it is not, the honest revert is back to 116 and the item
       goes back to being a staging question (`sly-perch` frames a ledge pose on flat paving). */
    { t: 0, e: 'soft', P: PERCH, pos: [0.045, -0.30, 0.07], cane: [140, -30, 45] },
    /* In-between keys re-derived as the SAME breath drifts on the new base — these are
       absolute angles, and §9's orphaned-key trap is exactly a base pose moving under keys
       like these. Old drift preserved: hips +[2,1,-1] / chest +[-3,-2,1] / head +[-3,3,-1]
       at 0.8, the mirror at 1.7, head/neck flick deltas at 2.3. pos.x rides at the base's
       0.045 throughout so the breath does not saw the pelvis laterally. */
    /* Tail breath keys carried forward onto the re-aimed base by the SAME per-bone deltas the
       base moved (tailA +12, tailB +20, tailD -28), so the drift amplitude is unchanged and
       only its centre moves. These are absolute angles and this is exactly §9's orphaned-key
       trap: left alone they would have yanked the tail back down to the old horizontal aim
       twice every 3.2 s, on the one clip the money shot freezes. */
    { t: 0.8, e: 'soft', P: { chest: [-17, -13, 15], head: [-21, 18, 1], hips: [28, 11, -14],
      // re-authored with the base pose's tail arc — these are absolute, not deltas
      tailA: [-22, -36, 0], tailB: [22, -40, 0], tailD: [12, 30, 0] }, pos: [0.045, -0.325, 0.078], cane: [144, -34, 45] },
    { t: 1.7, e: 'soft', P: { chest: [-11, -9, 13], head: [-15, 12, 3], hips: [24, 9, -12],
      tailA: [-14, -25, 0], tailB: [30, -29, 0], tailD: [4, 22, 0] }, pos: [0.045, -0.285, 0.062], cane: [136, -26, 45] },
    // a small head-flick as something below catches his eye
    { t: 2.3, e: 'out', P: { head: [-14, 26, -3], neck: [-14, 13, 4], earL: [-20, 8, -24] } },
    { t: 3.2, e: 'soft', P: PERCH, pos: [0.045, -0.30, 0.07], cane: [140, -30, 45] },
  ],
});

/** Balance: arms wide, one foot in front of the other, constant micro-correction. */
def('balance_idle', {
  dur: 2.6, loop: true, hold: 0.6,
  keys: [
    { t: 0, e: 'soft', P: P({
      hips: [4, 4, 6], spine: [-3, -2, -4], chest: [2, -3, -7], neck: [-6, 2, 4], head: [-8, 4, 9],
      shoulderL: [-4, 4, -18], upperArmL: [-14, 10, -74], lowerArmL: [-16, -10, -20], handL: [8, -14, -22],
      shoulderR: [-4, -4, 18], upperArmR: [-10, -10, 78], lowerArmR: [-14, 10, 18], handR: [6, 12, 20],
      upperLegL: [-24, 6, 4], lowerLegL: [22, 0, 0], footL: [-2, -4, 0],
      upperLegR: [12, -6, -4], lowerLegR: [16, 0, 0], footR: [4, 4, 0],
      tailA: [8, 16, 0], tailB: [4, 24, 0], tailC: [10, 16, 0], tailD: [18, -8, 0],
    }), pos: [0.01, -0.05, 0], cane: CANE.out },
    { t: 0.7, e: 'smooth', P: { hips: [4, 4, -7], chest: [2, -3, 8], head: [-8, 4, -10],
      upperArmL: [-14, 10, -60], upperArmR: [-10, -10, 92],
      tailA: [8, -14, 0], tailB: [4, -22, 0], tailC: [10, -14, 0], tailD: [18, 10, 0] }, pos: [-0.012, -0.05, 0], cane: [58, 30, 0] },
    { t: 1.5, e: 'smooth', P: { hips: [4, 4, 9], chest: [2, -3, -10], head: [-8, 4, 12],
      upperArmL: [-14, 10, -84], upperArmR: [-10, -10, 68],
      tailA: [8, 20, 0], tailB: [4, 28, 0], tailC: [10, 20, 0], tailD: [18, -12, 0] }, pos: [0.016, -0.05, 0], cane: [58, -40, 0] },
    { t: 2.6, e: 'smooth', P: { hips: [4, 4, 6], chest: [2, -3, -7], head: [-8, 4, 9],
      upperArmL: [-14, 10, -74], upperArmR: [-10, -10, 78],
      tailA: [8, 16, 0], tailB: [4, 24, 0], tailC: [10, 16, 0], tailD: [18, -8, 0] }, pos: [0.01, -0.05, 0], cane: CANE.out },
  ],
});

/* ========================================================================== */
/*  2. locomotion cycles                                                      */
/* ========================================================================== */

/*
 * Every ground cycle below puts the **left foot contact at t = 0 and the right at t = 0.5**.
 * That is not a stylistic choice: Animation.js runs one shared phase through the whole
 * locomotion tree so a walk can cross-fade into a run mid-stride without the feet swapping
 * or skating. Break the convention and the blend falls apart.
 *
 * `stride` is the ground distance one full cycle covers, so playback rate = speed / stride.
 */

/* --------------------------------- walk ---------------------------------- */

const WALK_CONTACT = P({
  hips: [3, -7, 1],
  spine: [-1, 3, 0],
  chest: [3, 9, -1],
  neck: [-6, -4, 1],
  head: [-4, -5, 2],
  shoulderL: [0, 6, -6], upperArmL: [16, 6, -30], lowerArmL: [-18, -12, -8], handL: [4, -10, -6],
  shoulderR: [-2, -8, 8], upperArmR: [-26, -6, 30], lowerArmR: [-40, 14, 10], handR: [8, 12, 6],
  upperLegL: [-27, 4, 3], lowerLegL: [7, 0, 0], footL: [-13, -3, 0], toeL: [-4, 0, 0],
  upperLegR: [19, -4, -3], lowerLegR: [11, 0, 0], footR: [24, 3, 0], toeR: [14, 0, 0],
  tailA: [-4, 9, 0], tailB: [-12, 13, 0], tailC: [6, 8, 0], tailD: [24, -6, 0],
});
const WALK_DOWN = {
  hips: [5, -5, 3], spine: [0, 2, 1], chest: [5, 7, -2], head: [-3, -4, 1],
  upperArmL: [12, 6, -28], upperArmR: [-20, -6, 30], lowerArmR: [-34, 14, 10],
  upperLegL: [-15, 4, 3], lowerLegL: [25, 0, 0], footL: [-3, -3, 0], toeL: [0, 0, 0],
  upperLegR: [25, -4, -3], lowerLegR: [33, 0, 0], footR: [13, 3, 0], toeR: [22, 0, 0],
  tailA: [-8, 6, 0], tailB: [-16, 10, 0], tailC: [4, 6, 0],
};
const WALK_PASS = {
  hips: [3, 0, 0], spine: [-2, 0, 0], chest: [3, 0, 0], neck: [-6, 0, 0], head: [-4, 0, 0],
  shoulderL: [0, 3, -8], upperArmL: [-2, 3, -32], lowerArmL: [-26, -12, -8],
  shoulderR: [0, -3, 8], upperArmR: [-6, -3, 32], lowerArmR: [-28, 12, 8],
  upperLegL: [-3, 2, 2], lowerLegL: [12, 0, 0], footL: [-1, -2, 0], toeL: [2, 0, 0],
  upperLegR: [-9, -2, -2], lowerLegR: [47, 0, 0], footR: [-13, 2, 0], toeR: [4, 0, 0],
  tailA: [-6, 0, 0], tailB: [-14, 0, 0], tailC: [8, 0, 0], tailD: [26, 0, 0],
};
const WALK_UP = {
  hips: [1, 5, -2], spine: [-3, -2, -1], chest: [1, -6, 1], head: [-5, 4, -2],
  upperArmL: [-14, 0, -34], lowerArmL: [-30, -12, -8],
  upperArmR: [10, 0, 32], lowerArmR: [-22, 12, 8],
  upperLegL: [12, 2, 2], lowerLegL: [6, 0, 0], footL: [19, -2, 0], toeL: [12, 0, 0],
  upperLegR: [-23, -2, -2], lowerLegR: [27, 0, 0], footR: [-15, 2, 0], toeR: [2, 0, 0],
  tailA: [-4, -7, 0], tailB: [-12, -11, 0], tailC: [8, -6, 0], tailD: [26, 4, 0],
};

def('walk', {
  dur: 1.0, loop: true, stride: 2.55, hold: 0.13,
  events: [
    { t: 0.02, n: 'footstep', d: { foot: 'L', power: 0.55 } },
    { t: 0.52, n: 'footstep', d: { foot: 'R', power: 0.55 } },
  ],
  keys: [
    { t: 0.000, e: 'out', P: WALK_CONTACT, pos: [0.012, -0.036, 0], cane: CANE.down },
    { t: 0.125, e: 'smooth', P: WALK_DOWN, pos: [0.016, -0.072, 0], sc: { hips: [1.03, 0.97, 1.02] } },
    { t: 0.250, e: 'smooth', P: WALK_PASS, pos: [0.006, -0.030, 0], sc: { hips: [1, 1, 1] }, cane: [80, -6, -6] },
    { t: 0.375, e: 'smooth', P: WALK_UP, pos: [-0.004, 0.014, 0] },
    { t: 0.500, e: 'out', P: mir(WALK_CONTACT), pos: [-0.012, -0.036, 0], cane: [76, 6, -6] },
    { t: 0.625, e: 'smooth', P: mir(WALK_DOWN), pos: [-0.016, -0.072, 0], sc: { hips: [1.03, 0.97, 1.02] } },
    { t: 0.750, e: 'smooth', P: mir(WALK_PASS), pos: [-0.006, -0.030, 0], sc: { hips: [1, 1, 1] }, cane: [80, 6, -6] },
    { t: 0.875, e: 'smooth', P: mir(WALK_UP), pos: [0.004, 0.014, 0] },
    { t: 1.000, e: 'out', P: WALK_CONTACT, pos: [0.012, -0.036, 0], cane: CANE.down },
  ],
});

/* --------------------------------- run ----------------------------------- */

/* A run is not a fast walk: the torso pitches forward over the lead foot, the arms drive
   instead of swing, there is a flight phase with both feet clear, and the head stays level
   while everything under it hammers. */
const RUN_CONTACT = P({
  hips: [14, -11, 2],
  spine: [4, 5, 1],
  chest: [10, 14, -2],
  neck: [-18, -6, 2],
  head: [-14, -7, 3],
  jaw: [6, 0, 0],
  shoulderL: [-4, 9, -14], upperArmL: [46, 10, -26], lowerArmL: [-58, -14, -12], handL: [10, -14, -10],
  shoulderR: [-6, -12, 16], upperArmR: [-58, -10, 22], lowerArmR: [-72, 18, 14], handR: [12, 16, 8],
  upperLegL: [-42, 5, 4], lowerLegL: [16, 0, 0], footL: [-10, -4, 0], toeL: [-2, 0, 0],
  upperLegR: [34, -5, -4], lowerLegR: [30, 0, 0], footR: [22, 4, 0], toeR: [16, 0, 0],
  /* Streaming out behind and to his left, well clear of the torso outline. A tail authored
     straight back sits along the view axis in a frontal shot and reads as a scarf. */
  tailA: [4, -26, 0], tailB: [-2, -32, 0], tailC: [2, 18, 0], tailD: [20, 22, 0],
});
const RUN_DOWN = {
  hips: [18, -8, 5], spine: [6, 4, 2], chest: [13, 11, -3], head: [-16, -5, 2],
  upperArmL: [38, 10, -24], upperArmR: [-46, -10, 24], lowerArmR: [-64, 18, 14],
  upperLegL: [-22, 5, 4], lowerLegL: [42, 0, 0], footL: [2, -4, 0], toeL: [4, 0, 0],
  upperLegR: [40, -5, -4], lowerLegR: [56, 0, 0], footR: [10, 4, 0], toeR: [24, 0, 0],
  tailA: [0, -22, 0], tailB: [-6, -28, 0], tailC: [0, 15, 0],
};
const RUN_PASS = {
  hips: [12, -2, 0], spine: [3, 1, 0], chest: [9, 3, 0], neck: [-16, -1, 0], head: [-12, -2, 0],
  upperArmL: [10, 8, -30], lowerArmL: [-66, -14, -12],
  upperArmR: [-22, -8, 28], lowerArmR: [-56, 18, 14],
  upperLegL: [8, 3, 3], lowerLegL: [18, 0, 0], footL: [22, -3, 0], toeL: [14, 0, 0],
  upperLegR: [-14, -3, -3], lowerLegR: [96, 0, 0], footR: [-16, 3, 0], toeR: [2, 0, 0],
  tailA: [2, -18, 0], tailB: [-4, -24, 0], tailC: [0, 12, 0], tailD: [22, 16, 0],
};
/* Full extension into the flight phase — the frame that sells the speed. */
const RUN_AIR = {
  hips: [10, 8, -3], spine: [2, -4, -1], chest: [7, -11, 2], head: [-11, 6, -3],
  shoulderL: [-4, 6, -16], upperArmL: [-42, 6, -30], lowerArmL: [-74, -14, -12],
  shoulderR: [-6, -8, 18], upperArmR: [38, -6, 26], lowerArmR: [-44, 18, 14],
  upperLegL: [38, 3, 3], lowerLegL: [12, 0, 0], footL: [26, -3, 0], toeL: [18, 0, 0],
  upperLegR: [-50, -3, -3], lowerLegR: [58, 0, 0], footR: [-18, 3, 0], toeR: [0, 0, 0],
  tailA: [8, -30, 0], tailB: [0, -36, 0], tailC: [-2, 20, 0], tailD: [24, 24, 0],
};

const RUN_KEYS = (h) => ([
  { t: 0.00 * h, e: 'out', P: RUN_CONTACT, pos: [0.02, -0.10, 0.02], sc: { hips: [1.02, 0.98, 1.01] }, cane: CANE.trail },
  { t: 0.09 * h, e: 'smooth', P: RUN_DOWN, pos: [0.026, -0.165, 0.024], sc: { hips: [1.05, 0.94, 1.03], chest: [1.03, 0.97, 1.02] } },
  { t: 0.22 * h, e: 'smooth', P: RUN_PASS, pos: [0.01, -0.075, 0.01], sc: { hips: [1, 1, 1], chest: [1, 1, 1] }, cane: [108, -20, -6] },
  { t: 0.36 * h, e: 'out', P: RUN_AIR, pos: [-0.012, 0.055, -0.012], sc: { hips: [0.97, 1.05, 0.98] } },
  { t: 0.50 * h, e: 'out', P: mir(RUN_CONTACT), pos: [-0.02, -0.10, 0.02], sc: { hips: [1.02, 0.98, 1.01] }, cane: [100, -8, -6] },
  { t: 0.59 * h, e: 'smooth', P: mir(RUN_DOWN), pos: [-0.026, -0.165, 0.024], sc: { hips: [1.05, 0.94, 1.03], chest: [1.03, 0.97, 1.02] } },
  { t: 0.72 * h, e: 'smooth', P: mir(RUN_PASS), pos: [-0.01, -0.075, 0.01], sc: { hips: [1, 1, 1], chest: [1, 1, 1] }, cane: [112, -14, -6] },
  { t: 0.86 * h, e: 'out', P: mir(RUN_AIR), pos: [0.012, 0.055, -0.012], sc: { hips: [0.97, 1.05, 0.98] } },
  { t: 1.00 * h, e: 'out', P: RUN_CONTACT, pos: [0.02, -0.10, 0.02], sc: { hips: [1.02, 0.98, 1.01] }, cane: CANE.trail },
]);

/* `hold` lands on the flight key (0.36 of the cycle), not on the contact key. `courtyard`
   freezes this clip at 59 px: a contact pose has both feet under the hips and reads as
   standing still, while full extension reads as a run at any size. */
def('run', {
  dur: 0.62, loop: true, stride: 4.05, hold: 0.2232,
  events: [
    { t: 0.01, n: 'footstep', d: { foot: 'L', power: 1 } },
    { t: 0.32, n: 'footstep', d: { foot: 'R', power: 1 } },
  ],
  keys: RUN_KEYS(0.62),
});

/* Sprint: more pitch, a longer flight phase, arms crossing further over the chest. */
def('run_fast', {
  dur: 0.52, loop: true, stride: 4.85, hold: 0.045,
  events: [
    { t: 0.01, n: 'footstep', d: { foot: 'L', power: 1.25 } },
    { t: 0.27, n: 'footstep', d: { foot: 'R', power: 1.25 } },
  ],
  keys: RUN_KEYS(0.52).map((k, i) => {
    const amp = { hips: 1.25, spine: 1.2, chest: 1.2 };
    const out = { t: k.t, e: k.e, cane: k.cane, sc: k.sc };
    out.P = {};
    for (const b in k.P) {
      const v = k.P[b], s = amp[b] || 1.12;
      out.P[b] = [v[0] * s, v[1] * s, v[2] * s];
    }
    if (i === 0 || i === 8) out.P = Object.assign({}, RUN_CONTACT, out.P);
    out.pos = [k.pos[0] * 1.1, k.pos[1] * 1.15 - 0.02, k.pos[2] * 1.3];
    return out;
  }),
});

/* -------------------------------- sneak ---------------------------------- */

/* Sly's sneak is a *pose*, not a slow walk: knees deep, chest low and forward, shoulders up
   around the ears, cane held out behind like a rudder, tail flat and level. */
const SNEAK_BASE = P({
  /* **This clip freezes in three of the ten canonical shots** (`temple`, `interior`, `guard`),
     which is more than any other pose in the file, and it was bilaterally symmetric: hips,
     spine, chest, neck and head all at yaw 0 and roll 0, and the two legs within 6 deg of
     mirror images. Measured on the held frame the whole centre line sat at x 0.000 from pelvis
     to skull. That is the "stiff / no line of action" §7.3 auto-fail, in the pose that decides
     three shots — a crouch does not excuse it, it makes it worse, because a crouched symmetric
     figure reads as a squat rather than as a creep.
     Now the pelvis turns into the lead leg and the ribcage counter-rotates against it, the
     stance is staggered front-to-back rather than side-by-side, and the head finishes the
     curve by turning back over the leading shoulder. */
  hips: [30, 15, -8],
  spine: [-6, -6, 5],
  chest: [-8, -15, 12],
  neck: [-26, 9, -6],
  head: [-24, 15, -10],
  jaw: [2, 0, 0],
  capBrim: [4, 0, 0],
  earL: [-16, 6, -18], earR: [-14, -6, 20],
  shoulderL: [-8, 6, -20], upperArmL: [-40, 12, -26], lowerArmL: [-56, -18, -14], handL: [16, -14, -10],
  shoulderR: [-8, -6, 20], upperArmR: [26, -14, 34], lowerArmR: [-30, 22, 16], handR: [8, 16, 10],
  upperLegL: [-60, 10, 7], lowerLegL: [72, 0, 0], footL: [-16, -5, 0], toeL: [6, 0, 0],
  upperLegR: [-36, -9, -6], lowerLegR: [48, 0, 0], footR: [-8, 5, 0], toeR: [6, 0, 0],
  /* **Dropped hard off the hips.** `hips` is pitched 30 deg nose-down here, and the tail
     hangs off the hips, so a tail authored level comes out of that rotation climbing at 30 deg
     — and at 1.34 m long it puts its tip above his own head. Rendered as a pure silhouette
     through `temple`, `interior` and `guard` (all three freeze this clip) it is a horizontal
     plank at shoulder height, which is the exact shape the tail notes elsewhere in this file
     warn against: it flattens the figure and drops the heaviest mass on the frame's mid-line.
     A sneaking animal carries its tail LOW, so the first two joints now dump it toward the
     floor and only the last two flick up — a shallow S below the hip line instead of a beam
     above the shoulder line. */
  tailA: [-38, -20, 0], tailB: [-24, -26, 0], tailC: [40, 30, 0], tailD: [48, 36, 0],
});

def('sneak_idle', {
  dur: 3.0, loop: true, hold: 0,
  keys: [
    { t: 0, e: 'soft', P: SNEAK_BASE, pos: [0, -0.30, 0.05], cane: CANE.out },
    { t: 0.8, e: 'soft', P: { chest: [-11, -5, 2], head: [-27, 12, -6], neck: [-28, 6, -2],
      tailA: [-40, -26, 0], tailB: [-22, -32, 0], tailC: [38, 34, 0], tailD: [46, 40, 0] }, pos: [0.006, -0.315, 0.055], cane: [56, -40, 0] },
    { t: 1.7, e: 'soft', P: { chest: [-5, 5, -2], head: [-21, -10, 5], neck: [-24, -5, 2],
      tailA: [-34, -14, 0], tailB: [-26, -20, 0], tailC: [42, 26, 0], tailD: [50, 30, 0] }, pos: [-0.006, -0.285, 0.045], cane: [60, -26, 0] },
    { t: 3.0, e: 'soft', P: SNEAK_BASE, pos: [0, -0.30, 0.05], cane: CANE.out },
  ],
});

/* Tiptoe: an exaggerated high knee lift, a long slow reach and a light toe-first plant. */
const SNEAK_C = Object.assign({}, SNEAK_BASE, {
  hips: [30, -9, 2], spine: [-6, 4, 0], chest: [-8, 11, -1],
  upperArmL: [-28, 12, -26], upperArmR: [16, -14, 34],
  upperLegL: [-76, 8, 4], lowerLegL: [46, 0, 0], footL: [12, -5, 0], toeL: [-6, 0, 0],
  upperLegR: [-18, -8, -4], lowerLegR: [48, 0, 0], footR: [-4, 5, 0], toeR: [10, 0, 0],
  tailA: [-36, -10, 0], tailB: [-26, -16, 0], tailC: [42, 34, 0], tailD: [48, 26, 0],
});
const SNEAK_D = {
  hips: [32, -6, 3], chest: [-6, 8, -1],
  upperLegL: [-56, 8, 4], lowerLegL: [62, 0, 0], footL: [-8, -5, 0], toeL: [4, 0, 0],
  upperLegR: [-30, -8, -4], lowerLegR: [66, 0, 0], footR: [4, 5, 0], toeR: [14, 0, 0],
};
const SNEAK_P = {
  hips: [30, 0, 0], spine: [-6, 0, 0], chest: [-8, 0, 0],
  upperArmL: [-40, 12, -26], upperArmR: [26, -14, 34],
  upperLegL: [-40, 6, 4], lowerLegL: [70, 0, 0], footL: [-16, -5, 0], toeL: [8, 0, 0],
  upperLegR: [-58, -6, -4], lowerLegR: [78, 0, 0], footR: [-22, 5, 0], toeR: [2, 0, 0],
  tailA: [-32, 0, 0], tailB: [-22, 0, 0], tailC: [42, 0, 0], tailD: [46, 0, 0],
};
const SNEAK_U = {
  hips: [30, 6, -1], spine: [-6, -3, 0], chest: [-8, -8, 1],
  upperArmL: [-48, 12, -26], upperArmR: [34, -14, 34],
  upperLegL: [-26, 6, 4], lowerLegL: [58, 0, 0], footL: [4, -5, 0], toeL: [12, 0, 0],
  upperLegR: [-78, -6, -4], lowerLegR: [56, 0, 0], footR: [6, 5, 0], toeR: [-4, 0, 0],
  tailA: [-2, -8, 0], tailB: [2, -11, 0], tailC: [4, -7, 0], tailD: [10, 6, 0],
};

def('sneak_walk', {
  dur: 1.5, loop: true, stride: 2.1, hold: 0.2,
  events: [
    { t: 0.045, n: 'footstep', d: { foot: 'L', power: 0.22 } },
    { t: 0.795, n: 'footstep', d: { foot: 'R', power: 0.22 } },
  ],
  keys: [
    { t: 0.000, e: 'out', P: SNEAK_C, pos: [0.014, -0.315, 0.05], cane: CANE.out },
    { t: 0.135, e: 'smooth', P: SNEAK_D, pos: [0.018, -0.335, 0.05] },
    { t: 0.260, e: 'in', P: SNEAK_P, pos: [0.006, -0.30, 0.05], cane: [58, -30, 0] },
    { t: 0.385, e: 'smooth', P: SNEAK_U, pos: [-0.006, -0.285, 0.05] },
    { t: 0.500, e: 'out', P: mir(SNEAK_C), pos: [-0.014, -0.315, 0.05], cane: [58, -40, 0] },
    { t: 0.635, e: 'smooth', P: mir(SNEAK_D), pos: [-0.018, -0.335, 0.05] },
    { t: 0.760, e: 'in', P: mir(SNEAK_P), pos: [-0.006, -0.30, 0.05], cane: [58, -30, 0] },
    { t: 0.885, e: 'smooth', P: mir(SNEAK_U), pos: [0.006, -0.285, 0.05] },
    { t: 1.000, e: 'out', P: SNEAK_C, pos: [0.014, -0.315, 0.05], cane: CANE.out },
  ].map((k) => ({ ...k, t: k.t * 1.5 })),
});

/* -------------------------------- crouch --------------------------------- */

const CROUCH_BASE = P({
  hips: [44, 0, 0], spine: [-10, 0, 0], chest: [-14, 0, 0], neck: [-30, 0, 0], head: [-26, 0, 0],
  shoulderL: [-6, 6, -14], upperArmL: [-46, 14, -18], lowerArmL: [-64, -20, -16], handL: [20, -16, -10],
  shoulderR: [-6, -6, 14], upperArmR: [-30, -14, 22], lowerArmR: [-58, 20, 16], handR: [16, 16, 10],
  upperLegL: [-92, 8, 6], lowerLegL: [102, 0, 0], footL: [-14, -6, 0], toeL: [10, 0, 0],
  upperLegR: [-88, -8, -6], lowerLegR: [98, 0, 0], footR: [-12, 6, 0], toeR: [10, 0, 0],
  tailA: [4, 0, 0], tailB: [-6, 0, 0], tailC: [-4, 0, 0], tailD: [16, 0, 0],
});

def('crouch_idle', {
  dur: 2.8, loop: true, hold: 0.6,
  keys: [
    { t: 0, e: 'soft', P: CROUCH_BASE, pos: [0, -0.52, 0.08], cane: CANE.tuck },
    { t: 0.9, e: 'soft', P: { chest: [-17, -4, 2], head: [-29, 9, -5], tailA: [6, -9, 0], tailB: [-4, -13, 0], tailD: [14, 8, 0] }, pos: [0, -0.535, 0.084] },
    { t: 1.9, e: 'soft', P: { chest: [-11, 4, -2], head: [-23, -7, 4], tailA: [2, 8, 0], tailB: [-8, 12, 0], tailD: [18, -6, 0] }, pos: [0, -0.505, 0.076] },
    { t: 2.8, e: 'soft', P: CROUCH_BASE, pos: [0, -0.52, 0.08], cane: CANE.tuck },
  ],
});

const CR_C = Object.assign({}, CROUCH_BASE, {
  hips: [44, -8, 2], chest: [-14, 10, -1],
  upperArmL: [-34, 14, -18], upperArmR: [-42, -14, 22],
  upperLegL: [-116, 10, 6], lowerLegL: [96, 0, 0], footL: [-4, -6, 0],
  upperLegR: [-64, -10, -6], lowerLegR: [88, 0, 0], footR: [4, 6, 0], toeR: [16, 0, 0],
  tailA: [4, 10, 0], tailB: [-6, 14, 0], tailC: [-4, 9, 0], tailD: [16, -7, 0],
});
const CR_P = {
  hips: [44, 0, 0], chest: [-14, 0, 0],
  upperArmL: [-46, 14, -18], upperArmR: [-30, -14, 22],
  upperLegL: [-86, 8, 6], lowerLegL: [108, 0, 0], footL: [-16, -6, 0],
  upperLegR: [-96, -8, -6], lowerLegR: [112, 0, 0], footR: [-18, 6, 0], toeR: [4, 0, 0],
  tailA: [4, 0, 0], tailB: [-6, 0, 0], tailC: [-4, 0, 0], tailD: [16, 0, 0],
};

def('crouch_walk', {
  dur: 1.25, loop: true, stride: 1.55, hold: 0.16,
  events: [
    { t: 0.038, n: 'footstep', d: { foot: 'L', power: 0.3 } },
    { t: 0.663, n: 'footstep', d: { foot: 'R', power: 0.3 } },
  ],
  keys: [
    { t: 0.000, e: 'out', P: CR_C, pos: [0.012, -0.535, 0.08], cane: CANE.tuck },
    { t: 0.250, e: 'smooth', P: CR_P, pos: [0.004, -0.505, 0.08] },
    { t: 0.500, e: 'out', P: mir(CR_C), pos: [-0.012, -0.535, 0.08] },
    { t: 0.750, e: 'smooth', P: mir(CR_P), pos: [-0.004, -0.505, 0.08] },
    { t: 1.000, e: 'out', P: CR_C, pos: [0.012, -0.535, 0.08], cane: CANE.tuck },
  ].map((k) => ({ ...k, t: k.t * 1.25 })),
});

/* --------------------------------- crawl --------------------------------- */

/* Belly-down in a vent. Cross-pattern: left arm reaches with the right knee. */
const CRAWL_A = P({
  hips: [80, -6, 0], spine: [-14, 4, 0], chest: [-30, 8, 0], neck: [-46, -4, 0], head: [-40, -5, 0],
  shoulderL: [-16, 10, -34], upperArmL: [-96, 18, -40], lowerArmL: [-46, -20, -18], handL: [30, -12, -8],
  shoulderR: [-4, -8, 12], upperArmR: [-20, -18, 30], lowerArmR: [-84, 24, 18], handR: [18, 18, 10],
  upperLegL: [-42, 22, 8], lowerLegL: [86, 0, 0], footL: [-4, -8, 0], toeL: [8, 0, 0],
  upperLegR: [-88, -26, -8], lowerLegR: [104, 0, 0], footR: [-8, 8, 0], toeR: [8, 0, 0],
  tailA: [-14, 8, 0], tailB: [-8, 12, 0], tailC: [0, 8, 0], tailD: [12, -6, 0],
});

def('crawl', {
  dur: 1.6, loop: true, stride: 1.35, hold: 0.2,
  events: [
    { t: 0.08, n: 'footstep', d: { foot: 'L', power: 0.18 } },
    { t: 0.88, n: 'footstep', d: { foot: 'R', power: 0.18 } },
  ],
  keys: [
    { t: 0.00, e: 'out', P: CRAWL_A, pos: [0.01, -0.86, 0.10], cane: CANE.tuck },
    { t: 0.25, e: 'smooth', P: { hips: [80, 0, 0], chest: [-30, 0, 0], head: [-40, 0, 0],
      upperArmL: [-64, 18, -34], upperArmR: [-56, -18, 30],
      upperLegL: [-64, 24, 8], upperLegR: [-64, -24, -8], lowerLegL: [96, 0, 0], lowerLegR: [96, 0, 0] }, pos: [0, -0.845, 0.10] },
    { t: 0.50, e: 'out', P: mir(CRAWL_A), pos: [-0.01, -0.86, 0.10], cane: [96, -26, 0] },
    { t: 0.75, e: 'smooth', P: { hips: [80, 0, 0], chest: [-30, 0, 0], head: [-40, 0, 0],
      upperArmL: [-64, 18, -34], upperArmR: [-56, -18, 30],
      upperLegL: [-64, 24, 8], upperLegR: [-64, -24, -8], lowerLegL: [96, 0, 0], lowerLegR: [96, 0, 0] }, pos: [0, -0.845, 0.10] },
    { t: 1.00, e: 'out', P: CRAWL_A, pos: [0.01, -0.86, 0.10], cane: CANE.tuck },
  ].map((k) => ({ ...k, t: k.t * 1.6 })),
});

/* -------------------------------- turns ---------------------------------- */

/* Turn in place. Blended in additively by the tree from `turnRate`, so it is authored as a
   *whole-body wind*: hips lead, chest counters, head has already arrived. */
def('turn_l', {
  dur: 0.7, loop: true, hold: 0.35,
  keys: [
    { t: 0, e: 'smooth', P: P({
      hips: [2, 22, 4], spine: [-2, 10, 2], chest: [4, 16, -3], neck: [-6, 12, 2], head: [-5, 22, -6],
      shoulderL: [0, 8, -6], upperArmL: [-16, 8, -26], lowerArmL: [-34, -14, -10],
      shoulderR: [0, -8, 12], upperArmR: [4, -10, 38], lowerArmR: [-30, 16, 12],
      upperLegL: [-14, 26, 6], lowerLegL: [22, 0, 0], footL: [-6, -14, 0],
      upperLegR: [4, 10, -2], lowerLegR: [14, 0, 0], footR: [-2, 16, 0],
      tailA: [4, 22, 0], tailB: [-4, 30, 0], tailC: [10, 20, 0], tailD: [24, -12, 0],
    }), pos: [0.02, -0.05, -0.01], cane: [84, -26, -6] },
    { t: 0.35, e: 'smooth', P: {
      upperLegL: [4, 14, 6], lowerLegL: [14, 0, 0], footL: [-2, -8, 0],
      upperLegR: [-16, 22, -2], lowerLegR: [28, 0, 0], footR: [-8, 20, 0],
      hips: [2, 26, 3], tailA: [4, 16, 0], tailB: [-4, 24, 0],
    }, pos: [0.01, -0.065, -0.01] },
    { t: 0.7, e: 'smooth', P: {
      upperLegL: [-14, 26, 6], lowerLegL: [22, 0, 0], footL: [-6, -14, 0],
      upperLegR: [4, 10, -2], lowerLegR: [14, 0, 0], footR: [-2, 16, 0],
      hips: [2, 22, 4], tailA: [4, 22, 0], tailB: [-4, 30, 0],
    }, pos: [0.02, -0.05, -0.01] },
  ],
});

/* ========================================================================== */
/*  3. stops and rolls                                                        */
/* ========================================================================== */

/* Skid: the classic cartoon stop — heels dug in, body reclined *behind* the feet, arms
   windmilling forward, cane thrown out for balance, then a snap upright. */
def('skid_stop', {
  dur: 0.62, loop: false, hold: 0.14,
  events: [{ t: 0.03, n: 'footstep', d: { foot: 'B', power: 1.4 } }],
  keys: [
    { t: 0, e: 'snap', P: P({
      hips: [16, -6, 0], spine: [2, 3, 0], chest: [8, 8, 0], neck: [-16, -4, 0], head: [-12, -6, 0],
      shoulderL: [-6, 8, -18], upperArmL: [-46, 12, -38], lowerArmL: [-52, -16, -14],
      shoulderR: [-6, -8, 18], upperArmR: [-40, -12, 34], lowerArmR: [-48, 16, 14],
      upperLegL: [-40, 6, 4], lowerLegL: [30, 0, 0], footL: [-18, -4, 0],
      upperLegR: [10, -6, -4], lowerLegR: [40, 0, 0], footR: [10, 4, 0],
      tailA: [16, 10, 0], tailB: [8, 14, 0], tailC: [-4, 8, 0], tailD: [10, -6, 0],
    }), pos: [0.01, -0.10, 0.03], cane: CANE.trail },
    // heels in, torso reclined back over the skid, arms thrown forward
    { t: 0.14, e: 'out', P: {
      hips: [-16, -8, 2], spine: [-8, 4, 1], chest: [-14, 10, -2], neck: [4, -5, 1], head: [10, -8, 3],
      upperArmL: [-84, 16, -46], lowerArmL: [-30, -18, -16],
      upperArmR: [-78, -16, 42], lowerArmR: [-26, 18, 16],
      upperLegL: [-58, 8, 4], lowerLegL: [16, 0, 0], footL: [-30, -5, 0], toeL: [-10, 0, 0],
      upperLegR: [-28, -8, -4], lowerLegR: [26, 0, 0], footR: [-24, 5, 0], toeR: [-8, 0, 0],
      tailA: [30, 16, 0], tailB: [26, 22, 0], tailC: [8, 14, 0], tailD: [-6, -10, 0],
    }, pos: [0.014, -0.20, -0.09], sc: { hips: [1.06, 0.92, 1.04] }, cane: [122, 28, -8] },
    // overshoot the recovery: he comes back up past vertical
    { t: 0.38, e: 'out', P: {
      hips: [10, 4, -2], spine: [4, -2, 0], chest: [10, -6, 2], neck: [-14, 3, -1], head: [-14, 5, -2],
      upperArmL: [-6, 8, -30], lowerArmL: [-40, -14, -10],
      upperArmR: [4, -10, 30], lowerArmR: [-52, 16, 12],
      upperLegL: [-20, 6, 4], lowerLegL: [30, 0, 0], footL: [-6, -4, 0], toeL: [4, 0, 0],
      upperLegR: [-12, -6, -4], lowerLegR: [24, 0, 0], footR: [-4, 4, 0], toeR: [4, 0, 0],
      tailA: [-10, 6, 0], tailB: [-18, 10, 0], tailC: [4, 6, 0], tailD: [26, -4, 0],
    }, pos: [0, -0.07, 0.02], sc: { hips: [0.98, 1.03, 0.99] }, cane: [86, 8, -6] },
    { t: 0.62, e: 'soft', P: IDLE_A, pos: [-0.078, -0.018, 0], sc: { hips: [1, 1, 1] }, cane: CANE.plant },
  ],
});

/* Roll. The root is at his feet, so the tumble is authored on the hips with a matching
   pos offset — the tuck stays centred on the ball of the body all the way round. */
def('roll', {
  dur: 0.66, loop: false, hold: 0.28,
  events: [{ t: 0.50, n: 'footstep', d: { foot: 'B', power: 0.8 } }],
  keys: [
    // anticipation: he ducks and gathers before he throws himself at the ground
    { t: 0, e: 'in', P: P({
      hips: [34, -4, 0], spine: [-8, 2, 0], chest: [-16, 4, 0], neck: [-24, -2, 0], head: [-22, -3, 0],
      upperArmL: [-30, 12, -34], lowerArmL: [-70, -18, -14],
      upperArmR: [-24, -12, 30], lowerArmR: [-66, 18, 14],
      upperLegL: [-70, 6, 4], lowerLegL: [78, 0, 0], footL: [-10, -5, 0],
      upperLegR: [-64, -6, -4], lowerLegR: [72, 0, 0], footR: [-8, 5, 0],
      tailA: [10, 4, 0], tailB: [-4, 6, 0], tailC: [-8, 4, 0], tailD: [14, -2, 0],
    }), pos: [0, -0.34, 0.06], cane: CANE.tuck },
    { t: 0.10, e: 'out', P: { hips: [116, -4, 0], chest: [-22, 4, 0], head: [-30, -3, 0],
      upperLegL: [-104, 6, 4], lowerLegL: [116, 0, 0], upperLegR: [-100, -6, -4], lowerLegR: [112, 0, 0],
      upperArmL: [-56, 12, -30], lowerArmL: [-96, -18, -14], upperArmR: [-50, -12, 26], lowerArmR: [-92, 18, 14],
      tailA: [26, 4, 0], tailB: [10, 6, 0], tailC: [-14, 4, 0], tailD: [-8, -2, 0] },
      pos: [0, -0.58, 0.34], sc: { hips: [1.04, 0.94, 1.04] } },
    { t: 0.26, e: 'lin', P: { hips: [252, -4, 0] }, pos: [0, -0.62, 0.10] },
    { t: 0.40, e: 'out', P: { hips: [340, -4, 0], chest: [-16, 4, 0],
      upperLegL: [-86, 6, 4], upperLegR: [-82, -6, -4] }, pos: [0, -0.50, -0.16] },
    // land out of the roll on one knee, cane planted — an authored recovery beat
    { t: 0.50, e: 'out', P: { hips: [376, -8, 2], spine: [-10, 4, 1], chest: [-8, 8, -2], neck: [-20, -4, 2], head: [-16, -6, 4],
      upperArmL: [-56, 14, -28], lowerArmL: [-40, -18, -14], handL: [28, -14, -8],
      upperArmR: [-18, -14, 26], lowerArmR: [-70, 20, 16],
      upperLegL: [-104, 10, 6], lowerLegL: [116, 0, 0], footL: [-6, -6, 0],
      upperLegR: [-48, -10, -6], lowerLegR: [56, 0, 0], footR: [-14, 6, 0],
      tailA: [-6, -10, 0], tailB: [-16, -14, 0], tailC: [2, -8, 0], tailD: [22, 8, 0] },
      pos: [0, -0.40, -0.02], sc: { hips: [1.08, 0.88, 1.06], chest: [1.05, 0.93, 1.04] }, cane: [104, 20, -6] },
    // and rise, overshooting slightly upright before settling
    { t: 0.66, e: 'out', P: Object.assign({}, IDLE_A, { hips: [358, 10, -6], chest: [1, -10, 5] }),
      pos: [-0.050, -0.024, 0], sc: { hips: [0.99, 1.02, 0.99], chest: [1, 1, 1] }, cane: CANE.plant },
  ],
});

/* ========================================================================== */
/*  4. air                                                                    */
/* ========================================================================== */

/**
 * The jump. MOVEMENT fires this on the frame the launch impulse is applied, so the
 * anticipation has to live in the first 70 ms of the clip: he is still compressed from the
 * crouch, then the whole body extends through it and overshoots into a long arch.
 */
/* `loop: false` because a rise is not a cycle. `compile()` defaults loop to true (`d.loop !==
   false`), and `baseClip()` holds a track whose time grows without bound, so while the state
   persists `sampleInto` was wrapping t and snapping the body back to key 0 — the launch arm
   (-30/14/-78) resetting to the coiled crouch (10/12/-22), 75° in one frame. Reachable: the
   default jump rises for jumpV0/g = 11.0/24 = 0.458 s, inside the clip, but a spire jump launches
   at spireJump × jumpV0 = 13.75 and rises for 0.573 s. With loop false, `sampleInto` clamps and
   holds the final extended pose, which is what an over-long rise should look like. The clip has
   no events, and `_trackEvents` reads `tr.loop` not `clip.loop`, so nothing else changes. */
def('jump_rise', {
  dur: 0.55, loop: false, hold: 0.24,
  keys: [
    // still coiled — the pose the launch is escaping from
    { t: 0, e: 'in', P: P({
      hips: [40, -3, 0], spine: [-10, 2, 0], chest: [-14, 3, 0], neck: [-22, -2, 0], head: [-20, -2, 0],
      shoulderL: [-8, 8, -12], upperArmL: [10, 12, -22], lowerArmL: [-56, -18, -14],
      shoulderR: [-8, -8, 12], upperArmR: [18, -12, 26], lowerArmR: [-50, 18, 14],
      upperLegL: [-78, 6, 4], lowerLegL: [92, 0, 0], footL: [-12, -5, 0], toeL: [12, 0, 0],
      upperLegR: [-74, -6, -4], lowerLegR: [88, 0, 0], footR: [-10, 5, 0], toeR: [12, 0, 0],
      tailA: [6, 4, 0], tailB: [-6, 6, 0], tailC: [-4, 4, 0], tailD: [18, -2, 0],
    }), pos: [0, -0.42, 0.05], sc: { hips: [1.08, 0.86, 1.06], chest: [1.05, 0.92, 1.04] }, cane: CANE.tuck },
    // full extension: toes pointed, arms thrown up, chest open, stretched on Y
    { t: 0.13, e: 'out', P: {
      hips: [-6, -3, 0], spine: [2, 2, 0], chest: [-8, 3, 0], neck: [-14, -2, 0], head: [-16, -2, 0],
      shoulderL: [-14, 10, -26], upperArmL: [-44, 14, -96], lowerArmL: [-30, -20, -22], handL: [16, -14, -18],
      shoulderR: [-14, -10, 26], upperArmR: [-38, -14, 92], lowerArmR: [-26, 20, 22], handR: [12, 16, 18],
      upperLegL: [-14, 6, 4], lowerLegL: [12, 0, 0], footL: [30, -5, 0], toeL: [20, 0, 0],
      upperLegR: [6, -6, -4], lowerLegR: [8, 0, 0], footR: [34, 5, 0], toeR: [22, 0, 0],
      tailA: [-16, 4, 0], tailB: [-26, 6, 0], tailC: [-14, 4, 0], tailD: [10, -2, 0],
    }, pos: [0, 0.05, -0.02], sc: { hips: [0.92, 1.14, 0.93], chest: [0.95, 1.08, 0.96] }, cane: [110, 14, -8] },
    // settle out of the stretch and start folding for the apex
    { t: 0.34, e: 'smooth', P: {
      hips: [4, -3, 0], chest: [-4, 3, 0], head: [-18, -2, 0],
      upperArmL: [-30, 14, -78], upperArmR: [-24, -14, 74],
      upperLegL: [-30, 6, 4], lowerLegL: [40, 0, 0], footL: [16, -5, 0],
      upperLegR: [-10, -6, -4], lowerLegR: [24, 0, 0], footR: [24, 5, 0],
      tailA: [-6, 4, 0], tailB: [-16, 6, 0], tailC: [-2, 4, 0], tailD: [20, -2, 0],
    }, pos: [0, 0.01, 0], sc: { hips: [0.98, 1.04, 0.98], chest: [1, 1, 1] }, cane: [98, 6, -8] },
    { t: 0.55, e: 'smooth', P: {
      hips: [10, -3, 0], chest: [-2, 3, 0],
      upperLegL: [-40, 6, 4], lowerLegL: [52, 0, 0],
      upperLegR: [-18, -6, -4], lowerLegR: [34, 0, 0],
    }, pos: [0, 0, 0], sc: { hips: [1, 1, 1] } },
  ],
});

/* Apex — the §6 float. He hangs, arches, and looks where he is going. */
def('jump_apex', {
  dur: 0.8, loop: true, hold: 0.32,
  keys: [
    { t: 0, e: 'smooth', P: P({
      hips: [8, -6, 3], spine: [-6, 3, 1], chest: [-12, 8, -2], neck: [-16, -4, 2], head: [-18, -6, 3],
      shoulderL: [-12, 10, -22], upperArmL: [-34, 16, -70], lowerArmL: [-44, -20, -20], handL: [14, -16, -16],
      shoulderR: [-12, -10, 22], upperArmR: [-20, -16, 62], lowerArmR: [-40, 20, 20], handR: [10, 18, 16],
      upperLegL: [-46, 8, 5], lowerLegL: [56, 0, 0], footL: [14, -6, 0], toeL: [12, 0, 0],
      upperLegR: [-20, -8, -5], lowerLegR: [36, 0, 0], footR: [22, 6, 0], toeR: [16, 0, 0],
      tailA: [-10, -8, 0], tailB: [-22, -12, 0], tailC: [-6, -8, 0], tailD: [16, 6, 0],
    }), pos: [0, -0.02, 0.01], cane: [96, -12, -8] },
    { t: 0.4, e: 'smooth', P: {
      hips: [6, 6, -3], chest: [-10, -8, 2], head: [-16, 7, -3],
      upperArmL: [-26, 16, -62], upperArmR: [-28, -16, 70],
      upperLegL: [-34, 8, 5], lowerLegL: [44, 0, 0], upperLegR: [-30, -8, -5], lowerLegR: [46, 0, 0],
      tailA: [-14, 10, 0], tailB: [-26, 14, 0], tailC: [-10, 9, 0], tailD: [12, -7, 0],
    }, pos: [0, 0.01, -0.01], cane: [100, 10, -8] },
    { t: 0.8, e: 'smooth', P: {
      hips: [8, -6, 3], chest: [-12, 8, -2], head: [-18, -6, 3],
      upperArmL: [-34, 16, -70], upperArmR: [-20, -16, 62],
      upperLegL: [-46, 8, 5], lowerLegL: [56, 0, 0], upperLegR: [-20, -8, -5], lowerLegR: [36, 0, 0],
      tailA: [-10, -8, 0], tailB: [-22, -12, 0], tailC: [-6, -8, 0], tailD: [16, 6, 0],
    }, pos: [0, -0.02, 0.01], cane: [96, -12, -8] },
  ],
});

/* Falling: he reaches for the ground with his feet and the tail streams straight up. */
def('jump_fall', {
  dur: 0.7, loop: true, hold: 0.3,
  keys: [
    { t: 0, e: 'smooth', P: P({
      hips: [16, -4, 2], spine: [2, 2, 1], chest: [6, 6, -1], neck: [-22, -3, 1], head: [-20, -4, 2],
      shoulderL: [-16, 12, -26], upperArmL: [12, 18, -78], lowerArmL: [-52, -22, -24], handL: [18, -18, -20],
      shoulderR: [-16, -12, 26], upperArmR: [20, -18, 74], lowerArmR: [-48, 22, 24], handR: [14, 20, 20],
      upperLegL: [-30, 8, 5], lowerLegL: [40, 0, 0], footL: [-6, -6, 0], toeL: [6, 0, 0],
      upperLegR: [-14, -8, -5], lowerLegR: [26, 0, 0], footR: [-2, 6, 0], toeR: [6, 0, 0],
      tailA: [-26, -6, 0], tailB: [-34, -10, 0], tailC: [-16, -6, 0], tailD: [8, 4, 0],
    }), pos: [0, -0.02, -0.01], cane: [112, -10, -8] },
    { t: 0.35, e: 'smooth', P: {
      hips: [20, 4, -2], chest: [8, -6, 1], head: [-22, 5, -2],
      upperArmL: [4, 18, -70], upperArmR: [26, -18, 82],
      upperLegL: [-20, 8, 5], lowerLegL: [30, 0, 0], upperLegR: [-24, -8, -5], lowerLegR: [34, 0, 0],
      tailA: [-30, 8, 0], tailB: [-38, 12, 0], tailC: [-20, 8, 0], tailD: [4, -5, 0],
    }, pos: [0, 0, 0.01], cane: [116, 8, -8] },
    { t: 0.7, e: 'smooth', P: {
      hips: [16, -4, 2], chest: [6, 6, -1], head: [-20, -4, 2],
      upperArmL: [12, 18, -78], upperArmR: [20, -18, 74],
      upperLegL: [-30, 8, 5], lowerLegL: [40, 0, 0], upperLegR: [-14, -8, -5], lowerLegR: [26, 0, 0],
      tailA: [-26, -6, 0], tailB: [-34, -10, 0], tailC: [-16, -6, 0], tailD: [8, 4, 0],
    }, pos: [0, -0.02, -0.01], cane: [112, -10, -8] },
  ],
});

/**
 * Double jump — the cane twirl. He tucks, whips the cane through a full rotation overhead
 * and the spin drags his body round with it. The cane channel does the 360; the body only
 * needs to sell that the twirl is what lifted him.
 */
/* `loop: false` — see jump_rise. Not reachable at the current tuning (doubleJumpV0/g = 9.90/24 =
   0.4125 s against a 0.62 s clip, 0.21 s of headroom) but discontinuous by 42° at the seam, so it
   is one tuning nudge from the same snap. */
def('double_jump', {
  dur: 0.62, loop: false, hold: 0.2,
  keys: [
    { t: 0, e: 'in', P: P({
      hips: [30, -14, 4], spine: [-6, 6, 2], chest: [-12, 16, -3], neck: [-18, -8, 2], head: [-16, -12, 4],
      shoulderL: [-10, 12, -18], upperArmL: [-14, 14, -40], lowerArmL: [-62, -20, -16],
      shoulderR: [-14, -14, 22], upperArmR: [-30, -18, 54], lowerArmR: [-58, 24, 20], handR: [10, 18, 14],
      upperLegL: [-70, 10, 5], lowerLegL: [84, 0, 0], footL: [10, -6, 0], toeL: [14, 0, 0],
      upperLegR: [-62, -10, -5], lowerLegR: [78, 0, 0], footR: [14, 6, 0], toeR: [14, 0, 0],
      tailA: [4, -16, 0], tailB: [-8, -22, 0], tailC: [-6, -14, 0], tailD: [16, 10, 0],
    }), pos: [0, -0.16, 0.03], sc: { hips: [1.06, 0.9, 1.05] }, cane: [40, -60, 0] },
    { t: 0.16, e: 'out', P: {
      hips: [-2, 22, -6], spine: [2, -8, -2], chest: [-6, -22, 4], neck: [-14, 10, -3], head: [-18, 16, -6],
      upperArmL: [-40, 14, -84], lowerArmL: [-28, -20, -20],
      upperArmR: [-64, -18, 96], lowerArmR: [-24, 24, 24],
      upperLegL: [-26, 10, 5], lowerLegL: [30, 0, 0], footL: [28, -6, 0],
      upperLegR: [-6, -10, -5], lowerLegR: [16, 0, 0], footR: [32, 6, 0],
      tailA: [-14, 24, 0], tailB: [-26, 32, 0], tailC: [-12, 22, 0], tailD: [12, -14, 0],
    }, pos: [0, 0.06, -0.02], sc: { hips: [0.93, 1.12, 0.94] }, cane: [-60, 100, 0] },
    { t: 0.34, e: 'smooth', P: {
      hips: [6, -18, 5], chest: [-4, 18, -3], head: [-16, -12, 4],
      upperArmL: [-30, 14, -70], upperArmR: [-46, -18, 78],
      upperLegL: [-38, 10, 5], lowerLegL: [46, 0, 0], upperLegR: [-18, -10, -5], lowerLegR: [30, 0, 0],
      tailA: [-6, -20, 0], tailB: [-18, -26, 0], tailC: [-8, -18, 0], tailD: [14, 12, 0],
    }, pos: [0, 0.01, 0], sc: { hips: [1, 1, 1] }, cane: [-160, 260, 0] },
    { t: 0.62, e: 'smooth', P: {
      hips: [12, -6, 3], chest: [-6, 8, -2],
      upperArmL: [-26, 16, -66], upperArmR: [-24, -16, 66],
      upperLegL: [-44, 8, 5], lowerLegL: [54, 0, 0], upperLegR: [-22, -8, -5], lowerLegR: [36, 0, 0],
      tailA: [-10, -8, 0], tailB: [-22, -12, 0], tailC: [-6, -8, 0], tailD: [16, 6, 0],
    }, pos: [0, -0.01, 0], cane: [96, 400, -8] },
  ],
});

/* ---------------------------- landings ----------------------------------- */

/* §6: 0.82 scale-y over 90 ms, ease-out back. The squash is a *pose*, not just a scale —
   knees fold, the chest drops between the shoulders, the tail flies up from the impact. */
def('land_soft', {
  dur: 0.42, loop: false, hold: 0.09,
  events: [
    { t: 0.0, n: 'land', d: { force: 0.45 } },
    { t: 0.01, n: 'footstep', d: { foot: 'B', power: 0.7 } },
  ],
  keys: [
    { t: 0, e: 'snap', P: P({
      hips: [14, -4, 2], spine: [0, 2, 1], chest: [4, 5, -1], neck: [-18, -3, 1], head: [-16, -4, 2],
      upperArmL: [4, 14, -56], lowerArmL: [-48, -18, -18],
      upperArmR: [10, -14, 52], lowerArmR: [-44, 18, 18],
      upperLegL: [-34, 7, 5], lowerLegL: [42, 0, 0], footL: [-8, -5, 0],
      upperLegR: [-30, -7, -5], lowerLegR: [38, 0, 0], footR: [-6, 5, 0],
      tailA: [-18, -5, 0], tailB: [-28, -8, 0], tailC: [-10, -5, 0], tailD: [12, 4, 0],
    }), pos: [0, -0.06, 0.01], cane: [104, -8, -8] },
    // the squash: 90 ms in, everything compresses
    { t: 0.09, e: 'out', P: {
      hips: [34, -6, 3], spine: [-8, 3, 1], chest: [-14, 7, -2], neck: [-14, -4, 2], head: [-10, -6, 3],
      upperArmL: [-24, 16, -34], lowerArmL: [-70, -20, -18], handL: [22, -16, -12],
      upperArmR: [-16, -16, 32], lowerArmR: [-66, 20, 18],
      upperLegL: [-76, 9, 6], lowerLegL: [88, 0, 0], footL: [-14, -6, 0], toeL: [8, 0, 0],
      upperLegR: [-70, -9, -6], lowerLegR: [82, 0, 0], footR: [-12, 6, 0], toeR: [8, 0, 0],
      tailA: [16, -8, 0], tailB: [4, -12, 0], tailC: [-8, -8, 0], tailD: [6, 6, 0],
    }, pos: [0, -0.40, 0.04], sc: { hips: [1.13, 0.82, 1.1], chest: [1.08, 0.88, 1.06], head: [1.05, 0.94, 1.04] }, cane: [92, -18, -8] },
    // ease-out back, overshooting a touch tall before it settles
    { t: 0.26, e: 'out', P: {
      hips: [2, 8, -5], spine: [-2, -4, 3], chest: [4, -10, 4], head: [-8, 10, -5],
      upperArmL: [-10, 6, -32], lowerArmL: [-32, -14, -10],
      upperArmR: [0, -10, 30], lowerArmR: [-48, 16, 12],
      upperLegL: [-14, 5, 3], lowerLegL: [18, 0, 0], footL: [-6, -4, 0],
      upperLegR: [-12, -5, -3], lowerLegR: [16, 0, 0], footR: [-5, 4, 0],
      tailA: [-2, 10, 0], tailB: [-12, 14, 0], tailC: [10, 9, 0], tailD: [28, -7, 0],
    }, pos: [0, 0.015, 0], sc: { hips: [0.97, 1.05, 0.98], chest: [0.98, 1.03, 0.99], head: [1, 1, 1] }, cane: [82, 4, -6] },
    { t: 0.42, e: 'soft', P: IDLE_A, pos: [-0.078, -0.018, 0], sc: { hips: [1, 1, 1], chest: [1, 1, 1] }, cane: CANE.plant },
  ],
});

/* Hard landing: three-point, one glove punched into the paving, cane out wide. */
def('land_hard', {
  dur: 0.72, loop: false, hold: 0.13,
  events: [
    { t: 0.0, n: 'land', d: { force: 1 } },
    { t: 0.01, n: 'footstep', d: { foot: 'B', power: 1.5 } },
  ],
  keys: [
    { t: 0, e: 'snap', P: P({
      hips: [10, -6, 3], spine: [2, 3, 1], chest: [8, 8, -2], neck: [-20, -4, 2], head: [-18, -6, 3],
      upperArmL: [-6, 16, -62], lowerArmL: [-40, -20, -18],
      upperArmR: [8, -16, 58], lowerArmR: [-38, 20, 18],
      upperLegL: [-28, 8, 5], lowerLegL: [34, 0, 0], footL: [-10, -6, 0],
      upperLegR: [-24, -8, -5], lowerLegR: [30, 0, 0], footR: [-8, 6, 0],
      tailA: [-24, -8, 0], tailB: [-34, -12, 0], tailC: [-14, -8, 0], tailD: [10, 6, 0],
    }), pos: [0, -0.04, 0.01], cane: [110, -14, -8] },
    { t: 0.10, e: 'out', P: {
      hips: [52, -12, 6], spine: [-14, 6, 3], chest: [-26, 14, -4], neck: [-10, -8, 4], head: [-4, -12, 6],
      shoulderL: [8, 12, -18], upperArmL: [-70, 20, -20], lowerArmL: [-52, -22, -14], handL: [40, -14, -6],
      shoulderR: [-6, -12, 18], upperArmR: [16, -22, 44], lowerArmR: [-40, 26, 22], handR: [12, 20, 14],
      upperLegL: [-104, 12, 8], lowerLegL: [116, 0, 0], footL: [-16, -8, 0], toeL: [12, 0, 0],
      upperLegR: [-92, -12, -8], lowerLegR: [104, 0, 0], footR: [-14, 8, 0], toeR: [12, 0, 0],
      tailA: [26, -14, 0], tailB: [14, -20, 0], tailC: [-6, -13, 0], tailD: [2, 10, 0],
    }, pos: [0, -0.62, 0.10], sc: { hips: [1.18, 0.74, 1.14], chest: [1.12, 0.83, 1.09], head: [1.08, 0.9, 1.06] }, cane: [70, -46, -8] },
    { t: 0.20, e: 'smooth', P: { hips: [48, -10, 5], head: [-8, -10, 5] },
      pos: [0, -0.58, 0.10], sc: { hips: [1.14, 0.79, 1.1], chest: [1.09, 0.87, 1.07], head: [1.05, 0.94, 1.04] } },
    { t: 0.44, e: 'out', P: {
      hips: [0, 10, -6], spine: [-2, -5, 4], chest: [6, -12, 5], neck: [-8, 6, -2], head: [-12, 12, -6],
      shoulderL: [0, 6, -8], upperArmL: [-12, 8, -34], lowerArmL: [-30, -16, -12], handL: [10, -14, -10],
      shoulderR: [-2, -6, 10], upperArmR: [-4, -12, 28], lowerArmR: [-54, 18, 14],
      upperLegL: [-12, 6, 4], lowerLegL: [16, 0, 0], footL: [-6, -5, 0], toeL: [2, 0, 0],
      upperLegR: [-10, -6, -4], lowerLegR: [14, 0, 0], footR: [-5, 5, 0], toeR: [2, 0, 0],
      tailA: [-6, 12, 0], tailB: [-16, 16, 0], tailC: [8, 11, 0], tailD: [26, -8, 0],
    }, pos: [0, 0.02, 0], sc: { hips: [0.96, 1.07, 0.97], chest: [0.97, 1.04, 0.98], head: [1, 1, 1] }, cane: [86, 6, -6] },
    { t: 0.72, e: 'soft', P: IDLE_A, pos: [-0.078, -0.018, 0], sc: { hips: [1, 1, 1], chest: [1, 1, 1] }, cane: CANE.plant },
  ],
});

/* Landing straight into a roll — the impact is absorbed by rotating through it. */
def('land_roll', {
  dur: 0.78, loop: false, hold: 0.1,
  events: [
    { t: 0.0, n: 'land', d: { force: 0.8 } },
    { t: 0.30, n: 'footstep', d: { foot: 'B', power: 0.6 } },
  ],
  keys: [
    { t: 0, e: 'snap', P: P({
      hips: [24, -6, 2], spine: [0, 3, 1], chest: [2, 8, -2], neck: [-16, -4, 2], head: [-14, -6, 3],
      upperArmL: [-20, 16, -50], lowerArmL: [-56, -20, -18],
      upperArmR: [-10, -16, 46], lowerArmR: [-52, 20, 18],
      upperLegL: [-42, 8, 5], lowerLegL: [50, 0, 0], footL: [-8, -6, 0],
      upperLegR: [-36, -8, -5], lowerLegR: [44, 0, 0], footR: [-6, 6, 0],
      tailA: [-16, -8, 0], tailB: [-26, -12, 0], tailC: [-10, -8, 0], tailD: [12, 6, 0],
    }), pos: [0, -0.12, 0.02], cane: [102, -18, -8] },
    { t: 0.10, e: 'out', P: {
      hips: [88, -6, 2], chest: [-20, 8, -2], head: [-26, -6, 3],
      upperArmL: [-52, 16, -34], lowerArmL: [-88, -20, -14],
      upperArmR: [-44, -16, 30], lowerArmR: [-84, 20, 14],
      upperLegL: [-96, 8, 5], lowerLegL: [108, 0, 0], upperLegR: [-92, -8, -5], lowerLegR: [104, 0, 0],
      tailA: [22, -8, 0], tailB: [8, -12, 0], tailC: [-12, -8, 0], tailD: [-4, 6, 0],
    }, pos: [0, -0.54, 0.28], sc: { hips: [1.1, 0.86, 1.08] } },
    { t: 0.30, e: 'lin', P: { hips: [244, -6, 2] }, pos: [0, -0.62, 0.08], sc: { hips: [1.04, 0.95, 1.03] } },
    { t: 0.46, e: 'out', P: { hips: [352, -8, 3], chest: [-10, 10, -3],
      upperLegL: [-96, 10, 6], lowerLegL: [110, 0, 0], upperLegR: [-56, -10, -6], lowerLegR: [64, 0, 0],
      upperArmL: [-50, 14, -30], lowerArmL: [-46, -18, -14], handL: [30, -14, -8],
      tailA: [-4, -12, 0], tailB: [-14, -16, 0], tailC: [4, -10, 0], tailD: [22, 8, 0] },
      pos: [0, -0.44, 0.0], sc: { hips: [1.06, 0.9, 1.05] }, cane: [100, 16, -6] },
    { t: 0.60, e: 'out', P: { hips: [366, 6, -4], chest: [4, -8, 4],
      upperLegL: [-26, 8, 5], lowerLegL: [32, 0, 0], upperLegR: [-14, -8, -5], lowerLegR: [20, 0, 0],
      upperArmL: [-14, 8, -34], upperArmR: [-10, -12, 30] },
      pos: [0, -0.03, 0], sc: { hips: [0.98, 1.04, 0.99] }, cane: [88, 4, -6] },
    { t: 0.78, e: 'soft', P: Object.assign({}, IDLE_A, { hips: [361, 12, -8] }), pos: [-0.078, -0.018, 0], sc: { hips: [1, 1, 1] }, cane: CANE.plant },
  ],
});

/* ========================================================================== */
/*  5. walls                                                                  */
/* ========================================================================== */

/**
 * Wall run, wall on his LEFT. Feet strike the vertical surface, the body is banked hard into
 * it, the inside (left) hand slaps along the stone and the cane trails on the outside. A wall
 * run that just plays a run cycle sideways is the single most obvious tell of a cheap rig, so
 * the whole torso is rolled ~40° toward the wall and the legs cycle across the body.
 */
const WR_A = P({
  hips: [8, -18, -34], spine: [2, 6, -8], chest: [6, 14, -12], neck: [-20, -8, 12], head: [-18, -12, 20],
  jaw: [4, 0, 0], earL: [-14, 8, -20], earR: [-10, -8, 24],
  shoulderL: [-8, 10, -22], upperArmL: [-30, 16, -78], lowerArmL: [-40, -18, -22], handL: [24, -16, -16],
  shoulderR: [-6, -10, 14], upperArmR: [24, -14, 30], lowerArmR: [-58, 20, 16], handR: [12, 16, 10],
  upperLegL: [-58, 10, -14], lowerLegL: [40, 0, 0], footL: [4, -8, -18], toeL: [8, 0, 0],
  upperLegR: [22, -12, -6], lowerLegR: [24, 0, 0], footR: [18, 8, -10], toeR: [12, 0, 0],
  tailA: [4, 22, 0], tailB: [-6, 30, 0], tailC: [-2, 20, 0], tailD: [18, -12, 0],
});
def('wall_run_l', {
  dur: 0.5, loop: true, stride: 2.5, hold: 0.12,
  events: [
    { t: 0.02, n: 'footstep', d: { foot: 'L', power: 0.9 } },
    { t: 0.27, n: 'footstep', d: { foot: 'R', power: 0.9 } },
  ],
  keys: [
    { t: 0.00, e: 'out', P: WR_A, pos: [-0.06, -0.10, 0.02], cane: [96, -34, -10] },
    { t: 0.25, e: 'smooth', P: {
      hips: [8, -14, -38], chest: [6, 10, -14], head: [-18, -8, 22],
      upperArmL: [-52, 16, -66], lowerArmL: [-24, -18, -22],
      upperLegL: [10, 10, -10], lowerLegL: [30, 0, 0], footL: [16, -8, -14],
      upperLegR: [-48, -12, -10], lowerLegR: [46, 0, 0], footR: [0, 8, -14],
      tailA: [4, 14, 0], tailB: [-6, 20, 0], tailC: [-2, 13, 0], tailD: [18, -8, 0],
    }, pos: [-0.07, -0.05, 0.02], cane: [104, -24, -10] },
    { t: 0.50, e: 'out', P: {
      hips: [8, -18, -34], chest: [6, 14, -12], head: [-18, -12, 20],
      upperArmL: [-30, 16, -78], lowerArmL: [-40, -18, -22],
      upperLegL: [-58, 10, -14], lowerLegL: [40, 0, 0], footL: [4, -8, -18],
      upperLegR: [22, -12, -6], lowerLegR: [24, 0, 0], footR: [18, 8, -10],
      tailA: [4, 22, 0], tailB: [-6, 30, 0], tailC: [-2, 20, 0], tailD: [18, -12, 0],
    }, pos: [-0.06, -0.10, 0.02], cane: [96, -34, -10] },
  ],
});

/* Cling: spread-eagled on the stone, both gloves gripping, cheek almost against the wall. */
def('wall_cling', {
  dur: 2.2, loop: true, hold: 0.5,
  keys: [
    { t: 0, e: 'soft', P: P({
      hips: [-12, 0, 0], spine: [6, 0, 0], chest: [10, 0, 0], neck: [-26, 0, 0], head: [-30, 6, 0],
      shoulderL: [-14, 8, -30], upperArmL: [-16, 20, -106], lowerArmL: [-34, -22, -26], handL: [26, -18, -22],
      shoulderR: [-14, -8, 30], upperArmR: [-12, -20, 102], lowerArmR: [-30, 22, 26], handR: [22, 20, 22],
      upperLegL: [-34, 16, 8], lowerLegL: [46, 0, 0], footL: [-16, -10, 0], toeL: [10, 0, 0],
      upperLegR: [-20, -16, -8], lowerLegR: [30, 0, 0], footR: [-12, 10, 0], toeR: [10, 0, 0],
      tailA: [-20, 10, 0], tailB: [-30, 14, 0], tailC: [-14, 9, 0], tailD: [10, -7, 0],
    }), pos: [0, -0.14, 0.10], cane: [126, 20, -10] },
    // he slips a few centimetres and re-grips — the beat that says this is costing him
    { t: 0.9, e: 'in', P: { hips: [-10, 0, 0], head: [-28, 4, 0] }, pos: [0, -0.19, 0.10] },
    { t: 1.05, e: 'out', P: { hips: [-14, 0, 0], head: [-32, 8, 0], upperArmL: [-20, 20, -110], upperArmR: [-16, -20, 106],
      tailA: [-26, 10, 0], tailB: [-36, 14, 0] }, pos: [0, -0.12, 0.10] },
    { t: 2.2, e: 'soft', P: { hips: [-12, 0, 0], head: [-30, 6, 0], upperArmL: [-16, 20, -106], upperArmR: [-12, -20, 102],
      tailA: [-20, 10, 0], tailB: [-30, 14, 0] }, pos: [0, -0.14, 0.10], cane: [126, 20, -10] },
  ],
});

/* Wall jump: coil into the stone, then fire off it with a twist. */
/* `loop: false` — see jump_rise. 39° at the seam, and only 0.07 s of headroom: the kick-off rises
   for jumpV0 × wallJumpUp / g = 11.0 × 0.94 / 24 = 0.431 s against a 0.5 s clip. */
def('wall_jump', {
  dur: 0.5, loop: false, hold: 0.16,
  keys: [
    { t: 0, e: 'in', P: P({
      hips: [-6, -10, -14], spine: [4, 4, -4], chest: [8, 10, -6], neck: [-22, -6, 4], head: [-24, -8, 8],
      shoulderL: [-12, 10, -26], upperArmL: [-22, 18, -92], lowerArmL: [-46, -20, -24],
      shoulderR: [-10, -10, 22], upperArmR: [6, -18, 60], lowerArmR: [-58, 22, 20],
      upperLegL: [-72, 12, 6], lowerLegL: [86, 0, 0], footL: [-8, -8, -8], toeL: [10, 0, 0],
      upperLegR: [-58, -12, -6], lowerLegR: [72, 0, 0], footR: [-6, 8, -6], toeR: [10, 0, 0],
      tailA: [10, 16, 0], tailB: [-2, 22, 0], tailC: [-4, 14, 0], tailD: [16, -9, 0],
    }), pos: [0, -0.30, 0.08], sc: { hips: [1.07, 0.89, 1.05] }, cane: [104, -28, -8] },
    { t: 0.14, e: 'out', P: {
      hips: [-2, 26, 16], spine: [0, -10, 5], chest: [-6, -26, 8], neck: [-16, 12, -5], head: [-20, 20, -10],
      upperArmL: [-44, 18, -70], lowerArmL: [-26, -20, -24],
      upperArmR: [-48, -18, 88], lowerArmR: [-22, 22, 24],
      upperLegL: [-10, 12, 6], lowerLegL: [16, 0, 0], footL: [28, -8, 0], toeL: [18, 0, 0],
      upperLegR: [12, -12, -6], lowerLegR: [10, 0, 0], footR: [32, 8, 0], toeR: [18, 0, 0],
      tailA: [-16, -22, 0], tailB: [-28, -30, 0], tailC: [-12, -20, 0], tailD: [12, 12, 0],
    }, pos: [0, 0.05, -0.04], sc: { hips: [0.92, 1.13, 0.94] }, cane: [76, 44, -8] },
    { t: 0.5, e: 'smooth', P: {
      hips: [8, 8, 4], chest: [-8, -10, 3], head: [-18, 8, -4],
      upperArmL: [-30, 16, -72], upperArmR: [-26, -16, 68],
      upperLegL: [-40, 8, 5], lowerLegL: [50, 0, 0], upperLegR: [-20, -8, -5], lowerLegR: [34, 0, 0],
      tailA: [-10, -8, 0], tailB: [-22, -12, 0], tailC: [-6, -8, 0], tailD: [16, 6, 0],
    }, pos: [0, 0, 0], sc: { hips: [1, 1, 1] }, cane: [96, 6, -8] },
  ],
});

/* ========================================================================== */
/*  6. ledges                                                                 */
/* ========================================================================== */

/* Hang: long body, both gloves over the lip, one knee drawn up, tail hanging dead straight —
   the stillness is what makes the shimmy and the mantle read as effort. */
const HANG = P({
  hips: [-4, 0, 0], spine: [4, 0, 0], chest: [8, 0, 0], neck: [-24, 0, 0], head: [-28, 4, 0],
  shoulderL: [-16, 6, -34], upperArmL: [-10, 16, -118], lowerArmL: [-24, -20, -20], handL: [28, -16, -18],
  shoulderR: [-16, -6, 34], upperArmR: [-8, -16, 114], lowerArmR: [-22, 20, 20], handR: [24, 18, 18],
  upperLegL: [-40, 10, 6], lowerLegL: [56, 0, 0], footL: [16, -8, 0], toeL: [10, 0, 0],
  upperLegR: [-8, -10, -6], lowerLegR: [20, 0, 0], footR: [24, 8, 0], toeR: [12, 0, 0],
  tailA: [-26, 4, 0], tailB: [-34, 6, 0], tailC: [-16, 4, 0], tailD: [6, -3, 0],
});
def('ledge_hang', {
  dur: 2.8, loop: true, hold: 0.6,
  keys: [
    { t: 0, e: 'soft', P: HANG, pos: [0, -0.06, -0.04], cane: [134, 14, -10] },
    { t: 0.9, e: 'soft', P: { chest: [10, 5, -2], head: [-30, 12, -4], hips: [-4, -6, 3],
      upperLegL: [-46, 10, 6], upperLegR: [-4, -10, -6],
      tailA: [-24, -10, 0], tailB: [-32, -14, 0], tailC: [-14, -9, 0], tailD: [8, 7, 0] }, pos: [0.01, -0.08, -0.04] },
    { t: 1.9, e: 'soft', P: { chest: [6, -5, 2], head: [-26, -4, 4], hips: [-4, 6, -3],
      upperLegL: [-34, 10, 6], upperLegR: [-12, -10, -6],
      tailA: [-28, 10, 0], tailB: [-36, 14, 0], tailC: [-18, 9, 0], tailD: [4, -7, 0] }, pos: [-0.01, -0.04, -0.04] },
    { t: 2.8, e: 'soft', P: HANG, pos: [0, -0.06, -0.04], cane: [134, 14, -10] },
  ],
});

/* Shimmy left: reach with the left glove, then the right catches up. Weight swings under
   the gripping hand each half-cycle, which is what stops it reading as sliding. */
def('ledge_shimmy_l', {
  dur: 0.9, loop: true, stride: 0.75, hold: 0.24,
  events: [{ t: 0.05, n: 'footstep', d: { foot: 'L', power: 0.15 } }],
  keys: [
    { t: 0, e: 'smooth', P: Object.assign({}, HANG, {
      hips: [-4, 6, 8], chest: [8, -4, -6], head: [-28, -2, -8],
      upperArmL: [-14, 18, -104], upperArmR: [-6, -18, 122],
      upperLegL: [-46, 12, 8], upperLegR: [-4, -8, -4],
      tailA: [-26, -12, 0], tailB: [-34, -16, 0], tailC: [-16, -10, 0], tailD: [6, 8, 0],
    }), pos: [0.03, -0.05, -0.04], cane: [132, 20, -10] },
    { t: 0.25, e: 'out', P: {
      hips: [-4, 2, 4], chest: [8, 0, -3],
      upperArmL: [-22, 20, -132], lowerArmL: [-16, -20, -20],
      upperLegL: [-30, 12, 8], lowerLegL: [40, 0, 0],
      tailA: [-24, -4, 0], tailB: [-32, -6, 0],
    }, pos: [0.05, -0.07, -0.04] },
    { t: 0.5, e: 'smooth', P: {
      hips: [-4, -6, -8], chest: [8, 4, 6], head: [-28, 4, 8],
      upperArmL: [-10, 16, -118], lowerArmL: [-24, -20, -20],
      upperArmR: [-14, -20, 100],
      upperLegL: [-40, 10, 6], lowerLegL: [56, 0, 0], upperLegR: [-10, -12, -8],
      tailA: [-28, 12, 0], tailB: [-36, 16, 0], tailC: [-18, 10, 0], tailD: [4, -8, 0],
    }, pos: [-0.02, -0.05, -0.04], cane: [136, 6, -10] },
    { t: 0.75, e: 'out', P: {
      upperArmR: [-4, -18, 126], lowerArmR: [-14, 20, 20],
      upperLegR: [-18, -12, -8], lowerLegR: [34, 0, 0], hips: [-4, -2, -4],
    }, pos: [-0.04, -0.07, -0.04] },
    { t: 0.9, e: 'smooth', P: Object.assign({}, HANG, {
      hips: [-4, 6, 8], chest: [8, -4, -6], head: [-28, -2, -8],
      upperArmL: [-14, 18, -104], upperArmR: [-6, -18, 122],
      upperLegL: [-46, 12, 8], upperLegR: [-4, -8, -4],
      tailA: [-26, -12, 0], tailB: [-34, -16, 0], tailC: [-16, -10, 0], tailD: [6, 8, 0],
    }), pos: [0.03, -0.05, -0.04], cane: [132, 20, -10] },
  ],
});

/* Mantle: pull, throw a knee over the lip, push down through both arms and rise. */
def('ledge_climb', {
  dur: 0.95, loop: false, hold: 0.42,
  events: [{ t: 0.62, n: 'footstep', d: { foot: 'R', power: 0.6 } }],
  keys: [
    { t: 0, e: 'in', P: HANG, pos: [0, -0.06, -0.04], cane: [134, 14, -10] },
    // the pull — elbows fold, chin clears the lip, tail counterweights down
    { t: 0.22, e: 'out', P: {
      hips: [10, -4, 2], spine: [-2, 2, 1], chest: [-4, 5, -2], neck: [-14, -3, 2], head: [-16, -4, 3],
      upperArmL: [-24, 18, -86], lowerArmL: [-86, -22, -22], handL: [30, -16, -18],
      upperArmR: [-20, -18, 82], lowerArmR: [-84, 22, 22],
      upperLegL: [-84, 14, 8], lowerLegL: [96, 0, 0], footL: [-4, -10, 0],
      upperLegR: [-30, -12, -6], lowerLegR: [44, 0, 0], footR: [12, 10, 0],
      tailA: [-30, -6, 0], tailB: [-38, -9, 0], tailC: [-18, -6, 0], tailD: [4, 5, 0],
    }, pos: [0, -0.34, -0.02] },
    // knee over
    { t: 0.42, e: 'smooth', P: {
      hips: [42, -8, 4], spine: [-10, 4, 2], chest: [-18, 10, -3], neck: [-8, -5, 3], head: [-10, -8, 5],
      upperArmL: [-70, 20, -46], lowerArmL: [-58, -22, -18], handL: [40, -16, -12],
      upperArmR: [-40, -20, 54], lowerArmR: [-70, 24, 20],
      upperLegL: [-116, 16, 10], lowerLegL: [104, 0, 0], footL: [-10, -12, 0], toeL: [14, 0, 0],
      upperLegR: [-46, -14, -8], lowerLegR: [66, 0, 0], footR: [4, 12, 0],
      tailA: [-8, -12, 0], tailB: [-20, -16, 0], tailC: [-4, -10, 0], tailD: [18, 9, 0],
    }, pos: [0, -0.46, 0.16] },
    // push down and up, overshooting tall
    { t: 0.68, e: 'out', P: {
      hips: [12, 8, -5], spine: [-4, -4, 3], chest: [0, -10, 4], neck: [-12, 5, -2], head: [-14, 10, -5],
      upperArmL: [-14, 10, -40], lowerArmL: [-30, -16, -12], handL: [14, -14, -10],
      upperArmR: [-6, -12, 34], lowerArmR: [-46, 18, 14],
      upperLegL: [-46, 8, 5], lowerLegL: [54, 0, 0], footL: [-8, -6, 0],
      upperLegR: [-16, -8, -5], lowerLegR: [24, 0, 0], footR: [-6, 6, 0],
      tailA: [2, 10, 0], tailB: [-8, 14, 0], tailC: [10, 9, 0], tailD: [26, -7, 0],
    }, pos: [0, -0.10, 0.06], sc: { hips: [0.97, 1.04, 0.98] }, cane: [92, 10, -8] },
    { t: 0.95, e: 'soft', P: IDLE_A, pos: [-0.078, -0.018, 0], sc: { hips: [1, 1, 1] }, cane: CANE.plant },
  ],
});

/* ========================================================================== */
/*  7. hooks                                                                  */
/* ========================================================================== */

/* Grab: he throws the cane up, the hook bites, and his weight snaps onto it. */
def('hook_grab', {
  dur: 0.44, loop: false, hold: 0.2,
  keys: [
    { t: 0, e: 'in', P: P({
      hips: [16, -8, 3], spine: [2, 4, 1], chest: [4, 10, -2], neck: [-24, -5, 2], head: [-26, -8, 4],
      shoulderL: [-10, 10, -22], upperArmL: [-6, 16, -70], lowerArmL: [-48, -20, -20],
      shoulderR: [-14, -12, 26], upperArmR: [-26, -20, 74], lowerArmR: [-60, 24, 22], handR: [16, 20, 16],
      upperLegL: [-40, 10, 6], lowerLegL: [52, 0, 0], footL: [4, -7, 0],
      upperLegR: [-18, -10, -6], lowerLegR: [32, 0, 0], footR: [12, 7, 0],
      tailA: [-14, -8, 0], tailB: [-26, -12, 0], tailC: [-10, -8, 0], tailD: [14, 6, 0],
    }), pos: [0, -0.06, 0.02], cane: [30, -30, 0] },
    // the throw: cane snaps overhead, body stretches after it
    { t: 0.12, e: 'snap', P: {
      hips: [-4, -4, 2], chest: [-8, 6, -1], neck: [-30, -3, 1], head: [-34, -5, 2],
      shoulderL: [-18, 12, -32], upperArmL: [-24, 20, -108], lowerArmL: [-26, -22, -24],
      shoulderR: [-20, -14, 34], upperArmR: [-40, -22, 112], lowerArmR: [-30, 26, 26], handR: [22, 22, 20],
      upperLegL: [-24, 10, 6], lowerLegL: [34, 0, 0], footL: [22, -7, 0],
      upperLegR: [-6, -10, -6], lowerLegR: [18, 0, 0], footR: [26, 7, 0],
      tailA: [-30, -6, 0], tailB: [-40, -9, 0], tailC: [-20, -6, 0], tailD: [4, 5, 0],
    }, pos: [0, 0.04, -0.03], sc: { hips: [0.94, 1.09, 0.95] }, cane: CANE.up },
    // the catch: everything jolts down as the rope takes his weight
    { t: 0.22, e: 'out', P: {
      hips: [14, -6, 3], chest: [4, 8, -2], head: [-28, -6, 3],
      upperArmL: [-14, 20, -122], lowerArmL: [-36, -22, -24],
      upperArmR: [-28, -22, 120], lowerArmR: [-38, 26, 26],
      upperLegL: [-52, 12, 7], lowerLegL: [64, 0, 0], footL: [10, -8, 0],
      upperLegR: [-30, -12, -7], lowerLegR: [44, 0, 0], footR: [16, 8, 0],
      tailA: [-6, -10, 0], tailB: [-18, -14, 0], tailC: [-6, -9, 0], tailD: [18, 7, 0],
    }, pos: [0, -0.16, 0.02], sc: { hips: [1.05, 0.93, 1.04] }, cane: [-92, 4, 0] },
    { t: 0.44, e: 'out', P: {
      hips: [6, -4, 2], chest: [0, 6, -1], head: [-26, -4, 2],
      upperArmL: [-16, 18, -116], upperArmR: [-24, -20, 112],
      upperLegL: [-34, 10, 6], lowerLegL: [46, 0, 0], upperLegR: [-16, -10, -6], lowerLegR: [30, 0, 0],
      tailA: [-18, -6, 0], tailB: [-28, -9, 0], tailC: [-12, -6, 0], tailD: [12, 5, 0],
    }, pos: [0, -0.05, 0], sc: { hips: [1, 1, 1] }, cane: CANE.up },
  ],
});

/**
 * `hook_swing` — the `traversal` shot. He hangs off the cane with both gloves, body drawn into
 * a long C that reverses through the swing, legs together and streaming, tail whipping behind
 * the arc. One clear line of action from the cane hook down through the spine to the toes.
 */
const SWING_BACK = P({
  hips: [-26, -6, 3], spine: [8, 3, 1], chest: [14, 8, -2], neck: [-34, -4, 2], head: [-36, -6, 4],
  jaw: [4, 0, 0], earL: [-18, 8, -22], earR: [-12, -8, 26],
  shoulderL: [-18, 8, -34], upperArmL: [-14, 18, -122], lowerArmL: [-30, -20, -22], handL: [26, -16, -20],
  shoulderR: [-18, -8, 34], upperArmR: [-16, -18, 118], lowerArmR: [-28, 20, 22], handR: [24, 18, 20],
  upperLegL: [26, 8, 6], lowerLegL: [34, 0, 0], footL: [26, -6, 0], toeL: [16, 0, 0],
  upperLegR: [34, -8, -6], lowerLegR: [28, 0, 0], footR: [30, 6, 0], toeR: [16, 0, 0],
  tailA: [-8, 6, 0], tailB: [-20, 9, 0], tailC: [-10, 6, 0], tailD: [14, -5, 0],
});
/* `hold` is the front of the arc, not the bottom of it. `traversal` freezes this clip, and the
   bottom-of-arc key is by construction the frame where the body is straightest and most
   vertical — the one moment in a swing that looks like hanging still. */
def('hook_swing', {
  dur: 1.5, loop: true, hold: 0.75,
  keys: [
    { t: 0, e: 'smooth', P: SWING_BACK, pos: [0, -0.02, -0.05], cane: [-96, 4, 0] },
    // through the bottom: body straightens, legs whip through and forward
    { t: 0.42, e: 'lin', P: {
      hips: [22, -3, 2], spine: [-4, 2, 1], chest: [-6, 5, -1], neck: [-24, -2, 1], head: [-24, -3, 2],
      upperArmL: [-20, 18, -116], upperArmR: [-22, -18, 112],
      upperLegL: [-46, 8, 6], lowerLegL: [24, 0, 0], footL: [20, -6, 0],
      upperLegR: [-38, -8, -6], lowerLegR: [30, 0, 0], footR: [24, 6, 0],
      tailA: [-24, -4, 0], tailB: [-34, -6, 0], tailC: [-18, -4, 0], tailD: [8, 3, 0],
    }, pos: [0, -0.06, 0.05], sc: { hips: [0.96, 1.06, 0.97] }, cane: [-92, -6, 0] },
    // front of the arc — the pose the traversal frame wants: knees up, chest open, grinning
    { t: 0.75, e: 'smooth', P: {
      hips: [46, -6, 3], spine: [-12, 3, 1], chest: [-18, 8, -2], neck: [-10, -4, 2], head: [-8, -6, 4],
      upperArmL: [-34, 18, -104], lowerArmL: [-46, -20, -22],
      upperArmR: [-36, -18, 100], lowerArmR: [-44, 20, 22],
      upperLegL: [-96, 10, 7], lowerLegL: [72, 0, 0], footL: [-6, -8, 0], toeL: [10, 0, 0],
      upperLegR: [-84, -10, -7], lowerLegR: [64, 0, 0], footR: [-2, 8, 0], toeR: [10, 0, 0],
      tailA: [-26, -24, 0], tailB: [-34, -30, 0], tailC: [-14, 18, 0], tailD: [10, 20, 0],
    }, pos: [0, -0.04, 0.10], sc: { hips: [1, 1, 1] }, cane: [-100, 8, 0] },
    { t: 1.1, e: 'lin', P: {
      hips: [16, -3, 2], chest: [-4, 5, -1], head: [-22, -3, 2],
      upperArmL: [-22, 18, -118], upperArmR: [-24, -18, 114],
      upperLegL: [-20, 8, 6], lowerLegL: [30, 0, 0], upperLegR: [-10, -8, -6], lowerLegR: [26, 0, 0],
      tailA: [-16, -6, 0], tailB: [-28, -9, 0], tailC: [-14, -6, 0], tailD: [10, 5, 0],
    }, pos: [0, -0.05, 0.02], cane: [-94, -4, 0] },
    { t: 1.5, e: 'smooth', P: SWING_BACK, pos: [0, -0.02, -0.05], cane: [-96, 4, 0] },
  ],
});

/* Release: he snaps the cane free and flings himself forward off the arc. */
def('hook_release', {
  dur: 0.4, loop: false, hold: 0.14,
  keys: [
    { t: 0, e: 'in', P: P({
      hips: [40, -6, 3], spine: [-10, 3, 1], chest: [-16, 8, -2], neck: [-14, -4, 2], head: [-12, -6, 4],
      shoulderL: [-18, 8, -34], upperArmL: [-32, 18, -108], lowerArmL: [-44, -20, -22],
      shoulderR: [-18, -8, 34], upperArmR: [-34, -18, 104], lowerArmR: [-42, 20, 22],
      upperLegL: [-88, 10, 7], lowerLegL: [66, 0, 0], footL: [-4, -8, 0],
      upperLegR: [-78, -10, -7], lowerLegR: [60, 0, 0], footR: [0, 8, 0],
      tailA: [-28, 8, 0], tailB: [-36, 12, 0], tailC: [-18, 8, 0], tailD: [8, -6, 0],
    }), pos: [0, -0.04, 0.08], cane: [-100, 8, 0] },
    // let go and throw the arms wide — the release reads as a decision, not a slip
    { t: 0.12, e: 'out', P: {
      hips: [4, -10, 5], spine: [4, 5, 2], chest: [8, 12, -3], neck: [-26, -6, 3], head: [-28, -10, 6],
      upperArmL: [-52, 20, -70], lowerArmL: [-22, -22, -24], handL: [10, -18, -22],
      upperArmR: [-46, -20, 66], lowerArmR: [-20, 22, 24],
      upperLegL: [-20, 10, 6], lowerLegL: [26, 0, 0], footL: [24, -8, 0], toeL: [16, 0, 0],
      upperLegR: [-2, -10, -6], lowerLegR: [14, 0, 0], footR: [28, 8, 0], toeR: [16, 0, 0],
      tailA: [-22, -12, 0], tailB: [-32, -16, 0], tailC: [-16, -11, 0], tailD: [10, 9, 0],
    }, pos: [0, 0.03, -0.02], sc: { hips: [0.94, 1.10, 0.95] }, cane: [-40, 40, 0] },
    { t: 0.4, e: 'smooth', P: {
      hips: [12, -4, 2], chest: [-2, 6, -1], head: [-20, -4, 2],
      upperArmL: [-32, 16, -72], upperArmR: [-26, -16, 68],
      upperLegL: [-40, 8, 5], lowerLegL: [50, 0, 0], upperLegR: [-20, -8, -5], lowerLegR: [34, 0, 0],
      tailA: [-12, -8, 0], tailB: [-24, -12, 0], tailC: [-8, -8, 0], tailD: [16, 6, 0],
    }, pos: [0, 0, 0], sc: { hips: [1, 1, 1] }, cane: [96, 6, -8] },
  ],
});

/* ========================================================================== */
/*  8. rails and poles                                                        */
/* ========================================================================== */

/* Rail slide: side-on, feet fore-and-aft along the rail, knees deep, one arm leading, cane
   thrown out behind as a counterweight. The sway is authored (§6 wants ±6°), not procedural. */
const RAIL = P({
  hips: [22, -52, 4], spine: [-4, 14, -3], chest: [-2, 26, -6], neck: [-16, 8, 4], head: [-18, 24, 8],
  jaw: [4, 0, 0], earL: [-14, 8, -20], earR: [-10, -8, 22],
  shoulderL: [-8, 12, -22], upperArmL: [-46, 20, -56], lowerArmL: [-30, -18, -20], handL: [16, -16, -16],
  shoulderR: [-6, -12, 20], upperArmR: [34, -18, 44], lowerArmR: [-24, 22, 18], handR: [10, 18, 12],
  upperLegL: [-48, 26, 8], lowerLegL: [58, 0, 0], footL: [-6, -24, 0], toeL: [8, 0, 0],
  upperLegR: [-30, -22, -8], lowerLegR: [42, 0, 0], footR: [-4, 20, 0], toeR: [8, 0, 0],
  tailA: [4, -26, 0], tailB: [-6, -34, 0], tailC: [-2, -22, 0], tailD: [18, 14, 0],
});
def('rail_slide', {
  dur: 1.4, loop: true, hold: 0.35,
  keys: [
    { t: 0, e: 'smooth', P: RAIL, pos: [0.03, -0.30, 0], cane: [64, -50, -8] },
    { t: 0.45, e: 'smooth', P: {
      hips: [24, -52, -6], chest: [-2, 26, 4], head: [-18, 24, -2],
      upperArmL: [-52, 20, -68], upperArmR: [28, -18, 34],
      upperLegL: [-42, 26, 8], lowerLegL: [52, 0, 0], upperLegR: [-36, -22, -8], lowerLegR: [48, 0, 0],
      tailA: [4, -14, 0], tailB: [-6, -20, 0], tailC: [-2, -13, 0], tailD: [18, 8, 0],
    }, pos: [0.02, -0.335, 0], cane: [68, -38, -8] },
    { t: 0.95, e: 'smooth', P: {
      hips: [20, -52, 12], chest: [-2, 26, -12], head: [-18, 24, 14],
      upperArmL: [-40, 20, -48], upperArmR: [40, -18, 52],
      upperLegL: [-52, 26, 8], lowerLegL: [62, 0, 0], upperLegR: [-26, -22, -8], lowerLegR: [38, 0, 0],
      tailA: [4, -34, 0], tailB: [-6, -44, 0], tailC: [-2, -28, 0], tailD: [18, 18, 0],
    }, pos: [0.04, -0.285, 0], cane: [60, -58, -8] },
    { t: 1.4, e: 'smooth', P: RAIL, pos: [0.03, -0.30, 0], cane: [64, -50, -8] },
  ],
});

/* Rail walk: tightrope. Feet placed exactly in line, arms wide and constantly correcting. */
const RW_A = P({
  hips: [8, 2, 5], spine: [-3, -1, -4], chest: [2, -2, -8], neck: [-10, 1, 5], head: [-12, 3, 10],
  shoulderL: [-6, 4, -22], upperArmL: [-18, 12, -86], lowerArmL: [-14, -12, -22], handL: [8, -14, -24],
  shoulderR: [-6, -4, 22], upperArmR: [-14, -12, 90], lowerArmR: [-12, 12, 22], handR: [6, 14, 24],
  upperLegL: [-34, 10, 4], lowerLegL: [40, 0, 0], footL: [-6, -8, 0], toeL: [4, 0, 0],
  upperLegR: [10, -8, -4], lowerLegR: [18, 0, 0], footR: [6, 6, 0], toeR: [4, 0, 0],
  tailA: [8, 18, 0], tailB: [2, 26, 0], tailC: [8, 18, 0], tailD: [20, -10, 0],
});
def('rail_walk', {
  dur: 1.4, loop: true, stride: 1.6, hold: 0.3,
  events: [
    { t: 0.056, n: 'footstep', d: { foot: 'L', power: 0.25 } },
    { t: 0.756, n: 'footstep', d: { foot: 'R', power: 0.25 } },
  ],
  keys: [
    { t: 0.00, e: 'out', P: RW_A, pos: [0.01, -0.13, 0], cane: [58, -44, 0] },
    { t: 0.25, e: 'smooth', P: {
      hips: [8, 2, -3], chest: [2, -2, 5], head: [-12, 3, -6],
      upperArmL: [-18, 12, -74], upperArmR: [-14, -12, 100],
      upperLegL: [-8, 10, 4], lowerLegL: [22, 0, 0], footL: [0, -8, 0],
      upperLegR: [-16, -8, -4], lowerLegR: [56, 0, 0], footR: [-14, 6, 0],
      tailA: [8, -10, 0], tailB: [2, -15, 0], tailC: [8, -10, 0], tailD: [20, 6, 0],
    }, pos: [0, -0.10, 0], cane: [58, -20, 0] },
    { t: 0.50, e: 'out', P: mir(RW_A), pos: [-0.01, -0.13, 0], cane: [58, -50, 0] },
    { t: 0.75, e: 'smooth', P: {
      hips: [8, -2, 3], chest: [2, 2, -5], head: [-12, -3, 6],
      upperArmL: [-18, 12, -100], upperArmR: [-14, -12, 74],
      upperLegL: [-16, 8, 4], lowerLegL: [56, 0, 0], footL: [-14, -6, 0],
      upperLegR: [-8, -10, -4], lowerLegR: [22, 0, 0], footR: [0, 8, 0],
      tailA: [8, 10, 0], tailB: [2, 15, 0], tailC: [8, 10, 0], tailD: [20, -6, 0],
    }, pos: [0, -0.10, 0], cane: [58, -20, 0] },
    { t: 1.00, e: 'out', P: RW_A, pos: [0.01, -0.13, 0], cane: [58, -44, 0] },
  ].map((k) => ({ ...k, t: k.t * 1.4 })),
});

/* Pole climb: shinning up. Hands alternate overhead, knees grip and pull, tail wraps round. */
const PC_A = P({
  hips: [-14, -8, 0], spine: [6, 4, 0], chest: [10, 8, 0], neck: [-26, -4, 0], head: [-30, -6, 0],
  shoulderL: [-16, 8, -32], upperArmL: [-16, 18, -114], lowerArmL: [-40, -20, -22], handL: [28, -18, -20],
  shoulderR: [-8, -8, 18], upperArmR: [-24, -16, 56], lowerArmR: [-96, 22, 20], handR: [24, 18, 16],
  upperLegL: [-64, 24, 10], lowerLegL: [92, 0, 0], footL: [-6, -18, 0], toeL: [10, 0, 0],
  upperLegR: [-30, -24, -10], lowerLegR: [58, 0, 0], footR: [-2, 18, 0], toeR: [10, 0, 0],
  tailA: [-18, 14, 0], tailB: [-26, 20, 0], tailC: [-12, 13, 0], tailD: [10, -9, 0],
});
def('pole_climb', {
  dur: 0.9, loop: true, stride: 1.5, hold: 0.22,
  events: [
    { t: 0.027, n: 'footstep', d: { foot: 'L', power: 0.3 } },
    { t: 0.477, n: 'footstep', d: { foot: 'R', power: 0.3 } },
  ],
  keys: [
    { t: 0.00, e: 'out', P: PC_A, pos: [0, -0.10, 0.08], cane: [130, 26, -10] },
    { t: 0.25, e: 'smooth', P: {
      hips: [-6, 0, 0], chest: [10, 0, 0], head: [-30, 0, 0],
      upperArmL: [-22, 18, -84], lowerArmL: [-80, -20, -22],
      upperArmR: [-20, -16, 86], lowerArmR: [-56, 22, 20],
      upperLegL: [-44, 24, 10], lowerLegL: [72, 0, 0], upperLegR: [-48, -24, -10], lowerLegR: [76, 0, 0],
      tailA: [-18, 0, 0], tailB: [-26, 0, 0], tailC: [-12, 0, 0], tailD: [10, 0, 0],
    }, pos: [0, -0.06, 0.08] },
    { t: 0.50, e: 'out', P: mir(PC_A), pos: [0, -0.10, 0.08], cane: [130, 14, -10] },
    { t: 0.75, e: 'smooth', P: {
      hips: [-6, 0, 0], chest: [10, 0, 0], head: [-30, 0, 0],
      upperArmL: [-22, 18, -84], lowerArmL: [-80, -20, -22],
      upperArmR: [-20, -16, 86], lowerArmR: [-56, 22, 20],
      upperLegL: [-44, 24, 10], lowerLegL: [72, 0, 0], upperLegR: [-48, -24, -10], lowerLegR: [76, 0, 0],
      tailA: [-18, 0, 0], tailB: [-26, 0, 0], tailC: [-12, 0, 0], tailD: [10, 0, 0],
    }, pos: [0, -0.06, 0.08] },
    { t: 1.00, e: 'out', P: PC_A, pos: [0, -0.10, 0.08], cane: [130, 26, -10] },
  ].map((k) => ({ ...k, t: k.t * 0.9 })),
});

/* Pole slide: he lets go and drops, gripping loose, boots squeezing the pole, leaning back. */
def('pole_slide', {
  dur: 0.8, loop: true, hold: 0.3,
  keys: [
    { t: 0, e: 'smooth', P: P({
      hips: [-18, -4, 0], spine: [8, 2, 0], chest: [12, 4, 0], neck: [-24, -2, 0], head: [-26, 10, 0],
      shoulderL: [-16, 8, -34], upperArmL: [-12, 18, -122], lowerArmL: [-30, -20, -22], handL: [30, -18, -20],
      shoulderR: [-16, -8, 34], upperArmR: [-10, -18, 118], lowerArmR: [-28, 20, 22], handR: [26, 18, 20],
      upperLegL: [-52, 22, 10], lowerLegL: [76, 0, 0], footL: [-4, -18, 0], toeL: [10, 0, 0],
      upperLegR: [-52, -22, -10], lowerLegR: [76, 0, 0], footR: [-4, 18, 0], toeR: [10, 0, 0],
      tailA: [-30, 6, 0], tailB: [-38, 9, 0], tailC: [-20, 6, 0], tailD: [4, -5, 0],
    }), pos: [0, -0.14, 0.10], cane: [132, 18, -10] },
    { t: 0.4, e: 'smooth', P: { hips: [-20, 4, 0], head: [-24, -8, 0],
      tailA: [-32, -6, 0], tailB: [-40, -9, 0], tailC: [-22, -6, 0], tailD: [2, 5, 0] }, pos: [0, -0.12, 0.10] },
    { t: 0.8, e: 'smooth', P: { hips: [-18, -4, 0], head: [-26, 10, 0],
      tailA: [-30, 6, 0], tailB: [-38, 9, 0], tailC: [-20, 6, 0], tailD: [4, -5, 0] }, pos: [0, -0.14, 0.10], cane: [132, 18, -10] },
  ],
});

/* Pole swing: one glove on the pole, body flung out horizontal, orbiting. */
def('pole_swing', {
  dur: 0.85, loop: true, hold: 0.3,
  keys: [
    { t: 0, e: 'smooth', P: P({
      hips: [10, -26, -22], spine: [-4, 8, 6], chest: [-8, 18, 10], neck: [-18, -8, -6], head: [-20, -14, -10],
      shoulderL: [-16, 10, -36], upperArmL: [-20, 20, -116], lowerArmL: [-34, -20, -24], handL: [28, -18, -22],
      shoulderR: [-4, -10, 14], upperArmR: [32, -18, 40], lowerArmR: [-34, 24, 18], handR: [12, 18, 12],
      upperLegL: [-24, 20, 10], lowerLegL: [46, 0, 0], footL: [14, -16, 0], toeL: [12, 0, 0],
      upperLegR: [-4, -20, -10], lowerLegR: [30, 0, 0], footR: [20, 16, 0], toeR: [12, 0, 0],
      tailA: [-8, -28, 0], tailB: [-18, -38, 0], tailC: [-8, -25, 0], tailD: [14, 16, 0],
    }), pos: [-0.04, -0.08, 0.04], cane: [70, -40, -8] },
    { t: 0.42, e: 'smooth', P: {
      hips: [10, -26, 22], chest: [-8, 18, -10], head: [-20, -14, 10],
      upperArmL: [-28, 20, -96], upperArmR: [24, -18, 56],
      upperLegL: [-8, 20, 10], lowerLegL: [34, 0, 0], upperLegR: [-20, -20, -10], lowerLegR: [42, 0, 0],
      tailA: [-8, 26, 0], tailB: [-18, 36, 0], tailC: [-8, 24, 0], tailD: [14, -15, 0],
    }, pos: [0.04, -0.06, 0.04], cane: [70, -22, -8] },
    { t: 0.85, e: 'smooth', P: {
      hips: [10, -26, -22], chest: [-8, 18, 10], head: [-20, -14, -10],
      upperArmL: [-20, 20, -116], upperArmR: [32, -18, 40],
      upperLegL: [-24, 20, 10], lowerLegL: [46, 0, 0], upperLegR: [-4, -20, -10], lowerLegR: [30, 0, 0],
      tailA: [-8, -28, 0], tailB: [-18, -38, 0], tailC: [-8, -25, 0], tailD: [14, 16, 0],
    }, pos: [-0.04, -0.08, 0.04], cane: [70, -40, -8] },
  ],
});

/* ========================================================================== */
/*  9. spire                                                                  */
/* ========================================================================== */

/* Ninja Spire Landing: he drops onto a point, compresses to almost nothing, then unfolds
   into a perfectly still one-toe pose. The compression is the whole gag. */
def('spire_land', {
  dur: 0.6, loop: false, hold: 0.34,
  events: [{ t: 0.0, n: 'land', d: { force: 0.6 } }],
  keys: [
    { t: 0, e: 'snap', P: P({
      hips: [10, -6, 2], spine: [2, 3, 1], chest: [4, 8, -2], neck: [-22, -4, 2], head: [-24, -6, 3],
      upperArmL: [-10, 16, -78], lowerArmL: [-44, -20, -20],
      upperArmR: [-4, -16, 72], lowerArmR: [-40, 20, 20],
      upperLegL: [-26, 8, 5], lowerLegL: [36, 0, 0], footL: [8, -6, 0],
      upperLegR: [-22, -8, -5], lowerLegR: [32, 0, 0], footR: [10, 6, 0],
      tailA: [-24, -6, 0], tailB: [-34, -9, 0], tailC: [-16, -6, 0], tailD: [8, 5, 0],
    }), pos: [0, -0.04, 0], cane: [106, -16, -8] },
    // fully folded onto the point — knees around the ears
    { t: 0.10, e: 'out', P: {
      hips: [58, -8, 3], spine: [-14, 4, 2], chest: [-24, 10, -3], neck: [-6, -5, 3], head: [-2, -8, 5],
      upperArmL: [-56, 18, -30], lowerArmL: [-84, -22, -16], handL: [30, -16, -10],
      upperArmR: [-30, -20, 44], lowerArmR: [-88, 24, 20],
      upperLegL: [-126, 14, 8], lowerLegL: [128, 0, 0], footL: [-16, -10, 0], toeL: [14, 0, 0],
      upperLegR: [-118, -14, -8], lowerLegR: [122, 0, 0], footR: [-14, 10, 0], toeR: [14, 0, 0],
      tailA: [30, -10, 0], tailB: [18, -14, 0], tailC: [-4, -9, 0], tailD: [-2, 7, 0],
    }, pos: [0, -0.66, 0.06], sc: { hips: [1.2, 0.72, 1.16], chest: [1.12, 0.84, 1.09] }, cane: [64, -50, -8] },
    // unfold, overshooting into the poised pose
    { t: 0.34, e: 'out', P: {
      hips: [16, 6, -6], spine: [-4, -3, 4], chest: [-2, -8, 6], neck: [-14, 4, -3], head: [-16, 8, -7],
      shoulderL: [-6, 6, -20], upperArmL: [-20, 14, -80], lowerArmL: [-20, -16, -20], handL: [10, -14, -22],
      shoulderR: [-6, -6, 20], upperArmR: [-14, -14, 84], lowerArmR: [-18, 16, 20], handR: [8, 14, 22],
      upperLegL: [-92, 12, 7], lowerLegL: [100, 0, 0], footL: [-10, -9, 0], toeL: [12, 0, 0],
      upperLegR: [-16, -10, -6], lowerLegR: [24, 0, 0], footR: [-8, 8, 0], toeR: [6, 0, 0],
      tailA: [12, 12, 0], tailB: [2, 18, 0], tailC: [6, 12, 0], tailD: [22, -8, 0],
    }, pos: [0, -0.24, 0.02], sc: { hips: [0.96, 1.06, 0.97], chest: [1, 1, 1] }, cane: [58, -34, 0] },
    { t: 0.6, e: 'soft', P: {
      hips: [12, 4, -4], chest: [0, -6, 4], head: [-14, 6, -5],
      upperArmL: [-18, 14, -76], upperArmR: [-12, -14, 80],
      upperLegL: [-88, 12, 7], lowerLegL: [96, 0, 0], upperLegR: [-14, -10, -6], lowerLegR: [22, 0, 0],
      tailA: [10, 10, 0], tailB: [0, 15, 0], tailC: [6, 10, 0], tailD: [22, -7, 0],
    }, pos: [0, -0.22, 0.02], sc: { hips: [1, 1, 1] }, cane: [58, -34, 0] },
  ],
});

/* Balancing on the point: one toe down, the other leg folded, arms wide, tail sweeping to
   counter every wobble. Reads as controlled show-off, not as struggling. */
const SPIRE = P({
  hips: [12, 4, -4], spine: [-4, -3, 4], chest: [0, -6, 4], neck: [-14, 4, -3], head: [-14, 6, -5],
  jaw: [3, 0, 0], earL: [-12, 6, -16], earR: [-8, -6, 18],
  shoulderL: [-6, 6, -20], upperArmL: [-18, 14, -76], lowerArmL: [-20, -16, -20], handL: [10, -14, -22],
  shoulderR: [-6, -6, 20], upperArmR: [-12, -14, 80], lowerArmR: [-18, 16, 20], handR: [8, 14, 22],
  upperLegL: [-88, 12, 7], lowerLegL: [96, 0, 0], footL: [-10, -9, 0], toeL: [12, 0, 0],
  upperLegR: [-14, -10, -6], lowerLegR: [22, 0, 0], footR: [-8, 8, 0], toeR: [6, 0, 0],
  tailA: [10, 10, 0], tailB: [0, 15, 0], tailC: [6, 10, 0], tailD: [22, -7, 0],
});
def('spire_balance', {
  dur: 2.4, loop: true, hold: 0.55,
  keys: [
    { t: 0, e: 'smooth', P: SPIRE, pos: [0, -0.22, 0.02], cane: [58, -34, 0] },
    { t: 0.55, e: 'smooth', P: {
      hips: [12, 4, 7], chest: [0, -6, -8], head: [-14, 6, 9],
      upperArmL: [-18, 14, -62], upperArmR: [-12, -14, 94],
      upperLegL: [-82, 12, 7], upperLegR: [-20, -10, -6],
      tailA: [10, -16, 0], tailB: [0, -24, 0], tailC: [6, -16, 0], tailD: [22, 10, 0],
    }, pos: [-0.02, -0.20, 0.02], cane: [58, 26, 0] },
    { t: 1.25, e: 'smooth', P: {
      hips: [12, 4, -9], chest: [0, -6, 10], head: [-14, 6, -11],
      upperArmL: [-18, 14, -92], upperArmR: [-12, -14, 64],
      upperLegL: [-94, 12, 7], upperLegR: [-8, -10, -6],
      tailA: [10, 22, 0], tailB: [0, 30, 0], tailC: [6, 20, 0], tailD: [22, -13, 0],
    }, pos: [0.03, -0.24, 0.02], cane: [58, -52, 0] },
    { t: 2.4, e: 'smooth', P: SPIRE, pos: [0, -0.22, 0.02], cane: [58, -34, 0] },
  ],
});

/* ========================================================================== */
/*  10. combat                                                                */
/* ========================================================================== */

/**
 * The three-hit cane combo. Each hit is anticipation → contact → follow-through → recovery,
 * and each one leaves him wound up for the next, so the three read as one sentence.
 * `cane_hit` fires on the contact frame.
 */
def('cane_combo_1', {
  dur: 0.46, loop: false, hold: 0.16,
  events: [{ t: 0.15, n: 'cane_hit', d: { index: 1 } }],
  keys: [
    // anticipation: wind back and away, weight onto the back foot, cane cocked behind
    { t: 0, e: 'in', P: P({
      hips: [8, 30, -6], spine: [-2, 12, 3], chest: [2, 26, -6], neck: [-10, -14, 4], head: [-8, -22, 8],
      shoulderL: [-4, 12, -16], upperArmL: [-24, 16, -40], lowerArmL: [-56, -18, -14],
      shoulderR: [-8, -14, 18], upperArmR: [26, -20, 36], lowerArmR: [-52, 26, 22], handR: [16, 22, 14],
      upperLegL: [-16, 22, 6], lowerLegL: [30, 0, 0], footL: [-6, -18, 0],
      upperLegR: [-8, 12, -4], lowerLegR: [22, 0, 0], footR: [-4, 14, 0],
      tailA: [4, 32, 0], tailB: [-8, 42, 0], tailC: [-2, 28, 0], tailD: [20, -18, 0],
    }), pos: [0.03, -0.09, -0.03], cane: [122, 46, 0] },
    // contact: everything fires through the swing, hips leading, chest square
    { t: 0.15, e: 'snap', P: {
      hips: [10, -34, 6], spine: [2, -14, -3], chest: [8, -30, 6], neck: [-14, 16, -4], head: [-14, 24, -8],
      shoulderL: [-2, -10, -10], upperArmL: [-6, -12, -34], lowerArmL: [-40, -14, -10],
      shoulderR: [-10, 14, 22], upperArmR: [-30, 26, 62], lowerArmR: [-26, -18, 14], handR: [8, -14, 10],
      upperLegL: [-30, -10, 6], lowerLegL: [40, 0, 0], footL: [-8, 12, 0],
      upperLegR: [4, -22, -4], lowerLegR: [26, 0, 0], footR: [6, -18, 0],
      tailA: [8, -34, 0], tailB: [-2, -44, 0], tailC: [2, -30, 0], tailD: [22, 20, 0],
    }, pos: [-0.02, -0.12, 0.06], sc: { chest: [1.04, 0.98, 1.02] }, cane: [30, -68, 0] },
    // follow-through past the target, then a settle back into a guard
    { t: 0.26, e: 'out', P: {
      hips: [8, -50, 8], chest: [10, -44, 8], head: [-16, 32, -10],
      upperArmR: [-44, 30, 76], lowerArmR: [-18, -22, 12],
      upperArmL: [4, -16, -30], tailA: [8, -46, 0], tailB: [-2, -58, 0], tailC: [2, -40, 0],
    }, pos: [-0.03, -0.11, 0.07], sc: { chest: [1, 1, 1] }, cane: [10, -104, 0] },
    { t: 0.46, e: 'out', P: {
      hips: [6, -10, 2], spine: [-2, -4, 2], chest: [4, -10, 4], neck: [-10, 6, -2], head: [-10, 10, -5],
      shoulderL: [0, 4, -10], upperArmL: [-14, 6, -32], lowerArmL: [-44, -14, -12],
      shoulderR: [-6, -6, 14], upperArmR: [0, -12, 30], lowerArmR: [-60, 20, 18], handR: [12, 16, 10],
      upperLegL: [-14, 6, 4], lowerLegL: [22, 0, 0], footL: [-6, -5, 0],
      upperLegR: [-10, -6, -4], lowerLegR: [18, 0, 0], footR: [-5, 5, 0],
      tailA: [0, -14, 0], tailB: [-12, -18, 0], tailC: [6, -12, 0], tailD: [24, 8, 0],
    }, pos: [0, -0.05, 0.02], cane: [70, -30, -6] },
  ],
});

/* Hit two: the backhand return, mirrored across the body and faster. */
def('cane_combo_2', {
  dur: 0.42, loop: false, hold: 0.14,
  events: [{ t: 0.13, n: 'cane_hit', d: { index: 2 } }],
  keys: [
    { t: 0, e: 'in', P: P({
      hips: [8, -28, 6], spine: [-2, -10, -3], chest: [4, -26, 6], neck: [-10, 12, -4], head: [-10, 20, -8],
      shoulderL: [-4, -8, -12], upperArmL: [-10, -10, -36], lowerArmL: [-48, -16, -12],
      shoulderR: [-10, 12, 24], upperArmR: [-38, 26, 70], lowerArmR: [-22, -20, 14], handR: [10, -16, 10],
      upperLegL: [-24, -10, 6], lowerLegL: [34, 0, 0], footL: [-6, 12, 0],
      upperLegR: [0, -20, -4], lowerLegR: [24, 0, 0], footR: [4, -16, 0],
      tailA: [6, -38, 0], tailB: [-4, -48, 0], tailC: [0, -33, 0], tailD: [22, 18, 0],
    }), pos: [-0.03, -0.10, 0.04], cane: [16, -96, 0] },
    { t: 0.13, e: 'snap', P: {
      hips: [12, 34, -6], spine: [2, 14, 4], chest: [10, 32, -8], neck: [-16, -16, 5], head: [-16, -26, 10],
      shoulderL: [-8, 14, -22], upperArmL: [-32, 18, -52], lowerArmL: [-30, -18, -14],
      shoulderR: [-6, -16, 12], upperArmR: [24, -28, 22], lowerArmR: [-58, 30, 26], handR: [18, 24, 16],
      upperLegL: [-6, 24, 6], lowerLegL: [22, 0, 0], footL: [-2, -20, 0],
      upperLegR: [-32, 14, -4], lowerLegR: [42, 0, 0], footR: [-8, 16, 0],
      tailA: [10, 36, 0], tailB: [0, 46, 0], tailC: [4, 32, 0], tailD: [24, -20, 0],
    }, pos: [0.04, -0.13, 0.06], sc: { chest: [1.04, 0.98, 1.02] }, cane: [104, 70, 0] },
    { t: 0.23, e: 'out', P: {
      hips: [12, 50, -8], chest: [12, 46, -10], head: [-18, -34, 12],
      upperArmR: [40, -32, 8], lowerArmR: [-70, 34, 30],
      tailA: [10, 50, 0], tailB: [0, 62, 0], tailC: [4, 44, 0],
    }, pos: [0.05, -0.12, 0.07], sc: { chest: [1, 1, 1] }, cane: [128, 96, 0] },
    { t: 0.42, e: 'out', P: {
      hips: [8, 14, -3], spine: [-2, 5, 2], chest: [6, 14, -4], neck: [-10, -7, 3], head: [-10, -12, 5],
      shoulderL: [0, 6, -12], upperArmL: [-18, 8, -34], lowerArmL: [-46, -16, -12],
      shoulderR: [-6, -8, 14], upperArmR: [8, -14, 30], lowerArmR: [-58, 22, 20], handR: [14, 18, 12],
      upperLegL: [-10, 12, 5], lowerLegL: [20, 0, 0], footL: [-5, -10, 0],
      upperLegR: [-14, 4, -4], lowerLegR: [24, 0, 0], footR: [-6, 6, 0],
      tailA: [2, 18, 0], tailB: [-10, 24, 0], tailC: [8, 16, 0], tailD: [24, -10, 0],
    }, pos: [0.01, -0.06, 0.02], cane: [92, 34, -6] },
  ],
});

/**
 * Hit three — the finisher, and the `combat` shot. He winds up overhead, twists, and drives
 * the cane down and across in a two-handed slam. The impact frame is a deep lunge with one
 * knee down, both hands driven past the low point, tail flung up behind: one long diagonal
 * from the raised heel through the hips to the cane tip.
 */
def('cane_combo_3', {
  dur: 0.62, loop: false, hold: 0.22,
  events: [
    { t: 0.21, n: 'cane_hit', d: { index: 3 } },
    { t: 0.21, n: 'land', d: { force: 0.5 } },
  ],
  keys: [
    // wind up: cane thrown high behind, body coiled and stretched tall
    { t: 0, e: 'in', P: P({
      hips: [-4, 26, -8], spine: [-8, 10, 4], chest: [-14, 24, -7], neck: [-4, -12, 5], head: [0, -20, 9],
      shoulderL: [-12, 12, -26], upperArmL: [-30, 18, -78], lowerArmL: [-40, -20, -20], handL: [14, -16, -18],
      shoulderR: [-16, -14, 30], upperArmR: [-34, -22, 96], lowerArmR: [-44, 28, 26], handR: [20, 22, 20],
      upperLegL: [-14, 22, 6], lowerLegL: [26, 0, 0], footL: [-4, -18, 0],
      upperLegR: [-6, 10, -4], lowerLegR: [18, 0, 0], footR: [12, 12, 0], toeR: [10, 0, 0],
      tailA: [-12, 30, 0], tailB: [-24, 40, 0], tailC: [-12, 27, 0], tailD: [12, -17, 0],
    }), pos: [0, 0.03, -0.05], sc: { hips: [0.95, 1.08, 0.96] }, cane: [-124, 40, 0] },
    /* Impact — the frame `combat` freezes on, so it is the only key in this file that has to
       survive being looked at as a still.

       It used to be a kneel: 42° of pelvis pitch on top of a 56 cm hip drop, a left knee folded
       112°, and *both* arms driven down and forward. Four limbs on the floor and the head below
       the hips is a quadruped, and the critic read the frame exactly that way — "a cat about to
       be sick". Nothing was wrong with the timing or the FX; the pose was on all fours.

       Now a wide lunge instead of a kneel. One long diagonal from the pushing right toe,
       through the hips, out along the cane; the free arm is flung back to open the chest and
       give that diagonal something to read against; the head stays above the shoulders and on
       the target, which is what stops a lunge reading as a fall. */
    { t: 0.21, e: 'snap', P: {
      hips: [20, -20, 9], spine: [-3, -8, -5], chest: [9, -24, 12], neck: [-19, 13, -7], head: [-17, 19, -12],
      shoulderL: [-6, -7, -17], upperArmL: [28, -16, -66], lowerArmL: [-36, -20, -16], handL: [16, -22, -20],
      shoulderR: [11, 9, 15], upperArmR: [-64, 15, 21], lowerArmR: [-20, -11, 7], handR: [18, -9, 4],
      upperLegL: [-56, 9, 16], lowerLegL: [44, 0, 0], footL: [2, -9, -8], toeL: [6, 0, 0],
      upperLegR: [33, -11, 9], lowerLegR: [21, 0, 0], footR: [31, 8, 0], toeR: [26, 0, 0],
      tailA: [30, -16, 0], tailB: [38, -22, 0], tailC: [11, 9, 0], tailD: [-16, 20, 0],
    }, pos: [0.02, -0.27, 0.15], sc: { hips: [1.14, 0.84, 1.10], chest: [1.09, 0.88, 1.07] }, cane: [40, -34, 12] },
    // hold the impact a beat, then unwind into a smug guard
    { t: 0.30, e: 'smooth', P: { hips: [18, -18, 9], head: [-15, 17, -11] },
      pos: [0.02, -0.25, 0.14], sc: { hips: [1.09, 0.89, 1.07], chest: [1.05, 0.92, 1.04] } },
    { t: 0.46, e: 'out', P: {
      hips: [12, -6, 2], spine: [-4, -3, 2], chest: [2, -10, 5], neck: [-12, 6, -3], head: [-12, 12, -7],
      shoulderL: [0, 4, -10], upperArmL: [-20, 6, -34], lowerArmL: [-44, -16, -12],
      shoulderR: [-6, -6, 14], upperArmR: [-8, -14, 34], lowerArmR: [-62, 22, 20], handR: [14, 18, 12],
      upperLegL: [-40, 4, 5], lowerLegL: [48, 0, 0], footL: [-8, -4, 0], toeL: [4, 0, 0],
      upperLegR: [-12, -8, -4], lowerLegR: [20, 0, 0], footR: [-4, 6, 0], toeR: [2, 0, 0],
      tailA: [2, -12, 0], tailB: [-10, -16, 0], tailC: [8, -11, 0], tailD: [24, 8, 0],
    }, pos: [0, -0.12, 0.04], sc: { hips: [0.98, 1.03, 0.99], chest: [1, 1, 1] }, cane: [74, -22, -6] },
    { t: 0.62, e: 'soft', P: IDLE_A, pos: [-0.078, -0.018, 0], sc: { hips: [1, 1, 1] }, cane: CANE.plant },
  ],
});

/* Dive attack (Cane Slam): he flips upside-down over the target and comes down cane-first. */
/* `loop: false` — see jump_rise, and the worst of the four at 88° (upperArmR). `DiveAttack` holds
   this clip until it grounds, so the reachable case is not marginal: at diveSpeed the fall covers
   0.5 s of clip in the first 9 m, and this level's rooftops and the temple deck are all above that.
   `dive_impact`, its own sibling, already declares loop false. */
def('dive_attack', {
  dur: 0.5, loop: false, hold: 0.3,
  keys: [
    { t: 0, e: 'in', P: P({
      hips: [-30, -6, 3], spine: [10, 3, 1], chest: [16, 8, -2], neck: [-30, -4, 2], head: [-34, -6, 4],
      shoulderL: [-16, 14, -30], upperArmL: [-30, 20, -94], lowerArmL: [-40, -22, -22],
      shoulderR: [-18, -16, 32], upperArmR: [-40, -24, 104], lowerArmR: [-38, 28, 26], handR: [22, 24, 20],
      upperLegL: [20, 10, 6], lowerLegL: [40, 0, 0], footL: [22, -8, 0], toeL: [14, 0, 0],
      upperLegR: [26, -10, -6], lowerLegR: [36, 0, 0], footR: [24, 8, 0], toeR: [14, 0, 0],
      tailA: [-24, 8, 0], tailB: [-34, 12, 0], tailC: [-18, 8, 0], tailD: [6, -6, 0],
    }), pos: [0, 0.02, -0.06], cane: [-70, 20, 0] },
    // committed: body vertical, cane speared straight down past his boots
    { t: 0.18, e: 'out', P: {
      hips: [36, -4, 2], spine: [-14, 2, 1], chest: [-24, 5, -1], neck: [-2, -3, 1], head: [4, -4, 2],
      shoulderL: [12, 10, -14], upperArmL: [-104, 12, -18], lowerArmL: [-34, -16, -10], handL: [30, -12, -6],
      shoulderR: [12, -10, 14], upperArmR: [-108, -12, 18], lowerArmR: [-30, 16, 10], handR: [28, 12, 6],
      upperLegL: [-52, 8, 5], lowerLegL: [86, 0, 0], footL: [16, -6, 0], toeL: [14, 0, 0],
      upperLegR: [-46, -8, -5], lowerLegR: [80, 0, 0], footR: [18, 6, 0], toeR: [14, 0, 0],
      tailA: [-34, -4, 0], tailB: [-42, -6, 0], tailC: [-22, -4, 0], tailD: [2, 3, 0],
    }, pos: [0, -0.10, 0.02], sc: { hips: [0.94, 1.10, 0.95] }, cane: [176, 0, 0] },
    { t: 0.5, e: 'smooth', P: { hips: [40, -4, 2], head: [6, -4, 2],
      upperLegL: [-58, 8, 5], lowerLegL: [92, 0, 0], upperLegR: [-52, -8, -5], lowerLegR: [86, 0, 0],
      tailA: [-38, 4, 0], tailB: [-46, 6, 0] }, pos: [0, -0.12, 0.02], cane: [178, 0, 0] },
  ],
});

/* The slam itself: cane driven into the paving, body folded over it, then a proud rise. */
def('dive_impact', {
  dur: 0.7, loop: false, hold: 0.11,
  events: [
    { t: 0.0, n: 'cane_hit', d: { index: 4 } },
    { t: 0.0, n: 'land', d: { force: 1.4 } },
  ],
  keys: [
    { t: 0, e: 'snap', P: P({
      hips: [30, -4, 2], spine: [-10, 2, 1], chest: [-18, 5, -1], neck: [-6, -3, 1], head: [0, -4, 2],
      shoulderL: [10, 10, -14], upperArmL: [-96, 12, -18], lowerArmL: [-38, -16, -10], handL: [30, -12, -6],
      shoulderR: [10, -10, 14], upperArmR: [-100, -12, 18], lowerArmR: [-34, 16, 10], handR: [28, 12, 6],
      upperLegL: [-48, 8, 5], lowerLegL: [80, 0, 0], footL: [12, -6, 0], toeL: [12, 0, 0],
      upperLegR: [-44, -8, -5], lowerLegR: [76, 0, 0], footR: [14, 6, 0], toeR: [12, 0, 0],
      tailA: [-30, -4, 0], tailB: [-40, -6, 0], tailC: [-20, -4, 0], tailD: [4, 3, 0],
    }), pos: [0, -0.16, 0.02], cane: [176, 0, 0] },
    // the crater frame: everything crushed down over the cane
    { t: 0.09, e: 'out', P: {
      hips: [64, -6, 3], spine: [-18, 3, 2], chest: [-32, 8, -2], neck: [-2, -4, 2], head: [6, -6, 4],
      upperArmL: [-84, 16, -26], lowerArmL: [-56, -20, -12], handL: [36, -14, -8],
      upperArmR: [-88, -16, 26], lowerArmR: [-52, 20, 12], handR: [34, 14, 8],
      upperLegL: [-126, 12, 8], lowerLegL: [130, 0, 0], footL: [-14, -10, 0], toeL: [14, 0, 0],
      upperLegR: [-120, -12, -8], lowerLegR: [126, 0, 0], footR: [-12, 10, 0], toeR: [14, 0, 0],
      tailA: [40, -8, 0], tailB: [28, -12, 0], tailC: [4, -8, 0], tailD: [-10, 6, 0],
    }, pos: [0, -0.72, 0.10], sc: { hips: [1.22, 0.70, 1.18], chest: [1.14, 0.82, 1.1], head: [1.08, 0.9, 1.06] }, cane: [172, 0, 0] },
    { t: 0.22, e: 'smooth', P: { hips: [58, -6, 3], head: [2, -6, 4] },
      pos: [0, -0.64, 0.10], sc: { hips: [1.14, 0.8, 1.1], chest: [1.08, 0.88, 1.06], head: [1.03, 0.96, 1.02] } },
    // rise off the planted cane, chest first — the "and that's that" beat
    { t: 0.46, e: 'out', P: {
      hips: [4, 14, -8], spine: [-4, -6, 4], chest: [4, -14, 6], neck: [-12, 8, -4], head: [-14, 16, -8],
      shoulderL: [0, 6, -10], upperArmL: [-16, 8, -34], lowerArmL: [-40, -16, -12], handL: [12, -14, -10],
      shoulderR: [-4, -8, 14], upperArmR: [-30, -10, 28], lowerArmR: [-56, 20, 18], handR: [14, 16, 10],
      upperLegL: [-22, 8, 5], lowerLegL: [28, 0, 0], footL: [-8, -6, 0], toeL: [2, 0, 0],
      upperLegR: [-14, -8, -5], lowerLegR: [20, 0, 0], footR: [-6, 6, 0], toeR: [2, 0, 0],
      tailA: [0, 16, 0], tailB: [-12, 22, 0], tailC: [8, 15, 0], tailD: [26, -10, 0],
    }, pos: [0, -0.08, 0.02], sc: { hips: [0.97, 1.05, 0.98], chest: [1, 1, 1], head: [1, 1, 1] }, cane: [120, 20, -6] },
    { t: 0.7, e: 'soft', P: IDLE_A, pos: [-0.078, -0.018, 0], sc: { hips: [1, 1, 1] }, cane: CANE.plant },
  ],
});

/* ========================================================================== */
/*  11. specials                                                              */
/* ========================================================================== */

/* Pickpocket: he leans in on tiptoe, two fingers extended, and cannot resist grinning at
   the camera on the way out. Deliberately slow in, fast out. */
def('pickpocket', {
  dur: 1.1, loop: false, hold: 0.42,
  keys: [
    { t: 0, e: 'in', P: P({
      hips: [26, -6, 2], spine: [-4, 3, 1], chest: [-6, 8, -2], neck: [-24, -4, 2], head: [-22, -6, 3],
      shoulderL: [-8, 8, -18], upperArmL: [-40, 14, -30], lowerArmL: [-58, -18, -16],
      shoulderR: [-8, -8, 18], upperArmR: [-20, -14, 32], lowerArmR: [-54, 20, 18],
      upperLegL: [-46, 8, 5], lowerLegL: [58, 0, 0], footL: [-10, -6, 0],
      upperLegR: [-42, -8, -5], lowerLegR: [54, 0, 0], footR: [-8, 6, 0],
      tailA: [-4, -6, 0], tailB: [-14, -9, 0], tailC: [4, -6, 0], tailD: [22, 5, 0],
    }), pos: [0, -0.24, 0.06], cane: CANE.out },
    // the reach — everything stretches after the hand, tail out for counterbalance
    { t: 0.42, e: 'out', P: {
      hips: [34, -14, 4], spine: [-2, 6, 2], chest: [0, 16, -4], neck: [-26, -8, 3], head: [-24, -14, 6],
      shoulderL: [-6, 20, -26], upperArmL: [-86, 26, -34], lowerArmL: [-34, -22, -14], handL: [30, -20, -8],
      shoulderR: [-10, -12, 22], upperArmR: [4, -20, 46], lowerArmR: [-48, 26, 22], handR: [16, 22, 14],
      upperLegL: [-58, 10, 6], lowerLegL: [66, 0, 0], footL: [-4, -8, 0], toeL: [12, 0, 0],
      upperLegR: [-34, -10, -6], lowerLegR: [50, 0, 0], footR: [16, 8, 0], toeR: [14, 0, 0],
      tailA: [8, -24, 0], tailB: [-2, -32, 0], tailC: [4, -22, 0], tailD: [24, 14, 0],
    }, pos: [0.01, -0.28, 0.19], sc: { chest: [0.97, 1.04, 0.98] }, cane: [50, -46, 0] },
    // snatch and snap back with the prize
    { t: 0.62, e: 'snap', P: {
      hips: [22, 10, -4], chest: [-6, -12, 4], head: [-20, 12, -6],
      upperArmL: [-24, 14, -30], lowerArmL: [-76, -18, -16], handL: [18, -16, -10],
      tailA: [-6, 18, 0], tailB: [-16, 24, 0], tailC: [2, 16, 0], tailD: [22, -10, 0],
    }, pos: [-0.01, -0.22, 0.03], sc: { chest: [1, 1, 1] }, cane: [60, -20, 0] },
    { t: 1.1, e: 'soft', P: IDLE_A, pos: [-0.078, -0.018, 0], cane: CANE.plant },
  ],
});

/* Paraglide: cane held overhead across the wind, body long, legs trailing, drifting. */
def('paraglide', {
  dur: 2.0, loop: true, hold: 0.5,
  keys: [
    { t: 0, e: 'smooth', P: P({
      hips: [-16, -8, 4], spine: [6, 4, 2], chest: [10, 10, -3], neck: [-28, -5, 2], head: [-30, -8, 5],
      shoulderL: [-18, 10, -34], upperArmL: [-20, 20, -112], lowerArmL: [-26, -22, -24], handL: [26, -18, -22],
      shoulderR: [-18, -10, 34], upperArmR: [-18, -20, 108], lowerArmR: [-24, 22, 24], handR: [24, 20, 22],
      upperLegL: [10, 12, 6], lowerLegL: [34, 0, 0], footL: [22, -8, 0], toeL: [14, 0, 0],
      upperLegR: [18, -12, -6], lowerLegR: [28, 0, 0], footR: [26, 8, 0], toeR: [14, 0, 0],
      tailA: [-22, 10, 0], tailB: [-32, 14, 0], tailC: [-16, 9, 0], tailD: [8, -7, 0],
    }), pos: [0, -0.04, -0.04], cane: [-92, 0, 0] },
    { t: 0.7, e: 'smooth', P: { hips: [-12, 8, -4], chest: [10, -10, 3], head: [-30, 8, -5],
      upperArmL: [-14, 20, -104], upperArmR: [-24, -20, 116],
      upperLegL: [16, 12, 6], upperLegR: [10, -12, -6],
      tailA: [-26, -10, 0], tailB: [-36, -14, 0], tailC: [-18, -9, 0], tailD: [6, 7, 0] }, pos: [0, -0.01, -0.04], cane: [-88, 0, 0] },
    { t: 1.4, e: 'smooth', P: { hips: [-18, -6, 5], chest: [10, 8, -4], head: [-30, -6, 6],
      upperArmL: [-24, 20, -116], upperArmR: [-14, -20, 104],
      upperLegL: [6, 12, 6], upperLegR: [22, -12, -6],
      tailA: [-20, 12, 0], tailB: [-30, 16, 0], tailC: [-15, 11, 0], tailD: [9, -8, 0] }, pos: [0, -0.05, -0.04], cane: [-96, 0, 0] },
    { t: 2.0, e: 'smooth', P: { hips: [-16, -8, 4], chest: [10, 10, -3], head: [-30, -8, 5],
      upperArmL: [-20, 20, -112], upperArmR: [-18, -20, 108],
      upperLegL: [10, 12, 6], upperLegR: [18, -12, -6],
      tailA: [-22, 10, 0], tailB: [-32, 14, 0], tailC: [-16, 9, 0], tailD: [8, -7, 0] }, pos: [0, -0.04, -0.04], cane: [-92, 0, 0] },
  ],
});

/* Hurt: snapped backwards, spine arched, limbs thrown out, then a wincing recovery. */
def('hurt', {
  dur: 0.62, loop: false, hold: 0.1,
  keys: [
    { t: 0, e: 'snap', P: P({
      hips: [-24, 12, -8], spine: [-10, -6, 4], chest: [-22, 14, -8], neck: [16, -8, 5], head: [22, 12, -10],
      shoulderL: [-14, 14, -30], upperArmL: [-56, 20, -76], lowerArmL: [-24, -22, -24], handL: [22, -20, -24],
      shoulderR: [-14, -14, 30], upperArmR: [-48, -20, 72], lowerArmR: [-22, 22, 24], handR: [20, 22, 24],
      upperLegL: [-38, 12, 6], lowerLegL: [50, 0, 0], footL: [8, -8, 0], toeL: [10, 0, 0],
      upperLegR: [-14, -12, -6], lowerLegR: [26, 0, 0], footR: [16, 8, 0], toeR: [10, 0, 0],
      tailA: [26, -14, 0], tailB: [16, -20, 0], tailC: [-4, -13, 0], tailD: [8, 9, 0],
      browL: [0, 0, -14], browR: [0, 0, 12], jaw: [14, 0, 0], earL: [-26, 10, -30], earR: [-22, -10, 34],
    }), pos: [0.02, -0.10, -0.12],
      /* Startled pupils (SPEC-startle-pupils): snap to 0.35 with the impact, held through the
         0.16 key — the hold frame (0.1) sits inside the constricted window, so any frozen
         capture of `hurt` shows the startle — then recover on the sc-only key at 0.42. The
         glint shares the bone, so the catchlight constricts with the disc. */
      sc: { chest: [1.06, 0.94, 1.04], pupilL: [0.35, 0.35, 1], pupilR: [0.35, 0.35, 1] }, cane: [60, 60, 0] },
    { t: 0.16, e: 'out', P: {
      hips: [18, 8, -5], chest: [-8, 10, -5], neck: [-8, -5, 3], head: [-6, 8, -6],
      upperArmL: [-30, 16, -50], upperArmR: [-24, -16, 46],
      upperLegL: [-58, 10, 5], lowerLegL: [70, 0, 0], upperLegR: [-40, -10, -5], lowerLegR: [56, 0, 0],
      tailA: [-2, 10, 0], tailB: [-12, 14, 0], tailC: [4, 9, 0], tailD: [20, -7, 0],
    }, pos: [0, -0.30, 0.02], sc: { chest: [1, 1, 1], pupilL: [0.35, 0.35, 1], pupilR: [0.35, 0.35, 1] }, cane: [86, 20, 0] },
    // sc-only key: pupil recovery to full, eased out — no bone or cane track reads this key
    { t: 0.42, e: 'out', sc: { pupilL: [1, 1, 1], pupilR: [1, 1, 1] } },
    { t: 0.36, e: 'out', P: {
      hips: [10, 4, -2], chest: [2, 4, -2], head: [-12, 6, -4], jaw: [7, 0, 0],
      upperArmL: [-18, 10, -36], upperArmR: [-12, -10, 34],
      upperLegL: [-28, 8, 5], lowerLegL: [36, 0, 0], upperLegR: [-20, -8, -5], lowerLegR: [28, 0, 0],
    }, pos: [0, -0.12, 0.01] },
    { t: 0.62, e: 'soft', P: IDLE_A, pos: [-0.078, -0.018, 0], cane: CANE.plant },
  ],
});

/* KO: he folds, drops, bounces once and sprawls. */
def('ko', {
  dur: 1.3, loop: false, hold: 0.9,
  events: [{ t: 0.34, n: 'land', d: { force: 0.9 } }],
  keys: [
    { t: 0, e: 'in', P: P({
      hips: [-18, 10, -6], spine: [-8, -5, 3], chest: [-18, 12, -6], neck: [12, -6, 4], head: [18, 10, -8],
      upperArmL: [-48, 18, -66], lowerArmL: [-28, -20, -22],
      upperArmR: [-40, -18, 62], lowerArmR: [-26, 20, 22],
      upperLegL: [-30, 10, 5], lowerLegL: [42, 0, 0], upperLegR: [-12, -10, -5], lowerLegR: [24, 0, 0],
      tailA: [20, -10, 0], tailB: [10, -14, 0], tailC: [-6, -9, 0], tailD: [10, 7, 0],
      jaw: [16, 0, 0], browL: [0, 0, -16], browR: [0, 0, 14],
      /* Startled pupils, KO flavour (SPEC-startle-pupils): constrict 0.45 from the hit and
         recover only to 0.72 by the settle key at 1.3 — dazed, not alert. The 0.9 hold frame
         reads mid-recovery by construction. */
    }), pos: [0, -0.08, -0.08], sc: { pupilL: [0.45, 0.45, 1], pupilR: [0.45, 0.45, 1] }, cane: [70, 50, 0] },
    { t: 0.34, e: 'out', P: {
      hips: [86, 6, -4], spine: [-16, -3, 2], chest: [-26, 8, -4], neck: [26, -4, 2], head: [30, 6, -5],
      upperArmL: [-70, 22, -96], lowerArmL: [-14, -22, -26], handL: [16, -22, -26],
      upperArmR: [-62, -22, 92], lowerArmR: [-12, 22, 26], handR: [14, 22, 26],
      upperLegL: [-96, 16, 8], lowerLegL: [104, 0, 0], footL: [-8, -12, 0],
      upperLegR: [-58, -18, -8], lowerLegR: [70, 0, 0], footR: [-4, 14, 0],
      tailA: [-10, 16, 0], tailB: [-20, 22, 0], tailC: [-10, 15, 0], tailD: [12, -10, 0],
    }, pos: [0, -0.86, 0.02], sc: { hips: [1.14, 0.82, 1.12], chest: [1.08, 0.9, 1.06] },
      /* Was [96,30,0], which put the butt 15 cm under the floor even on the old short shaft and
         25 cm under once `dropBelowGrip` grew to plant the idle. He is flat on his back here, so
         the cane should be lying down beside him: this aim lays the shaft along the ground with
         tip y 0.096 and hook y 0.032 — both ends just clear — and keeps it 0.72 m off the torso
         so it does not draw a line across the body. `ko` was the only one of the 52 clips whose
         tip was through the floor, before or after the lengthening. */
      cane: [126, 12, 0] },
    // a small dead bounce
    { t: 0.46, e: 'out', P: { hips: [80, 6, -4], head: [26, 6, -5] }, pos: [0, -0.80, 0.02], sc: { hips: [1.06, 0.94, 1.05], chest: [1, 1, 1] } },
    { t: 0.62, e: 'smooth', P: { hips: [90, 8, -5], head: [34, 8, -7],
      upperArmL: [-76, 22, -100], upperArmR: [-68, -22, 96],
      upperLegL: [-88, 16, 8], upperLegR: [-52, -18, -8],
      tailA: [-14, 20, 0], tailB: [-24, 26, 0] }, pos: [0, -0.90, 0.02], sc: { hips: [1.02, 0.97, 1.02] } },
    { t: 1.3, e: 'soft', P: { head: [32, 10, -8], jaw: [10, 0, 0],
      tailA: [-12, 14, 0], tailB: [-22, 20, 0], tailC: [-12, 13, 0], tailD: [14, -9, 0] }, pos: [0, -0.91, 0.02],
      sc: { pupilL: [0.72, 0.72, 1], pupilR: [0.72, 0.72, 1] } },
  ],
});

/* Victory: cane twirl into a shoulder rest, hip cocked, brim tipped. Pure swagger. */
def('victory', {
  dur: 2.2, loop: false, hold: 1.5,
  keys: [
    { t: 0, e: 'in', P: P({
      hips: [4, -12, 4], spine: [-2, 6, -2], chest: [4, -14, 5], neck: [-8, 8, -3], head: [-10, -10, 6],
      shoulderL: [0, 6, -10], upperArmL: [-16, 8, -34], lowerArmL: [-44, -16, -12],
      shoulderR: [-8, -10, 20], upperArmR: [-10, -16, 44], lowerArmR: [-56, 24, 22], handR: [14, 20, 14],
      upperLegL: [-10, 8, 4], lowerLegL: [18, 0, 0], footL: [-5, -6, 0],
      upperLegR: [-8, -8, -4], lowerLegR: [16, 0, 0], footR: [-4, 6, 0],
      tailA: [0, -14, 0], tailB: [-10, -20, 0], tailC: [6, -13, 0], tailD: [24, 9, 0],
    }), pos: [0, -0.03, 0], cane: [70, -30, 0] },
    // the twirl: two full rotations of the cane, body dips with the wind-up
    { t: 0.34, e: 'lin', P: { hips: [4, -6, 2], chest: [4, -8, 3], head: [-10, -4, 3],
      upperArmR: [-26, -14, 58], lowerArmR: [-44, 22, 20] }, pos: [0, -0.05, 0], cane: [70, 330, 0] },
    { t: 0.68, e: 'out', P: { hips: [4, 6, -3], chest: [4, 8, -4], head: [-8, 8, -4],
      upperArmR: [4, -18, 30], lowerArmR: [-66, 26, 24] }, pos: [0, -0.02, 0], cane: [70, 690, 0] },
    // catch it on the shoulder and pop the hip — the pose he holds
    { t: 0.9, e: 'out', P: Object.assign({}, IDLE_A, {
      hips: [1, 18, -11], chest: [2, -18, 8], head: [-10, 20, -12], jaw: [6, 0, 0],
      browL: [0, 0, 14], browR: [0, 0, -10],
      shoulderR: [-6, -10, 18], upperArmR: [10, -16, 4], lowerArmR: [-80, 32, 24], handR: [-8, 18, 12],
      upperArmL: [-14, 8, -26], lowerArmL: [-38, -18, -16], handL: [14, -18, -14],
      tailA: [22, -12, 0], tailB: [26, -17, 0], tailC: [15, 10, 0], tailD: [-14, 22, 0],
    }), pos: [0.01, -0.02, 0], sc: { chest: [1.03, 1.03, 1.03] }, cane: [-118, -20, 6] },
    // tip the brim, wink
    { t: 1.5, e: 'smooth', P: { upperArmL: [-24, 14, -18], lowerArmL: [-84, -26, -18], handL: [24, -20, -10],
      head: [-8, 22, -14], capBrim: [10, 0, -6], browL: [0, 0, 18], earL: [-16, 8, -20] } },
    { t: 1.9, e: 'out', P: { upperArmL: [-14, 8, -28], lowerArmL: [-40, -18, -16], handL: [14, -18, -14],
      head: [-11, 19, -12], capBrim: [2, 0, -3], browL: [0, 0, 10] } },
    { t: 2.2, e: 'soft', P: IDLE_A, pos: [-0.078, -0.018, 0], sc: { chest: [1, 1, 1] }, cane: CANE.plant },
  ],
});

/* ========================================================================== */
/*  12. mirrored variants                                                     */
/* ========================================================================== */

/** Mirror an entire authored clip. Cheaper than authoring twice and guaranteed symmetric. */
function defMirror(name, src) {
  const s = RAW[src];
  if (!s) return;
  RAW[name] = {
    ...s,
    keys: s.keys.map((k) => {
      const out = { t: k.t, e: k.e, P: mir(k.P) };
      if (k.pos) out.pos = mirPos(k.pos);
      if (k.sc) {
        out.sc = {};
        for (const b in k.sc) {
          const last = b[b.length - 1];
          const n = last === 'L' ? `${b.slice(0, -1)}R` : last === 'R' ? `${b.slice(0, -1)}L` : b;
          out.sc[n] = k.sc[b];
        }
      }
      // The cane never changes hands, but its sweep does flip with the body.
      if (k.cane) out.cane = [k.cane[0], -k.cane[1], -k.cane[2]];
      return out;
    }),
    events: (s.events || []).map((e) => ({
      ...e,
      d: e.d ? { ...e.d, foot: e.d.foot === 'L' ? 'R' : e.d.foot === 'R' ? 'L' : e.d.foot } : e.d,
    })),
  };
}

defMirror('turn_r', 'turn_l');
defMirror('wall_run_r', 'wall_run_l');
defMirror('ledge_shimmy_r', 'ledge_shimmy_l');

/* ========================================================================== */
/*  compile                                                                   */
/* ========================================================================== */

const _q = new THREE.Quaternion();

function trackFromKeys(keys, pick) {
  const times = [];
  const vals = [];
  const ease = [];
  for (const k of keys) {
    const v = pick(k);
    if (v === undefined || v === null) continue;
    times.push(k.t);
    ease.push(EASE_ID[k.e] ?? 1);
    vals.push(v);
  }
  if (!times.length) return null;
  return { times: Float32Array.from(times), ease: Uint8Array.from(ease), vals };
}

function quatTrack(keys, bone) {
  const t = trackFromKeys(keys, (k) => k.P?.[bone]);
  if (!t) return null;
  const q = new Float32Array(t.times.length * 4);
  for (let i = 0; i < t.vals.length; i++) {
    const e = t.vals[i];
    eulerDeg(e[0], e[1], e[2], _q);
    q[i * 4] = _q.x; q[i * 4 + 1] = _q.y; q[i * 4 + 2] = _q.z; q[i * 4 + 3] = _q.w;
  }
  return { name: bone, times: t.times, ease: t.ease, q };
}

function vecTrack(keys, pick, n) {
  const t = trackFromKeys(keys, pick);
  if (!t) return null;
  const v = new Float32Array(t.times.length * n);
  for (let i = 0; i < t.vals.length; i++) for (let j = 0; j < n; j++) v[i * n + j] = t.vals[i][j];
  return { times: t.times, ease: t.ease, v };
}

function compile(name, d) {
  const keys = d.keys.slice().sort((a, b) => a.t - b.t);
  const dur = Math.max(1e-3, d.dur ?? (keys[keys.length - 1]?.t || 1));

  const boneSet = new Set();
  const scaleSet = new Set();
  for (const k of keys) {
    for (const b in k.P) boneSet.add(b);
    for (const b in k.sc) scaleSet.add(b);
  }

  const bones = [];
  for (const b of boneSet) { const tr = quatTrack(keys, b); if (tr) bones.push(tr); }

  const scales = [];
  for (const b of scaleSet) {
    const tr = vecTrack(keys, (k) => k.sc?.[b], 3);
    if (tr) scales.push({ name: b, ...tr });
  }

  const cane = vecTrack(keys, (k) => k.cane, 3);
  if (cane) {
    // Cane deltas are authored in degrees but consumed as a quaternion, same as a bone.
    const q = new Float32Array(cane.times.length * 4);
    for (let i = 0; i < cane.times.length; i++) {
      eulerDeg(cane.v[i * 3], cane.v[i * 3 + 1], cane.v[i * 3 + 2], _q);
      q[i * 4] = _q.x; q[i * 4 + 1] = _q.y; q[i * 4 + 2] = _q.z; q[i * 4 + 3] = _q.w;
    }
    cane.q = q;
  }

  return {
    name,
    dur,
    loop: d.loop !== false,
    hold: Math.min(dur, d.hold ?? dur * 0.4),
    stride: d.stride || 0,
    mask: d.mask || null,
    events: (d.events || []).map((e) => ({ t: e.t, n: e.n, d: e.d || null })).sort((a, b) => a.t - b.t),
    bones,
    scales,
    pos: vecTrack(keys, (k) => k.pos, 3),
    cane,
  };
}

/* ========================================================================== */
/*  sampling                                                                  */
/* ========================================================================== */

/** Locate the segment containing `t` and return the eased fraction through it. */
function seg(times, ease, t, out) {
  const n = times.length;
  if (n === 1 || t <= times[0]) { out.a = 0; out.b = 0; out.f = 0; return out; }
  if (t >= times[n - 1]) { out.a = n - 1; out.b = n - 1; out.f = 0; return out; }
  let i = 0;
  while (i < n - 2 && times[i + 1] <= t) i++;
  const t0 = times[i], t1 = times[i + 1];
  const raw = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  out.a = i; out.b = i + 1;
  out.f = EASES[ease[i]](raw < 0 ? 0 : raw > 1 ? 1 : raw);
  return out;
}

const _s = { a: 0, b: 0, f: 0 };
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

/**
 * Add one clip's pose to a PoseBuffer at `weight`. Zero allocation: every temporary is
 * module scope, and the tracks are flat typed arrays.
 */
export function sampleInto(clip, time, pose, weight) {
  if (!clip || weight <= 0) return;
  const t = clip.loop ? ((time % clip.dur) + clip.dur) % clip.dur : Math.min(Math.max(time, 0), clip.dur);

  for (let i = 0; i < clip.bones.length; i++) {
    const tr = clip.bones[i];
    seg(tr.times, tr.ease, t, _s);
    const a = _s.a * 4;
    _qa.set(tr.q[a], tr.q[a + 1], tr.q[a + 2], tr.q[a + 3]);
    if (_s.f > 0) {
      const b = _s.b * 4;
      _qb.set(tr.q[b], tr.q[b + 1], tr.q[b + 2], tr.q[b + 3]);
      _qa.slerp(_qb, _s.f);
    }
    pose.addQuat(tr.name, _qa, weight);
  }

  for (let i = 0; i < clip.scales.length; i++) {
    const tr = clip.scales[i];
    seg(tr.times, tr.ease, t, _s);
    const a = _s.a * 3, b = _s.b * 3, f = _s.f;
    pose.addScale(tr.name,
      tr.v[a] + (tr.v[b] - tr.v[a]) * f,
      tr.v[a + 1] + (tr.v[b + 1] - tr.v[a + 1]) * f,
      tr.v[a + 2] + (tr.v[b + 2] - tr.v[a + 2]) * f, weight);
  }

  if (clip.pos) {
    const tr = clip.pos;
    seg(tr.times, tr.ease, t, _s);
    const a = _s.a * 3, b = _s.b * 3, f = _s.f;
    pose.addPos(
      tr.v[a] + (tr.v[b] - tr.v[a]) * f,
      tr.v[a + 1] + (tr.v[b + 1] - tr.v[a + 1]) * f,
      tr.v[a + 2] + (tr.v[b + 2] - tr.v[a + 2]) * f, weight);
  }
}

/** Cane orientation delta for a clip, into `out`. Returns false when the clip doesn't aim it. */
export function sampleCane(clip, time, out) {
  if (!clip?.cane) return false;
  const t = clip.loop ? ((time % clip.dur) + clip.dur) % clip.dur : Math.min(Math.max(time, 0), clip.dur);
  const tr = clip.cane;
  seg(tr.times, tr.ease, t, _s);
  const a = _s.a * 4;
  out.set(tr.q[a], tr.q[a + 1], tr.q[a + 2], tr.q[a + 3]);
  if (_s.f > 0) {
    const b = _s.b * 4;
    _qb.set(tr.q[b], tr.q[b + 1], tr.q[b + 2], tr.q[b + 3]);
    out.slerp(_qb, _s.f);
  }
  return true;
}

/* ========================================================================== */

export const CLIPS = Object.create(null);
export const MISSING = [];

for (const name in RAW) CLIPS[name] = compile(name, RAW[name]);
for (const name of REQUIRED) if (!CLIPS[name]) MISSING.push(name);

export const CLIP_NAMES = Object.keys(CLIPS);
