# RESULT — fx20: the `temple` pink disc is `sandHigh`

Scored by the coordinator against the acceptance registered in `fx20.mjs`'s header **before the
frames existed** (KNOWN_ISSUES §124.5). Ten jobs, one boot, all dt-0 variants on one staging.
Log `progress/records/logs/fx20.log`; frames `shots/fx20/`.

## Control first, as registered

`back` vs `base`: **bit-identical, 0 px.** Rows are scoreable. Had this failed, every row below
would be void and nothing named — that ordering is the registered one and it was applied before
any treatment number was read.

## The rows

DISC ROI (555,100)–(675,220), 121×121 px. Base ROI luma mean 58.89.

| arm | ROI mean ΔL | ROI changed | whole-frame changed |
|---|---|---|---|
| `no-sandHigh` | **−3.24** | **21.7 %** | 13 724 px |
| `no-sparkles` | −0.30 | 2.1 % | 323 px |
| `no-sandLow` | +0.00 | 0.0 % | 15 423 px |
| `no-shimmer` | +0.00 | 0.0 % | 48 436 px |
| `no-dust` | +0.00 | 0.0 % | **0 px** |
| `no-smoke` | +0.00 | 0.0 % | **0 px** |
| `no-airMotes` | +0.00 | 0.0 % | **0 px** |
| `no-flames` | +0.00 | 0.0 % | **0 px** |

## Verdict: `sandHigh`, and the named branch fired rather than the escalation branch

One pool clears the registered 3.0 bar; every other pool is under 1.0. **The disc is a batch
sprite and it is `sandHigh`.** The escalation branch — *"if no pool clears 3.0 the disc is not a
batch sprite"* — did not fire, so `shafts` remains counted-but-never-toggled and is still the
untested arm, but nothing now depends on it.

### The statistic understated the result, and the image is what shows it

**−3.24 against a 3.0 bar is an 8 % margin and reads as marginal. It is not.** Cropped at 3× and
looked at (`progress/records/crops/fx20-disc-{base,nosandhigh}.png`), the disc is a soft-edged
mauve-pink blob over the blue star ceiling in `base` and is **completely absent** in
`no-sandHigh` — the ceiling is clean blue with its star motifs legible where the blob was.

The ROI is 121×121 = 14 641 px and the disc occupies ~21.7 % of it, so **the mean was diluted by
~4.6× over mostly-unchanged pixels.** The margin looked thin because the ROI was drawn generously
around a feature that does not fill it.

> A mean over an ROI larger than its subject reports a fraction of the effect, and the fraction is
> set by the ROI's generosity rather than by anything about the treatment. Here it erred
> *conservatively* — the bar was cleared anyway — but the same dilution with a 3.5× ROI would have
> failed a total removal. **Quote the changed-fraction beside the mean, or size the ROI to the
> subject.**

### Four pools moved zero whole-frame pixels, and that is sound rather than broken

`dust` (290 live), `smoke` (220), `airMotes` (1000) and `flames` (24) are all **present at base per
the probe** and yet removing each changes **zero pixels in the whole frame**. That is not a failed
toggle: it means those pools contribute nothing visible in this framing, and a pool contributing
zero pixels cannot be producing a disc that is visibly there.

Worth stating because the inference direction matters. This run can say *"`dust` is not the disc"*
precisely because the disc **is** in `base` — §122.3's premise-absent trap runs the other way and
does not apply. The discrimination came down to `sandHigh` vs `sandLow` vs `shimmer`, all three of
which are live and visible in-frame (15 423 and 48 436 whole-frame px for the latter two), and only
`sandHigh` touches the ROI.

## Provenance — the boot-tree question, answered from the stamp

`hashwatch` stamped at the lock-acquisition transition, which §124.4 established is the only moment
that matters (the bundler reads the tree at `page.goto`, not at capture).

| | queued 15:24:57 | at-goto 15:36:20 |
|---|---|---|
| HEAD | `bb164fb` | `3ea7be6` |
| `Outline.js` | `d88ae445f398` | **`d88ae445f398`** |
| `ToonMaterial.js` | `e02f4154b6af` | **`e02f4154b6af`** |
| `toon.glsl.js` | `2aa97c5e1f85` | **`2aa97c5e1f85`** |

`driftFromQueued`: **`src/world/Kit.js` only** (GEOMETRY's bead-UV fix at 15:36:12, eight seconds
before `goto`).

**Both `2417356` (slyInk, inert) and `831f6de` (fur cards at weight 0.40, not inert) are on the
boot side** — SHADING's three files were written at 15:18–15:19, *before* fx20 was even queue-
stamped, and are byte-identical at `goto`. So `fx20`'s frames contain the 0.40 fur cards.

**And the `back`-vs-`base` control passed at 0 px, which settles it empirically.** The concern I
raised in the poke — that the ink change endangers that check — was already retracted at §126: all
ten jobs are dt-0 variants in **one boot**, so a different Sly is equally present in `base` and
`back`. The run confirms it. *The poke restating a superseded claim is worth noting on its own: a
scheduled reminder carries whatever framing was current when it was written, and it does not learn.*

`Kit.js`'s drift is architecture geometry landing 8 s before boot; the disc ROI is ceiling and the
control is bit-identical, so nothing here depends on it.

## What this does not settle

- **`shafts` was never toggled** — counted only (38 live). The escalation branch did not fire, so
  it is not needed, but it remains the one system in this scene with no arm.
- **Why `sandHigh` produces a 60 × 63 px near-lens sprite** is unanswered. §122.3's mechanism
  candidate — an uncapped pool where only `air_motes` carries a `maxSize` ceiling
  (`Particles.js:2012`) — is now specific: `sandHigh` is uncapped and it is the pool. The fix
  §124.1 argued for is a **per-sprite near-plane guard**, not a global screen-size ceiling, because
  §124's own bracket showed capping `sandLow` at 0.12 removes ~97.8 % of the field's contribution.
  That is a design decision for FX, on a named pool, with the mechanism measured.
