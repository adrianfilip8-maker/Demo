#!/bin/bash
# Take the edit window for the candidate-1 gate patch, atomically and hazard-inverted.
#
# §121.4's fatal case is editing src/** while another arm BOOTS after the edit. The condition
# is therefore: no live queue ticket, and no lock holder. This script re-checks that at the
# instant it runs (not when it was scheduled), and then INVERTS the hazard rather than relying
# on timing: it plants its own live ticket BEFORE touching a file, so any arm arriving mid-edit
# queues behind it instead of booting into a half-applied tree.
#
# Fails closed everywhere: any check that does not pass leaves src/** untouched.
set -u
S=/tmp/claude-0/-home-user-Demo/94022f73-a328-5e86-b2ec-031aa9c720ce/scratchpad
R=/home/user/Demo
Q=/tmp/sands-of-ra/queue
SRC=$R/src/fx/Particles.js
CAND=$R/progress/records/cand1/Particles.cand1.js

# ---- 1. re-verify the window, now ----
if [ -f /tmp/sands-of-ra/capture.lock ]; then
  echo "WINDOW CLOSED: lock held by $(cat /tmp/sands-of-ra/capture.lock 2>/dev/null | cut -d' ' -f1)"; exit 1; fi
for t in $(ls $Q 2>/dev/null); do
  pid=${t##*-}
  if [ -d /proc/$pid ]; then echo "WINDOW CLOSED: live ticket $t ($(tr '\0' ' ' < /proc/$pid/cmdline | cut -c1-50))"; exit 1; fi
done

# ---- 2. plant a live ticket BEFORE editing (hazard inversion) ----
mkdir -p $Q
sleep 900 &
HOLD=$!
TICKET=$Q/$(date +%s%3N)-$HOLD
: > $TICKET
echo "ticket planted: $TICKET (holder pid $HOLD)"
cleanup() { kill $HOLD 2>/dev/null; rm -f $TICKET; }

# ---- 3. verify the tree is the one the candidate was derived from ----
if ! [ -f "$CAND" ]; then echo "ABORT: candidate missing"; cleanup; exit 2; fi
cp "$SRC" "$S/Particles.prepatch.bak"
if diff -q "$SRC" "$CAND" >/dev/null; then echo "ABORT: already applied (src == candidate)"; cleanup; exit 3; fi
# The candidate is a full-file derivative of the CURRENT src; if src has drifted since it was
# made, the diff will contain hunks the patch record does not describe. Compare hunk counts.
NOW_HUNKS=$(diff -u "$SRC" "$CAND" | grep -c '^@@')
REC_HUNKS=$(grep -c '^@@' "$R/progress/records/cand1/cand1.patch")
if [ "$NOW_HUNKS" != "$REC_HUNKS" ]; then
  echo "ABORT: src drifted since the candidate was recorded ($NOW_HUNKS hunks now vs $REC_HUNKS recorded)"
  echo "       re-derive the candidate against the current file rather than forcing this."
  cleanup; exit 4
fi

# ---- 4. apply, syntax-check, revert on failure ----
cp "$CAND" "$SRC"
if ! node --check "$SRC" >/dev/null 2>&1; then
  echo "ABORT: node --check failed on the patched file — reverting"
  cp "$S/Particles.prepatch.bak" "$SRC"; cleanup; exit 5
fi
echo "PATCH APPLIED to src/fx/Particles.js ($NOW_HUNKS hunks), syntax OK"
grep -q "backdropGate" "$SRC" && echo "  verified: TUNE.backdropGate present"
grep -q "_copyBackdrop" "$SRC" && echo "  verified: _copyBackdrop present"

# ---- 5. launch the capture, then release the ticket ----
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
