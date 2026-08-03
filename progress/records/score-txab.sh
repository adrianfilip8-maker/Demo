#!/bin/sh
# Score PREREG-txab. Both arms are the same commit, so this is a straight control→shipped diff;
# there is no baseline directory to trust and no interval to argue about.
#   sh progress/records/score-txab.sh [offDir] [onDir]
# No capture lock, ~3 min.
set -e
OFF=${1:-shots/txab-off}
ON=${2:-shots/txab-on}
R=progress/records
T=${TMPDIR:-/tmp}/txabscore
mkdir -p $T

echo "=== PROVENANCE — the control arm must say so in its own report.json"
for D in "$OFF" "$ON"; do
  printf '%s: ' "$D"
  node -e "const r=require('/home/user/Demo/$D/report.json');
    const w=[].concat(r.bootWarnings||[],r.warnings||[]).filter(s=>/A\/B CONTROL BUILD/.test(s));
    console.log(r.commit?('sha '+r.commit.sha+(r.commit.dirty?'+dirty':'')):'no sha', '|', w.length?w[0]:'*** no A/B stamp — this is a SHIPPED build ***');"
done

echo
echo "=== P1 / P4 / P5  (per-material fine + coarse band contrast, eroded 3 px)"
for S in traversal interior; do
  echo "--- $S  control ---"; node $R/matflat.mjs $OFF/$S.png $S --erode 3 | head -9
  echo "--- $S  shipped ---"; node $R/matflat.mjs $ON/$S.png  $S --erode 3 | head -9
done

echo
echo "=== P3  tiling ACF inside the hieroglyph mask"
for S in traversal interior; do
  [ -f "$T/$S-mask.bin" ] || node $R/matmask.mjs $S 1280 720 $T/$S-mask.bin >/dev/null
done
echo "--- control ---"
node $R/hgframe.mjs $OFF/traversal.png $T/traversal-mask.bin arch:hieroglyph_wall --band 300,420
node $R/hgframe.mjs $OFF/interior.png  $T/interior-mask.bin  arch:hieroglyph_wall --band 60,200
echo "--- shipped ---"
node $R/hgframe.mjs $ON/traversal.png $T/traversal-mask.bin arch:hieroglyph_wall --band 300,420
node $R/hgframe.mjs $ON/interior.png  $T/interior-mask.bin  arch:hieroglyph_wall --band 60,200

echo
echo "=== P6  finding #12 — paving marks with the crack term zeroed"
echo "  node tools/crop.mjs $OFF/sly-key.png /tmp/P6-off.png 300 470 320 220 3"
echo "  node tools/crop.mjs $ON/sly-key.png  /tmp/P6-on.png  300 470 320 220 3"
node $R/matflat.mjs $OFF/sly-key.png sly-key --erode 3 | head -7
node $R/matflat.mjs $ON/sly-key.png  sly-key --erode 3 | head -7

echo
echo "=== P7 is the image. Crops to open at 4x:"
echo "  node tools/crop.mjs $ON/interior.png  /tmp/P7-int-hg.png  660   0 300 220 4   # hieroglyph band"
echo "  node tools/crop.mjs $ON/interior.png  /tmp/P7-int-gran.png 150 120 240 180 4  # tomb granite"
echo "  node tools/crop.mjs $ON/traversal.png /tmp/P7-trav.png    236 288 300 220 4"
