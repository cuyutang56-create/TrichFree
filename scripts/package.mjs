// Zips dist/ into release/trichfree-desk-v<version>.zip for the Chrome Web Store (or "Load unpacked" pilots).
import JSZip from 'jszip';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
if (manifest.version !== pkg.version) throw new Error('dist/manifest.json is stale; run npm run build');
for (const f of ['mediapipe/models/hand_landmarker.task', 'mediapipe/models/face_landmarker.task', 'mediapipe/wasm/vision_wasm_module_internal.wasm']) {
  statSync(join('dist', f)); // throws if a bundled asset is missing
}
const zip = new JSZip();
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (!name.endsWith('.map') && name !== '.DS_Store' && !/vision_wasm_(nosimd_)?internal\.(js|wasm)$/.test(name)) zip.file(relative('dist', p), readFileSync(p));
  }
};
walk('dist');
mkdirSync('release', { recursive: true });
const out = `release/trichfree-desk-v${pkg.version}.zip`;
writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
console.log(`[package] ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB)`);
