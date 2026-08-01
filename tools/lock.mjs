/**
 * Cross-process mutex for capture runs.
 *
 * Rendering here is CPU-bound software rasterisation (no GPU in this container), so N
 * concurrent captures don't run N-way parallel — they thrash and every one of them gets
 * slower than if they'd simply queued. With a dozen agents each running the harness to
 * check their work, serialising is dramatically faster in aggregate.
 *
 * Deliberately simple: an exclusive-create lockfile holding the owner's pid, with stale
 * detection so a killed run can't wedge the queue.
 *
 * **It is a FIFO queue, not a race.** It used to be a race: every waiter polled on a jittered
 * timer and whoever happened to call `tryTake()` first when the lock freed won it, so an agent
 * that had waited forty minutes had exactly the same chance as one that had just arrived. With
 * six agents contending that starves the patient ones, and an agent correctly observed that
 * "restarting costs nothing" — true under a race, because there were no places to lose.
 *
 * Now each waiter drops a ticket file and only attempts the lock when it holds the oldest live
 * ticket. `tryTake()` is still the atomic exclusive-create, so the ticket only decides *who
 * tries*: if two processes ever disagree about who is oldest, the worst case degrades to the
 * old race rather than to two holders. Correctness never depended on the ordering.
 */
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync, openSync, closeSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DIR = process.env.SANDS_LOCK_DIR
  || path.join(os.tmpdir(), 'sands-of-ra');
const LOCK = path.join(DIR, 'capture.lock');
const QUEUE = path.join(DIR, 'queue');

const STALE_MS = 20 * 60 * 1000;   // a capture that's held the lock this long is dead or hung

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Ticket files are `<epochMs>-<pid>`; the name is the whole record. */
function myTicket() { return path.join(QUEUE, `${_ticketAt}-${process.pid}`); }
let _ticketAt = 0;

function takeTicket() {
  if (_ticketAt) return;
  _ticketAt = Date.now();
  mkdirSync(QUEUE, { recursive: true });
  try { writeFileSync(myTicket(), ''); } catch { _ticketAt = 0; }
}

/**
 * Re-create our ticket if it has gone missing, keeping the original timestamp so our place in
 * the queue is preserved.
 *
 * Needed because losing a ticket is silent and self-inflicting: `takeTicket()` early-returns
 * once `_ticketAt` is set, so a swept ticket was never recreated and the waiter then raced
 * ticketless — the exact starvation the FIFO exists to prevent, visited on the *longest*
 * waiter. Called every poll; a `writeFileSync` of an empty file once a second is free next to
 * a 90 s boot.
 */
function reassertTicket() {
  if (!_ticketAt) return;
  try {
    if (!existsSync(myTicket())) { mkdirSync(QUEUE, { recursive: true }); writeFileSync(myTicket(), ''); }
  } catch {}
}

function dropTicket() {
  if (!_ticketAt) return;
  try { unlinkSync(myTicket()); } catch {}
  _ticketAt = 0;
}

/** True when no live ticket is older than ours. Sweeps dead holders' tickets on the way. */
function isMyTurn() {
  if (!_ticketAt) return true;
  let names;
  try { names = readdirSync(QUEUE); } catch { return true; }
  for (const n of names) {
    const dash = n.lastIndexOf('-');
    if (dash < 0) continue;
    const at = parseInt(n.slice(0, dash), 10);
    const pid = parseInt(n.slice(dash + 1), 10);
    if (!Number.isFinite(at) || !Number.isFinite(pid)) continue;
    if (pid === process.pid) continue;
    /* Liveness is the ONLY eviction rule. An age cutoff was tried and was a bug: a waiter that
       had queued patiently for thirty minutes had its ticket swept while its process was
       perfectly alive, and it then raced ticketless — starvation inflicted on precisely the
       waiter the FIFO exists to protect. On this container a legitimate wait behind several
       2-5 minute captures routinely exceeds any cutoff worth setting, so "old" carries no
       information about "dead" and `alive()` answers the question directly. */
    if (!alive(pid)) {
      try { unlinkSync(path.join(QUEUE, n)); } catch {}
      continue;
    }
    // Older ticket, or same ms and a lower pid — deterministic tie-break.
    if (at < _ticketAt || (at === _ticketAt && pid < process.pid)) return false;
  }
  return true;
}

function readLock() {
  try {
    const [pid, at] = readFileSync(LOCK, 'utf8').split(/\s+/);
    return { pid: parseInt(pid, 10), at: parseInt(at, 10) };
  } catch { return null; }
}

function tryTake() {
  try {
    // 'wx' fails if the file exists — that's the atomic part.
    const fd = openSync(LOCK, 'wx');
    writeFileSync(fd, `${process.pid} ${Date.now()}`);
    closeSync(fd);
    return true;
  } catch {
    const held = readLock();
    if (!held) return false;
    const stale = !alive(held.pid) || Date.now() - held.at > STALE_MS;
    if (stale) {
      try { unlinkSync(LOCK); } catch {}
      return tryTake();
    }
    return false;
  }
}

/**
 * Wait for the capture lock. Returns a release function.
 * @param {(waitedMs:number, holder:number)=>void} [onWait] progress callback, called every ~10 s
 */
/* Give-up time. Deliberately long, because giving up means rendering *unlocked* alongside
   everyone else, and that is the thrash the lock exists to prevent — seven concurrent
   SwiftShader renderers were observed after several waiters timed out at the old 45 minutes,
   each then making every other run slower, including the one holding the lock. A fair queue
   changes the arithmetic: under FIFO your wait is bounded by the runs ahead of you, so waiting
   three hours is strictly better than joining a stampede. */
export async function acquire({ timeoutMs = 3 * 60 * 60 * 1000, onWait } = {}) {
  mkdirSync(DIR, { recursive: true });
  const t0 = Date.now();
  let announced = 0;

  takeTicket();
  // Only attempt the lock when we hold the oldest live ticket, so waiting is rewarded rather
  // than merely tolerated. `tryTake()` remains the atomic step; this decides who gets to call it.
  while (!(reassertTicket(), isMyTurn() && tryTake())) {
    const waited = Date.now() - t0;
    if (waited > timeoutMs) {
      // Better to render slowly alongside someone else than to fail the agent's check.
      dropTicket();
      onWait?.(waited, readLock()?.pid ?? 0);
      return () => {};
    }
    if (waited - announced > 10000) {
      announced = waited;
      onWait?.(waited, readLock()?.pid ?? 0);
    }
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));
  }
  dropTicket();

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    dropTicket();
    const held = readLock();
    if (held?.pid === process.pid && existsSync(LOCK)) { try { unlinkSync(LOCK); } catch {} }
  };

  // Don't wedge the queue if the run dies.
  process.once('exit', release);
  process.once('SIGINT', () => { release(); process.exit(130); });
  process.once('SIGTERM', () => { release(); process.exit(143); });

  return release;
}
