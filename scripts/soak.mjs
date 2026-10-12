// Background soak: monitoring on, app tab closed, another page in front. Measures the frame rate the extension
// sustains and, on Linux, the browser's CPU and memory with monitoring off vs on.
// Usage: npm run build && npm run soak -- [minutes=3] [--video=file.mjpeg] [--headed] [--lighter] [--write]
//   --lighter  turns on Settings → "Lighter detection on this computer" first
//   --write    saves the result to docs/soak-latest.json (or soak-lighter.json), read by `npm run evaluate`
// The fake camera shows a test pattern with no face, so after 10 minutes the extension stops itself ("away"):
// keep runs shorter than that, or pass --video with a recording of a person.
import { chromium } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const minutes = Number(process.argv.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? 3);
const video = process.argv.find((a) => a.startsWith('--video='))?.slice(8);
const lighter = process.argv.includes('--lighter');
const DIST = resolve(process.env.E2E_DIST ?? 'dist');
if (!existsSync(join(DIST, 'manifest.json'))) { console.error(`No built extension in ${DIST}: run \`npm run build\` first.`); process.exit(1); }
const userDataDir = mkdtempSync(join(tmpdir(), 'tf-soak-'));
const ctx = await chromium.launchPersistentContext(userDataDir, {
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
  headless: !process.argv.includes('--headed'),
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    ...(video ? [`--use-file-for-fake-video-capture=${resolve(video)}`] : [])],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- CPU and memory of every process of this browser (Linux /proc only) ----
const linux = platform() === 'linux';
const TICK = 100; // USER_HZ on Linux
function browserPids() {
  const procs = readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map((pid) => {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      return { pid, ppid: fields[1], cmd: readFileSync(`/proc/${pid}/cmdline`, 'utf8') };
    } catch { return null; }
  }).filter(Boolean);
  const roots = procs.filter((p) => p.cmd.includes(userDataDir)).map((p) => p.pid);
  const tree = new Set(roots);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of procs) if (!tree.has(p.pid) && tree.has(p.ppid)) { tree.add(p.pid); grew = true; }
  }
  return [...tree];
}
function sample() {
  let ticks = 0, pssKb = 0;
  for (const pid of browserPids()) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      ticks += Number(f[11]) + Number(f[12]); // utime + stime
      const roll = readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8').match(/^Pss:\s+(\d+)/m);
      pssKb += roll ? Number(roll[1]) : 0;
    } catch { /* process exited */ }
  }
  return { t: Date.now(), ticks, pssKb };
}
async function measure(seconds) {
  const a = sample();
  const mem = [];
  for (let k = 0; k < seconds / 5; k++) { await sleep(5000); mem.push(sample().pssKb); }
  const b = sample();
  return { cpu: (100 * (b.ticks - a.ticks)) / TICK / ((b.t - a.t) / 1000), pssMb: mem.reduce((x, y) => x + y, 0) / mem.length / 1024 };
}

const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const app = ctx.pages().find((p) => p.url().includes('chrome-extension')) ?? (await ctx.waitForEvent('page'));
await app.waitForLoadState();
await app.evaluate(async () => { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach((t) => t.stop()); });
if (lighter) {
  await app.getByRole('button', { name: 'Continue' }).click();
  await app.getByRole('button', { name: 'Finish without starting' }).click();
  await app.waitForURL(/#\/home/);
  await app.goto(app.url().replace(/#.*$/, '#/settings'));
  await app.getByLabel('Lighter detection on this computer', { exact: true }).check();
  await app.waitForTimeout(500);
}
// Put something else in front and close the app tab, so only the extension's background work remains.
const other = await ctx.newPage();
await other.goto('about:blank');
await other.bringToFront();
const opener = await ctx.newPage();
await opener.goto(app.url());
await app.close();

let off = null;
if (linux) {
  await sleep(5000);
  off = await measure(20);
  console.log(`monitoring off: CPU ${off.cpu.toFixed(0)} %, memory ${off.pssMb.toFixed(0)} MB`);
}
await opener.evaluate(() => chrome.runtime.sendMessage({ target: 'sw', type: 'DESK_START' }));
await opener.close();

const read = async () => {
  try { return (await sw.evaluate(() => chrome.storage.local.get('deskState'))).deskState; }
  catch { const w = ctx.serviceWorkers()[0]; return w ? (await w.evaluate(() => chrome.storage.local.get('deskState'))).deskState : null; }
};
// Let the models load and the frame rate settle before measuring.
await sleep(20_000);
const fps = [];
let delegate = '?';
const end = Date.now() + minutes * 60_000;
let on = null;
const cpuRun = linux ? measure(Math.max(10, minutes * 60 - 10)) : null;
while (Date.now() < end) {
  await sleep(10_000);
  const d = await read();
  if (d?.status === 'watching' || d?.status === 'slow') fps.push(d.fps);
  if (d?.delegate) delegate = d.delegate;
  console.log(new Date().toISOString().slice(11, 19), d?.status, `${d?.fps?.toFixed(1)} fps`, d?.delegate, `hb ${d?.lastHeartbeat ? Math.round((Date.now() - d.lastHeartbeat) / 1000) : '?'}s ago`);
}
if (cpuRun) on = await cpuRun;
await ctx.close();

if (!fps.length) { console.log('\nSOAK: monitoring never reached "watching": see the log above.'); process.exit(1); }
const min = Math.min(...fps), avg = fps.reduce((a, b) => a + b, 0) / fps.length;
console.log(`\nSOAK ${minutes} min: ${min.toFixed(1)}–${avg.toFixed(1)} fps (min–avg), delegate ${delegate}`);
if (on) console.log(`monitoring on: CPU ${on.cpu.toFixed(0)} %, memory ${on.pssMb.toFixed(0)} MB (100 % = one core, ${cpus().length} cores)`);
if (process.argv.includes('--write')) {
  const env = process.env.SOAK_ENV ?? `${platform()}, ${cpus().length} × ${cpus()[0]?.model?.trim() ?? 'CPU'}, ${process.argv.includes('--headed') ? 'headed' : 'headless'} Chromium`;
  const out = lighter ? 'docs/soak-lighter.json' : 'docs/soak-latest.json';
  writeFileSync(out, JSON.stringify({
    date: new Date().toISOString().slice(0, 10), environment: env, minutes, delegate, lighter,
    fpsMin: Number(min.toFixed(1)), fpsAvg: Number(avg.toFixed(1)),
    cpuOff: off ? Math.round(off.cpu) : null, cpuOn: on ? Math.round(on.cpu) : null,
    rssOffMb: off ? Math.round(off.pssMb) : null, rssOnMb: on ? Math.round(on.pssMb) : null,
  }, null, 2) + '\n');
  console.log(`wrote ${out}`);
}
