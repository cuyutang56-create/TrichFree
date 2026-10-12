import type { Arm, OutputMode } from './types';

/** Local calendar date "YYYY-MM-DD" for a timestamp. */
export function localDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Pilot day by local calendar date; the enrolment date is day 1. */
export function pilotDay(enrolledDate: string, now: number): number {
  const [y, m, d] = enrolledDate.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const [ny, nm, nd] = localDate(now).split('-').map(Number);
  const today = new Date(ny, nm - 1, nd).getTime();
  return Math.round((today - start) / 86_400_000) + 1;
}

export type PilotPhase = 'baseline' | 'randomised' | 'complete';
export function pilotPhase(day: number, baselineDays = 3, totalDays = 14): PilotPhase {
  if (day <= baselineDays) return 'baseline';
  if (day <= totalDays) return 'randomised';
  return 'complete';
}

/** FNV-1a string hash → 32-bit seed. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** mulberry32 PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Permuted block of 4 (2 CHIME + 2 VOICE), seeded on participant code + block index. */
export function permutedBlock(code: string, blockIndex: number): ('CHIME' | 'VOICE')[] {
  const block: ('CHIME' | 'VOICE')[] = ['CHIME', 'CHIME', 'VOICE', 'VOICE'];
  const rnd = mulberry32(hashSeed(`${code}:${blockIndex}`));
  for (let i = block.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [block[i], block[j]] = [block[j], block[i]];
  }
  return block;
}

/** Arm for the n-th randomised episode (0-based) of a participant. */
export function randomisedArm(code: string, episodeIndex: number): 'CHIME' | 'VOICE' {
  return permutedBlock(code, Math.floor(episodeIndex / 4))[episodeIndex % 4];
}

export interface ArmContext {
  outputMode: OutputMode;
  pilot?: { code: string; enrolledDate: string; nextIndex: number; baselineDays?: number; totalDays?: number } | null;
  now: number;
}

/**
 * Decide the arm at ALERT_1 (Section 5.2 / 5.4). `consumesIndex` is true when a block slot was used,
 * so the caller increments the participant's randomised-episode counter.
 */
export function resolveArm(ctx: ArmContext): { arm: Arm; pilotDay?: number; consumesIndex: boolean } {
  if (ctx.pilot) {
    const day = pilotDay(ctx.pilot.enrolledDate, ctx.now);
    const phase = pilotPhase(day, ctx.pilot.baselineDays, ctx.pilot.totalDays);
    if (phase === 'baseline') return { arm: 'SILENT', pilotDay: day, consumesIndex: false };
    if (ctx.outputMode === 'silent_log') return { arm: 'SILENT', pilotDay: day, consumesIndex: false };
    if (ctx.outputMode === 'chime_only') return { arm: 'FORCED_CHIME', pilotDay: day, consumesIndex: false };
    if (ctx.outputMode === 'visual') return { arm: 'VISUAL', pilotDay: day, consumesIndex: false };
    if (phase === 'randomised') return { arm: randomisedArm(ctx.pilot.code, ctx.pilot.nextIndex), pilotDay: day, consumesIndex: true };
    return { arm: 'VOICE', pilotDay: day, consumesIndex: false };
  }
  if (ctx.outputMode === 'silent_log') return { arm: 'SILENT', consumesIndex: false };
  if (ctx.outputMode === 'chime_only') return { arm: 'FORCED_CHIME', consumesIndex: false };
  if (ctx.outputMode === 'visual') return { arm: 'VISUAL', consumesIndex: false };
  return { arm: 'VOICE', consumesIndex: false };
}
