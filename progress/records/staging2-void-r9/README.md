# staging2 run r9 — **VOID (P-F8), retained as evidence, NOT scoreable**

These six frames and `readback-r9.json` are the complete r9 capture. **Do not score them.**

`PREREG-staging2` P-F8 as registered at capture time required `srcTreeBefore == srcTreeAfter`.
r9 reported `before 9fb6101f27556a12 after 4c83af2068ab9936 same=false`, so the registered
consequence — **VOID, re-run** — applies and was taken.

They are kept rather than deleted because the run was *substantively* clean and the frames document
it: one `bootId` (`a71e0b5a-21f`), feet `[843.9,625.3]` and head `[863.6,244.3]` **pixel-identical
across every arm**, `treeDrift` false, the shot table restored in-page, `src/**` never written, and
the camera/stand pairs exactly 1.75 m apart on `cand`. §192.1 records why the falsifier fired on a
run that had not actually drifted — both its hashes were sampled outside the held lock, so they
caught a *sibling* runner's arm during the queue wait.

They were **moved out of `staging2/`** because the runner is idempotently resumable: it skips any
arm whose frame is already present. Left in place, a "re-run" boots, skips all six, and writes a
fresh readback with a new `bootId`, `arms: []` and `sameTree: true` over frames from the old boot —
which is exactly the cross-boot mix P-F8's `bootId` clause exists to catch, wearing the appearance
of a cured run. That happened once (r10) and is the reason this directory exists.
