#!/bin/sh
# Score PREREG-goldspec. Three arms, one tree, one knob; there is no baseline directory to
# trust and no interval to argue about.
#   sh progress/records/score-goldspec.sh [maskdir]
# No capture lock. Masks are built once if absent (~1 min each).
set -e
R=progress/records
M=${1:-${TMPDIR:-/tmp}/goldspec-masks}
mkdir -p "$M"

echo "=== PROVENANCE — the two control arms must stamp themselves, the shipped arm must not"
for D in shots/gs-pol0 shots/gs-ship shots/gs-x8; do
  printf '%s: ' "$D"
  node -e "const r=require('/home/user/Demo/$D/report.json');
    const w=[].concat(r.bootWarnings||[],r.warnings||[]).filter(s=>/A\/B CONTROL BUILD/.test(s));
    console.log(r.at, r.commit?('sha '+r.commit.sha+(r.commit.dirty?'+dirty':'')):'no sha', '|', w.length?w[0]:'*** no A/B stamp — SHIPPED build ***');" \
    || echo "MISSING"
done

for S in sly-startle sly-key; do
  [ -f "$M/$S-mask.bin" ] || node $R/matmask.mjs $S 1280 720 "$M/$S-mask.bin" >/dev/null
done

echo
echo "=== P1 — pol0 -> ship   (the shipped notch; a NULL is the registered expectation)"
for S in sly-startle sly-key; do node $R/goldspecdiff.mjs shots/gs-pol0 shots/gs-ship $S "$M" --json "$M/P1-$S.json"; echo; done

echo "=== P2 — pol0 -> x8   (calibration: 8.5x the notch. P1 is unquotable without this)"
for S in sly-startle sly-key; do node $R/goldspecdiff.mjs shots/gs-pol0 shots/gs-x8 $S "$M" --json "$M/P2-$S.json"; echo; done

echo "=== P5 — the image. Crops to open (densest gilded window per shot):"
echo "  node tools/crop.mjs shots/gs-pol0/sly-key.png /tmp/P5-key-pol0.png 660 100 240 180 4"
echo "  node tools/crop.mjs shots/gs-ship/sly-key.png /tmp/P5-key-ship.png 660 100 240 180 4"
echo "  node tools/crop.mjs shots/gs-x8/sly-key.png   /tmp/P5-key-x8.png   660 100 240 180 4"
echo "  node tools/crop.mjs shots/gs-x8/sly-startle.png /tmp/P5-st-x8.png 1040 0 240 180 4"
