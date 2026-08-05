# RESULT — fx22 r4: candidate 1 (backdropGate) scored against PREREG-sandhigh.md Amendment 1, arms D1–D4

**Status: SCORING IN PROGRESS — this file is written incrementally (§163–§164 rollback cadence).
Sections land as arms compute; the VERDICT block at the bottom is the decision.**

Scored by a fresh FX agent (all prior transcripts lost to rollbacks) from committed evidence only.
The sealed scorer `progress/records/cand1/fx22an.mjs` was run **unmodified**; this file reports its
output and applies the registered wording. Per the scorer's own footer: *"This file evaluates; the
RESULT decides, after the crops have been looked at."*

## Provenance

- **Run**: fx22 r4, four chunks per §164.1 (`temple` / `hero+dunes` / `courtyard+night` /
  `interior`), each chunk one boot, every registered comparison within its chunk's boot (pairs share
  the boot; `temple.back` rides the temple chunk). Run logs:
  `progress/records/logs/fx22-r4c{1,2,3,4}.log` — all four end `fx22 DONE`.
- **Tree**: `src/**/*.js` hash at scoring = `3fea650a4d645857e4843149d19e5445f133ac33172a321c128517a87a7a7a57`
  = prelaunch stamp = the registered stamp in `cand1/fx22.treehash.json` (postrun field now filled).
  The tree never moved across the r4 window; §121.4 closed for this run. Head at prelaunch: `47de8f1`,
  0 dirty src files.
- **Evidence scored**: the COMMITTED copies under `progress/records/cand1/frames/` (13 PNGs +
  `fx22.json`, landed across commits 8391e43…efef525). Verified byte-identical (sha256) to the live
  `shots/fx22/` copies, then copied over them so the scorer's fixed paths read committed bytes.
- **Renderer**: SwiftShader (software raster) in all four boots; frame-time cost of the extra
  backdrop pass remains **unmeasured, not estimated** (§148.1).

### Evidence sha256 (committed == live verified before scoring)

| file | sha256 |
|---|---|
| temple.base.png | 221685c77d853f4cc4cf450e0a973a574541167d5d9c1a482fcc1576dc2b3ef3 |
| temple.back.png | 221685c77d853f4cc4cf450e0a973a574541167d5d9c1a482fcc1576dc2b3ef3 (== base, byte-identical) |
| temple.gated.png | 06b58497259d67455f2a8f25911f42e5ee2c362806c60a55a990a8646d3f456b |
| hero.base.png / hero.gated.png | 33d4af14c5d1dcbb3f043bfa2117cca479fe76fe73ca4ff4b48c08e1122826d0 (identical pair) |
| dunes.base.png / dunes.gated.png | bd6c664d64da04ecfc3c46d8932c328cc40a400791b2b77eddf474ab6c8e6c19 (identical pair) |
| courtyard.base.png | a59ed531ea4452669c0a64d9595804d9ae64f409c6f89599e23827d4fa2b2338 |
| courtyard.gated.png | fd9327ea7b24e084691992eb209dbf4557be8355874cee5f7d3613002fc371e2 |
| night.base.png | cab03f7b6bafe71f01c7ea3f2b2d4d5b21aa30a9f9c016451d11106e163a6420 |
| night.gated.png | 31e89b0b1189860aed9492bac6e7fa5d5860c025d7b16524a5991e7c8967253f |
| interior.base.png | 9d720634a6ff25161a170aecf6ee9f0ad1732129fb82b3ead7b1646885bcec97 |
| interior.gated.png | ae07095f70e51de2ae93ac104777908a25ed0c9817d5a2ba0244d8bffd2a0f99 |
| fx22.json | d62a735116676d3734eb4aae9b08118d1f5d6848eb8ee1571f2171f650ebcd68 |

Scorer output preserved verbatim at `progress/records/logs/fx22an-r4.log`.

---

*(arms below are appended as they compute)*
