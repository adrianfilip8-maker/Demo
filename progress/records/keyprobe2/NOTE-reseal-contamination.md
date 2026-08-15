# NOTE-reseal-contamination — what a keyprobe re-seal is allowed to be, and why it is not a re-run

**Lane:** SHADING (record only). **Date:** 2026-08-15. **Nothing ships. No `src` touched. No capture.**
**Ancestry:** §336 (names the `key` readback) → §340 (control mis-aimed ⇒ VOID; ordering control
prescribed) → §341 (bandgate2, the ordering control adjudicating) → §342/§342.1/§342.2 → **§344
(keyprobe VOID: `PF_KEY_LO` encoded a claim measured false)**.

**Written under §141.1 with the voided run's numbers in front of me.** I state below exactly what I
knew, exactly what I computed, and exactly what I refused to compute, because the whole question this
file exists to answer is whether anything sealed after those numbers can still be a measurement.

---

## 0. DISCLOSURE — what the author of this file knew before writing a single bar

Unavoidable: these are committed to `RESULT-keyprobe.md`, `KNOWN_ISSUES.md §344` and
`progress/records/logs/keyprobe-score.txt`. Anyone reconstructing the item from the ledger sees them.

```
rect     class                ramp    ndl    key  sh=key/ramp
SHADE_R  shade-terminator  0.1408 0.1013 0.1017       0.4908     <- K1, not read (run VOIDed)
CAST_L   shade-cast        0.0684 0.0300 0.0281       0.1768
LIT_R    lit               0.8532 0.7823 0.5382       0.6172
GROUND   both              0.7735 0.4183 0.3010       0.3608
```

**What I additionally computed while writing this file, all of it arithmetic on the four published
rows, on committed manifests and on rect coordinates in committed seals — no pixel was read:** the
reconstructions in §2.3 and §4, the `sha256` comparison in §3, and the rect-containment check in §3.
I have also read `RESULT-bandgate2.md` §2's published band histogram, which bears on the forecast and
is disclosed at the point where it does (§3).

**What I deliberately did NOT compute, and the successor must be able to verify that I did not:**

- `key` (or anything else) on `progress/records/bandgate1/courtyard.ramp.png` — an independent boot's
  copy of the identical instrument frame (§3). **This is the seal's live quantity.** Computing it here
  would destroy the only uncontaminated thing left on this item.
- any per-texel distribution, quantile, histogram or spatial structure inside `SHADE_R`.
- `term6`'s cross-check numbers. The scorer prints them at line 198, *after* the `process.exit(1)` at
  line 177, so the VOID means they were never printed. They are un-read and they stay un-read.

No file was written under `progress/records/logs/`. The two files in this directory are the only
things this session produced.

---

## 1. The split is three ways, not two, and the third way is the one that decides the item

The brief separates a clean decision band from a contaminated pre-flight bar. That separation is
correct as far as it goes. It is not the whole hazard.

**(a) The DECISION band — `KEYED ≥ 0.10` / `DARK ≤ 0.02`.** Registered at `678fd49`, before
`keyprobe1/` existed. Not fitted to the data. **Carried over unchanged** per the brief and per §141.1.
See §2 — its *timing* is clean and its *provenance* is not, and that distinction turns out to matter.

**(b) `PF_KEY_LO`'s REPLACEMENT.** Contaminated the moment it is chosen to clear 0.0281. Must come
from a principle. §5 does that.

**(c) THE DECISION TO RUN AT ALL, and the stopping rule.** §141.1 is written about thresholds, so
this one has no section number to hide behind, and it is the one that actually kills the naive
re-seal. An item whose *gates* are revised after each failure, by an author who knows which way the
revision resolves, has selected its outcome through the gate — even when every individual revision is
principled. This item is on its **fourth** control in one week: §342.1 (wrong lighting state), §342.2
(right object, assumed state), keyprobe (measured the state, found the assumption false), and now
this. A fourth revision authored by someone who can compute in advance that it passes is
gate-shopping in form, whatever its derivation reads like.

The test that separates a legitimate fourth attempt from gate-shopping is not "is the bar principled".
It is: **is there a quantity in this seal whose value the author cannot already derive?** Apply that
test honestly to a re-run of K1 on `keyprobe1/` and the answer is no. Every gate, every rect mean,
every verdict is fixed by bytes already committed and already published. A pre-registration whose
result is determined before it is written is not a pre-registration; it is a **ratification
instrument**, and it should be called one out loud rather than dressed as a measurement.

---

## 2. The uncomfortable part, and it is worse than "clears by 1.7%"

K1 = **0.1017** against `KEYED ≥ 0.10`. Three separate things are wrong with ratifying that, and only
the first is the one the brief flagged.

### 2.1 The margin is 0.43 of one byte

The instrument reports `byte/255`. One least-significant bit is `1/255 = 0.003922`. The margin is

```
K1 - KEYED = 0.1017 - 0.1000 = 0.0017  =  0.43 LSB
```

The verdict turns on **less than half of one quantisation step** of the channel it is measured in.
That is not a statistical objection — see §3, the render is not noisy in the sampling sense — it is a
statement about how little has to move for the answer to change sign.

### 2.2 The decision band is not independent of the refuted claim — only its timing is

This is the finding of this file and I did not expect it. `PREREG-keyprobe.md` §6 derives **both**
decision bounds from `PF_KEY_LO`, in its own words:

> `0.02` is not invented: it is `PF_KEY_LO`'s own bar … `0.10` is **5×** that floor

So `DARK = PF_KEY_LO × 1` and `KEYED = PF_KEY_LO × 5`. And `PF_KEY_LO = 0.02` was set at 0.02
*because* `NOTE-shadowtint-space.md:258` asserted `sh = 0, hence key = 0` on colossus-L — the
assertion §344 measured false (`key` 0.0281, `sh` 0.1768).

**The band was registered before any frame existed, and it inherits its entire scale from the claim
that voided the run.** Uncontaminated by the *data*; carrying the *error*. Those are different
properties and the item has been treating them as one.

Now the sensitivity, which is why this is not a pedantic point. Substitute the measured floor for the
refuted one — colossus-L's own `key` of 0.0281, the largest value the instrument actually reports on
the surface the record calls unkeyed — and apply the seal's own unchanged 5× logic:

```
floor  0.0200 (asserted, refuted)  ->  KEYED 0.1000   K1 0.1017  = KEYED         (clears by 0.43 LSB)
floor  0.0281 (measured)           ->  KEYED 0.1405   K1 0.1017  = INCONCLUSIVE
```

**The verdict a re-seal would ratify sits inside the width of the error that voided the run.** I am
not re-deriving the band — the brief forbids it, §141.1 forbids it, and it stays at 0.10/0.02 in the
draft seal. I am recording that the number it would license is not robust to correcting the one
mistake everybody agrees was made. Anybody who later quotes `K1 = KEYED` needs to have read this
paragraph.

### 2.3 The mean may be the wrong statistic for the question

`SHADE_R` is registered `shade-**terminator**`. A rect that spans a terminator contains lit texels and
dark texels, and the mean over it is a **mixture**, not a property of "the face". "Is the colossus's
shade face still receiving direct key?" has two completely different answers consistent with
`mean key = 0.1017`:

- the whole face carries a uniform low key leak of ~0.10 — **the face is keyed**; or
- ~90 % of the rect is dark and a lit sliver inside the rect carries the entire mean — **the face is
  not keyed, and the rect is not on the face the question is about.**

Reconstructing a two-population mixture from the published means alone (a fraction `p` of texels
behaving like `LIT_R`, the rest like `CAST_L`) gives:

```
p(ramp) = 0.0923     p(ndl) = 0.0948     p(key) = 0.1443
```

Two things fall out. First, **a ~9–14 % lit minority reproduces every published `SHADE_R` mean** — the
mixture reading is live, not a hypothetical. Second, and more useful: a *clean* two-population
mixture would return the **same** `p` on all three channels. It does not — `key`'s 0.1443 is 56 %
above `ramp`'s 0.0923. So `SHADE_R` is not a clean binary mixture either; it is a **continuum across a
terminator**, which is the worst case for a mean threshold, because then K1 is a smooth function of
*where the rect's edge was drawn*.

And that rect was drawn by the shadowtint lane for chroma patch sampling (`shadowtint/roi.json` — its
own header says the classes exist so a patch scanner can keep 10×10 patches with per-channel
sd ≤ 3). It was never drawn to sit inside a single key band. §141.1 correctly forbids re-aiming it
now. The consequence has to be stated rather than escaped: **if `SHADE_R` is a continuum, no re-seal
on this rect can answer §336's question at any threshold**, and the item needs a rect registered for
*this* question on a frame nobody has seen — which is a bigger and cleaner piece of work than a
re-seal.

The published mean barely constrains this. If `f` is the texel fraction with `key ≥ 0.02` and `g` the
fraction with `key ≥ 0.10`, then `mean = 0.1017` forces only

```
f > 0.0834        g > 0.0019
```

`g > 0.19 %` is no constraint at all. **The composition of `SHADE_R` is genuinely unknown and genuinely
knowable from frames already committed.** That is the one place on this item where a real
pre-registration is still possible.

---

## 3. "Just re-run it" — the determinism question, resolved against both easy answers

I expected to find that the renderer is bit-deterministic, which would make a fresh capture vacuous.
The record says otherwise, and it says it precisely. Three captures of shot `courtyard`, **all three
at `srcHash b3852e39472ed68f`** — the identical `src` tree — all at warm-up 2, all staged live-settle:

| capture | boot | head | arm at `debugRaw('scene')` + `debugTerm(5)` | `sha256` |
|---|---|---|---|---|
| `bandgate1/` | 12:26 | `f3d314dd54` | `courtyard.ramp.png` | `1de4f00760af51fb…` |
| `bandgate2run/` | 13:20 | `8a29576f0f` | `courtyard.ramp.png` | `7d6125ed124e5577…` |
| `keyprobe1/` | 15:44 | `cfcdd941f8` | `courtyard.term5.png` | `7d6125ed124e5577…` |

Verified with `sha256sum` against the on-disk files, and the arm configuration verified in
`bandgate/bandgate.mjs:63` (`['ramp', { raw: true, term: 5 }]`) — the same bypass and the same debug
term keyprobe used. The heads differ only outside `src`.

**Two boots are byte-identical. The third is not.** So:

1. **A fresh capture is NOT vacuous.** Bytes do move across boots on one tree. RESULT-bandgate2 §2
   already recorded this and attributed it to §337; note in passing that §337 itself measured a
   *cross-tree* instability and affirmed cross-*boot* reproduction, so §337's own conclusion is
   narrower than the citation makes it — the bandgate1-vs-bandgate2run pair is a same-`srcHash`,
   different-boot disagreement, which is a fact §337 does not cover.
2. **K1 has already been reproduced exactly, for free, and the reproduction proves less than it
   looks.** `bandgate2run/courtyard.ramp.png` and `keyprobe1/courtyard.term5.png` are the *same
   bytes*, so K1 on the former is 0.1017 exactly — derivable from the hash, no pixel read. Identical
   bytes are not an independent replicate; they are the same observation filed twice.
3. **The open question is boot A**, and it is open. `bandgate1/courtyard.ramp.png` is the identical
   instrument frame from a boot whose bytes demonstrably differ, it is committed, it has never been
   scored for `key`, and **nobody knows what K1 is on it.** Against a 0.43-LSB margin, that is the
   measurement this item actually needs.

**And there is already one published result bearing on it, which I must disclose because it moves my
forecast and would otherwise make the open question look more open than it is.** `PREREG-bandgate2.md`
§4's TERMINATOR rect is `[1044, 322, 1090, 358]` — and that rectangle is **entirely inside `SHADE_R`**
(`x[1044,1090) ⊂ x[1020,1110)`, `y[322,358) ⊂ y[260,390)`), 1 656 px, **14.15 % of `SHADE_R`'s area**.
RESULT-bandgate2 §2 records that its band histogram over that rect came back `96.4 / 3.6 / 0.0` on
**boot A** (the voided smoke test) and `96.4 / 3.6 / 0.0` again on **boot B** — i.e. a rect statistic
computed inside `SHADE_R` has *already* been shown to survive the exact A↔B byte disagreement, to the
tenth of a percent. That is real evidence and it pushes `R_BOOT` toward passing.

It does not make `R_BOOT` redundant, for three stated reasons: that statistic was on **`ramp`**, not
`key`; a band *fraction* sitting at 96.4 % is nowhere near its own boundary, whereas K1 sits 0.43 LSB
from its own; and it covered **14 %** of `SHADE_R`, leaving the other 86 % — the part where §2.3's
lit sliver would have to live — unexamined in both boots. Its `LIT 0.0 %` likewise constrains only
that inner seventh.

The precedent cuts the same way. `PREREG-bandgate2.md` §8.1 faced this exact situation — an author who
had seen the voided run's numbers — and committed:

> **It is not the verdict and cannot become one.** bandgate VOIDed; re-scoring a voided run under new
> bars is exactly the post-hoc reinterpretation §141.1 forbids. **Only fresh frames decide.**

It then took a fresh capture and honoured it. **That is binding on keyprobe2**, and it is why the draft
seal makes a fresh boot the frames that adjudicate. `RESULT-keyprobe.md` §5's "the frames in
`keyprobe1/` are re-usable; a re-seal needs no new capture" was written by the same author in the same
breath as "derive a new bar", and on this point the earlier seal is the stronger authority.

There is one asymmetry that makes the boot-A replicate legitimate where re-scoring K1 is not:
**exactly one of the two numbers in that comparison is known to me.** The comparison's outcome is
therefore not known to me. A ratification of 0.1017 against 0.10 has no such property.

---

## 4. The ordering control, evaluated honestly — it is better than the bar it replaces and it is not sufficient

The brief sketches `key(LIT_R) > key(SHADE_R) > key(CAST_L)`. It has real virtues and one defect that
disqualifies it as the *whole* replacement.

**In its favour.** It asserts no zero, so it cannot import a third party's claim about a surface's
state. It is §340's own prescription (*"replace the absolute `PF_LIT` with an **ordering** control …
which tests that the channel discriminates without requiring me to know in advance which band either
rect occupies"*), it has a working precedent (§341's `PF_ORDER`, 0.486 against 0.25), and it tests the
property `PREREG-keyprobe.md` §5 actually names — *"two-sided proves the channel spans the range the
question lives in."*

**The defect.** Check it against the published table on all three channels of the same frame:

```
             LIT_R      SHADE_R    CAST_L     ordering holds?
ramp    (R)  0.8532  >  0.1408  >  0.0684        yes
ndl     (G)  0.7823  >  0.1013  >  0.0300        yes
key     (B)  0.5382  >  0.1017  >  0.0281        yes
```

**The ordering is satisfied identically by `ramp`, by `ndl` and by `key`.** A scorer that read the red
channel instead of the blue — the single most likely instrument failure on a three-term debug write —
would pass this control with room to spare. And "is this `ramp` or is this `sh`?" is *precisely* the
conflation §342.2 recorded as its Error 2 (*"different factors of one product, conflated because both
are called shadow"*). A control that cannot distinguish the two does not prove the instrument on the
axis this item has already got wrong once.

**Verdict on the sketch: adopt it, do not stop at it.** It goes into the draft seal as `PF_SPAN`, and
it is joined by a control that *is* specific to `key` — §5.

**On attaching a margin to it.** The brief is right that a margin needs a derivation that is not the
measured gaps, and the honest answer is that the middle rung cannot have one. §341's 0.25 was derived
as *"half a band step: smaller than the gap between adjacent nominal levels, larger than
`rakeTrack`'s increment"* — a property of `slyRamp` with `bands: 3`. That derivation transfers to
`key = ramp × sh` **only where `sh ≈ 1`**, which is exactly what is unknown on `SHADE_R`. So the draft
uses 0.25 on the **outer** pair (`LIT_R` vs `CAST_L`, both of whose classes are visually settled and
neither of which is under test), restates its derivation and its limit, and requires of the **middle**
rung only strict ordering beyond one byte — because one LSB is the smallest separation the instrument
can represent, and any larger number on that rung would be read off the 0.1017/0.0281 gap I have
already seen. Registering a weak bar and saying it is weak beats registering a fitted one.

---

## 5. The replacement control, and where each constant comes from

Three sources are admissible, and nothing else is:

1. **The shipped shader**, which predates the entire item and was authored for another purpose.
2. **The PNG encoding**, which is arithmetic.
3. **A constant already registered in an earlier seal**, cited with its original derivation *and* the
   limits of transferring it.

`PF_PROD` is the one that carries the weight, and it comes from source 1:

```glsl
toon.glsl.js:492   float sh   = smoothstep( uShadowSharp.x, uShadowSharp.y, shadowRaw );   // sh in [0,1]
toon.glsl.js:528   float key  = ramp * sh;
```

Since `sh ∈ [0,1]`, **`key ≤ ramp` per texel, everywhere, as an identity of the shipped shader** — red
channel ≥ blue channel in every pixel of a `debugTerm(5)` frame, tolerance one LSB for independent
rounding. This is not a claim about any surface, so it cannot encode anybody's assertion about
colossus-L; it is a claim about the *channel*, and it fails loudly on a channel swap (the exact
failure `PF_SPAN` is blind to). Paired with a requirement that `key` be separated *below* `ramp`
somewhere by more than a byte — otherwise `sh ≡ 1` and the run is measuring `ramp` under another name
— it does the job `PF_KEY_LO` was supposed to do, and does it without a zero.

**One coincidence to flag before someone launders it.** The shipped shader carries `step(0.02, ndl)`
at `toon.glsl.js:1455`, and the scorer carries `RAMP_FLOOR = 0.02`. That `0.02` is numerically equal to
`PF_KEY_LO` and has **nothing to do with it**: it is an N·L epsilon in shipped code, on a different
channel, authored for a different purpose, and it predates `NOTE-shadowtint-space.md:258`'s claim
entirely. It is a legitimate constant to build on and an illegitimate one to point at while saying
"see, 0.02 was derivable after all." The draft seal uses it only where it means what the shader means
by it, and says so at the site.

---

## 6. VERDICT

**A re-seal that re-runs K1 on `keyprobe1/` against the carried band must NOT happen.** Four reasons,
in descending order of how much they should bother the reader:

1. **It cannot be a measurement.** Every gate and every value in it is fixed by committed, published
   bytes. Its author knows the outcome before writing the first bar. That is a ratification
   instrument, and §141.1's entire purpose is to prevent one from being read as a measurement.
2. **The value it would ratify is inside the error bar of the mistake that voided the run.**
   §2.2: correcting the refuted floor to the measured one moves `KEYED` to 0.1405 and turns `K1` from
   KEYED into INCONCLUSIVE. The band's timing is clean; its scale is inherited from the refuted claim.
3. **A 0.43-LSB margin has never been shown to survive a boot change**, and the record contains a
   same-tree, different-boot byte disagreement (§3) whose magnitude on this channel and this rect has
   never been measured.
4. **The mean may be the wrong statistic** (§2.3). The rect is registered `shade-terminator`, the
   published means reconstruct as a ~9–14 % lit minority, and the channel-to-channel disagreement in
   that reconstruction says continuum rather than clean mixture — so K1 may be a function of where the
   rect edge fell rather than of the face's lighting state.

**A seal SHOULD nonetheless happen, and it is a different seal, answering a different question.** The
brief's suspicion is correct: this item needs a different measurement, not a re-run. The different
measurement is available, cheap, and genuinely un-read:

- **Is the verdict boot-stable?** `bandgate1/courtyard.ramp.png` is the identical instrument frame
  from a boot whose bytes differ, committed since 12:26, never scored for `key`. Score it. If it lands
  in a different registered band than `keyprobe1` did, the 0.43-LSB margin is boot noise and K1 is not
  readable at this margin by anyone, ever, on this rect. **This gate needs no free parameter at all**
  — it asks only that two boots agree on the band, using the band already registered at `678fd49`.
- **Is `SHADE_R` one population or a mixture?** Never computed. The published mean constrains it
  almost not at all (`g > 0.19 %`). Registered with the seal's own existing 0.10/0.02 bounds as the
  per-texel classifier, it invents no constant either.
- **Then, and only then, a fresh boot decides** — per `PREREG-bandgate2.md` §8.1, which is the house's
  own ruling on this exact situation and which I am not entitled to overturn by pointing at
  `RESULT-keyprobe.md` §5.

Draft in `PREREG-keyprobe2.md`, this directory. It is a **draft, not a seal**: it becomes a
pre-registration at the instant it is committed, and it is only a pre-registration if it is committed
**before** anyone scores `bandgate1/courtyard.ramp.png`. If those two events happen in the other
order, the file is worthless and should be deleted rather than salvaged.

**And the outcome that would make all of this moot, registered here so it cannot be quietly dropped:**
if the composition test says `SHADE_R` is a continuum across a terminator, then the honest reading is
that §336's question has never had a rect capable of answering it, three seals have been arguing about
a number that measures a rectangle rather than a surface, and the successor is a **fresh, blind rect
registered for this question** — not a fifth control on this one.
