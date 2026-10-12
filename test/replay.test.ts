import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runReplay, type LandmarkRecording } from '../src/core/replay';

const files = readdirSync('test/fixtures').filter((f) => f.endsWith('.json'));

describe('replay fixtures', () => {
  it('ships the synthetic fixtures (regenerate with npm run fixtures)', () => {
    expect(files.sort()).toEqual([
      'brief-touch-crown.json', 'chin-rest-long-hair.json', 'chin-rest.json', 'drinking-cup.json', 'glasses-adjust.json', 'hover-boundary.json',
      'pinch-at-crown.json', 'pinch-at-temple.json', 'pinch-strand.json', 'reach-hairline-open.json', 'scratch-scalp.json', 'three-reaches.json',
    ]);
  });
  for (const f of files) {
    it(`${f} produces the expected events`, () => {
      const rec = JSON.parse(readFileSync(`test/fixtures/${f}`, 'utf8')) as LandmarkRecording;
      const res = runReplay(rec);
      expect(res.alerts).toBe(rec.meta.expect!.alerts);
      if (f === 'pinch-strand.json') expect(res.detectorEvents.find((e) => e.type === 'alertThresholdReached')).toMatchObject({ stats: { zone: 'strands' } });
      if (f === 'pinch-at-crown.json') {
        const ep = res.effects.find((e) => e.type === 'logEpisode');
        expect(ep && ep.type === 'logEpisode' && ep.episode.outcome).toBe('interrupted');
      }
    });
  }
});
