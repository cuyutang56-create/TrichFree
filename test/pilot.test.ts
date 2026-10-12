import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, normaliseParticipantCode, PARTICIPANT_CODE_RE } from '../src/shared/pilot';

describe('participant codes', () => {
  it('accepts the long random format and what people actually type', () => {
    expect(PARTICIPANT_CODE_RE.test('TF-K7QM-3XWD')).toBe(true);
    for (const typed of ['tf-k7qm-3xwd', 'TF K7QM 3XWD', 'TFK7QM3XWD', ' k7qm-3xwd ']) expect(normaliseParticipantCode(typed)).toBe('TF-K7QM-3XWD');
  });
  it('rejects short (guessable) codes and look-alike characters', () => {
    for (const bad of ['TF-AB12', 'TF-K7QM-3XW', 'TF-K7QM-3XWDX', 'TF-K7QO-3XWD', 'TF-K7Q0-3XWD', 'TF-K7QI-3XWD', 'TF-K7Q1-3XWD', 'TF-K7QL-3XWD', 'TF-K7QU-3XWD'])
      expect(PARTICIPANT_CODE_RE.test(normaliseParticipantCode(bad)), bad).toBe(false);
  });
  it('the regex allows exactly the alphabet, and the generator uses the same alphabet', () => {
    const allowed = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].filter((c) => PARTICIPANT_CODE_RE.test(`TF-${c.repeat(4)}-2222`));
    expect(allowed.sort().join('')).toBe([...CODE_ALPHABET].sort().join(''));
    expect(CODE_ALPHABET).toHaveLength(30);
    expect(readFileSync('scripts/make-pilot-codes.mjs', 'utf8')).toContain(`'${CODE_ALPHABET}'`);
  });
  it('the generator makes valid, distinct codes', () => {
    const out = execFileSync('node', ['scripts/make-pilot-codes.mjs', '50'], { encoding: 'utf8' });
    const codes = out.split('\n').filter((l) => /^TF-/.test(l));
    expect(codes).toHaveLength(50);
    expect(new Set(codes).size).toBe(50);
    for (const c of codes) expect(PARTICIPANT_CODE_RE.test(c), c).toBe(true);
    expect(out).toContain('insert into public.pilot_codes (code) values');
  });
  it('the database check uses the same pattern as the app', () => {
    const sql = readFileSync('supabase/migrations/20261012000100_pilot_telemetry.sql', 'utf8');
    expect(sql).toContain(`'${PARTICIPANT_CODE_RE.source}'`);
  });
});
