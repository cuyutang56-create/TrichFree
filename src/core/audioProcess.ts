// Pure audio post-processing on Float32Array (Section 6): trim, normalise, resample, WAV encode.

export const dbToAmp = (db: number) => Math.pow(10, db / 20);
export const ampToDb = (a: number) => 20 * Math.log10(Math.max(a, 1e-12));

export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0].slice();
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}

/** Trim leading/trailing silence: RMS below thresholdDb over windowMs windows, keeping padMs padding. */
export function trimSilence(x: Float32Array, sampleRate: number, thresholdDb = -45, windowMs = 20, padMs = 150): Float32Array {
  const win = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
  const thr = dbToAmp(thresholdDb);
  const nWin = Math.ceil(x.length / win);
  let first = -1, last = -1;
  for (let w = 0; w < nWin; w++) {
    let sum = 0;
    const s = w * win, e = Math.min(x.length, s + win);
    for (let i = s; i < e; i++) sum += x[i] * x[i];
    const rms = Math.sqrt(sum / (e - s));
    if (rms >= thr) { if (first < 0) first = w; last = w; }
  }
  if (first < 0) return new Float32Array(0);
  const pad = Math.round((sampleRate * padMs) / 1000);
  const start = Math.max(0, first * win - pad);
  const end = Math.min(x.length, (last + 1) * win + pad);
  return x.slice(start, end);
}

export function peak(x: Float32Array): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; }
  return p;
}

/** Peak-normalise to targetDb dBFS. */
export function normalizePeak(x: Float32Array, targetDb = -3): Float32Array {
  const p = peak(x);
  if (p === 0) return x.slice();
  const g = dbToAmp(targetDb) / p;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] * g;
  return out;
}

/** Linear-interpolation resampler with a simple box pre-filter when downsampling. */
export function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x.slice();
  let src = x;
  const ratio = from / to;
  if (ratio > 1) {
    const k = Math.floor(ratio);
    if (k > 1) {
      src = new Float32Array(x.length);
      let acc = 0;
      for (let i = 0; i < x.length; i++) {
        acc += x[i];
        if (i >= k) acc -= x[i - k];
        src[i] = acc / Math.min(i + 1, k);
      }
    }
  }
  const n = Math.floor((x.length * to) / from);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos), i1 = Math.min(src.length - 1, i0 + 1);
    const f = pos - i0;
    out[i] = src[i0] * (1 - f) + src[i1] * f;
  }
  return out;
}

/** 16-bit PCM mono WAV. */
export function encodeWav16(x: Float32Array, sampleRate: number): Uint8Array {
  const dataLen = x.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, dataLen, true);
  for (let i = 0; i < x.length; i++) {
    const s = Math.max(-1, Math.min(1, x[i]));
    v.setInt16(44 + i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
  }
  return new Uint8Array(buf);
}

export const OUTPUT_RATE = 22050;

/** Full post-processing chain. Returns null if the clip is silent. */
export function processClip(channels: Float32Array[], sampleRate: number): { wav: Uint8Array; durationMs: number } | null {
  const mono = mixToMono(channels);
  const trimmed = trimSilence(mono, sampleRate);
  if (trimmed.length === 0) return null;
  const rs = resample(trimmed, sampleRate, OUTPUT_RATE);
  const norm = normalizePeak(rs, -3);
  return { wav: encodeWav16(norm, OUTPUT_RATE), durationMs: Math.round((norm.length / OUTPUT_RATE) * 1000) };
}
