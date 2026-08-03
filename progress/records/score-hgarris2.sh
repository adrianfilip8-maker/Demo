#!/bin/sh
# Score PREREG-hgarris2. Both arms are the same commit, so this is a straight control->shipped
# diff; there is no baseline directory to trust and no interval to argue about.
#   sh progress/records/score-hgarris2.sh [offDir] [onDir]
# No capture lock, ~4 min.
set -e
OFF=${1:-shots/arris2-off}
ON=${2:-shots/arris2-on}
R=progress/records
T=${TMPDIR:-/tmp}/hgarris2
mkdir -p $T

echo "=== PROVENANCE — the control arm must say so in its own report.json"
for D in "$OFF" "$ON"; do
  printf '%s: ' "$D"
  node -e "const r=require('/home/user/Demo/$D/report.json');
    const w=[].concat(r.bootWarnings||[],r.warnings||[]).filter(s=>/A\/B CONTROL BUILD/.test(s));
    console.log(r.commit?('sha '+r.commit.sha+(r.commit.dirty?'+dirty':'')):'no sha', '|', w.length?w[0]:'*** no A/B stamp — this is a SHIPPED build ***');"
done

echo
echo "=== P1 / P3 / P4 / P5 / P6 — per-material band stats (eroded 3 px)"
for S in traversal interior temple hero; do
  node $R/matflat.mjs $OFF/$S.png $S --erode 3 --json $T/$S-off.json > /dev/null
  node $R/matflat.mjs $ON/$S.png  $S --erode 3 --json $T/$S-on.json  > /dev/null
done
node $R/hgarris2diff.mjs $T

echo
echo "=== P2 — busy guard: squint sd at 1/8 inside the hieroglyph_wall mask"
for S in traversal interior temple; do
  [ -f "$T/$S-mask.bin" ] || node $R/matmask.mjs $S 1280 720 $T/$S-mask.bin >/dev/null
  echo "--- $S"
  node $R/hgframe.mjs $OFF/$S.png $T/$S-mask.bin arch:hieroglyph_wall 2>/dev/null | head -1
  node $R/hgframe.mjs $ON/$S.png  $T/$S-mask.bin arch:hieroglyph_wall 2>/dev/null | head -1
done

echo
echo "=== P7 — the image. Crops to open at 4x and 8x:"
echo "  node tools/crop.mjs $OFF/interior.png  /tmp/P7-int-off.png  660  60 240 180 8"
echo "  node tools/crop.mjs $ON/interior.png   /tmp/P7-int-on.png   660  60 240 180 8"
echo "  node tools/crop.mjs $OFF/traversal.png /tmp/P7-trav-off.png 300 300 320 240 4"
echo "  node tools/crop.mjs $ON/traversal.png  /tmp/P7-trav-on.png  300 300 320 240 4"
echo "  node tools/crop.mjs $ON/hero.png       /tmp/P7-hero-on.png  400 260 300 220 8   # gilded spec ring"
echo "  node tools/crop.mjs $ON/temple.png     /tmp/P7-temple-on.png 380 200 300 220 4  # column register"
