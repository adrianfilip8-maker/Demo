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
