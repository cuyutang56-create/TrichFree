import { describe, expect, it } from 'vitest';
import { bridgeAllowed } from '../src/shared/bridge';

describe('website bridge origin check', () => {
  const site = 'https://trichfree.example';
  it('accepts only the configured website origin', () => {
    expect(bridgeAllowed('https://trichfree.example', site, false)).toBe(true);
    expect(bridgeAllowed('https://evil.example', site, false)).toBe(false);
    expect(bridgeAllowed('https://trichfree.example.evil.com', site, false)).toBe(false);
    expect(bridgeAllowed('http://trichfree.example', site, false)).toBe(false);
    expect(bridgeAllowed(undefined, site, false)).toBe(false);
    expect(bridgeAllowed('not a url', site, false)).toBe(false);
  });
  it('allows local http origins only in dev/test builds', () => {
    expect(bridgeAllowed('http://127.0.0.1:5174', site, false)).toBe(false);
    expect(bridgeAllowed('http://127.0.0.1:5174', site, true)).toBe(true);
    expect(bridgeAllowed('http://localhost:3000', undefined, true)).toBe(true);
    expect(bridgeAllowed('https://localhost.evil.com', undefined, true)).toBe(false);
  });
});
