// Downloads the official float16 MediaPipe models into public/mediapipe/models (bundled, never fetched at runtime).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
const base = 'https://storage.googleapis.com/mediapipe-models';
const models = {
  'hand_landmarker.task': `${base}/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task`,
  'face_landmarker.task': `${base}/face_landmarker/face_landmarker/float16/latest/face_landmarker.task`,
  'hair_segmenter.tflite': `${base}/image_segmenter/hair_segmenter/float32/latest/hair_segmenter.tflite`,
};
const dir = 'public/mediapipe/models';
mkdirSync(dir, { recursive: true });
for (const [name, url] of Object.entries(models)) {
  const out = `${dir}/${name}`;
  if (existsSync(out) && !process.argv.includes('--force')) { console.log('[fetch-models] exists', out); continue; }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log('[fetch-models] saved', out);
}
