# ADDENDUM to PREREG-aokey — the sealed arm table cannot be produced by the poke it specifies

**Written by the coordinator, not by SHADING.** SHADING found this, sized it, and deliberately
declined to edit a sealed document — the right call, and the reason this file exists rather than a
quiet amendment inside `PREREG-aokey.md`. The seal stands as written; this addendum records what it
turns out not to reach, and what must change before anyone spends the lock.

Nothing here changes the seal's **mechanism**, which is unaffected: `ao` is textually absent from
the key term, and the two-knob framing (`uAoKey`, then `uAoStrength` compressing the authored span
before anything multiplies by it) is exactly right. What fails is the **operationalisation** — the
specified poke does not move one of the two knobs.

---

## 1. Three of the four sealed arms are one applied state

Measured, not read: `scratchpad/aokey-applied.mjs` builds the real `Shading`, real materials through
the real `toon()`, and reads back the uniform object that `onBeforeCompile` actually splices into
`shader.uniforms`.

| arm | poke as sealed | applied `uAoKey` | applied `uAoStrength` |
|---|---|---|---|
| k0 | — | 0.00 | 0.5500 |
| k1 | `uniforms.uAoKey.value = 1` | 1.00 | 0.5500 |
| k1b70 | `TUNE.bakedAO = 0.70` | 1.00 | **0.5500** |
| k1b85 | `TUNE.bakedAO = 0.85` | 1.00 | **0.5500** |

`k0` vs `k1` is real — `uAoKey` is shared by identity, so that poke lands. **`k1`, `k1b70` and
`k1b85` are the same state**, and per the contact seal's §6.1 line, *two arms with equal applied
state are COLLAPSED and score nothing*. Three of four arms would have produced a null that looked
exactly like "the second knob is a dead lever".

**Why:** `uAoStrength` is per-material, computed once at `toon()` time (`ToonMaterial.js:805`) and
frozen at `:896`. A grep for writers returns **three hits total** — that line, the GLSL declaration,
and the GLSL use. **There is no writer.** `TUNE.bakedAO` is read at construction and never again.

## 2. It is worse than a no-op: the poke mints a duplicate material

`r3(o.ao)` is part of the option hash at `ToonMaterial.js:837`. So any `toon()` call *after* the poke
returns a **new** material — probe: `same instance returned? false`, new one carrying 0.8500 — while
every mesh already in the scene keeps the old one. The result is a half-applied state plus a silent
duplicate program, which is the §23 hazard (a foreign change inside the A/B window) manufactured by
the A/B's own poke.

A run that hit this would have shown a small, real, entirely spurious delta on whatever was built
late, and a plausible story to explain it.

## 3. The working poke

Verified to read back 0.7000 and 0.8500: walk `shading._cache` and set

```js
m.userData.slyUniforms.uAoStrength.value = v;
```

Every arm must still print applied state per §40, and `k1b70`/`k1b85` must be shown to **differ from
`k1`** before any pixel is scored.

## 4. The falsifier can fire while the diagnosis is correct — re-scope it

`uAoKey` multiplies `alb * keyRad * key`, and `key = ramp * sh`. This is §48.2's shape again: where
`sh = 0` the term is **exactly zero at any `uAoKey`**. `ToonMaterial.js`'s own TUNE comment records
that only **~1.4% of `hero`'s gilded population is key-lit**.

The sealed falsifier — *"if the gilded span does not reach 1.45:1, the key term is not where the
occlusion went"* — is therefore scored over a population of which **98.6% cannot move by
construction**. It can fire against a correct diagnosis, which is §48.3's failure mode arriving in a
second, independently sealed document.

**Required before the run: re-scope the falsifier's ROI to the key-lit subset**, and state the
subset's pixel count in the same breath, so a small population is visible as a limit rather than
discovered afterwards as an excuse.

## 5. Status

`PREREG-aokey.md` is **not superseded** — its mechanism, its sizing and its two-knob insight all
stand, and §1 of it is the reason this was caught at all. It is **not runnable as written**. The
lock should not be spent until §3's poke replaces the sealed one and §4's ROI replaces the sealed
falsifier's.

The general point, which is now the fifth instance this session (§39, §40, §43, §50): **the check
that pays is asking what the instrument reads in the state you have not created yet.** Here it was
run *before* the capture rather than after, and it cost nothing.
