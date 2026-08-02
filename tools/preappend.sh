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
# RESIDUAL GAP, CLOSED BY --verify (KNOWN_ISSUES §64.1). The check above guards the moment you
# READ. Staging happens later, and anything another agent writes in between is swept in anyway.
# That is not hypothetical: commit ee9c23a added 152 lines, of which ~110 were named in its
# message; the remaining ~45 were a section written between the read and the `git add`.
#
#   tools/preappend.sh KNOWN_ISSUES.md            # before appending; records a stamp
#   …append…
#   tools/preappend.sh --verify KNOWN_ISSUES.md   # before `git add`; refuses if others' work grew
#
# --verify compares the CURRENT other-author diff against the one recorded at check time. Your own
# append is excluded by construction: the stamp is taken from the file as it stood before you
# touched it, so only foreign growth can move it.
set -u
MODE=check
if [ "${1:-}" = "--verify" ]; then MODE=verify; shift; fi
f="${1:-KNOWN_ISSUES.md}"
cd "$(git rev-parse --show-toplevel)" || exit 2
stampdir="${TMPDIR:-/tmp}/preappend-stamps"
mkdir -p "$stampdir"
stamp="$stampdir/$(echo "$f" | tr '/' '_').stamp"

if [ "$MODE" = verify ]; then
  if [ ! -f "$stamp" ]; then
    echo "preappend --verify: no stamp for '$f' — run the check before appending." >&2
    exit 2
  fi
  read -r was_bytes was_sha < "$stamp"
  # You append to the END, so the file must still START with exactly the bytes recorded at check
  # time. A foreign write anywhere in that prefix — which is where other agents edit, since they
  # correct at declaration sites — breaks the prefix hash. Comparing the index would NOT catch it:
  # an unstaged working-tree write by another agent leaves the index untouched.
  now_bytes=$(wc -c < "$f")
  if [ "$now_bytes" -lt "$was_bytes" ]; then
    echo "preappend --verify: REFUSING — '$f' SHRANK since the check ($was_bytes -> $now_bytes bytes)." >&2
    exit 1
  fi
  now_sha=$(head -c "$was_bytes" "$f" | sha256sum | cut -d' ' -f1)
  if [ "$now_sha" != "$was_sha" ]; then
    echo "preappend --verify: REFUSING — '$f' changed BENEATH your append since the check." >&2
    echo "  Another author wrote into the first $was_bytes bytes while you were composing." >&2
    echo "  Re-read the diff and name their work, or commit it separately with credit." >&2
    exit 1
  fi
  echo "preappend --verify: '$f' prefix unchanged ($was_bytes bytes). Safe to stage."
  exit 0
fi

if ! git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
  echo "preappend: '$f' is not tracked — nothing to collide with." >&2
  exit 0
fi

n=$(git diff --numstat -- "$f" | awk '{print $1+$2}')
n=${n:-0}

if [ "$n" -eq 0 ]; then
  printf '%s %s\n' "$(wc -c < "$f")" "$(sha256sum < "$f" | cut -d' ' -f1)" > "$stamp"
  echo "preappend: '$f' is clean at $(git rev-parse --short HEAD). Safe to append."
  echo "  stamped $(wc -c < "$f") bytes — run 'tools/preappend.sh --verify $f' before git add."
  exit 0
fi

echo "preappend: REFUSING — '$f' has $n uncommitted line(s) from another author." >&2
echo "--- their work, which you are about to stage under your own commit message ---" >&2
git diff -- "$f" >&2
echo "--- end ---" >&2
echo "Read it. Name it in your message or commit it separately with credit." >&2
echo "Then number your section from THIS diff, not from HEAD." >&2
exit 1
