# HUD audit and pass 2 — what it draws, what it was missing, what it now says

Lane: **HUD** (`src/ui/**` only). Read from the code, not from the previous notes: `src/ui/HUD.js`,
`Alert.js`, `Icons.js`, `hud.css.js`, plus `src/player/Health.js`, `src/player/Targets.js`,
`src/ai/Guard.js`, `src/ai/Patrol.js`, `src/world/Pickups.js`, `src/player/Controller.js`.

The brief: a stealth-platformer player must be able to tell **at a glance** — am I hidden or seen ·
what can I interact with and with which button · how much health and loot do I have · where is my
objective. Everything below is scored against those four questions and against *readability in
motion*, not against how the HUD looks in a still.

---

## 1. Audit — what the HUD drew before this pass

| # | Element | What is drawn | When it appears | Game state that drives it |
|---|---|---|---|---|
| 1 | `.sly-pips` | Row of identical carnelian gems | Always | `health` → `{hp, max}` from `PlayerHealth`. `hp = 1 + charms` |
| 2 | `.sly-coins` | Struck gold coin, tabular digits, floating `+N` | Always | `coins` (absolute, Pickups' first-frame sync) · `coin` (delta, Pickups) · `guardPickpocket` (delta, Guard) |
| 3 | `.sly-threat` | Eye glyph + `HIDDEN / NOTICED / HUNTED / SPOTTED` + `×N` | Always | Worst-of over every tracked guard state, via `threatFor()` in `Alert.js` |
| 4 | `.sly-alert` | World-projected arc + glyph + label per guard; edge-clamped when off-screen | One per guard that has ever emitted; live states persist, retired ones fade over 1.2 s | `guardAlert` — **edge-triggered**, `Patrol._setState` emits once per transition |
| 5 | `.sly-obj` | Comic cel: kicker, title, subtitle; collapses to a mini tab after 5 s | `HUD.init` sets the only one that ever appeared | `objective` event (no publisher in `src/`) |
| 6 | `.sly-toasts` | Up to 3 inked pills, top-centre, 2.6 s each | On event | `toast` (Pickups, Health) + `guardPickpocket` |
| 7 | `.sly-prompt` | Keycap + dash + verb, bottom-centre | On event, else HUD's own fallback | `prompt` event (no publisher at rest), else a 10 Hz `collision.query` over `hook/rail/pole/spire/vent` within 4.4 m |
| 8 | `.sly-tov` | Desaturate + crush + vignette + pulse rings + `THIEF-O-VISION` tag | While Thief-o-Vision is held | `thiefVision` (Controller, RMB) |
| 9 | `.sly-mark` | Spinning lock-on brackets + tag label, ≤ 16 | **Only** while ToV is on *and* a list has arrived | `thiefTargets` (Controller, emitted once on ToV entry) |
| 10 | `.sly-binoc` | Full-screen optics, caller panel, live camera telemetry | Tab | Own state (`input.pressed('binocu')`); hides the gameplay cluster |
| 11 | `.sly-vig` | Red radial multiply | Continuous | `opacity = (1 − hp/max)·0.72 + punch`, from `health` |
| 12 | `.sly-flash` | Screen flash | On pip loss and on Binocucom open | `setHealth`, `binocucom` |
| 13 | `.sly-shake` | Whole cluster translated/rotated | On impact | `shake` event, chase transition, pip loss |
| 14 | `.sly-pause` | Full 25-move control reference | Esc, or pointer-lock loss | `pointerlock`, keydown |

### What the audit actually found

The HUD was well built and **entirely edge-triggered**. Every readout above changes only when some
other module crosses a threshold and emits. A stealth player spends most of his time strictly
*between* thresholds, and in that whole region nothing on screen moved at all.

Scored against the four questions:

- **Am I hidden or seen?** Half answered. The discrete ladder (chip + badges) is good and stays
  untouched. But nothing moved during the fill from 0 to `DETECT.suspicious` (0.34), and nothing
  moved during the 0.34/s drain back out of a search. The *continuous* signal existed
  (`Guards.alertLevel`) and no UI consumed it.
- **What can I interact with, with which button?** Traversal only. **Pickpocket had no prompt at
  all** — `canBePickpocketed`, `nearestPickpocketTarget` and a 45–150 coin roll per guard were
  reachable only by a player who already knew to walk behind a guard and press E.
- **How much health and loot?** Numerically yes, meaningfully no. Three identical gems said "you
  have three of something"; what the player has is **his life plus two consumables**, and
  `PlayerHealth` says so in as many words — *"Sly himself is the last pip"*. Carried treasure — the
  one thing in the game with a *risk* attached — had no readout at all.
- **Where is my objective?** Not answered. The objective was a line of prose. The level ships three
  authored treasures, a fence at `(-3.4, 0, 32.2)` and a full carry-and-bank loop, and the HUD had
  **no world-space marker of any kind**.

---

## 2. What I implemented, and why

### 2.1 Analog exposure — the suspicion lash (highest value)

`Icons.threatEye()` gains `.sly-eye-fill`, an arc traced along the eye's upper lash, driven every
frame from `Guards.alertLevel` (garrison max of `suspicion / DETECT.chase`; a public getter whose
own comment records AUDIO as a consumer). `pathLength="100"` normalises the dash arithmetic so the
driver never needs the curve's real length. Colour comes from `suspicionColour(level)`, added to
`Alert.js`, which walks the **same `NUMERIC_BANDS`** the payload fallback already used — so the
meter and the badge cannot disagree about where a threshold is.

Two deliberate properties:

- It is **not eased** beyond killing jitter (`susLerp: 22` against the badge's `alertLerp: 9`). The
  badge arc smooths between two *canonical* fractions and the ease is presentation; this meter *is*
  the signal, and a warning that arrives eased arrives late.
- The **colour leads the chip**. The lash warms to amber at 0.34 and to red at 0.99 while the chip
  is still saying HIDDEN, because the whole point is that the analog channel moves first.

`Alert.js`'s standing ANALOG vs DISCRETE argument is honoured, not overridden: the per-guard badge
stays discrete and is untouched. That argument was about not duplicating the *cone's* per-guard
analog signal in the *per-guard* badge. The garrison maximum is not a signal any cone carries —
reading it off the world means seeing every cone at once, including the ones behind you.

### 2.2 Calling-card health

`Ico.pip(filled, kind)` now draws two shapes: index 0 is the **Cooper calling card**, indices 1+ are
**horseshoes** (the series' own lucky charm). Derived from the index via `pipKind()` against
`PlayerHealth`'s published contract `hp = 1 + charms` — **no new field, no interface change in
`src/player/`**. The row empties right-to-left, so the card is the last thing standing, which is
exactly the fact it exists to communicate: with no charm left, the next hit ends the run.

A card among horseshoes is a *silhouette* difference, so it survives the ~19 px this renders at on
a 1280×720 frame without relying on colour. The card is sized a shade larger (`.sly-pip-life`).

### 2.3 The loot loop: carry chip + world-space objective marker

Subscribed `treasurePickup` / `treasureDropped` / `treasureBanked`, all of which `Pickups` already
emitted to nobody.

- **`.sly-carry`** — gold-inked chip under the threat chip: what you are holding and what it is
  worth. It **flashes whenever `data-threat` is not `hidden`**, because a chase is what takes the
  treasure off you. That puts the value of what you hold physically next to how close you are to
  losing it, which is the decision the player is actually making.
- **`.sly-goal`** — a projected marker: lapis disc, gold die, distance in whole metres. It points at
  the **fence while a treasure is in hand**, and at the **spot a chase knocked it out of his hands**
  after a drop. It retires when the loop closes, so it is never ambient clutter.
- The objective card is retitled for the duration of a carry and **restored** afterwards
  (`_objBase`), instead of being overwritten.

Readability in motion drove two specific choices: off-screen the marker clamps to the frame edge
(the path the guard badges already take) and a **chevron orbits the head** to carry the bearing —
the head itself never spins, so the eye tracks a stable shape during a fast pan and reads direction
off the part that moves. Distance recomputes at ~12 Hz; a number that changes every frame is a
texture, not a readout.

### 2.4 Pickpocket prompt

The HUD's affordance fallback now queries `Guards.nearestPickpocketTarget(pos, undefined, mv.yaw)`
first — public API on the registered `guards` module, sibling of `Guards.nearest`, whose own comment
names the HUD as a consumer. Range is **left to the guards module's own `TUNE.pocketRange`** rather
than restated, so the prompt cannot promise a reach Sly does not have.

The pocket outranks every traversal affordance, and that ranking is not a preference: a rail is
still a rail in ten seconds; a pocket closes the moment the guard is alerted or looted. It is the
only affordance in the game with a deadline, so it is the only prompt that earns colour and motion —
`[data-kind='steal']` gives it the gold loot channel plus a heartbeat, against traversal's neutral
paint-white. Verb→kind classification (`PROMPT_KIND`) applies to *externally published* prompts too,
so MOVEMENT's own `{text:'Pickpocket'}` gets the same treatment with no contract change asked of a
file this lane does not own.

### 2.5 Lock-on reticle

`lockOn` (`{pos, body}` / `null`) is published by `Moveset.CombatStrafe` and had **no subscriber**.
§6.1 promises "hold right mouse — Thief-o-Vision + hook lock-on", and the player was being committed
to a camera framing and a movement axis chosen by a target he could not identify. `.sly-lock` points
the existing `Ico.lockOn()` art at the mark. Not edge-clamped: a reticle pinned to the frame edge is
pointing at nothing, and MOVEMENT drops the lock at `lockDrop` anyway.

### 2.6 CAUGHT stamp

`PlayerHealth` publishes `down` on the same payload the pips already read, and the HUD was
discarding it. The fatal hit rendered as an empty pip row and a red vignette — indistinguishable
from a hit that merely spent a charm. In a game whose premise is that being seen *is* the failure,
"caught" and "hurt" must not look the same. `.sly-busted` holds for 1.6 s against
`CHARM.downTime` 1.15, on its own timer so a fast checkpoint cannot cut the beat short.

---

## 3. What I deliberately did **not** add

| Sly vocabulary / candidate | Verdict | Reason from the code |
|---|---|---|
| **Pickpocket timing ring** | No | `Moveset.Pickpocket` is a 0.55 s one-shot with no timing window and no failure state. A ring would be a meter for a mechanic that does not exist. |
| **"Hidden in shadow" meter** | No | `DETECT.darkGain/litGain` is driven by `Guards._lightTarget(debug.timeOfDay)` — a **global** term, plus a per-guard "you are in someone else's beam" flag. There is no per-position concealment to display; a shadow meter would be a lie about a mechanic the level does not have. |
| **Sneak / crouch state badge** | No | `sneakGain 0.40` and `crouchGain 0.55` are real and significant, but the state is player-initiated by a held key and fully carried by the animation. A badge for "you are holding the key you are holding" is noise in the corner where the exposure read lives. |
| **Full-screen "detected" alarm frame** | No | `.sly-vig` already owns red at the screen edges for damage. A second red edge treatment makes *hurt* and *seen* indistinguishable — the one confusion a stealth HUD cannot afford. The escalation read stays on the chip (colour + fill + pulse) and the shake. |
| **Permanent waypoints on the three treasures** | No | Marking un-found loot turns a heist into a checklist. The marker only ever points at something currently actionable. |
| **Minimap / compass** | No | Nothing in the level or `CameraRig` supports one, and it competes for exactly the peripheral read the alert badges already own. |
| **Charm-progress meter (coins → next charm)** | Wanted, blocked | See §5 — `Health.purse` is not published. |

---

## 4. Provenance

**Nothing external was brought in.** No new npm dependency, no CDN, no webfont, no image file, no
runtime fetch. Every glyph added this pass (`lifePip`, `charmPip`, `goalPin`, `goalArrow`, the
suspicion lash) is inline SVG authored in `src/ui/Icons.js`, and every colour is from the AGENTS.md
§2.2 palette via the existing `Icons.C` table and the `hud.css.js` tokens. The
`public/assets/kaykit/PROVENANCE.md` convention is therefore **not triggered** — there is nothing to
record. `tests/hud.test.mjs`'s self-containment assertion (no remote URL, no `@font-face`, no
`fetch`) still passes over all four `src/ui/*` files.

Resolution independence: every new size is expressed in the existing `--u`
(`clamp(11px, 1.52vmin, 27px)`) unit, and every projected element positions itself from
`engine.width/height`, so nothing assumes 1280×720. New gameplay text runs are all ≥ `0.74u`,
above the `0.68u` reference floor M6 enforces.

---

## 5. Interfaces I needed from other lanes

**Existed and were used** (all through `engine.get(key)` or the bus — no imports across lanes, no
edits outside `src/ui/`):

- `Guards.alertLevel` · `Guards.nearestPickpocketTarget(pos, maxDist, facing)`
- `Pickups.fence` · `treasurePickup` / `treasureDropped` / `treasureBanked`
- `charms` and `down` on the `health` payload — already published, previously discarded by the HUD
- `lockOn` from `Moveset.CombatStrafe`

**Missing — worked around, not patched:**

1. **`Health.purse` is not published.** `health` carries `{hp, max, charms, down}` but not the
   coins banked toward the next 100-coin charm. The coin counter shows the *wallet* total, which is
   a different number (`Health.bank` keeps its own running purse). So "you are 40 coins from another
   charm" — a real, tuned economy with a `toast` on completion — cannot be shown. **Worked around by
   showing nothing.** Adding `purse` to the existing `_publish()` payload would close it with no new
   event and no new subscriber.
2. **No concealment signal.** There is no `playerHidden` event and no per-position light query.
   `Guards._light` is module-private and global. `Alert.js` already records this; nothing changed.
3. **No pickpocket-window event.** Nothing announces when a guard becomes (un)pickpocketable, so the
   prompt must poll `nearestPickpocketTarget`. Acceptable at 10 Hz — a loop over eleven guards — but
   it is a poll, and MOVEMENT's `pickMark()` is already computing the same answer every frame.
4. **No `objective` publisher.** The card's text now comes from `HUD.init` and the loot loop only.
   Publishing it needs the same care as `prompt` — see the recommendation below.

---

## 6. RECOMMENDATION (routed, not applied): make the `prompt` retirement per-channel

**Do not treat this as done. It is filed here at the coordinator's instruction because it spans two
lanes' files.**

`HUD._wire` sets `_sawPrompt = true` on the first `prompt` event, and `_tickAffordancePrompt` then
returns early **permanently**. `tests/eventbus.test.mjs` names the consequence by name:
*"the first module to publish this silently kills every contextual verb in the game"*.

During this pass the movement lane briefly published `prompt` from `Controller._pushPrompt`, whose
own comment states: *"Only pickpocket marks are announced. A prompt for hook/rail/pole would be nice
and is left out deliberately"* — because `afford()` costs a BVH `nearest()` per tag. So the live
behaviour for that window was: the game **lost** `Cane hook` / `Mount rail` / `Climb pole` /
`Spire land` / `Crawl in` the first time the player walked behind a guard, and **gained** one prompt
the HUD was already drawing. That lane has since reverted, and the suite is green again.

I wrote the per-channel handover, then **reverted it** on coordinator instruction. The design, for
whoever routes it:

- **The pocket is MOVEMENT's**, permanently, from its first `prompt` event. `Controller.pickMark`
  knows `pickApproach`, whether the state machine is busy, and whether Sly is grounded; the HUD does
  not, and a second opinion is the two-sources-of-truth failure this repo keeps paying for.
- **Traversal stays the HUD's.** One `collision.query` covering all five tags is *cheaper* than the
  per-tag `nearest()` MOVEMENT declined — this is not duplicated work, it is the half nobody else is
  doing.
- **Whichever is currently showing wins:** a live external prompt suppresses the fallback outright;
  the fallback resumes on the frame MOVEMENT sends `null`.

That needs one field in `HUD.js` (an `_extPrompt` latch replacing the wholesale `_sawPrompt` gate)
and no change at all in `Controller.js`. The hazard is documented at the `AFF_VERB` declaration site
so the next reader of that file cannot re-apply half of it by accident.

---

## 7. Files touched

- `src/ui/HUD.js` — suspicion driver, loot loop, goal marker, lock-on, CAUGHT, prompt kinds, pip kinds
- `src/ui/Icons.js` — `pip(filled, kind)` split into calling card + horseshoe; `goalPin`, `goalArrow`; suspicion lash on `threatEye`
- `src/ui/Alert.js` — `suspicionColour(level)`, on the existing `NUMERIC_BANDS`
- `src/ui/hud.css.js` — carry chip, goal marker, lock-on, CAUGHT stamp, steal prompt, suspicion arc, life-pip sizing
- `tests/eventbus.test.mjs` — **three lines deleted from `DEAD_PUBLICATIONS`.** Not a scope
  exception taken lightly: the census is a defect *register* that fails in both directions, its own
  failure output says *"If you WIRED one, delete it from DEAD_PUBLICATIONS"*, and the entry being
  deleted read *"The HUD should react to banking a treasure and to dropping one under CHASE; that is
  the loot agent's own open item, and these three lines are what will turn red when it is closed."*
  It is closed. `lockOn` never entered the list — MOVEMENT started publishing it and the HUD
  subscribed it in the same round — and a comment now says so, because a *live* event added to that
  list fails the census exactly as a dead one missing from it does.

`node --test "tests/*.test.mjs"` — **549 passing, 0 failing.**
