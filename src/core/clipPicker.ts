import type { ClipCategory, ClipMeta } from './types';

export const ALERT_CATEGORIES: Record<1 | 2, ClipCategory[]> = {
  1: ['notice', 'need', 'instead', 'custom'],
  2: ['reason', 'instead', 'compassion', 'custom'],
};

/**
 * Least-recently-played clip within the alert's allowed categories, never repeating the previous clip.
 * Falls back to any other clip if the allowed set is empty; returns undefined if there is nothing to play.
 */
export function pickClip(clips: ClipMeta[], alertNo: 1 | 2, lastClipId?: string): ClipMeta | undefined {
  const allowed = clips.filter((c) => ALERT_CATEGORIES[alertNo].includes(c.category));
  const pool = allowed.length ? allowed : clips;
  const fresh = pool.filter((c) => c.id !== lastClipId);
  if (!fresh.length) return undefined;
  return [...fresh].sort(
    (a, b) => (a.lastPlayedAt ?? 0) - (b.lastPlayedAt ?? 0) || a.playCount - b.playCount || a.createdAt - b.createdAt,
  )[0];
}
