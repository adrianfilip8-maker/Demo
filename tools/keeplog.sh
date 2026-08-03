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

# Idempotence: if the body is already preserved unchanged, leave the file alone. Re-running this
# is ENCOURAGED by the standing capture routine, and rewriting the header every time produced
# commits whose entire diff was a fresher timestamp — noise that makes a real log change hard to
# spot. It also drifts the header further from the run on each invocation, which is the defect
# below.
# Strip the header by matching its TERMINATOR, not by a line count. The first version used
# `tail -n +8`, which was correct for the 7-line header it was written against and would have
# silently compared header text against log text the moment the header changed length — which it
# does in this very commit, going to 8 lines. A hardcoded offset into a format you are editing in
# the same change is a bug with a fuse on it. `^# -\+$` matches the all-dashes closing rule and
# not line 1, which carries text.
# ...but idempotence must not freeze a stale HEADER in place, which is what it did on first test.
# The header below was corrected in the same commit that added this check, and because every
# existing log's BODY was unchanged, not one of them would ever have received the correction —
# the misleading `# tree:` line would have been preserved forever by the very guard meant to
# reduce noise. So the body test is necessary and not sufficient: an old-format header (one
# lacking the marker) forces a rewrite regardless.
HDR_MARKER="NOT the run's build"
if [ -f "$out" ] && grep -q "$HDR_MARKER" "$out" && sed '1,/^# -\+$/d' "$out" | cmp -s - "$log"; then
  echo "keeplog: '$out' already holds this log unchanged — not rewriting."
  exit 0
fi

{
  echo "# ---- run log preserved by tools/keeplog.sh ----"
  echo "# run:      $run"
  echo "# source:   $log"
  echo "# copied:   $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  # The commit below is WHERE THE TREE STOOD WHEN THIS COPY WAS TAKEN. It is *not* the commit the
  # run rendered against, and the two can be far apart — a capture that waits an hour in the queue
  # and is copied afterwards will stamp a commit made long after it started. fx19 rendered under
  # 52d4a43 and a re-copy stamped db803df, which a reader would reasonably have read as the run's
  # build. Labelled explicitly rather than left to be inferred; the run's OWN manifest
  # (report.json / <run>.json) is the authority on what it rendered against.
  echo "# tree at copy time (NOT the run's build): $(git rev-parse --short HEAD)$( [ -n "$(git status --porcelain)" ] && echo ' — working tree DIRTY')"
  echo "#   For the commit this run actually rendered, read shots/$run/report.json or $run.json."
  echo "# NOTE: this is a COPY. The scratchpad original is ephemeral and may already be gone."
  echo "# ------------------------------------------------"
  cat "$log"
} > "$out"

echo "keeplog: $(wc -l < "$out") lines -> $out"
echo "  now: git add $out && commit. An unpushed log is not a durable log."
