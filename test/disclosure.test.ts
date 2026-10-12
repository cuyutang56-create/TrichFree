// Release audit: what the pilot notice (the text participants agree to), the privacy policy and the landing page
// say is collected must match what the code actually sends. Every uploaded column needs a disclosed phrase; a new
// column without one fails here, so adding telemetry forces a review of the notice.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COPY } from '../src/shared/copy';
import { EPISODE_COLUMNS, EVENT_COLUMNS, SESSION_COLUMNS, calibrationRow } from '../src/shared/telemetry';

const CALIBRATION_COLUMNS = Object.keys(calibrationRow({ id: '', createdAt: 0, zones: [], rMin: 0, rMax: 0, pinchThresh: 0, zoneAdjust: {}, extraDwellMs: 0, riskyNegatives: [], faceIndicesVersion: 1 }, '', 0));
/** Random row identifiers that only link rows to each other; they say nothing about the person. */
const ROW_IDS = new Set(['id', 'session_id']);
const PHRASE: Record<string, string> = {
  participant_code: 'participant code',
  started_at: 'when each possible pull was detected', alert_at: 'when each possible pull was detected', ended_at: 'when each possible pull was detected', pilot_day: 'which day of the pilot',
  zone: 'which area of your head', arm: 'which reminder played', clip_count: 'how many of your voice clips',
  outcome: 'whether and how quickly your hand came down', seconds_to_hand_down: 'whether and how quickly your hand came down',
  pinch_fraction: 'detector measurements', r_median: 'detector measurements', p_smooth_max: 'detector measurements',
  pulled_during: 'I just pulled', app_version: 'app version',
  desk_minutes: 'desk minutes', fps_avg: 'how fast detection runs', delegate: 'how fast detection runs', output_mode: 'the reminder type you chose',
  type: 'app events', t: 'app events',
  created_at: 'calibration quality scores', zones: 'the areas you chose to watch', validation_pos: 'calibration quality scores', validation_neg: 'calibration quality scores', dwell_ms: 'detection timing',
};
const SESSION_PHRASE: Record<string, string> = { started_at: 'when TrichFree was started, paused, resumed and stopped', ended_at: 'when TrichFree was started, paused, resumed and stopped' };

const flat = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[‘’“”'"]/g, '').replace(/\s+/g, ' ');
const privacy = readFileSync('web/privacy/index.html', 'utf8');
const section = (id: string) => flat(privacy.split(`id="${id}"`)[1].split('<h2')[0]);

describe('disclosure matches what is sent', () => {
  const texts = { 'pilot notice (in the extension)': flat(COPY.pilotNotice), 'privacy policy, research section': section('research') };
  const tables = { episodes: EPISODE_COLUMNS, sessions: SESSION_COLUMNS, events: EVENT_COLUMNS, calibrations: CALIBRATION_COLUMNS };

  for (const [where, text] of Object.entries(texts)) {
    it(`every pilot column is disclosed in the ${where}`, () => {
      const missing: string[] = [];
      for (const [table, cols] of Object.entries(tables)) {
        for (const c of cols) {
          if (ROW_IDS.has(c)) continue;
          const phrase = (table === 'sessions' && SESSION_PHRASE[c]) || PHRASE[c];
          if (!phrase) { missing.push(`${table}.${c}: no disclosure phrase mapped (add one, and say it in the notice)`); continue; }
          if (!text.includes(flat(phrase))) missing.push(`${table}.${c}: "${phrase}"`);
        }
      }
      expect(missing).toEqual([]);
      expect(text).toContain('never sends video, images or your voice');
      expect(text).toContain('stays on this computer'); // what stopping means for rows not yet sent
    });
  }

  it('the privacy policy lists the device tag an account stores with its settings', () => {
    expect(section('account')).toContain('random identifier for the browser that last changed them');
  });

  it('the landing page does not say reminder history always stays on the device (the opt-in pilot sends it)', () => {
    const page = flat(readFileSync('web/index.html', 'utf8'));
    const item = page.slice(page.indexOf('Your history of reminders'), page.indexOf('Only if you create an account'));
    expect(item).toMatch(/research pilot/);
  });
});
