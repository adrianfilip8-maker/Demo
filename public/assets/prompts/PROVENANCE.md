# Kenney Input Prompts (PS4 glyphs) — provenance

**Source:** Input Prompts (1.3), created and distributed by Kenney, <https://kenney.nl> —
pack page <https://kenney.nl/assets/input-prompts>, pack creation date 03-04-2025 per its own
licence file.

**Licence: Creative Commons Zero (CC0 1.0)** — <http://creativecommons.org/publicdomain/zero/1.0/>.
The pack's own licence file is kept verbatim beside this note as `LICENSE.txt`, and states: *"You
can use this content for personal, educational, and commercial purposes."* Crediting Kenney is
explicitly **not a requirement**; this file exists anyway, for the same reason `kaykit/PROVENANCE.md`
does — a project that ships should be able to say where every asset came from without relying on
someone's memory.

**The route, recorded because it was not the front door:** kenney.nl is unreachable from the
container this was built in (the egress proxy refuses the CONNECT, verified 2026-08-21). The files
were instead fetched from the public GitHub mirror
<https://github.com/Maaack/Kenney-Input-Prompts> at commit `dd37497` (2025-04-03), directory
`PlayStation Series/Vector/`, over `raw.githubusercontent.com`; every copy here was verified
byte-identical (`cmp`) against that mirror's checkout, and `LICENSE.txt` is the mirror's
`License.txt` unmodified. Two facts make the mirror licence-sound rather than merely convenient:
CC0 is irrevocable for copies already distributed under it, and the mirror redistributes the pack
whole, licence file included. Worth knowing for anyone refreshing these: the search index reports
that the CURRENT pack revision on kenney.nl no longer includes the PlayStation series at all (the
1.3 mirror predates that removal), so "re-download from the source" may not reproduce these files —
which is exactly why the mirror commit is pinned here.

**What was taken:** 12 of the pack's ~1,500 glyphs — only the ones the HUD actually renders
(`src/ui/Icons.js` `PAD_GLYPH_FILES` is the consuming table, and `tests/input.test.mjs` asserts the
two lists stay equal in both directions):

- `playstation_button_color_cross/circle/square/triangle.svg` — the four face buttons, in the
  pack's colour variants (cross `#7C66E8`, circle `#FF6666`, square `#FF69F8`, triangle `#40E2A0`)
- `playstation_trigger_l1/l2/r1/r2.svg` — shoulders and triggers
- `playstation_button_r3.svg` — stick click (camera recentre)
- `playstation4_button_options.svg` — the PS4 Options button
- `playstation_stick_l.svg`, `playstation_stick_r.svg` — move / look sticks

**Files are verbatim** — no retint, no edit. The glyphs are white-on-transparent (the four colour
face buttons excepted), so `Icons.padBtn` composites each one onto the HUD's own dark ink cap
rather than the parchment the keycaps use; contrast is solved at composition time, in code, and
the assets stay exactly what Kenney shipped.

**Why `public/` and not `src/assets/`:** same reason as `kaykit/` — these are fetched at runtime
by URL (SVG `<image href>` from `Icons.js`), served from the app's own origin, copied verbatim
into `dist/` by Vite. Nothing is fetched from an external host at runtime; the licence and this
note travel with the files.
