import { pilotDay, pilotPhase } from '../core/arms';
import { DEFAULT_CONFIG } from '../core/detectorConfig';
import type { AppSettings } from './db';

export const PARTICIPANT_CODE_RE = /^TF-[A-Z0-9]{4}$/;
export const EXIT_SURVEY_URL = (import.meta.env?.VITE_EXIT_SURVEY_URL as string | undefined) || '';
export const TEAM_EMAIL = (import.meta.env?.VITE_TEAM_EMAIL as string | undefined) || '';

export function pilotInfo(s: AppSettings, now = Date.now()) {
  if (!s.participantCode || !s.pilotConsent || !s.enrolledDate) return null;
  const day = pilotDay(s.enrolledDate, now);
  const phase = pilotPhase(day, DEFAULT_CONFIG.pilotBaselineDays, DEFAULT_CONFIG.pilotTotalDays);
  const banner =
    phase === 'baseline' ? `Pilot day ${day} of ${DEFAULT_CONFIG.pilotTotalDays} · Baseline (silent)`
    : phase === 'randomised' ? `Pilot day ${day} of ${DEFAULT_CONFIG.pilotTotalDays} · Alerts on`
    : 'Pilot complete. Thank you!';
  return { day, phase, banner, code: s.participantCode };
}
