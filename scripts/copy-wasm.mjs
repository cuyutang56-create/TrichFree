// Copies MediaPipe tasks-vision WASM into public/ so it is bundled inside the extension (MV3 forbids remote code).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
const src = 'node_modules/@mediapipe/tasks-vision/wasm';
const dst = 'public/mediapipe/wasm';
if (!existsSync(src)) { console.warn('[copy-wasm] tasks-vision not installed yet, skipping'); process.exit(0); }
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log('[copy-wasm] copied', src, '->', dst);
