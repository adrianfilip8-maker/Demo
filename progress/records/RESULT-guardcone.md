# RESULT-guardcone — DO NOT SHIP. Five bars fail or void; the capture itself is clean

**Seal:** `PREREG-guardcone.md` + `AMENDMENT-A1` (cone-only, guard-model arms waived per §309) +
`AMENDMENT-A2` (chunked). **Capture:** `progress/records/guardcone1/`, 49 frames, 16 chunks, all
force-added. **Scorer output:** `logs/guardcone-score.txt` (exit 1).

```
==> DO NOT SHIP — BS1 FAIL, BH1 VOID, PROT-MOON FAIL, PROT-LAMPS FAIL,
    PROT-B_sly-startle FAIL   (VOID is not PASS — BH1 could not be evaluated)
```

**The candidate fails; the capture does not.** Every structural gate passed, so this is a verdict
about the cone tuple rather than about the run that measured it.

---

## 1. What passed, and why it matters that it did

```
V_CHUNK_TREE  PASS   one src hash 317fd7305bab0f01 across 16 chunks + 49 rows
V_CHUNKS      PASS   16/16 chunks, 49/49 rows
PARK1         PASS   §309 guard-model levers inert in 49/49 rows
R_<shot>      PASS   x16 — every off-vs-back bracket exactly 0 px
BV1           PASS   readbacks match §2's constants
BF1 · BL1 · PROT-SPARK · 14 of 15 PROT-B   PASS
```

**Sixteen chunks, sixteen exact 0-px brackets**, with intermediate `bon` arms ranging from small to
**99.94%** of the frame (`sly-profile`) and **98.5%** (`guard`). A 0-px return on a quiet shot proves
little; returning byte-identical after essentially every pixel changed and changed back is what
makes `{dt: 0}` staging credible here.

That settles the question the lane raised against my briefing. §334 measured this staging mode as
**0/12 byte-identical across boots**, and I reverted to it anyway because AMENDMENT-A2 specifies it
and no guardcone bar compares across boots. Sixteen exact within-boot brackets is the evidence that
decision was owed — and `V_CHUNK_TREE` holding one hash across sixteen separate processes is the
evidence the chunking cost nothing.

---

## 2. The five that did not

### BS1 FAIL — the apex disc is not there

```
BS1 apex [770,335] hot-warm px=0 maxL=196 (want >= 1)
```

**Zero** hot-warm pixels at the registered apex. `maxL=196` says the region is bright, so this is not
a dark or missing beam — it is a beam whose apex does not satisfy the hot-warm classifier at all. The
bar wanted a single qualifying pixel and got none.

### BH1 VOID — the far half of the split has no pixels

```
BH1 near hue=17.8 S=0.453 (516057px)   far hue=n/a S=n/a (0px)
```

The near band is populous and well-defined. The **far band contains zero pixels**, so the near/far
hue comparison cannot be computed at all. This is VOID rather than FAIL, and the distinction is
load-bearing: the bar was not failed by the candidate, it was **not evaluable** — the shot's own
`apexS → farS` probe produced no far region to measure. Whether that is a property of the guard
placement in `guard`, of the probe, or of the cone geometry is **not established here**.

### PROT-MOON and PROT-LAMPS FAIL — the cone reaches into both protected ROIs

```
PROT-MOON  night [300,20,480,140]   diff=5723px  probe-touches=true  (disjoint→0, else <=400)
PROT-LAMPS night [640,0,1140,130]   diff=8028px  probe-touches=true  (disjoint→0, else <=400)
```

Both ROIs are touched by the cone's own probe, so the permissive branch applies — and both blow
through its 400 px allowance by **14×** and **20×**. The moon and the lamp band are exactly the
regions the seal set out to protect from a cone change, and the candidate moves thousands of pixels
in each.

### PROT-B_sly-startle FAIL — the only shot where the effect escapes its containers

```
PROT-B sly-startle  AFFECT inside=170167  outside=6087   (want outside <= 900)
```

Fourteen of fifteen shots report `outside = 0`; `night` reports 664, inside the allowance. Only
`sly-startle` leaks — **6087 px outside its probe containers**, 6.8× the bar.

**This vindicates an instinct of mine and refutes the reasoning I gave for it, and both halves are
on the record.** At chunk 5 I registered, before the arm rendered, that `sly-startle` (`inframe=0`)
would be "the strongest test of PROT-B in the roster", on the theory that a zero-guard frame removes
the cone's legitimate rendering and so exposes any leak. Both my predictions then failed and I
**withdrew that claim**, because `bon` moves seven uniforms and is not cone-only. The withdrawal was
correct on its stated grounds. But `sly-startle` is nonetheless the one shot that fails containment —
so the shot was revealing, for a reason I had not identified and still have not.

---

## 3. What is NOT claimed

- **No cause for any of the five.** `BS1`'s empty apex, `BH1`'s empty far band, the two ROI leaks and
  `sly-startle`'s escape are reported as measured. Attributing them to a specific term in the cone
  tuple would need arms this capture does not contain.
- **`BF1` passed trivially and should not be quoted as evidence.** `blown share bon=0.0000
  off=0.0000` satisfies both `<= 0.08` and `<= 0.5 × off`, but on two zeros — nothing was blown
  either way, so the bar discriminated nothing on this data.
- **The §8.3 LOOK gate is still binding and has not been performed.** The scorer says so in its own
  verdict line. Nothing here substitutes for it.
- **Nothing about `lampW`'s driver.** BV1's interior clause names the axis (`_light`, 0.56 knee) and
  reads the whole curve across all sixteen `bon` rows; I logged `lampW` for all sixteen and `_light`
  for exactly one, which is not the same thing and is not enough.

---

## 4. Disposition

**DO NOT SHIP.** The cone tuple as registered — `coneShape 1 + colPatrol #ffd9a0 + core 0.62 +
lampToon 1.0` — fails on the apex disc, cannot be evaluated on the near/far split, and violates both
night protection ROIs plus one shot's containment.

Task #14's decision is now **unblocked and answered in the negative**: this candidate does not ship.
A successor must address the apex classifier result and the two protection ROIs, and must first
establish why `BH1`'s far band is empty — a bar that cannot be evaluated is not a bar that passed.

---

## 5. §8.3 LOOK — PERFORMED (diagnostic only; the verdict was already settled on the numbers)

The LOOK cannot rescue a DO-NOT-SHIP, so this was done for the successor's benefit rather than as a
gate. Both registered pairs were opened.

**`guard.bon` vs `guard.off`.** The `off` frame is cool and neutral — muted tan floor, faint shafts,
guards reading as dark silhouettes with blue-white highlights. The `bon` frame turns the **entire
floor vivid orange** and introduces strong, hard-edged beam wedges from upper-left and upper-right.
This is not a localised cone treatment; it is a wholesale recolouring of the ground plane, and it is
what the 98.5% off-vs-bon figure and `PROT-B`'s large `inside` counts actually look like. A candidate
whose visible signature is "the floor is now orange" is a bigger look change than the seal's name
("guard cone night grade") suggests.

**`night.bon` vs `night.off`.** The ROIs are correctly aimed, which is the useful finding: the moon
sits plainly inside `PROT-MOON`'s `[300,20,480,140]`, and the row of hanging lamps runs straight
through `PROT-LAMPS`'s `[640,0,1140,130]`. So the two failures are not mis-drawn rectangles catching
unrelated pixels — the candidate is moving **5723 px on the moon** and **8028 px on the lamp row**,
against a 400 px allowance. A guard-cone grade repainting the moon and the level's hanging lamps is
a defect on its face, independent of the number.

**What the LOOK adds beyond the table:** `BS1`'s failure is the surprising one in this light. The
frame is conspicuously warm — the floor is orange, the beams are obvious — yet the registered apex
reports **zero** hot-warm pixels at `maxL=196`. Plenty of warmth, none of it where the bar looks. That
points at the apex probe's location or its classifier rather than at an absent beam, and it is the
first thing a successor should check before touching the cone tuple.

---

## 6. ADDENDUM — BS1 diagnosed: it fails on LUMINANCE by 2.1%, not on warmth

The successor's step 1 was "check the apex probe's location and classifier". Both checked, offline,
on the committed `guard.bon`. **This explains the failure; it does not relitigate it** — the bar was
sealed before any frame existed and DO NOT SHIP stands (§141.1).

`BS1` counts pixels in a radius-16 disc at `apexS` satisfying **`L >= 200` AND `R−B >= 8`**
(`guardcone-score.mjs:66-80`). Measured over all 797 disc pixels:

```
maxL                195.75      bar needs 200      SHORTFALL 4.25  (2.1%)
px with L >= 200        0
px with R-B >= 8      797       100% of the disc
px with BOTH            0
brightest px      (769,335) rgb(208,194,177)  R-B = 31
R-B among the 106 px at L>=180:  min 31, median 38, max 42
```

**Two findings, and the second is the useful one.**

**The probe location is correct.** The disc's brightest pixel sits at (769,335) against an `apexS` of
(770,335) — one pixel off centre. The probe is aimed at the local maximum, so "the rect is in the
wrong place" is ruled out.

**The failure is entirely in the luminance half of the conjunction.** Every pixel in the disc — 797
of 797 — clears the warmth condition, with a median `R−B` of 38 against a bar of 8, a 4.75× margin.
Not one pixel reaches `L = 200`, and the brightest misses by 4.25. So the apex is unambiguously
*warm* and marginally not *hot*.

That inverts the natural reading of "hot-warm px=0". It does not mean the apex lacks the cone's
colour; it means the apex is 2.1% short of a brightness threshold while carrying the colour in
abundance. A successor that responds by pushing warmth into the cone would be treating the half of
the bar that already passes overwhelmingly.

**Not claimed:** that 200 is the wrong threshold, or that a 4.25 shortfall should be waived. A 2.1%
miss is precisely the shape that invites "surely that is close enough", and §141.1 exists because
that reasoning is only ever available after the number is known. The bar was fixed in advance; it
was missed; the verdict is unchanged. What a successor may legitimately do is seal a NEW bar in a
new file, with its threshold derived and registered before its own candidate renders — and it now
knows the axis to derive it on is luminance at the apex, not chroma.

---

## 7. ADDENDUM — the `sly-startle` containment escape: located, sized, and one reading refuted

The successor's step 4 was "`sly-startle` containment escape, reason unknown". Offline read of the
committed `sly-startle.off` / `.bon`, no capture and no `src`. **§141.1 again: this explains the
failure and does not relitigate it.** `PROT-B` wanted `outside <= 900` and got **6087**; that stands.

### 7.1 It is the frame's only uncovered region, and the escape fills it

The container union (off ∪ bon, §4's rule) covers 853 808 of 921 600 px. The complement is
**exactly** `{x < 446 ∧ y >= 568}` — 67 792 px, verified by enumeration, with zero corner pixels
covered and zero uncovered pixels outside the corner. Its two edges are both container edges: `y=568`
is the bottom of `g2`'s dilated `beamRect`, `x=446` the left edge of the spill rect. All 6087
escaped pixels lie in it; 100 % fall in twelve 80-px cells.

### 7.2 It is at the quantisation floor — and two orders of magnitude under the change it guards

```
max|Δch| histogram    =1: 6063     2-3: 24     4-8: 0     >8: 0
outside   67792 px   flips 6087 (8.98%)   meanΔL over the WHOLE mask =  0.0238 codes
inside   853808 px   flips 170167 (19.93%)  meanΔL                   = -2.7614 codes
                     px with max|Δch| > 3 = 116602
```

99.6 % of the escape is a single code value in a single channel; nothing exceeds 3. Averaged over the
region it lives in, it is **0.0238 of one code — about 1/42 of a least significant bit**, against a
sanctioned inside-the-cone change 116× larger and of the opposite sign.

It is nonetheless *the cone's* signal, not a neutral wobble: of the channels touched, **R moves up in
3535 of 3636 cases and B moves down in 986 of 1214** — the warm axis `colPatrol 0xffd9a0` works on.

### 7.3 It is specific to this shot — the obvious explanation is false

The tempting reading is that every shot carries this bleed and the fourteen that scored `outside=0`
merely had full container coverage. **That is refuted by the other fourteen shots**, measured the
same way:

```
shot          uncovered px   flips    shot          uncovered px   flips
dunes             618 440        0    temple            179 090        0
traversal         314 543        0    hero              152 015        0
night             283 516      664    kaykit            104 855        0
sly-startle        67 792     6087    (7 shots)               0        0
```

`dunes` leaves **9.1× more of its frame uncovered** than `sly-startle` and leaks not one pixel.
Eleven of fifteen shots are at exactly zero. `night`'s 664 is the only other non-zero and it carries
the *opposite* sign (`meanΔL −0.0004`, B down 272 against R up 78). So the escape is a property of
this shot, not of its container geometry.

### 7.4 The falloff-tail reading is refuted, and widening the pad does not rescue it

The natural mechanism — `g2`'s `beamRect` under-covering the cone's own vertical falloff — predicts a
signal that **decays** with distance below `y=568`. Binned by y-band × luminance bucket, so that the
floor's brightening toward camera cannot confound it, the flip rate **rises monotonically** across
the full 152 px at three independent luminance levels:

```
y-band from the rect edge      568-592  592-616  616-640  640-664  664-688  688-720
  L 32-48                         3.0%     5.0%      n/a    10.8%    13.8%    14.0%
  L 48-64                         3.1%     3.6%     5.7%     7.6%    10.3%    12.4%
  L 64-80                         2.7%     5.1%     4.9%     7.4%     9.8%    10.0%
```

Nor is it a halo hugging a container edge: the median escaped pixel is **76 px** from the nearest
container, and re-running the containment with a wider pad leaves it substantially intact —
`pad=32 → 5924`, `48 → 5566`, `64 → 5043`, `96 → 4070`, **`128 → 2623`**. At 5.3× the sealed pad it
is still 2.9× over the bar.

### 7.5 What the evidence does point at, and what a successor must not assume

By x-band the escape is roughly flat at 6.8–8.2 % across `x 0-384` and then jumps to **18.76 %** in
the 62 px immediately left of the spill rect's edge — consistent with the spill term's own gradient
continuing past a hard axis-aligned boundary that has no counterpart in the light. But the profile is
**not** a single gradient: it dips to 6.77 % at `x 192-256` and rises again to 8.20 % at the frame's
left edge, so at least one further contribution is present and unaccounted for.

**Not claimed: which uniform is responsible.** The `bon` arm moves seven at once (`shape`, `lampW`,
`colPatrol`, `base`, `pool`, `core`, `glow`) and **`sly-startle` has no `blamp` row**, so the bundle
cannot be split on this shot. Naming one here would repeat the error §347 records — three successive
`lampW` theories, each written after a verdict and each wrong. Splitting it needs a shot captured
with the isolating arm, which is a capture, not a re-read.

**Incidental instrument note.** This shot's `ahead` disc projects to `[-1223,76,-1129,170]`, entirely
off-screen; `dilate()` clamps `x0` to 0 but leaves `x1 = -1105`, yielding a degenerate rect that
contains nothing. It is harmless here — the escape is nowhere near it — but a degenerate container is
silently empty rather than loud, and a successor relying on `ahead` should know that.
