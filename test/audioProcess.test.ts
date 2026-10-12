import { describe, expect, it } from 'vitest';
import { ampToDb, encodeWav16, normalizePeak, peak, processClip, resample, trimSilence } from '../src/core/audioProcess';

const SR = 48000;
function toneWithSilence(lead = 1, tone = 0.5, trail = 1, amp = 0.2) {
  const n = Math.round((lead + tone + trail) * SR);
  const x = new Float32Array(n);
  for (let i = Math.round(lead * SR); i < Math.round((lead + tone) * SR); i++) x[i] = amp * Math.sin((2 * Math.PI * 440 * i) / SR);
  // faint noise floor at about -60 dBFS
  for (let i = 0; i < n; i++) x[i] += (Math.random() - 0.5) * 0.002;
  return x;
}

describe('audioProcess', () => {
  it('trim removes padded silence but keeps 150 ms padding', () => {
    const out = trimSilence(toneWithSilence(), SR);
    const secs = out.length / SR;
    expect(secs).toBeGreaterThan(0.5 + 0.25);
    expect(secs).toBeLessThan(0.5 + 0.35 + 0.05);
  });
  it('fully silent input trims to nothing', () => {
    expect(trimSilence(new Float32Array(SR), SR).length).toBe(0);
    expect(processClip([new Float32Array(SR)], SR)).toBeNull();
  });
  it('peak after normalisation is -3 dBFS ± 0.2', () => {
    const n = normalizePeak(toneWithSilence(0.1, 0.5, 0.1, 0.05), -3);
    expect(Math.abs(ampToDb(peak(n)) - -3)).toBeLessThan(0.2);
  });
  it('full chain produces 22.05 kHz mono 16-bit WAV at about -3 dBFS', () => {
    const res = processClip([toneWithSilence()], SR)!;
    const v = new DataView(res.wav.buffer);
    expect(String.fromCharCode(...res.wav.slice(0, 4))).toBe('RIFF');
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(22050);
    expect(v.getUint16(34, true)).toBe(16);
    let pk = 0;
    for (let i = 44; i < res.wav.length; i += 2) pk = Math.max(pk, Math.abs(v.getInt16(i, true)));
    expect(Math.abs(ampToDb(pk / 32768) - -3)).toBeLessThan(0.2);
    expect(res.durationMs).toBeGreaterThan(700);
    expect(res.durationMs).toBeLessThan(900);
  });
  it('resample keeps duration and wav header is sized right', () => {
    expect(resample(new Float32Array(48000), 48000, 22050).length).toBe(22050);
    expect(encodeWav16(new Float32Array(10), 22050).length).toBe(64);
  });
});
