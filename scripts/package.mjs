// Zips dist/ into release/trichfree-desk-v<version>.zip (or --out <path>) for the Chrome Web Store or "Load unpacked" pilots.
import JSZip from 'jszip';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { releaseProblems } from './release-check.mjs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
if (manifest.version !== pkg.version) throw new Error('dist/manifest.json is stale; run npm run build');
for (const f of ['mediapipe/models/hand_landmarker.task', 'mediapipe/models/face_landmarker.task', 'mediapipe/wasm/vision_wasm_module_internal.wasm']) {
  statSync(join('dist', f)); // throws if a bundled asset is missing
}
// Refuse builds made with local test settings (use --allow-local only for throwaway local zips).
const { problems, notes } = releaseProblems(manifest, { testKeyId: readFileSync('e2e/fixtures/extension-key.pub.b64', 'utf8').trim() });
for (const n of notes) console.warn(`[package] note: ${n}`);
if (problems.length && !process.argv.includes('--allow-local')) {
  console.error(`[package] refusing to package this build:\n  - ${problems.join('\n  - ')}\nRebuild with production values (DEPLOYMENT.md §3), or pass --allow-local for a throwaway local zip.`);
  process.exit(1);
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
const outAt = process.argv.indexOf('--out');
const out = outAt > 0 ? process.argv[outAt + 1] : `release/trichfree-desk-v${pkg.version}.zip`; // --out: e.g. the website's downloads folder
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
console.log(`[package] ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB)`);
