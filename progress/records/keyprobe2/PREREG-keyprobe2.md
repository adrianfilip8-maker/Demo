# PREREG-keyprobe2 — DRAFT. Is K1 boot-stable, and is `SHADE_R` one surface or a mixture?

**Lane:** SHADING (instrument readback only). **Drafted:** 2026-08-15. **Nothing ships.**
**Ancestry:** §336 (names the `key` readback) → §340 (control mis-aimed ⇒ VOID; ordering prescribed) →
§341 (bandgate2 adjudicates) → §342/§342.1/§342.2 → **§344 (keyprobe VOID)** →
`keyprobe2/NOTE-reseal-contamination.md`, which is this seal's reasoning and is binding on it.

**This is NOT a re-run of keyprobe.** The NOTE argues at length that a re-run cannot be a measurement,
and this seal is built to be one. It asks two questions that have never been asked, and it is capable
of concluding that **K1 is unreadable on this rect by anybody** — which is the outcome that would make
three seals' worth of argument about 0.1017 moot.

---

## 0. DISCLOSURE — this file was authored with the voided run's control values known

Stated plainly and up front, because the brief requires it and because the reader's first question is
whether anything here was fitted.

**I knew, before writing a single bar in this file:**

```
SHADE_R  ramp 0.1408  ndl 0.1013  key 0.1017  sh 0.4908      <- K1, VOIDed unread
CAST_L   ramp 0.0684  ndl 0.0300  key 0.0281  sh 0.1768      <- the rect that failed PF_KEY_LO
LIT_R    ramp 0.8532  ndl 0.7823  key 0.5382  sh 0.6172
GROUND   ramp 0.7735  ndl 0.4183  key 0.3010  sh 0.3608
V_ROWS PASS · R_bracket PASS (0 px) · CAL PASS (23.9 %) · PF_KEY_HI PASS · PF_KEY_LO FAIL
```

and `RESULT-bandgate2.md` §2's `96.4 / 3.6 / 0.0` band histogram, whose rect is contained in
`SHADE_R` (NOTE §3).

**What follows from that, and it is not a formality.** Every bar below is therefore either

- **(C) carried unchanged** from `PREREG-keyprobe.md`, registered at `678fd49` before any frame
  existed — I may not move these and I have not; or
- **(D) definitional**, derived from the shipped shader or from the PNG encoding, so that no
  measurement of mine could have chosen it; or
- **(R) registered rather than derived** — a free parameter, labelled as one, in §141.4's sense.

There is **exactly one (R)** in this file and it is called out at its site. Any bar that is none of
these three does not belong here.

**Deliberately not computed by this file's author.** `key`, or any per-texel statistic, on
`bandgate1/courtyard.ramp.png`; any distribution inside `SHADE_R` on any frame; `term6`'s cross-check
numbers. **The scorer is deliberately not written either** — writing it invites the smoke test
`PREREG-bandgate2.md` §8.1 ran, and here a smoke test would consume the exact quantity that has to
stay unread. The scorer must be written to §6–§7 and **committed together with this seal, before it is
first executed.**

---

## 1. STATUS — what makes this a pre-registration, and the one way to void it before it starts

**Status: DRAFT. Not sealed.** It becomes a pre-registration at the instant it is committed, and only
if it is committed **before** anyone scores `bandgate1/courtyard.ramp.png` for anything.

Unlike `PREREG-keyprobe.md`, this seal cannot claim *"the capture does not exist at this sha"* — some
of its frames are committed and one of them has been published from. What it claims instead is
narrower and checkable: **no value of any quantity this seal decides on has been computed by anyone.**
The check is mechanical — `progress/records/logs/` contains no keyprobe2 output, and this directory
contains only two markdown files.

**If those two events happen in the wrong order, this file is worthless.** Do not salvage it, do not
re-derive around it. Delete it and write a successor that says what happened.

---

## 2. NO `src` CHANGE — same verification as `PREREG-keyprobe.md` §1, unchanged at this sha

```
toon.glsl.js:492   float sh   = smoothstep( uShadowSharp.x, uShadowSharp.y, shadowRaw );
toon.glsl.js:528   float key  = ramp * sh;
toon.glsl.js:1454  else if ( uDebugTerm < 5.5 ) dbgT = vec3( ramp, ndl, key );
```

`debugTerm(5)` writes `ramp` (R), `ndl` (G), `key` (B). Values are pre-AgX and meaningful only through
`postfx.debugRaw('scene')`; bytes are undecoded, i.e. `value * 255`, which `CAL` proves in-boot rather
than assuming. Every arm is an existing debug hook.

---

## 3. THE RECTS — `PREREG-keyprobe.md` §2's, carried verbatim, and NOT re-drawn

`shadowtint/roi.json`'s own rectangles, unchanged through three seals (§141.1):

| id | rect `[x,y,w,h]` | class | what it is |
|---|---|---|---|
| `SHADE_R` | `[1020, 260, 90, 130]` | shade-terminator | the rect under test — colossus-R's shadowed upper body |
| `CAST_L` | `[70, 150, 280, 300]` | shade-cast | colossus-L, the cast-shadowed twin |
| `LIT_R` | `[872, 300, 60, 210]` | lit | colossus-R's sunlit flank |
| `GROUND` | `[380, 600, 520, 110]` | both | courtyard ground — descriptive only, gates nothing |

Shot **`courtyard`**, 1280×720. §344 records these as visually verified against the whole frame after
a mis-reading that nearly cost a needless re-aim; they are not re-examined here.

**Registering a new rect is out of scope for this seal and that is deliberate.** Any rect drawn now
would be drawn by someone who has seen the frames, which is the §141.1 defect in its purest form. If
§7's composition test routes to `RE-AIM`, the new rect is a *successor's* job on a frame nobody has
seen — see §9.

---

## 4. FRAMES — three boots, one `src` tree, and which of them is allowed to adjudicate

All at `srcHash b3852e39472ed68f`, shot `courtyard`, warm-up 2, live-settle staging, arm configuration
`{ raw: true, term: 5 }` (`bandgate/bandgate.mjs:63`, `keyprobe/keyprobe-run.mjs`):

| boot | capture | frame | `sha256` | status |
|---|---|---|---|---|
| **A** | `bandgate1/` 12:26 `f3d314dd54` | `courtyard.ramp.png` | `1de4f00760af51fb…` | **committed, never scored for `key`** |
| **B** | `bandgate2run/` 13:20 `8a29576f0f` | `courtyard.ramp.png` | `7d6125ed124e5577…` | committed; **byte-identical to C** |
| **C** | `keyprobe1/` 15:44 `cfcdd941f8` | `courtyard.term5.png` | `7d6125ed124e5577…` | committed; K1 = 0.1017 published |
| **D** | *not yet captured* | `courtyard.term5.png` | — | **the frames that adjudicate** |

**B is not a replicate of C — it is the same bytes**, so K1(B) = 0.1017 exactly, derivable from the
hash without reading a pixel. B is therefore excluded from every gate below; counting it would be
counting one observation twice.

**Boot D is required, and the requirement is not mine.** `PREREG-bandgate2.md` §8.1, facing this exact
situation, ruled: *"re-scoring a voided run under new bars is exactly the post-hoc reinterpretation
§141.1 forbids. **Only fresh frames decide.**"* `RESULT-keyprobe.md` §5's contrary "no new capture is
needed" was written in the same breath as "derive a new bar" and does not override a seal that faced
the question head-on. Boot D is 5 arms, one boot, no `src` change — `keyprobe/keyprobe-run.mjs`
unmodified, output to `progress/records/keyprobe2run/`.

**Stage 1 runs first and is CPU-only** (§8). It can kill the capture before the window is spent, which
is §342.1's shape (*"this kills a seal that would have failed, before it was written"*).

---

## 5. VALIDITY — carried unchanged from `PREREG-keyprobe.md` §4, applied to boot D

| gate | bar | source | on failure |
|---|---|---|---|
| `V_ROWS` | 5 rows, one `srcHash` | (C) | **VOID** |
| `R_bracket` | `diff(off, back) == 0 px` | (C) | **VOID** |
| `CAL` | `cal` reads (64,128,191) ±1 over ≥ 5 % of frame | (C) | **VOID** |

Boots A and B carry only 4 arms and a different seal's manifest schema, so `V_ROWS` and `R_bracket`
are **not applicable** to them; their validity was established by their own seals (§340 `R` 0 px /
`CAL` 23.5 %; §341 `R` 0 px / `CAL` 23.9 %) and §344 recorded both captures as clean. Stated so nobody
later reports a gate as passing on a frame it never ran on — §211.1's shape.

---

## 6. PRE-FLIGHT — `PF_KEY_LO` is retired, and what replaces it is about the CHANNEL, not about a surface

`PF_KEY_LO ≤ 0.02` on `CAST_L` **is not carried in any form.** It encoded
`NOTE-shadowtint-space.md:258`'s assertion that colossus-L has `sh = 0, hence key = 0`; §344 measured
`key` 0.0281 and `sh` 0.1768 there. The claim is false and no bar in this file may depend on it.
**No bar below asserts that any surface is at zero.**

| gate | bar | source | on failure |
|---|---|---|---|
| `PF_KEY_HI` | mean `key` on `LIT_R` **≥ 0.50** | **(C)** | **VOID** |
| `PF_PROD` | per texel, over all four rects: `blue ≤ red + 1 LSB`; **and** mean `red − blue ≥ 1 LSB` on at least one rect | **(D)** | **VOID** |
| `PF_SPAN` | `key(LIT_R) > key(SHADE_R) > key(CAST_L)`, each gap **> 1 LSB**; **and** `key(LIT_R) − key(CAST_L) ≥ 0.25` | (D) + cited (§341) | **VOID** |

**`PF_KEY_HI` is carried unchanged.** It is uncontaminated, it was registered at `678fd49`, and it
passed. Carrying a gate that already passed is strictly conservative — it can only VOID more runs, never
fewer — and re-deriving it would be gratuitous movement of a bar §141.1 fixed.

**`PF_PROD` is the replacement, and it is the one that does `PF_KEY_LO`'s job.** Derivation, entirely
from shipped code: `sh = smoothstep(…) ∈ [0,1]` (`toon.glsl.js:492`) and `key = ramp * sh`
(`:528`), so **`key ≤ ramp` per texel is an identity of the shader**, i.e. blue ≤ red in every pixel of
a `debugTerm(5)` frame. The ±1 LSB slack is the PNG quantum (`1/255 = 0.003922`): two independently
rounded values that are equal in float can differ by one byte. The second clause — that `red − blue`
exceeds a byte *somewhere* — rejects the degenerate case `sh ≡ 1`, in which the blue channel is a copy
of the red one and the run would be measuring `ramp` under another name.

**Why this and not the ordering alone.** `PF_PROD` fails loudly on a channel swap; `PF_SPAN` does not.
On the published table the ordering `LIT > SHADE > CAST` holds identically on `ramp` (0.8532 / 0.1408 /
0.0684), on `ndl` (0.7823 / 0.1013 / 0.0300) **and** on `key` (0.5382 / 0.1017 / 0.0281) — so a scorer
reading red instead of blue passes `PF_SPAN` with room to spare. `ramp`-versus-`sh` confusion is
precisely §342.2's Error 2, the mistake this item has already made once, and the pre-flight must be
able to catch the mistake the item is known to make.

**`PF_SPAN`'s margins, and their honest limits.** The `0.25` on the **outer** pair is §341's
`PF_ORDER` constant, cited with its original derivation — *"half a band step: smaller than the gap
between adjacent nominal levels, larger than `rakeTrack`'s increment"* — and with the limit that
derivation was for `ramp`, and transfers to `key = ramp × sh` only where `sh ≈ 1`. `LIT_R` versus
`CAST_L` is the pair whose classes are visually settled and neither of which is under test, which is
where a borrowed constant is least likely to decide anything. The **middle** rung carries only
`> 1 LSB`, the smallest separation the instrument can represent (D). **That is a weak bar and it is
weak on purpose:** any larger number on the rung containing `SHADE_R` would have been read off the
0.1017 / 0.0281 gap I have already seen, and a weak bar honestly labelled beats a fitted one.

---

## 7. THE MEASUREMENT — two questions, neither of them "what is K1"

### 7.1 The decision band, carried over UNCHANGED and with a warning attached

```
K1 = mean key over SHADE_R, term5 blue, byte/255, undecoded
KEYED  K1 >= 0.10        DARK  K1 <= 0.02        INCONCLUSIVE  between
```

**(C). Registered at `678fd49`. Not moved, not widened, not re-derived.**

**Standing caveat, binding on any RESULT that quotes this band.** `PREREG-keyprobe.md` §6 derives both
bounds from `PF_KEY_LO` (`DARK = ×1`, `KEYED = ×5`), and `PF_KEY_LO = 0.02` was chosen because
`NOTE-shadowtint-space.md:258` asserted a zero that §344 measured false. The band's **timing** is
clean; its **scale** is inherited from the refuted claim. Substituting the measured floor (0.0281)
into the seal's own unchanged 5× logic gives `KEYED = 0.1405`, under which K1 = 0.1017 is
INCONCLUSIVE rather than KEYED. **The band is carried because §141.1 says it must be, not because it
is known to be right, and no RESULT may quote `K1 = KEYED` without carrying this paragraph with it.**

### 7.2 `R_BOOT` — is the verdict boot-stable? *(no free parameter)*

```
R_BOOT :  band(K1 on boot A) == band(K1 on boot C) == band(K1 on boot D)
          where band(.) is §7.1's KEYED / DARK / INCONCLUSIVE, unchanged
```

**Zero new constants** — it asks only that independent boots agree on the classification already
registered. The margin it is testing is `K1 − 0.10 = 0.0017 = 0.43 LSB`, and boots A and C are known
to differ in bytes at identical `srcHash` (§4). K1 on boot A has never been computed.

**On failure: this is not a VOID, it is the finding.** If two boots of one tree disagree on the band,
then **K1 is not readable on this rect at this margin by anyone**, the 0.1017 that three seals have
been circling is boot noise, and the item routes to §9's `RE-AIM`. `keyprobe`'s question does not get
answered and the record says why.

### 7.3 `MIX` — is `SHADE_R` one population or a mixture? *(the file's only (R))*

Over `SHADE_R`, per texel, on term5 blue, using **§7.1's own already-registered bounds** as the
classifier — no new constant:

```
frac_keyed = fraction of texels with key >= 0.10
frac_dark  = fraction of texels with key <= 0.02
```

| route | rule | meaning |
|---|---|---|
| **UNIFORM** | `frac_keyed > 0.5` | the face carries a broad low key leak. The mean means what it says, and K1 may be read against §7.1 (with §7.1's caveat). |
| **MIXTURE** | `frac_dark > 0.5` | most of the rect is dark and the mean is carried by a keyed minority. **The mean is not a property of the face.** K1 is not read; route `RE-AIM`. |
| **SPREAD** | neither majority | a continuum across a terminator — the worst case, because K1 is then a function of where the rect edge was drawn rather than of the surface. K1 is not read; route `RE-AIM`. |

**The `0.5` is this file's single free parameter and it is (R) — registered, not derived**, in
§141.4's sense (*"the single free parameter, fixed before `S` is known, and described as registered
rather than derived — the honest label"*). It is the least arbitrary split available, it is fixed here
before any distribution exists, and it is not adjusted afterwards for any reason.

`MIX` is computed on **A, C and D** and must return the **same route on all three**; a route that is
not boot-stable is `MIXTURE`/`SPREAD` by disposition, never `UNIFORM`.

### 7.4 Reported, gating nothing

Mean `ramp`, `ndl`, `key` and derived `sh = key/ramp` (over texels with `ramp > 0.02` — the shipped
shader's own N·L epsilon, `toon.glsl.js:1455`, **numerically equal to `PF_KEY_LO` and unrelated to
it**: a different channel, a different purpose, and it predates the refuted claim) on all four rects,
on all three boots. `GROUND` is descriptive. `term6` is a cross-check and is **not** load-bearing —
its `sh` is gated `sh * step(0.02, ndl)` and reads 0 in deep shade whatever `sh` is.

---

## 8. EXECUTION ORDER — the cheap stage can kill the expensive one

**Stage 1 — CPU only, no browser, no capture lock.** Score boots A and C. Run `PF_PROD`, `PF_SPAN`,
`PF_KEY_HI`, `MIX` and `band(K1)` on each. Then:

- `MIX` returns `MIXTURE` or `SPREAD` on A or C, **or** `band(K1 on A) ≠ band(K1 on C)`
  ⇒ **STOP. Do not capture boot D.** The question cannot be answered on this rect; write the RESULT
  and route `RE-AIM`. A capture window spent here buys a fourth copy of an unreadable number.
- any pre-flight FAILs on A or C ⇒ **STOP**, and the finding is about the instrument, not the colossus.
- otherwise ⇒ proceed.

**Stage 2 — boot D.** 5 arms, one boot, `keyprobe/keyprobe-run.mjs` unmodified, into
`progress/records/keyprobe2run/`. Full §5 validity plus §6 pre-flight plus §7 on D, and the
three-boot agreement of `R_BOOT` and `MIX`.

---

## 9. REGISTERED FORECAST — falsifiable, before any of it is computed

- **`R_BOOT` passes (A agrees with C on the band): ~70/30.** Reasoning, and the evidence cuts both
  ways so both sides are stated. *For:* `PREREG-bandgate2.md`'s TERMINATOR rect `[1044,322,1090,358]`
  is **entirely inside `SHADE_R`** (14.15 % of its area), and RESULT-bandgate2 §2 records its band
  histogram reproducing `96.4 / 3.6 / 0.0` across **exactly the A↔B pair** — a rect statistic inside
  this very rectangle has already survived this very byte disagreement, to the tenth of a percent.
  *Against:* that was `ramp`, not `key`; `96.4 %` sits nowhere near its boundary while K1 sits 0.43
  LSB from its own; and it covered a seventh of the rect. 70/30 is where those land, and **if A
  disagrees, that disagreement is the finding and outranks everything else in this seal.**
- **`MIX` returns `SPREAD`: ~50 · `MIXTURE`: ~25 · `UNIFORM`: ~25.** Genuinely open, and the
  arithmetic that makes it open is on the record already. A two-population reconstruction from the
  published means — fraction `p` behaving like `LIT_R`, the rest like `CAST_L` — gives
  `p(ramp) = 0.0923`, `p(ndl) = 0.0948`, `p(key) = 0.1443`. A **clean** binary mixture would return
  the same `p` on all three channels; `key`'s is 56 % above `ramp`'s, which says continuum rather than
  two populations, hence `SPREAD` as the modal call. Pulling the other way: `SHADE_R`'s derived
  `sh = 0.4908` against `CAST_L`'s 0.1768 says roughly half the shadow-map authority is absent across
  the rect, which reads more like broad partial lighting than like a dark field with a bright sliver —
  that is the 25 % on `UNIFORM`. The published mean itself constrains almost nothing here:
  `frac(key ≥ 0.02) > 0.0834` and `frac(key ≥ 0.10) > 0.0019`.
- **`PF_PROD` and `PF_SPAN` pass on A, C and D: ~95/5.** They are properties of a shader identity and
  of a frame whose classes are visually settled. A failure would mean the scorer or the readback is
  wrong, and it would be reported that way.

**The condition that would refute this seal's premise:** `MIX = UNIFORM` **and** `R_BOOT` passing on
all three boots. That would mean K1 is a stable property of a single-population surface, the 0.43-LSB
margin was a red herring, and the NOTE's §2.3 and §2.1 were both overcautious. It would still not
retire §7.1's provenance caveat, which is about where `0.10` came from and is untouched by any of
this. I will record that as written rather than reinterpret it.

---

## 10. BINDING LOOK

1. Open `courtyard.term5.png` for **each scored boot**. Recognisable structure or the row is an
   instrument failure and VOIDs whatever it computes to.
2. In each, `CAST_L` must be visibly darker in **blue** than `LIT_R`.
3. **New, and specific to `MIX`:** crop `SHADE_R` from boot A's and boot C's term5 frames at ≥ 2× and
   look at the blue channel. If a `UNIFORM` route is returned over a crop a human can see is split
   light/dark, the route is wrong whatever the fractions say, and the row is a **NO-CLAIM**. §344's
   own error was reading crops without their context; this reads the crop *and* the whole frame.

A LOOK failure is a NO-CLAIM on the row it touches, regardless of the table.

---

## 11. WHAT THIS SEAL DOES NOT DO

No candidate, no dose, no `TUNE` change, no ship, no `src` movement on any outcome. It does not
re-open §342's attribution (texture arithmetic against a double-digest-proven control, independent of
all of this). It does not re-derive, widen or improve §7.1's band. It does not re-draw a rect. It does
not resurrect `PF_KEY_LO` in any form. **And it does not promise to answer §336's question** — two of
its four routes end in `RE-AIM`, which is the honest outcome if the rect cannot carry the question.

## 12. DISPOSITION

- Any §5 validity or §6 pre-flight FAIL ⇒ **VOID**; nothing claimed about the shade face.
- `R_BOOT` FAIL ⇒ **K1 UNREADABLE at this margin.** Not a VOID — a finding, and the strongest one this
  seal can produce. Route `RE-AIM`.
- `MIX` = `MIXTURE` or `SPREAD` ⇒ **K1 not read.** The mean is not a property of the face. Route
  `RE-AIM`.
- `MIX` = `UNIFORM` **and** `R_BOOT` PASS **and** all gates PASS ⇒ read `K1` against §7.1 and route
  §336's successor by it, **carrying §7.1's provenance caveat verbatim into the RESULT**.
- **`RE-AIM` means:** the item's next step is a rect registered for *this* question — a key-band rect,
  not a chroma-patch rect inherited from `shadowtint/roi.json` — drawn against a frame the drawer has
  not seen, in a NEW seal. Not a fifth control on this one.
- **§141.1 absolute:** the rects, §7.1's `0.10 / 0.02` band, §6's bars and §7.3's `0.5` are fixed at
  the moment this file is committed. If the results make any of them look badly chosen, that is a
  finding to write down, not a threshold to move, and a re-seal is a NEW file.
