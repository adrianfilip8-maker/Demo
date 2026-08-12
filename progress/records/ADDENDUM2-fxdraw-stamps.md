# ADDENDUM 2 to PREREG-fxdraw — per-capture tree stamps, and a sixth arm so falsifier §5.1 has a same-boot denominator

Written **before any fxdraw invocation has ever produced frames** (`shots/fxdraw/` does not
exist). Nothing is loosened; one guard and one arm are added. §141.1 is intact — there is still
no candidate to see.

Cause: fxshape run 3. The FIFO capture lock serialises captures, not commits — another lane's
commit (`f4056f4`, 18:59:16) landed in the shared working tree between two arms of that locked
boot, the later arms rendered the new tree, and the run VOIDed on its own validity arm with the
same-tree-by-construction rider disproven by measurement (`noflash` +0.097 mean L BRIGHTER than
base, which removing an ADDITIVE sprite cannot do; the delta was the arriving torchlight term's
brazier pools). `SANDS_NO_HMR` does not keep a mid-boot commit out.

## 1. Per-capture tree stamps, fail-closed

`fxdraw.mjs` now records `{sha: HEAD, srcTree: HEAD:src, dirty: porcelain src/}` with every
arm, exactly as `fxshape.mjs`/`fxshape2.mjs` do since `eeccb0a`. `fxdrawan.mjs` VOIDs the whole
run — not just the ship verdict — if any stamp differs from the first or any capture ran with
`src/` dirty, or if stamps are missing. The onLocked provenance snapshot stays; the stamps are
what make "one boot" mean "one tree" as a measurement instead of a hope.

## 2. A sixth arm: `nocane`

PREREG-fxdraw §5 falsifier 1 reads: *"If the attribution shows the smear is not one dominant
emitter — no single arm accounts for more than half the changed pixels of `nocane` — then the
claim in §0 is wrong and this pre-registration is withdrawn rather than re-scoped."* Its
denominator was to come from the fxshape attribution run; run 3 VOIDed and its `nocane` count
(817,704 px) spans the tree flip, so it is not usable. Rather than spend another full queue
cycle on a standalone re-run, the denominator moves into THIS boot:

- `nocane` — all four impact emitters (`cane_ring`, `cane_flash`, `cane_spark`, `cane_debris`)
  suppressed, captured after `suspect` and before `cand`, shipped emitter table installed.

Falsifier 1 is then evaluated same-boot and fail-closed: **if `F0 < 0.50 × F(nocane)`, the
one-dominant-emitter claim is withdrawn and NO candidate ships from this run regardless of
D1–D4** — the gates are not even the question at that point. (Evidence in hand says it will
pass: run 3's pre-flip `base`/`noring` pair puts the ring at 184,126 px and the donut is the
frame's dominant impact feature; but that pair had no valid duplicate, so the claim is re-made
here under a real validity arm rather than inherited.)

Arm order becomes: `base`, `suspect`, `nocane`, `cand`, `candoff`, `base2`. `base2` keeps its
double duty (clock + restore residue), now also bracketing one more arm.

## 3. Unchanged

D1, D2a, D2b, D3, D4 — thresholds, definitions, ROI derivation, and the VOID conditions all
stand exactly as registered. The candidate values are still taken from the command line at run
time, so nothing here presupposes them.
