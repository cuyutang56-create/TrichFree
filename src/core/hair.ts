// Hair contact (pure): how much hair surrounds the fingertips, from a hair-segmentation category mask.
// The fingers themselves hide the hair right under the tips, so we sample a ring around each anchor.
import { HI } from './faceIndices';
import type { HandObs } from './types';

export interface HairMask {
  width: number;
  height: number;
  /** 1 where the pixel is hair, 0 otherwise (row-major). */
  data: Uint8Array;
}

const RING_ANGLES = 16;

/**
 * Fraction (0..1) of ring samples that land on hair, taking the best of three anchors:
 * thumb tip, index tip and the pinch midpoint. Ring radii scale with the hand size, so it works at any distance.
 */
export function hairContact(hand: HandObs, mask: HairMask): number {
  const { width: W, height: H, data } = mask;
  const L = hand.landmarks;
  const px = (i: number) => ({ x: L[i][0] * W, y: L[i][1] * H });
  const wrist = px(HI.wrist), mcp = px(HI.middleMcp);
  const handScale = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y);
  if (!(handScale > 2)) return 0;
  const t = px(HI.thumbTip), ix = px(HI.indexTip);
  const anchors = [t, ix, { x: (t.x + ix.x) / 2, y: (t.y + ix.y) / 2 }];
  const radii = [0.25 * handScale, 0.45 * handScale];
  let best = 0;
  for (const a of anchors) {
    let hit = 0, n = 0;
    for (const r of radii) {
      for (let k = 0; k < RING_ANGLES; k++) {
        const ang = (2 * Math.PI * k) / RING_ANGLES;
        const x = Math.round(a.x + r * Math.cos(ang)), y = Math.round(a.y + r * Math.sin(ang));
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        n++;
        if (data[y * W + x]) hit++;
      }
    }
    if (n) best = Math.max(best, hit / n);
  }
  return best;
}

/**
 * Tuned on real hair masks from the team's demo video (scripts/tune-hair.mjs, test/hair-real.test.ts):
 * hair-confidence ≥ 0.4 and a contact threshold of 0.175 catch 97% of fingertips on hair with 0% on the face
 * or background and 18% just beside the hair (was 82% caught at confidence 0.5 / threshold 0.25).
 */
export const HAIR_CONF = 0.4;
export const HAIR_TOUCH = 0.175;

/** Fast attack, slow release: contact jumps up at once but fades over a few frames (fingers flicker over hair). */
export function smoothContact(prev: number | undefined, next: number): number {
  if (prev == null || next >= prev) return next;
  return prev * 0.6 + next * 0.4;
}
