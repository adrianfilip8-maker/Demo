#!/bin/bash
# Take the edit window for the candidate-1 gate patch, atomically and hazard-inverted.
#
# §121.4's fatal case is editing src/** while another arm BOOTS after the edit. The condition is
# therefore: no lock holder, and no live queue ticket. This script re-checks that at the instant
# it runs, and INVERTS the hazard rather than relying on timing.
#
# ---------------------------------------------------------------------------------------------
# THE LOCK PATH IS DERIVED FROM lock.mjs, NEVER TRANSCRIBED. Read this before "fixing" it.
#
# This gate has now been wrong once in each direction from a hand-carried constant:
#   - a poke asserted the lock file was `/tmp/sands-of-ra/lock`; it is `capture.lock`
#     (lock.mjs: `const LOCK = path.join(DIR, 'capture.lock')`), and pointing the gate at the
#     non-existent name made the check pass unconditionally — the gate reported "window open"
#     during every capture, which is the exact hazard it exists to prevent.
# That is why the name is now PARSED OUT OF lock.mjs at run time and the script REFUSES TO RUN
# if the parse fails. A constant that can be transcribed will eventually be transcribed wrong;
# a derived one cannot drift from its source without the source changing.
#
# It also honours SANDS_LOCK_DIR exactly as lock.mjs does, so a redirected lock dir cannot leave
# this gate watching the default one.
#
# Second correctness point, established separately (CHARACTER): `lock.mjs` calls dropTicket()
# IMMEDIATELY ON ACQUISITION, so THE QUEUE IS EMPTY WHILE A CAPTURE HOLDS THE LOCK. The ticket
# scan therefore cannot stand in for the lock check — during a capture the lock file is the only
# signal there is. Both gates are required; neither is redundant.
#
# Third: `lock.mjs` evicts on LIVENESS, not age, so a lock file naming a dead pid is stale and
# must NOT block forever. A stale lock is reported and treated as open.
#
# Fails closed everywhere: any check that does not pass leaves src/** untouched.
set -u
S=/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad
R=/home/user/Demo
SRC=$R/src/fx/Particles.js
CAND=$R/progress/records/cand1/Particles.cand1.js

# ---- 0. derive the lock/queue paths from lock.mjs; refuse to run if that fails ----
LOCKDIR=${SANDS_LOCK_DIR:-/tmp/sands-of-ra}
LOCKNAME=$(sed -n "s/^const LOCK *= *path\.join(DIR, *'\([^']*\)').*/\1/p"  $R/tools/lock.mjs | head -1)
QNAME=$(   sed -n "s/^const QUEUE *= *path\.join(DIR, *'\([^']*\)').*/\1/p" $R/tools/lock.mjs | head -1)
if [ -z "$LOCKNAME" ] || [ -z "$QNAME" ]; then
  echo "REFUSING: could not derive lock/queue names from tools/lock.mjs (got LOCK='$LOCKNAME' QUEUE='$QNAME')."
  echo "          Fix the parse — do NOT hardcode a path here. src/** untouched."
  exit 7
fi
LOCK=$LOCKDIR/$LOCKNAME
Q=$LOCKDIR/$QNAME
echo "gate paths (derived from tools/lock.mjs): LOCK=$LOCK  QUEUE=$Q"

# ---- helper: is the lock held by a LIVE process? ----
# echoes "" when open, or a description when genuinely held.
lock_holder() {
  [ -f "$LOCK" ] || return 0
  local pid; pid=$(cut -d' ' -f1 "$LOCK" 2>/dev/null)
  if [ -n "$pid" ] && [ -d /proc/$pid ]; then
    echo "pid $pid ($(tr '\0' ' ' < /proc/$pid/cmdline 2>/dev/null | cut -c1-60))"
  else
    echo "" ; STALE_LOCK="pid ${pid:-?}"
  fi
}
STALE_LOCK=""

# ---- 1. plant a live ticket FIRST, then re-check (the only safe ordering) ----
# Planting before the check closes the gap between "checked clear" and "started editing":
# anything that arrives in that interval either sees this ticket and queues behind it, or has
# already taken the lock and is seen by the re-check below. Neither side can slip through.
mkdir -p "$Q"
sleep 900 &
HOLD=$!
TICKET=$Q/$(date +%s%3N)-$HOLD
: > "$TICKET"
cleanup() { kill $HOLD 2>/dev/null; rm -f "$TICKET"; }
echo "ticket planted: $(basename "$TICKET") (holder pid $HOLD)"

HELD=$(lock_holder)
if [ -n "$HELD" ]; then
  echo "WINDOW CLOSED: lock held by $HELD"; cleanup; exit 1
fi
[ -n "$STALE_LOCK" ] && echo "NOTE: stale lock file present naming dead $STALE_LOCK — treated as OPEN (lock.mjs evicts on liveness)"

for t in $(ls "$Q" 2>/dev/null); do
  pid=${t##*-}
  [ "$pid" = "$HOLD" ] && continue                       # our own ticket
  if [ -d /proc/$pid ]; then
    echo "WINDOW CLOSED: live ticket $t ($(tr '\0' ' ' < /proc/$pid/cmdline 2>/dev/null | cut -c1-50))"
    cleanup; exit 1
  fi
done
echo "WINDOW OPEN: no live lock holder, no live foreign ticket (re-checked AFTER planting)"

# ---- 1b. what else is alive that ignores the lock entirely? ----
# `reliefreach.mjs` was found rendering with no acquire()/withGame at all. Such a process cannot
# change our pixels, but one that also EDITS src/** could. Survey and report rather than guess.
echo "other node processes alive at take time:"
found=0
for d in /proc/[0-9]*; do
  cl=$(tr '\0' ' ' < $d/cmdline 2>/dev/null)
  case "$cl" in
    *node*) p=${d#/proc/}; [ "$p" = "$$" ] && continue
            echo "   pid $p: $(echo "$cl" | cut -c1-72)"; found=1;;
  esac
done
[ "$found" = 0 ] && echo "   (none)"

# `--dry` exercises THIS code path — the real one, not a copy — and stops before touching
# src/**. Testing a transcribed duplicate of a gate is how a gate ships broken.
if [ "${1:-}" = "--dry" ]; then
  echo "DRY RUN: gates evaluated, src/** untouched, ticket released."
  cleanup; exit 0
fi

# ---- 2. verify the tree is the one the candidate was derived from ----
if ! [ -f "$CAND" ]; then echo "ABORT: candidate missing"; cleanup; exit 2; fi
cp "$SRC" "$S/Particles.prepatch.bak"
if diff -q "$SRC" "$CAND" >/dev/null; then echo "ABORT: already applied (src == candidate)"; cleanup; exit 3; fi
NOW_HUNKS=$(diff -u "$SRC" "$CAND" | grep -c '^@@')
REC_HUNKS=$(grep -c '^@@' "$R/progress/records/cand1/cand1.patch")
if [ "$NOW_HUNKS" != "$REC_HUNKS" ]; then
  echo "ABORT: src drifted since the candidate was recorded ($NOW_HUNKS hunks now vs $REC_HUNKS recorded)"
  echo "       re-derive the candidate against the current file rather than forcing this."
  cleanup; exit 4
fi

# ---- 3. apply, syntax-check, revert on failure ----
cp "$CAND" "$SRC"
if ! node --check "$SRC" >/dev/null 2>&1; then
  echo "ABORT: node --check failed on the patched file — reverting"
  cp "$S/Particles.prepatch.bak" "$SRC"; cleanup; exit 5
fi
echo "PATCH APPLIED to src/fx/Particles.js ($NOW_HUNKS hunks), syntax OK"
grep -q "backdropGate" "$SRC" && echo "  verified: TUNE.backdropGate present"
grep -q "_copyBackdrop" "$SRC" && echo "  verified: _copyBackdrop present"

# ---- 4. launch the capture, then release the ticket ----
cd "$S"
nohup node fx22.mjs > fx22.log 2>&1 &
sleep 6
PID=""
for d in /proc/[0-9]*; do
  cl=$(tr '\0' ' ' < $d/cmdline 2>/dev/null)
  case "$cl" in *fx22.mjs*) case "$cl" in *bash*|*grep*) ;; *) PID=${d#/proc/};; esac;; esac
done
if [ -z "$PID" ]; then echo "WARNING: fx22 did not start; ticket released, patch left applied"; cleanup; exit 6; fi
echo $PID > $S/fx22.pid
PP=$(awk '{print $4}' /proc/$PID/stat)
if [ "$PP" != "1" ]; then kill $PP 2>/dev/null; sleep 2; PP=$(awk '{print $4}' /proc/$PID/stat 2>/dev/null); fi
echo "fx22 launched pid $PID ppid $PP"
cleanup
echo "ticket released — fx22 now owns its own place in the queue"
