#!/usr/bin/env bash
# Guard for appending to a file several agents write to (KNOWN_ISSUES.md above all).
#
# WHY THIS IS A SCRIPT AND NOT A HABIT — KNOWN_ISSUES §14.8, §14.9.
# Twice in one session the coordinator committed another agent's unread work by staging a
# SHARED file by explicit name. The second time was worse than the first: the check had already
# been written into the ledger as a rule, it was actually run, and its output was ignored —
# because the command was
#
#     git diff --stat -- KNOWN_ISSUES.md ; echo "(empty = safe to append)"
#
# and that `echo` prints the same verdict whether the diff is empty or four hundred lines long.
# A check whose conclusion does not depend on its measurement is not a check. It is the §39 /
# §43 / §50 family — an instrument that returns "healthy" for every input — hand-built, one
# commit after recording the rule it was meant to enforce.
#
# So: this EXITS NON-ZERO. It cannot be misread, because it refuses rather than reports.
#
#   tools/preappend.sh KNOWN_ISSUES.md   && <append> && git add ... && git commit ...
#
# On a non-empty diff it prints the other author's lines and stops. Read them, then either name
# them in your commit message or commit them separately with credit — and take your next section
# number from the DIFF, not from HEAD, because an uncommitted §N may already exist above where
# you are about to write §N.
set -u
f="${1:-KNOWN_ISSUES.md}"
cd "$(git rev-parse --show-toplevel)" || exit 2

if ! git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
  echo "preappend: '$f' is not tracked — nothing to collide with." >&2
  exit 0
fi

n=$(git diff --numstat -- "$f" | awk '{print $1+$2}')
n=${n:-0}

if [ "$n" -eq 0 ]; then
  echo "preappend: '$f' is clean at $(git rev-parse --short HEAD). Safe to append."
  exit 0
fi

echo "preappend: REFUSING — '$f' has $n uncommitted line(s) from another author." >&2
echo "--- their work, which you are about to stage under your own commit message ---" >&2
git diff -- "$f" >&2
echo "--- end ---" >&2
echo "Read it. Name it in your message or commit it separately with credit." >&2
echo "Then number your section from THIS diff, not from HEAD." >&2
exit 1
