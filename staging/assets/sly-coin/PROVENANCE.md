# The coin badge — provenance

**Source:** <https://github.com/NoahChase/Sly-Cooper--A-Thief-in-Godot>, a fan-made Godot project,
at repo HEAD **`a312a99`** *("The REAL Godot 4.7 Update")*. Read-only anonymous checkout; nothing
was pushed there.

**Licence: none stated.** The repository contains no LICENSE, no COPYING and no licence section —
checked in the tree, not assumed. It is a fan work derived from Sucker Punch / Sony's Sly Cooper.
The owner's standing instruction for this project is that copyright is not a legal obstacle here
for reasons they have not disclosed; that is their call, and it is recorded plainly here so that
nobody reading this repository has to infer the status of this file. **This is not equivalent to
`public/assets/kaykit/`, which carries an explicit CC0 grant.** The same paragraph at the top of
`public/assets/sly-godot/PROVENANCE.md` governs every other import from this repository.

**Nothing under `Assets/Music/` or `Assets/Effects/` was opened, copied, decoded or referenced.**
That rule is absolute on this project and `tools/godot2coin.mjs` reads exactly one file.

---

## READ THIS FIRST: the repository has no coin texture

The instruction this import serves was *"substitute out the texture of the coins with the coin
texture from the godot repo"*, and **the premise is false as stated**. Established by reading the
scene graph rather than by matching filenames — this project's standing rule for that repository,
and the rule that resolved the two different `Sly_Body.png` and the two different bottles before it:

```
Scenes/Design Tools/pickup_coin.tscn          ← their 3D coin, and the only one
  ├─ CylinderMesh          top_radius 0.25   bottom_radius 0.25   height 0.1
  ├─ StandardMaterial3D    albedo_color  (0.926704, 0.754991, 0.193364, 1)
  │                        emission      (0.925490, 0.756863, 0.192157, 1)
  │                        roughness 0.5 · diffuse_mode 3 · specular_mode 1
  │                        rim_enabled true · rim_tint 1.0 · clearcoat_enabled true
  │                        ** no albedo_texture — no texture reference of any kind **
  ├─ Area3D/CollisionShape3D   SphereShape3D (default radius 1.0)
  └─ AnimationPlayer       autoplay "idle spin" — rotation (0,0,−1.5708) → (0, 6.28319, −1.5708)
```

Their coin is a **procedural, untextured cylinder**. `Assets/Models/Pickups/` contains `BOTTLE.glb`
and `diamond.glb` and **no coin model**. A filename search for `*coin*` across the whole repository
returns four paths and only one of them is an image:

```
Scripts/pickup_coin.gd                                             the pickup logic (not taken)
Scripts/pickup_coin.gd.uid
Scenes/Design Tools/pickup_coin.tscn                               the untextured cylinder above
Assets/Textures/Icons/Badge_Coin_V2_-_Sly_Cooper_A_Thief_In_Paris.png    ← this file
```

## What was taken, and why this file and not another

`Assets/Textures/Icons/Badge_Coin_V2_-_Sly_Cooper_A_Thief_In_Paris.png` — **339×346, 8-bit RGBA,
47,428 bytes**, a gold coin struck with an embossed five-pointed star. 21.0% of its texels are
fully transparent: the corners outside the disc.

**It is filed as a UI icon, not as a 3D material, and nothing in the repository maps it onto a
mesh.** That is stated here rather than glossed because it is the one fact a reader needs in order
to redirect this cheaply. It is taken because it is the *only* coin image the repository has and
because it is a coin *face* — so it maps onto a coin face, which is the reading most likely to be
what "the coin texture" meant. The alternative honest reading is their **material** (the gold
albedo/emission/rim/clearcoat above), which is what their coin actually looks like in their game;
that reading is evaluated in `KNOWN_ISSUES.md` §712 and was not the one shipped.

## What the bake does to it

`tools/godot2coin.mjs --import --src <checkout root>` — re-runnable, and it prints every number
below rather than asserting them:

| step | what and why |
|---|---|
| alpha bleed | 8,344 transparent texels are given the nearest opaque RGB. The transparent region is stored as `(0,0,0,0)` — black — and downsampling or filtering across the disc edge would otherwise pull that black into the rim as a dark fringe. Alpha itself is untouched. |
| resample | 339×346 → **256×256**, box filter. `src/textures/PngCodec.js` asserts its input is 8-bit, colour type 6, non-interlaced and **square**, so a square bake is a hard requirement rather than a preference. Costs a **2.06%** stretch in x; the source disc measures 338×344 at alpha > 128, so it was never a perfect circle to begin with. |
| encode | re-encoded RGBA PNG, 40,813 bytes |
| bake | `src/world/CoinBadge.js`, 57,022 bytes — the PNG as base64, decoded at runtime by `PngCodec` into a `DataTexture` |

**Why base64 in a module rather than a file under `public/assets/`.** Two reasons, both of them
faults this project has already paid for:

- **No URL.** §666 is the class of production-only fault a runtime asset URL creates, and it is
  worse than that here: `Props` and `Pickups` both build from this, and a `fetch` of a relative URL
  in Node *does not reject — it never settles* (`CarmelitaGuard.js:330`), so a missing asset would
  **hang** the suite rather than fail it.
- **No canvas.** `PngCodec`'s own header measures a 2D canvas losing up to **±184 on red** for any
  map carrying alpha. This one is 21% transparent, which is precisely that case.

`decodeCoinBadge()` therefore runs identically in the browser and under `node --test`, and the
badge is a thing the suite can assert rather than a browser-only branch.

The **source bytes are committed verbatim** as `Badge_Coin_V2.png` beside this file, so the numbers
above can be checked against the bytes rather than believed, and so the bake is re-runnable without
the Godot checkout. `staging/` is git-kept and outside Vite's copy path — the arrangement
`tests/bundle.test.mjs` documents for exactly this — so the 47 KB source does not ship twice.

```
node tools/godot2coin.mjs --import --src <checkout root>   # checkout → staged png + baked module
node tools/godot2coin.mjs                                  # measure the committed module
SIZE=128 node tools/godot2coin.mjs --import --src <root>   # a different bake resolution
```

## What was deliberately NOT taken

- **`Scripts/pickup_coin.gd`.** Design references and adapted mechanics only, for code. The pickup
  logic here was already ours, and `Pickups.js` is the only module that may emit `coin`.
- **Their `StandardMaterial3D`.** Reading (b) in §712 — evaluated against our cel ramp and not
  shipped. Their `emission` at full coin gold and their `clearcoat` are a physically-shaded look;
  ours is a three-band toon ramp with an inverted-hull ink outline. The numbers are recorded in
  §712 so the decision can be revisited without re-reading their scene.
- **Their coin's SIZE.** `top_radius 0.25` is not inherited. Ours is `PropKit.COIN_RADIUS` = 0.24,
  which came from the owner's "50% larger" applied to our own authored 0.16 — the arithmetic is
  ours and landing 0.01 m from theirs is a coincidence worth noting and not a derivation.
- **Anything under `Assets/Music/` or `Assets/Effects/`.** Untouchable, per this project's absolute
  rule; `tools/godot2coin.mjs` reads exactly one path and it is the PNG named above.
