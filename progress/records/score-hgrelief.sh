#!/bin/sh
# Score PREREG-hgrelief against a capture directory. One command, no lock, ~3 min.
#   sh progress/records/score-hgrelief.sh shots/tx9
# Baselines are shots/critic6 (1bc8938); they are printed inline so the comparison is
# self-contained. The masks are rebuilt from the CURRENT tree — see matmask.mjs's SCOPE block
# for what that misattributes.
set -e
DIR=${1:-shots/tx9}
R=progress/records
T=${TMPDIR:-/tmp}/hgscore
mkdir -p $T
for S in traversal interior; do
  [ -f "$T/$S-mask.bin" ] || node $R/matmask.mjs $S 1280 720 $T/$S-mask.bin >/dev/null
done
echo "=== P1 / P4  (fineMed + cov1 per material; hieroglyph_wall is P1, the rest are P4 nulls)"
echo "--- baseline shots/critic6 ---"
node $R/matflat.mjs shots/critic6/traversal.png traversal --erode 3 | head -8
node $R/matflat.mjs shots/critic6/interior.png  interior  --erode 3 | head -6
echo "--- candidate $DIR ---"
node $R/matflat.mjs $DIR/traversal.png traversal --erode 3 | head -8
node $R/matflat.mjs $DIR/interior.png  interior  --erode 3 | head -6
echo
echo "=== P2 / P3  (squint sd at 1/8, and horizontal ACF inside the hieroglyph mask)"
echo "baseline traversal: squintSD 0.0578   ACF max lag30-300 = 30 @ 0.402"
echo "baseline interior : squintSD 0.0592   ACF max lag30-300 = 39 @ 0.399"
node $R/hgframe.mjs $DIR/traversal.png $T/traversal-mask.bin arch:hieroglyph_wall --band 300,420
node $R/hgframe.mjs $DIR/interior.png  $T/interior-mask.bin  arch:hieroglyph_wall --band 60,200
echo
echo "=== P5 is the image. Crops to look at (4x):"
echo "  node tools/crop.mjs $DIR/traversal.png /tmp/P5-trav.png 236 288 300 220 4"
echo "  node tools/crop.mjs $DIR/interior.png  /tmp/P5-int.png  660   0 300 220 4"
