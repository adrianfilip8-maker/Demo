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
 */
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DIR = process.env.SANDS_LOCK_DIR
  || path.join(os.tmpdir(), 'sands-of-ra');
const LOCK = path.join(DIR, 'capture.lock');

const STALE_MS = 20 * 60 * 1000;   // a capture that's held the lock this long is dead or hung

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
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
export async function acquire({ timeoutMs = 45 * 60 * 1000, onWait } = {}) {
  mkdirSync(DIR, { recursive: true });
  const t0 = Date.now();
  let announced = 0;

  while (!tryTake()) {
    const waited = Date.now() - t0;
    if (waited > timeoutMs) {
      // Better to render slowly alongside someone else than to fail the agent's check.
      onWait?.(waited, readLock()?.pid ?? 0);
      return () => {};
    }
    if (waited - announced > 10000) {
      announced = waited;
      onWait?.(waited, readLock()?.pid ?? 0);
    }
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const held = readLock();
    if (held?.pid === process.pid && existsSync(LOCK)) { try { unlinkSync(LOCK); } catch {} }
  };

  // Don't wedge the queue if the run dies.
  process.once('exit', release);
  process.once('SIGINT', () => { release(); process.exit(130); });
  process.once('SIGTERM', () => { release(); process.exit(143); });

  return release;
}
