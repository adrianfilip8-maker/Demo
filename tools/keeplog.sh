#!/usr/bin/env bash
# Make a capture's run log durable BEFORE it is scored.
#
# WHY THIS EXISTS — KNOWN_ISSUES §88, flagged by SHADING against its own run.
#
# A capture produces three artefacts and they do not have the same lifetime:
#
#   shots/<run>/*.png          on disk, survives a container restart? NO (not tracked)
#   progress/records/*.md      tracked, pushed                        YES
#   scratchpad/<run>.log       ephemeral                              NO
#
# The log is the one people forget, and it is often the only place the *applied-state readback*
# lives — the lines that decide whether an arm is VOID, whether a duplicate arm bracketed, whether
# the knob the seal names actually reached the shader. §40, §52.1 and §80.5 all turn on readback
# lines. If the log dies, a seal can still be "scored" against numbers whose validity is no longer
# checkable, which is worse than not scoring it.
#
# §83 destroyed thirty hours of scratchpad. The commits survived because they were pushed. So:
#
#   tools/keeplog.sh <run-name> [path-to-log]
#
# copies the log into progress/records/logs/<run>.log with a provenance header, so it is tracked,
# committed and pushed with everything else. Run it when the capture lands and BEFORE scoring.
set -u
run="${1:?usage: keeplog.sh <run-name> [logfile]}"
cd "$(git rev-parse --show-toplevel)" || exit 2

log="${2:-}"
if [ -z "$log" ]; then
  for c in "${TMPDIR:-/tmp}"/claude-*/*/*/scratchpad/"$run".log \
           "$HOME/scratchpad/$run.log" "scratchpad/$run.log"; do
    [ -f "$c" ] && { log="$c"; break; }
  done
fi

if [ -z "$log" ] || [ ! -f "$log" ]; then
  echo "keeplog: no log found for '$run' — pass the path explicitly." >&2
  exit 1
fi

mkdir -p progress/records/logs
out="progress/records/logs/$run.log"
{
  echo "# ---- run log preserved by tools/keeplog.sh ----"
  echo "# run:      $run"
  echo "# source:   $log"
  echo "# copied:   $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "# tree:     $(git rev-parse --short HEAD)$( [ -n "$(git status --porcelain)" ] && echo ' (DIRTY at copy time)')"
  echo "# NOTE: this is a COPY. The scratchpad original is ephemeral and may already be gone."
  echo "# ------------------------------------------------"
  cat "$log"
} > "$out"

echo "keeplog: $(wc -l < "$out") lines -> $out"
echo "  now: git add $out && commit. An unpushed log is not a durable log."
