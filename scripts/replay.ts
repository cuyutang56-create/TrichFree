// Usage: npm run replay -- test/fixtures/pinch-at-crown.json [--sensitivity balanced]
import { readFileSync } from 'node:fs';
import { configFor } from '../src/core/detectorConfig';
import { runReplay, type LandmarkRecording } from '../src/core/replay';
import type { Sensitivity } from '../src/core/types';

const args = process.argv.slice(2);
const files = args.filter((a) => a.endsWith('.json'));
const sIdx = args.indexOf('--sensitivity');
const sensitivity = (sIdx >= 0 ? args[sIdx + 1] : 'balanced') as Sensitivity;
if (!files.length) { console.error('usage: npm run replay -- <recording.json> [...] [--sensitivity relaxed|balanced|sensitive]'); process.exit(1); }

for (const file of files) {
  const rec = JSON.parse(readFileSync(file, 'utf8')) as LandmarkRecording;
  const t0 = rec.frames[0]?.t ?? 0;
  const res = runReplay(rec, { cfg: configFor(sensitivity) });
  console.log(`\n${file}  (${res.frames} frames, max pSmooth ${res.maxPSmooth.toFixed(2)})`);
  for (const e of res.detectorEvents) {
    const extra = e.type === 'handLeft' ? ` leftAt=+${((e.leftAt - t0) / 1000).toFixed(2)}s zone=${e.stats.zone}` : e.type === 'alertThresholdReached' ? ` zone=${e.stats.zone} pinch=${e.stats.pinchFraction.toFixed(2)} r=${e.stats.rMedian.toFixed(2)}` : '';
    console.log(`  +${((e.t - t0) / 1000).toFixed(2)}s  ${e.type}${extra}`);
  }
  for (const f of res.effects) if (f.type === 'logEpisode') console.log(`  episode → ${f.episode.outcome}${f.episode.secondsToHandDown != null ? ` (${f.episode.secondsToHandDown.toFixed(1)} s to hand-down)` : ''}`);
  const expect = rec.meta.expect?.alerts;
  if (expect != null) console.log(`  alerts: ${res.alerts} (expected ${expect}) ${res.alerts === expect ? 'OK' : 'MISMATCH'}`);
}
