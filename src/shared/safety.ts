// Static safety content. Every contact below was checked against the provider's own published information on
// HELPLINES_CHECKED. Numbers change: re-check before each release (DEPLOYMENT.md → release checklist).
export const SAFETY_LINES = [
  'TrichFree is a self-help tool. It is not a medical device or a treatment.',
  'If you swallow hair, or have stomach pain after pulling, please see a doctor.',
  'If you are feeling very low or unsafe, contact local emergency services or a crisis line.',
];

export const HELPLINES_CHECKED = '2026-10-12';

export const SUPPORT_LINKS: { label: string; url: string; note?: string }[] = [
  { label: 'The TLC Foundation for Body-Focused Repetitive Behaviors', url: 'https://www.bfrb.org', note: 'Information, treatment directory and support (US-based, international reach).' },
  { label: 'Trichotillomania Support', url: 'https://trichotillomania.co.uk', note: 'UK non-profit run by people in recovery from BFRBs.' },
];

/** Singapore (where the pilot runs). Sources: Ministry of Health (mindline, June 2025); Samaritans of Singapore services overview (2025). */
export const LOCAL_HELPLINES: { label: string; phone: string; note?: string }[] = [
  { label: 'National mindline 1771 (24 hours)', phone: '1771', note: 'Or WhatsApp +65 6669 1771, or webchat at mindline.sg' },
  { label: 'Samaritans of Singapore (24 hours)', phone: '1767', note: 'Or CareText on WhatsApp: 9151 1767' },
  { label: 'Emergency ambulance (Singapore)', phone: '995' },
];
