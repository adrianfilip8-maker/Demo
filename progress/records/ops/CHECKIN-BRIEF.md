# Recurring check-in brief — Sly Cooper Egypt build

Create as a Routine bound to session `session_01PXtatFVa9WWnKz5zHerfeC`, cron `0 * * * *` (hourly).
Name: `check-in: Sly Egypt build (recurring)`

Why recurring and not `send_later`: every prior check-in was a one-shot. Each fired, disabled
itself, and had to be re-armed by hand. 305 spent `run_once_fired` tombstones accumulated between
2026-08-01 and 2026-08-15, and the one time re-arming was missed the session was left with no wake
mechanism at all. A cron does not have that failure mode.

---

CHECK-IN (self-scheduled, recurring — NOT a human turn, not approval for anything).

Do not re-derive closed work. Do not restate this brief back to the user.

== STANDING MANDATE ==
Build a AAA-quality Sly Cooper game in Three.js, Ancient Egypt. Use sub-agents and blind
harsh-critic rounds against real game frames. Don't stop until critics are wowed.

== HARD CONSTRAINTS ==
Branch claude/sly-cooper-ancient-egypt-0koo0u ONLY; git push -u origin <branch>; retry only on
network errors (2s/4s/8s/16s). NO PR unless explicitly asked. Commits: --no-gpg-sign, explicit
paths, `git commit --only <paths>` (§311), never `git add -A` (§240), never rewrite pushed
history — fix forward (§314). Trailers: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
and `Claude-Session: https://claude.ai/code/session_01PXtatFVa9WWnKz5zHerfeC`. Never put the
model ID in a pushed artifact. §186: never edit src/** while a capture holds the lock. §141.1:
no post-hoc threshold moves; bars sealed before candidates; fresh frames for verdicts. Build
ships self-contained (no CDN/runtime fetch); licences recorded accurately. ringPainter is
UNTOUCHABLE (D12). Never put a kill and its relaunch on one command line. Suite: node --test
"tests/*.test.mjs" (quoted glob), expect 549 passing. GitHub scope: adrianfilip8-maker/demo.

== ROLLBACK RUNBOOK (has happened FIVE times; §325) ==
Symptom: HEAD far behind, KNOWN_ISSUES.md short, task list reverted. origin/* is a LOCAL cache
that reverts with .git — ALWAYS `git fetch origin <branch>` BEFORE concluding the remote lost
anything. Then `git reset --hard origin/<branch>`. Untracked files (capture frames, shots/)
survive. Every recovery so far: zero durable loss.

== CLOSED — DO NOT REOPEN ==
guardcone DO NOT SHIP (§348), successor closed on ALL FOUR steps: BS1 fails on luminance by
2.1% with the probe correctly placed; BH1 unreachable by construction (54.8x out of range);
sly-startle's escape is 1/42 LSB with both natural explanations refuted; PROT-MOON/LAMPS — named
objects barely move, sign is a DARKENING, cause is ROI placement across the cone's own container
(§349, §352). §354: `off` is NOT a null arm — off→bon moves seven fields, which is why
attribution kept failing; `blamp` peels exactly one.
§350 keyprobe re-seal REFUSED — K1=0.1017 is in a TRACKED log since 7468b1f, so a re-run
ratifies rather than measures. §351 PREREG-rimfloor WITHDRAWN — peak statistic vs area bar.
§358 r12 RETIRED as evidence — commit{sha 0525d5e, dirty:TRUE}, untracked, unreconstructible;
r12/keyprobe1 differ over 70.74% of pixels so §356's "localised to colossus-R" is false.
Movement: three shipping bugs fixed (c.pole soft-lock, free wall climb, spire fly-paper). Wall
climb DECLINED not deferred. UI: pickpocket range mismatch fixed by identity.

== OPEN (tasks) ==
#17 perch_idle — premise refuted 3x; §345 says the real residual is the CAMERA, not keyframes.
#21 staging4 — measure the multi-stage floor, re-anchor the base gate outside the FX band.
#23 retire r12 from the evidence chain + make dirty:true FAIL a roster render (the manifest
    already computes the flag and nothing reads it — §357.1's "a guard that exists is not a
    guard that runs", now in the evidence chain).
Also: Health.purse unpublished (blocks HUD charm progress — needs BOTH purse and charmCost);
§357.1 C4/C5 dead code left alone deliberately.

== WHAT TO DO NOW ==
1. Check state: git fetch + status, suite, capture running?, sub-agents live?
2. If sub-agents reported: VERIFY their load-bearing numbers INDEPENDENTLY before folding
   anything into KNOWN_ISSUES. They have been wrong before — several citation errors caught.
   Then commit their files yourself.
3. Otherwise pick up the highest-value open task and make real progress. Prefer offline
   analysis over captures when a capture would collide with a live src edit.
4. Commit and PUSH before going idle. The container is ephemeral and rolls back often.
