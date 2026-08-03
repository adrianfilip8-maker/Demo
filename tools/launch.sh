#!/bin/bash
# launch.sh — detach a long capture and FAIL LOUDLY if it did not actually detach.
#
# §78.4's hazard has recurred three times and been caught by a manual /proc walk each time.
# Three catches is not a fluke, it is a launcher that silently does the wrong thing:
# `nohup cmd &` inside a tool-call wrapper leaves node parented to the wrapper shell, and the
# wrapper lingers, so the child dies with the task tree. `setsid` is NOT a fix — it reported
# success on three runs here and detached none of them.
#
# The rule: a launcher that cannot PROVE detachment must refuse, not warn.
#
# Two bugs found by testing this script before trusting it, both recorded because each would
# have made it worse than the manual walk it replaces:
#   1. Verifying ppid while the launcher is still alive reads the LAUNCHER as the parent, so
#      the naive "kill the wrapper" killed the launcher itself (observed: exit 143). The fix
#      is a DOUBLE FORK — the intermediate subshell exits at once and init adopts node — and
#      then verification is of a stable state rather than a transient one.
#   2. A kill step must never be able to target its own ancestry. `is_ancestor` makes that
#      structural rather than a thing to be careful about.
#
#   usage: launch.sh <script.mjs> <logfile> [pidfile] [args...]
#   exit 0 = running AND ppid==1 (pid on stdout, written to pidfile)
#   exit 3 = could not be detached — process KILLED, nothing left running silently
#   exit 4 = never started (INCLUDING: started and crashed immediately, e.g. bad args)
#
# Arg passthrough exists because its absence produced an immediate real failure: a watcher
# launched with no argv crashed on startup, and the launcher correctly reported exit 4. That
# is the intended behaviour — a launcher that had "succeeded" there would have left a dead
# watcher and a run nobody was watching.
set -u
SCRIPT="${1:?usage: launch.sh <script.mjs> <log> [pidfile] [args...]}"
LOG="${2:?need logfile}"
PIDFILE="${3:-}"
shift 3 2>/dev/null || shift $#
ARGS=("$@")
BASE="$(basename "$SCRIPT")"
DIR="$(cd "$(dirname "$SCRIPT")" && pwd)"

[ -f "$SCRIPT" ] || { echo "LAUNCH FAIL: no such script: $SCRIPT" >&2; exit 4; }

# Find the node pid by scanning /proc for our script's basename. Deliberately NOT `pgrep -f`:
# that matches the wrapper shell (whose command line contains the script path) and the grep
# itself, which is exactly how the hazard went unnoticed the first time.
find_pid() {
  local p cl
  for d in /proc/[0-9]*; do
    p="${d#/proc/}"
    cl="$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null)" || continue
    [ -n "$cl" ] || continue
    case "$cl" in
      *"$BASE"*)
        case "$cl" in *bash*|*/bin/sh*|*grep*|*launch.sh*) continue;; esac
        case "$cl" in *node*) echo "$p"; return 0;; esac
      ;;
    esac
  done
  return 1
}
ppid_of() { awk '{print $4}' "/proc/$1/stat" 2>/dev/null; }

# Refuse to kill anything we are descended from. Structural, not vigilance (bug 2 above).
is_ancestor() {
  local target="$1" q="$$"
  while [ -n "$q" ] && [ "$q" != "0" ] && [ "$q" != "1" ]; do
    [ "$q" = "$target" ] && return 0
    q="$(ppid_of "$q")"
  done
  return 1
}

# DOUBLE FORK: the subshell backgrounds node and exits immediately, so init adopts node.
( cd "$DIR" && nohup node "$BASE" "${ARGS[@]}" > "$LOG" 2>&1 & ) &
wait $! 2>/dev/null

PID=""
for _ in $(seq 1 12); do sleep 1; PID="$(find_pid)"; [ -n "$PID" ] && break; done
[ -n "$PID" ] || { echo "LAUNCH FAIL: no node process for $BASE appeared; see $LOG" >&2; exit 4; }

# Let the adoption settle before judging it — the transient state is not the verdict.
PP=""
for _ in 1 2 3 4 5 6; do PP="$(ppid_of "$PID")"; [ "$PP" = "1" ] && break; sleep 1; done

if [ "$PP" != "1" ] && [ -n "$PP" ] && [ "$PP" != "0" ]; then
  if is_ancestor "$PP"; then
    echo "LAUNCH FAIL: parent $PP is my own ancestor — refusing to kill it." >&2
  else
    echo "launch: wrapper $PP lingering (§78.4) — killing it" >&2
    kill "$PP" 2>/dev/null
    for _ in 1 2 3 4 5; do sleep 1; PP="$(ppid_of "$PID")"; [ "$PP" = "1" ] && break; done
  fi
fi

if [ "$PP" != "1" ]; then
  echo "=================================================================" >&2
  echo " LAUNCH FAIL: $BASE runs as pid $PID with ppid $PP, not 1."        >&2
  echo " It would be reaped with this task tree. KILLING it now so the"    >&2
  echo " failure is loud instead of a capture that silently disappears."   >&2
  echo "=================================================================" >&2
  kill "$PID" 2>/dev/null
  exit 3
fi

[ -n "$PIDFILE" ] && echo "$PID" > "$PIDFILE"
echo "$PID"
echo "launch OK: $BASE pid $PID ppid 1 (detached, verified from /proc)" >&2
exit 0
