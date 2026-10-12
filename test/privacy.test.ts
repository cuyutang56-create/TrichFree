import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Episode } from '../src/core/types';
import { assertNoMedia, calibrationRow, episodeRow, eventRow, sessionRow } from '../src/shared/telemetry';

const ep: Episode = {
  id: 'e1', sessionId: 's1', participantCode: 'TF-AB12', startedAt: 1, alertAt: 2, endedAt: 3, zone: 'crown', arm: 'VOICE', pilotDay: 5,
  clipIds: ['c1', 'c2'], outcome: 'interrupted', secondsToHandDown: 1.2, pinchFraction: 0.5, rMedian: 0.6, pSmoothMax: 0.9, pulledDuring: false,
};

/** Recursively checks a value for Blob / ArrayBuffer / typed arrays / long base64 strings. */
function containsMedia(x: unknown): boolean {
  if (x == null) return false;
  if (x instanceof Blob || x instanceof ArrayBuffer || ArrayBuffer.isView(x)) return true;
  if (typeof x === 'string') return x.length > 1024 && /^[A-Za-z0-9+/=]+$/.test(x);
  if (Array.isArray(x)) return x.some(containsMedia);
  if (typeof x === 'object') return Object.values(x).some(containsMedia);
  return false;
}

describe('privacy', () => {
  it('telemetry mapper output contains no Blob, ArrayBuffer or base64 over 1 KB', () => {
    const rows = [
      episodeRow(ep, 'TF-AB12'),
      sessionRow({ id: 's1', startedAt: 1, endedAt: 2, deskMinutes: 3, fpsAvg: 14, delegate: 'GPU', outputMode: 'speakers' }, 'TF-AB12'),
      eventRow({ id: 'v1', type: 'manual_pull', t: 5, sessionId: 's1', data: { missed: true } }, 'TF-AB12'),
      calibrationRow({ id: 'c', createdAt: 1, zones: ['crown'], rMin: 0.5, rMax: 0.8, pinchThresh: 0.3, zoneAdjust: {}, extraDwellMs: 0, riskyNegatives: [], faceIndicesVersion: 1, validationPos: 5, validationNeg: 0 }, 'TF-AB12', 1500),
    ];
    for (const r of rows) {
      expect(containsMedia(r)).toBe(false);
      expect(() => assertNoMedia(r)).not.toThrow();
      expect(JSON.parse(JSON.stringify(r))).toEqual(r); // plain JSON
    }
    // Episodes send a clip count, never clip ids or audio.
    expect(Object.keys(rows[0])).not.toContain('clipIds');
    expect(episodeRow(ep, 'TF-AB12').clip_count).toBe(2);
  });

  it('assertNoMedia rejects media payloads', () => {
    expect(() => assertNoMedia({ a: new Blob(['x']) })).toThrow();
    expect(() => assertNoMedia({ a: new Uint8Array(4) })).toThrow();
    expect(() => assertNoMedia({ a: [new ArrayBuffer(8)] })).toThrow();
    expect(() => assertNoMedia({ a: 'A'.repeat(2000) })).toThrow();
    expect(() => assertNoMedia({ a: 'data:image/png;base64,AAAA' })).toThrow();
  });

  it('the upload queue is the only network path and checks every row', () => {
    const src = readFileSync('src/shared/uploadQueue.ts', 'utf8');
    expect(src).toMatch(/assertNoMedia\(row\)/);
    expect(src).toMatch(/rows\.forEach\(\(r\) => assertNoMedia\(r\.row\)\)/);
    // No other source file talks to the network.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && p !== join('src', 'shared', 'uploadQueue.ts')) {
          const s = readFileSync(p, 'utf8');
          if (/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket\(|createClient\(/.test(s)) offenders.push(p);
        }
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
  });

  it('the manifest CSP restricts connect-src and has no content scripts or broad permissions', () => {
    const m = readFileSync('manifest.config.ts', 'utf8');
    expect(m).toMatch(/connect-src \$\{connectSrc\}/);
    expect(m).not.toMatch(/content_scripts|<all_urls>|'tabs'|'history'/);
  });
});
