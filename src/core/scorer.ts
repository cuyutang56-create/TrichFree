import type { DetectorConfig } from './detectorConfig';
import { HAIR_TOUCH } from './hair';
import type { FrameFeatures } from './types';

/** Rule-based per-frame "atHair" probability (Section 4.5). */
export function scoreFrame(f: FrameFeatures, cfg: DetectorConfig): number {
  if (!f.hasHand || f.faceMissing || !f.zone) return 0;
  if (f.occlusionVeto) return 0;
  if (f.zone === 'strands') {
    // Fingers in hair outside the scalp zones: only a pinch at face depth gets over candidateOn.
    const s = cfg.strandWeights;
    const p = s.base + (f.depthConsistent ? s.depthOk : s.depthBad) + (f.isPinch ? s.pinch : 0) + (f.orientationOK ? s.orientation : 0);
    return Math.min(1, Math.max(0, p));
  }
  const w = cfg.weights;
  const p = w.base + (f.depthConsistent ? w.depthOk : w.depthBad) + (f.isPinch ? w.pinch : 0) + (f.orientationOK ? w.orientation : 0)
    + (f.hairContact >= HAIR_TOUCH ? w.hairBonus : 0);
  return Math.min(1, Math.max(0, p));
}
