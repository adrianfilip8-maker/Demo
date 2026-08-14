# PREREG — basketvary: the coil that is stamped eight times, once per set-dressing decision nobody made

**Seal (a) of the PROPS lane's three.** Registered BEFORE any candidate exists. §141.1: no
threshold in this file moves after a candidate is measured; a bar that is missed is missed.

## 1. The complaint, and the object it names

Critic r12, verbatim: *"the same coil basket appears three times in one frame"*, *"the seventh
appearance of the coil basket reads as set-dressing autopilot"*.

The object is `PropKit.ropeCoil` — eight of them, placed by `Props._courtyardDress`. Named by
two independent lock-free instruments before this file was sealed:

* `tools/pixat.mjs courtyard 749,577 968,671 721,635` returns `props_rope` at
  (2.85, 0.35, 24.94) / (4.59, 0.11, 30.90) / (0.86, 0.40, 29.56) — **the critic's three in one
  frame, exactly**.
* `progress/records/props1/propgeom.mjs` (offline, no boot, no lock) counts **7 of the 8 coils
  inside the `courtyard` frustum** — the critic's "seventh appearance", also exactly.

## 2. Measured baseline (`progress/records/props1/base-geom.json`, HEAD)

```
rope coils n=8   distinct silhouettes = 1   bbox-diagonal CV = 0.0025
signatures {"rope|11x4x11": 8}            <- all eight are ONE silhouette at 0.10 m
per shot (inFrustum / maxIdentical):
  dunes 8/8 · courtyard 7/7 · sly-closeup 5/5 · sly-perch 5/5 · sly-key 5/5 ·
  sly-startle 3/3 · combat 3/3 · kaykit 2/2 · sly-arm 2/2 · night 2/2 · sly-profile 2/2
MAX identical in any registered shot = 8
```

Every coil is `TorusGeometry(r(1-t*0.22), 0.07, 5, 14)` x4 at fixed `r 0.5, tube 0.07, coils 4`;
the only per-instance variation is a 5 cm centre drift and a yaw per ring, which moves the bbox
by 1.3% and the HEIGHT by **0.000 m**. The silhouette is a clone by construction.

## 3. PROTECTION CHECK DONE FIRST — do the coils carry gameplay volumes?

The mission's own instruction ("baskets may carry gameplay volumes — CHECK before moving
anything"). Read at `src/world/Props.js:462-466`: the coil loop calls `place(...)` then
`this._push('rope', g)` and **nothing else** — no `_ground` (no decal), no `_hazard`, no
`_maybeLedge`/`_deck`/`_pole`, no `registerCollider`. The `rope` material carries
`noShadow: true`. So a coil is pure set dress today, and the protection below is what keeps it
that way rather than an assumption that it is.

The neighbouring 26-piece pottery/basket loop DOES call `this._ground(g)` (a contact decal), so
it is *not* volume-free and its decal count is pinned by the same protection.

## 4. Bars (registered; all offline, lock-free, deterministic)

Instrument: `node progress/records/props1/propgeom.mjs --json <out>`; scorer
`node progress/records/props1/basketvary-score.mjs <cand.json>`. The scorer reads
`base-geom.json` (sealed with this file) as the baseline — it does not re-derive it.

| id | bar | base | ship requires |
|---|---|---|---|
| **A1 CLONE** | `A.maxIdenticalAnyShot` — largest set of rope coils sharing one silhouette signature inside any registered shot's frustum | **8** | **<= 2** |
| **A1b** | the same, in `courtyard` alone (the critic's frame) | **7** | **<= 2** |
| **A2 VARIETY** | `A.diagCV` — coefficient of variation of the coils' bbox diagonal | **0.0025** | **>= 0.12** |
| **A2b** | distinct silhouette signatures among the coils | **1** | **>= 5** |
| **A3 DENSITY** | `A.count` — coils placed | **8** | **<= 8** (may fall, may not rise) |
| **P-A1 VOLUMES** | collider count AND per-tag histogram, decals, hazards, fx, lights | 272 / `{ground:52,ledge:90,pole:21,spire:5,wall:75,hook:11,rail:6,vent:4,hazard:8}` / 46 / 8 / 24 / 24 | **all EXACTLY equal** |
| **P-A2 BUDGET** | `PROT.propTris` (§1 is already breached on 15/16 shots — this lane may not make it worse) | **76288** | **<= 76288** |

**Silhouette signature (registered form, not a knob):** material key + bbox extents rounded to
0.10 m. 0.10 m is the readable-difference floor at the camera that raised the complaint — a coil
sits 13-18 m from the `courtyard` eye, where 0.10 m subtends ~4 px, the smallest extent change
that can alter the drawn silhouette at all. Vertex count is deliberately excluded: two props with
the same vertex count and different extents are different objects on screen, and the converse.

**FAIL-CLOSED:** any bar missed => `src/**` unchanged for this seal. A2/A2b failing while A1
passes is still a fail (moving eight clones apart in the frustum is not variety).

## 5. SCORING RECIPE (exact commands, outcome branches, ship-write lines)

```bash
# 1. candidate is measured WITHOUT installing (propgeom takes a --root; src/ is never written)
rm -rf node_modules/.cache/props1-cand && mkdir -p node_modules/.cache/props1-cand
cp -a src node_modules/.cache/props1-cand/src   # scratch copy, OUTSIDE src/ and outside vite's watch
#    apply progress/records/props1/cand-basketvary.patch to that copy
git apply --directory=node_modules/.cache/props1-cand -p1 progress/records/props1/cand-basketvary.patch
node progress/records/props1/propgeom.mjs \
     --root node_modules/.cache/props1-cand/src \
     --json progress/records/props1/cand-basketvary-geom.json
# 2. score against the sealed baseline
node progress/records/props1/basketvary-score.mjs progress/records/props1/cand-basketvary-geom.json
```

* **PASS (all seven rows green)** -> ship-write is exactly:
  `git apply progress/records/props1/cand-basketvary.patch` (into `src/world/PropKit.js` and
  `src/world/Props.js` only), plus `tests/basketvary.test.mjs` pinning A1/A2/A3 and P-A1 to the
  scored numbers. Nothing else in `src/**` is touched by this seal.
* **FAIL (any row)** -> `src/**` unchanged, RESULT records the miss, patch stays in `records/`.

No boot, no capture lock, no frames: this seal's bars are geometry, and geometry is exactly
computable offline. A LOOK frame rides along on the lane's shared capture run for the record,
and is **not** a gate here.

## 6. Correction landed during this seal's drafting (§310)

§310 (another lane, 2026-08-14) measured that the "§1 budget breached on 15/16 shots" figure
quoted in §2/§4 above is FALSE — it came from `renderer.info.render` with `autoReset=false`, an
all-passes submission counter. The real worst shot is 85 draws / 0.647 M tris. **No threshold in
this file moves** (§141.1): P-A2 was registered as "may not get worse", which is the right bar
whether or not there is a breach, and the candidate is triangle-NEGATIVE either way. Recorded so
the justification text is not read later as a claim this lane made after §310 existed.
