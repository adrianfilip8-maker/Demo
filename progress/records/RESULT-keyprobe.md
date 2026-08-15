# RESULT-keyprobe — VOID. `PF_KEY_LO` failed, and it failed because the control bar encoded somebody else's unverified claim

**Seal:** `PREREG-keyprobe.md`, registered at `678fd49` before any frame existed.
**Capture:** `progress/records/keyprobe1/`, 5 frames, one boot, force-added.
**Scorer:** `progress/records/keyprobe/keyprobe-score.mjs`, the registered instrument.

**VERDICT: VOID. `K1` was not read and nothing is claimed about the colossus's shade face.**

---

## 1. What the gates did

```
V_ROWS       PASS   5 rows
R_bracket    PASS   off-vs-back 0 px
CAL          PASS   (64,128,191)+/-1 over 23.9% (want >= 5%)

PF_KEY_HI    PASS   LIT_R  key 0.5382 (want >= 0.50)
PF_KEY_LO    FAIL   CAST_L key 0.0281 (want <= 0.02)

VERDICT: VOID — K1 is NOT read.
```

The capture itself is clean: a **0-px off/back bracket**, and `CAL` at 23.9 % proving the
`debugRaw('scene')` bypass presents the scene target undecoded **in this boot**. The instrument
worked. The seal still VOIDs, because §5 says both control rects must behave as claimed before the
unknown one is read, and one did not.

## 2. Why `PF_KEY_LO` failed — the bar was derived from an assertion, not a measurement

`PF_KEY_LO`'s bar of **0.02** was not independently derived. §5 of the seal says so in as many words:

> `CAST_L` — registered `shade-cast`; `NOTE-shadowtint-space.md:258` states outright that this
> object has **`sh = 0`, hence `key = 0`**. This is the negative control and it is somebody else's
> claim, not mine.

Measured: **`key` 0.0281, `sh` 0.1768.** Not zero. The record's claim about colossus-L is **false as
measured**, by a little — and "by a little" is enough, because I set the bar at 0.02 *because* the
record said the true value was 0.

**This is §340 applied one level up, and I still only got half of it.** §340 says prove the control
is in the state you assert it is in. I proved the control's **identity** — the rect really is on
colossus-L, verified visually below — and then adopted its **state** from a third-party note without
measuring it. Identity is not state. The gate caught it, which is the entire reason the seal was
written fail-closed with a two-sided control.

## 3. The rects ARE on the colossi — a mis-reading of my own, recorded because it nearly cost a re-aim

While diagnosing the failure I cropped each rect in isolation and concluded all three landed on
architecture rather than on the statues. **That was wrong.** Viewed against the whole frame, the
courtyard shows two seated colossi flanking the central obelisk, and:

| rect | lands on |
|---|---|
| `CAST_L` `[70,150,280,300]` | the **west colossus**, fully shadowed body and throne |
| `LIT_R` `[872,300,60,210]` | the **east colossus's** sunlit left flank |
| `SHADE_R` `[1020,260,90,130]` | the **east colossus's** shadowed upper body |

A 13 m colossus at this framing is mostly large inscribed stone faces. Cropped small and out of
context they read exactly like pylon walls, and that is what I called them. The correction matters
because the wrong conclusion would have sent the successor to redraw rects that are correctly
placed. **Recorded as an error of mine, not as a finding.**

The measured values corroborate the placement: `LIT_R` carries `key` 0.5382 (a sunlit flank should),
`CAST_L` 0.0281 (a shadowed body should be near zero), `SHADE_R` between them. The channel spans the
range the question lives in — the instrument is sound.

## 4. What this costs the item, and what it does NOT

**Does not touch §342.** The albedo attribution — `granite_pink` at mean linear R/G 4.260, rank 1 of
23, the +1.570 `hueGrade` sign flip, `HUE.granite` 1-of-11 on both axes — is texture arithmetic
against a double-digest-proven control and never depended on any of this.

**Undermines §342.2's premise, though not its correction of §342.1.** §342.2 replaced the courtyard
ground with colossus-L as the "matched control" and computed reachability *"at full shadow
authority (`sh = 0`)"*. **colossus-L is not at `sh = 0`; it is at `sh` 0.1768.** So the figures
§342.2 derived under that label were not at full authority either. §342.2's *structural* point —
that the ground was the wrong control because it differs in cast-shadow state, orientation and
bounce — survives untouched. Its *arithmetic* now rests on a premise measured false and should be
re-derived against measured `sh` rather than an assumed zero.

**That is three successive controls on one item, each wrong differently:** §342.1 used a rect in the
wrong lighting state; §342.2 used the right object with an assumed state; keyprobe measured the
state and found the assumption wrong. The item has never yet had a control whose state was measured
before it was used.

## 5. What the re-seal must do (§141.1 — a NEW file, nothing here moves)

- **Do not re-use `PF_KEY_LO = 0.02`.** It encodes a refuted claim. Derive the negative-control bar
  from the *measured* distribution of `sh` on a surface established to be fully cast-shadowed, or
  drop the absolute bar and make the control **relative** — e.g. `key(CAST_L)` must be some factor
  below `key(SHADE_R)`, which tests the ordering the question actually depends on without asserting
  a zero.
- **Keep the rects.** They are correctly placed and now visually verified.
- **Keep the two-sided control.** It earned its place: `PF_KEY_HI` passed and would have let a
  one-sided seal proceed on a false premise.
- The frames in `keyprobe1/` are committed and re-usable. A re-seal needs no new capture unless it
  registers new rects or arms.

## 6. What is NOT claimed

`K1` is not read, so **nothing is claimed about whether the colossus's shade face is still receiving
direct key.** The registered decision — `KEYED >= 0.10` versus `DARK <= 0.02`, and the stake that
`DARK` would refute §342.2 — is untouched and still open. The numbers the scorer printed above the
gate line are the instrument's raw output, not a verdict, and are not to be quoted as one. §10 of
the seal is explicit: any gate FAIL ⇒ VOID; nothing is claimed about the shade face.

Nothing ships.
