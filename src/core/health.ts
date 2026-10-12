// Desk-mode health (pure). "Slow" and "stalled" are different things: a low-end laptop running detection at
// 3 fps is working (just coarser), while no processed frame for many seconds means detection has stopped.
// The old watchdog treated fps < 3 as a stall and told slow-but-working users that detection had stopped.

/** Models can take a while to load on slow machines before the first frame is processed. */
export const STARTUP_GRACE_MS = 90_000;
/** No processed frame for this long (after the first) means detection has stalled. */
export const STALL_MS = 15_000;
/** Sustained frame rate below this is reported as "slow" (dwell timing gets coarse). */
export const SLOW_FPS = 8;
export const SLOW_FOR_MS = 10_000;
/** Nobody in view for this long: stop the camera (privacy, battery). */
export const AWAY_MS = 10 * 60_000;
/** An input-idle computer is not "away" if a face was seen this recently (e.g. watching a lecture). */
export const PRESENT_MS = 2 * 60_000;

export type HealthStatus = 'starting' | 'watching' | 'slow' | 'problem';

export interface HealthInput {
  now: number;
  /** When the camera was attached. */
  attachedAt: number;
  lastFrameAt: number | null;
  fps: number;
  slowSince: number | null;
}

export function deskHealth(i: HealthInput): { status: HealthStatus; slowSince: number | null; reason?: 'no_frames' | 'stalled' } {
  if (i.lastFrameAt == null) {
    return i.now - i.attachedAt > STARTUP_GRACE_MS ? { status: 'problem', slowSince: null, reason: 'no_frames' } : { status: 'starting', slowSince: null };
  }
  if (i.now - i.lastFrameAt > STALL_MS) return { status: 'problem', slowSince: null, reason: 'stalled' };
  const slowSince = i.fps < SLOW_FPS ? i.slowSince ?? i.now : null;
  return { status: slowSince != null && i.now - slowSince >= SLOW_FOR_MS ? 'slow' : 'watching', slowSince };
}

/** Should desk mode stop because nobody is at the desk? */
export function isAway(now: number, lastFaceAt: number | undefined, startedAt: number | undefined): boolean {
  const since = Math.max(lastFaceAt ?? 0, startedAt ?? 0);
  return since > 0 && now - since > AWAY_MS;
}

/** chrome.idle says "idle" (no keyboard/mouse). Treat it as away only if no face was seen recently. */
export function idleMeansAway(now: number, lastFaceAt: number | undefined): boolean {
  return lastFaceAt == null || now - lastFaceAt > PRESENT_MS;
}
