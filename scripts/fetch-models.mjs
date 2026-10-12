// Downloads the official MediaPipe models into public/mediapipe/models (bundled, never fetched at runtime).
// Pinned to model version 1 and verified by SHA-256, so an upstream change or a corrupted or tampered download
// cannot silently change what detection runs. To adopt a new model version: change the URL, run with --force,
// re-run `npm test` and `npm run evaluate`, then update the checksum here.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const base = 'https://storage.googleapis.com/mediapipe-models';
const models = {
  'hand_landmarker.task': { url: `${base}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, sha256: 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1' },
  'face_landmarker.task': { url: `${base}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff' },
  'hair_segmenter.tflite': { url: `${base}/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite`, sha256: '2628cf3ce5f695f604cbea2841e00befcaa3624bf80caf3664bef2656d59bf84' },
};
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const dir = 'public/mediapipe/models';
mkdirSync(dir, { recursive: true });
for (const [name, { url, sha256: want }] of Object.entries(models)) {
  const out = `${dir}/${name}`;
  if (existsSync(out) && !process.argv.includes('--force')) {
    if (sha256(readFileSync(out)) === want) { console.log('[fetch-models] ok', out); continue; }
    console.warn('[fetch-models] checksum mismatch, downloading again:', out);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== want) throw new Error(`[fetch-models] ${name}: SHA-256 ${got} does not match the pinned ${want}. Not saved.`);
  writeFileSync(out, buf);
  console.log('[fetch-models] saved', out);
}
