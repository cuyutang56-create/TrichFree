// Reproducible detection evaluation on the synthetic landmark fixtures. Writes docs/DETECTION_REPORT.md.
// Usage: npm run evaluate            (regenerate fixtures first with `npm run fixtures` if the generator changed)
//        npm run evaluate -- --check (print only; do not write the report)
//
// Every number this prints comes from running the real detector pipeline and reminder engine over recorded-style
// landmark data. The fixtures are synthetic hands and faces, so the results describe how the logic behaves; they are
// NOT real-world or clinical accuracy.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { CONDITIONS, evaluate, summarise, type EvalRecording, type EvalResult } from '../src/core/evaluate';
import { configFor } from '../src/core/detectorConfig';
import { runReplay } from '../src/core/replay';
import type { Sensitivity } from '../src/core/types';

const DIR = 'test/fixtures';
const OUT = 'docs/DETECTION_REPORT.md';
const write = !process.argv.includes('--check');

const DESCRIPTIONS: Record<string, string> = {
  'pinch-at-crown': 'Fingers pinch at the crown for 4 s',
  'pinch-at-temple': 'Fingers pinch at the temple (sides zone) for 3.5 s',
  'pinch-strand': 'Pinching a lock of long hair beside the face (strands zone)',
  'reach-hairline-open': 'Open hand resting at the front hairline for 3 s (no pinch)',
  'three-reaches': 'Three separate 3 s reaches at the crown, 7 s apart',
  'chin-rest': 'Chin resting on the hand',
  'chin-rest-long-hair': 'Chin on an open hand with long hair falling nearby',
  'drinking-cup': 'Drinking from a cup (hand close to the camera)',
  'glasses-adjust': 'Two brief touches at the bridge of the glasses',
  'brief-touch-crown': 'A 0.5 s touch at the crown',
  'hover-boundary': 'Hand drifting back to the hairline for 40 s (2 s in, 1.2 s out)',
  'scratch-scalp': 'Scratching the scalp with an open hand for 3 s',
};

const recs = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as EvalRecording);
const ORDER = ['positive', 'negative', 'loop', 'limitation'];
recs.sort((a, b) => ORDER.indexOf(a.meta.category ?? '') - ORDER.indexOf(b.meta.category ?? '') || (a.meta.name ?? '').localeCompare(b.meta.name ?? ''));

const results: EvalResult[] = recs.flatMap((r) => CONDITIONS.map((c) => evaluate(r, c)));
const summary = summarise(results);
const s = (ms: number | null) => (ms == null ? '–' : `${(ms / 1000).toFixed(2)} s`);
const cell = (r: EvalResult) => {
  const ok = r.category === 'limitation' || r.category === 'loop' ? '' : r.alerts === r.expected ? '' : r.alerts < r.expected ? ' **missed**' : ' **false alert**';
  return `${r.alerts}${r.latencyMs != null ? ` (${s(r.latencyMs)})` : ''}${ok}`;
};

// The noisy conditions depend on the random seed: repeat them over many seeds rather than trusting one.
const SEEDS = 50;
const robust = CONDITIONS.filter((c) => c.noise || c.handDropout).map((c) => {
  const rs = Array.from({ length: SEEDS }, (_, k) => recs.map((r) => evaluate(r, { ...c, seed: k + 1 }))).flat();
  const [x] = summarise(rs.map((r) => ({ ...r, condition: c.label })));
  const missedBy = new Map<string, number>();
  for (const r of rs) if (r.category === 'positive' && r.alerts < r.expected) missedBy.set(r.name, (missedBy.get(r.name) ?? 0) + r.expected - r.alerts);
  return { ...x, negRuns: rs.filter((r) => r.category === 'negative').length, missedBy };
});

// Quiet time (cooldown) vs repeated reminders.
const QUIET = [5, 15, 30, 60, 120];
const loopRecs = recs.filter((r) => ['loop'].includes(r.meta.category ?? '') || r.meta.name === 'three-reaches');
const quiet = loopRecs.map((r) => ({ name: r.meta.name!, alerts: QUIET.map((q) => evaluate(r, CONDITIONS[0], 'balanced', { cooldownMs: q * 1000 }).alerts) }));

// Sensitivity presets at 15 fps.
const SENS: Sensitivity[] = ['relaxed', 'balanced', 'sensitive'];
const sens = SENS.map((sv) => {
  const rs = recs.map((r) => evaluate(r, CONDITIONS[0], sv));
  const [sm] = summarise(rs);
  return { sv, ...sm, limitation: rs.filter((r) => r.category === 'limitation').reduce((n, r) => n + r.alerts, 0) };
});

// Cost of the detection logic itself (pipeline + engine, no ML models), per frame, in this Node process.
const allFrames = recs.reduce((n, r) => n + r.frames.length, 0);
const cfg = configFor('balanced');
for (const r of recs) runReplay(r, { cfg }); // warm-up
const REPS = 20;
const t0 = performance.now();
for (let k = 0; k < REPS; k++) for (const r of recs) runReplay(r, { cfg });
const usPerFrame = ((performance.now() - t0) * 1000) / (REPS * allFrames);

// Optional browser measurements written by `npm run soak -- --write` (scripts/soak.mjs), if present.
interface Soak { date: string; environment: string; minutes: number; delegate: string; fpsMin: number; fpsAvg: number; cpuOff: number | null; cpuOn: number | null; rssOffMb: number | null; rssOnMb: number | null }
const readSoak = (f: string) => (existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Soak) : null);
const soak = readSoak('docs/soak-latest.json');
const soakLight = readSoak('docs/soak-lighter.json');

const today = new Date().toISOString().slice(0, 10);
const lines: string[] = [];
const p = (x = '') => lines.push(x);
p('# Detection report');
p();
p(`Generated ${today} by \`npm run evaluate\` (scripts/evaluate.ts). Re-run it after any detector change; \`npm test\` locks the key properties in (test/evaluate.test.ts).`);
p();
p('> **What this is and is not.** These results come from running the real detection pipeline and reminder engine over');
p('> **synthetic** hand and face landmark recordings, made by `scripts/make-fixtures.mjs`, under simulated degradations.');
p('> They show how the logic behaves on known movements: latency, missed simulated reaches, false alerts, alert loops.');
p('> They are **not** a measure of real-world or clinical accuracy. Real cameras, lighting, skin tones, hair, glasses,');
p('> occlusion and the MediaPipe models themselves are not exercised here. No user data was used.');
p();
p('## Fixtures');
p();
p('| Fixture | Kind | What happens | Expected reminders |');
p('|---|---|---|---|');
for (const r of recs) p(`| \`${r.meta.name}\` | ${r.meta.category} | ${DESCRIPTIONS[r.meta.name ?? ''] ?? ''} | ${r.meta.expect?.alerts ?? 0} |`);
p();
p('*positive*: a reminder is wanted. *negative*: an everyday movement that should stay quiet. *loop*: checks that a');
p('hand that keeps coming back does not cause a stream of reminders. *limitation*: ordinary touching that the detector');
p('cannot tell apart from a reach from landmarks alone (a known false positive, kept visible on purpose).');
p();
p('## Conditions');
p();
p('Each fixture is recorded at 15 frames per second. The harness degrades it the way slower computers and real cameras do:');
p();
p('| Condition | What changes |');
p('|---|---|');
for (const c of CONDITIONS) {
  const what = [c.fps ? `frames dropped to ${c.fps} per second (the face model runs on every 3rd processed frame)` : c.noise || c.handDropout ? '' : 'nothing (the recording as-is)', c.noise ? `landmark jitter σ=${c.noise} (≈${(c.noise * 640).toFixed(1)} px at 640 px)` : '', c.handDropout ? `the hand model misses the hand in ${c.handDropout * 100}% of frames` : ''].filter(Boolean).join('; ');
  p(`| ${c.label} | ${what} |`);
}
p();
p('All runs use the **balanced** sensitivity and the shortest quiet time (5 s), so repeated reminders are counted at');
p('their most frequent; the shipped default quiet time is 30 s (see below). Randomness is seeded, so every run gives');
p('the same numbers.');
p();
p('## Summary');
p();
p('| Condition | Reaches caught | False alerts (negatives) | Median latency | Worst latency |');
p('|---|---|---|---|---|');
for (const x of summary) p(`| ${x.condition} | ${x.positivesCaught} / ${x.positives} | ${x.falseAlerts} | ${s(x.medianLatencyMs)} | ${s(x.maxLatencyMs)} |`);
p();
p('A *reach* is one expected reminder (`three-reaches` holds three). Latency is the time from the hand arriving at the');
p('hair to the first reminder. It is mostly the deliberate dwell (0.8 s for a pinch, 1.5 s for an open hand at');
p('balanced sensitivity), which is what keeps brief touches quiet.');
p();
p(`### Over ${SEEDS} random seeds`);
p();
p('The conditions with noise or missed hands depend on the random seed, so they are repeated with seeds 1–50:');
p();
p('| Condition | Reaches caught | False alerts in negative runs | Misses by fixture |');
p('|---|---|---|---|');
for (const x of robust) p(`| ${x.condition} | ${x.positivesCaught} / ${x.positives} (${((100 * x.positivesCaught) / x.positives).toFixed(1)} %) | ${x.falseAlerts} in ${x.negRuns} | ${[...x.missedBy].map(([k, v]) => `\`${k}\` ${v}`).join(', ') || 'none'} |`);
p();
p('## Every fixture under every condition');
p();
p('Reminders produced (first-reminder latency for positives).');
p();
p(`| Fixture | ${CONDITIONS.map((c) => c.label).join(' | ')} |`);
p(`|---|${CONDITIONS.map(() => '---').join('|')}|`);
for (const r of recs) p(`| \`${r.meta.name}\` (expect ${r.meta.expect?.alerts ?? 0}) | ${CONDITIONS.map((c) => cell(results.find((x) => x.name === r.meta.name && x.condition === c.label)!)).join(' | ')} |`);
p();
p('## Quiet time and alert loops');
p();
p('Reminders at 15 fps for different quiet times (the pause after a reminder before another can fire; set in');
p('Settings → Reminder, 5 s to 10 min, default 30 s).');
p();
p(`| Fixture | ${QUIET.map((q) => `${q} s`).join(' | ')} |`);
p(`|---|${QUIET.map(() => '---').join('|')}|`);
for (const q of quiet) p(`| \`${q.name}\` | ${q.alerts.join(' | ')} |`);
p();
p('With the old fixed 5 s cooldown, a hand hovering at the hairline was reminded about every 10 s. The default is now');
p('30 s and configurable; the engine never re-alerts within one episode beyond the single follow-up (which can be');
p('turned off).');
p();
p('## Sensitivity presets (15 fps)');
p();
p('| Sensitivity | Reaches caught | False alerts (negatives) | Known false positive (scratching) | Median latency |');
p('|---|---|---|---|---|');
for (const x of sens) p(`| ${x.sv} | ${x.positivesCaught} / ${x.positives} | ${x.falseAlerts} | ${x.limitation} | ${s(x.medianLatencyMs)} |`);
p();
p('## Resource use');
p();
p(`- **Detection logic** (pipeline + reminder engine, excluding the ML models): **${usPerFrame.toFixed(1)} µs per frame**`);
p(`  in Node on this machine (${allFrames} frames × ${REPS} repetitions). It is negligible next to the models.`);
if (soak) {
  p(`- **In the browser** (\`npm run soak\`, ${soak.minutes} min each, ${soak.date}): ${soak.environment}.`);
  p('  CPU is the sum over all browser processes (100 % = one core); memory is their proportional set size.');
  p();
  p('  | | Frame rate (min–average) | Browser CPU | Memory |');
  p('  |---|---|---|---|');
  p(`  | Monitoring off | – | ${soak.cpuOff ?? '?'} % | ${soak.rssOffMb ?? '?'} MB |`);
  p(`  | Monitoring on (default, aims for 15 fps) | ${soak.fpsMin}–${soak.fpsAvg} fps | ${soak.cpuOn ?? '?'} % | ${soak.rssOnMb ?? '?'} MB |`);
  if (soakLight) p(`  | Monitoring on, "Lighter detection" (aims for 8 fps) | ${soakLight.fpsMin}–${soakLight.fpsAvg} fps | ${soakLight.cpuOn ?? '?'} % | ${soakLight.rssOnMb ?? '?'} MB |`);
  p();
  p('  This machine has no GPU, so these are close to a worst case: on a laptop with working GPU acceleration the models');
  p('  run on the GPU and the CPU figure should be much lower. That has **not** been measured yet (see "What would make');
  p('  this stronger").');
} else {
  p('- **In the browser**: run `npm run build && npm run soak -- --write` to measure frames per second, CPU and memory.');
}
p('- **On a real computer**, turn on Settings → "Show the debug page", then open Debug to see the live frame rate and');
p('  whether the GPU or CPU delegate is in use. The extension aims for 15 fps (8 with lighter detection); well below');
p('  that for 10 s the dashboard says "Watching (slowly)" instead of failing silently, and it reports a stall only');
p('  after 15 s with no frames.');
p();
p('## Findings and fixes from this harness');
p();
p('Each of these was found by this harness or the soak measurement and fixed; `test/temporal.test.ts`,');
p('`test/evaluate.test.ts` and `test/health.test.ts` keep them fixed.');
p();
p('- **Fixed: computers without GPU acceleration were very slow.** MediaPipe\'s GPU path ran through Chrome\'s software');
p('  GPU emulation: 2.4–2.7 fps at 372 % CPU on the machine above (measured 2026-10-12). The vision worker now detects a');
p('  software WebGL renderer (SwiftShader, llvmpipe, Microsoft Basic Render Driver) and uses MediaPipe\'s CPU path');
p('  instead, which gave the default-mode figures in the table above on the same machine. Machines with a real GPU are');
p('  unaffected.');
p('- **Added: "Lighter detection on this computer"** (Settings → Advanced, off by default): aims for 8 fps instead of 15.');
{
  const at = (label: string) => summary.find((x) => x.condition === label);
  const [a, b] = [at('15 fps'), at('8 fps')];
  const later = a?.medianLatencyMs != null && b?.medianLatencyMs != null ? `${((b.medianLatencyMs - a.medianLatencyMs) / 1000).toFixed(2)} s later (median)` : 'with similar latency';
  const less = soak?.cpuOn && soakLight?.cpuOn ? `, for ${Math.round((100 * (soak.cpuOn - soakLight.cpuOn)) / soak.cpuOn)} % less CPU on the machine above` : '';
  p(`  On these fixtures 8 fps catches ${b?.positivesCaught}/${b?.positives} reaches with ${b?.falseAlerts} false alerts, ${later}${less}.`);
  p('  The "running slowly" warning scales with the target, so it does not fire at 8 fps.');
}
p('- **Fixed: slow computers never completed a dwell.** At about 3 frames per second, frames arrive ~333 ms apart,');
p('  longer than the fixed 300 ms gap tolerance, so every reach reset its own dwell timer and **no reach was ever');
p('  caught**. The tolerance now adapts to the measured frame interval (it covers one missed frame, capped at 700 ms).');
p('- **Fixed: slow reactions on slow computers.** The smoothing constant was per frame, so at 3 fps the score took');
p('  five times longer to rise and one missed frame cost about 0.7 s. It now scales with the real time between frames');
p('  (identical at 15 fps). Worst-case latency in the hardest condition went from 4.0 s to the figure above.');
p('- **Fixed: time after the hand had gone could complete a dwell.** Widening the gap tolerance exposed this: a 0.5 s');
p('  touch at 3 fps became a reminder. Only a frame that actually sees the hand in the zone can now complete a dwell.');
p('- **Fixed: one missed hand detection counted as the hand leaving.** At 15 fps with 20 % missed detections, the');
p('  open-hand reach was missed in 11 of 50 seeds. A frame with no hand at all within 0.4 s of a hand in a zone is now');
p('  "no observation" (like the existing face hold): it neither lowers the score nor counts as a gap, and it can never');
p('  complete a dwell by itself. Now caught in 50 of 50 seeds, with no new false alerts.');
p('- **Fixed: alert loops.** The cooldown was a fixed 5 s. It is now a user setting with a 30 s default (table above).');
p('- **Known miss:** under the worst combined condition (3 fps + noise + 20 % missed hands), three missed frames in a');
p('  row leave over a second unobserved, which restarts the dwell, so a few reaches are missed (see the seed table).');
p('  The open-hand reach is the most affected, because its dwell is longest.');
p('- **Known false positive:** scratching the scalp looks like a reach to the detector. From hand and face landmarks');
p('  alone there is no reliable way to tell them apart. Users can switch a zone off, choose the relaxed sensitivity,');
p('  lengthen the quiet time or run the 2-minute camera tune-up. "Not a pull" (dashboard, popup, notification or');
p('  Ctrl/⌘+Shift+Y) records the false alarm on the device, where it counts in Insights and tunes the personal model.');
p();
p('## Limitations of this evaluation');
p();
p('- Synthetic landmarks only: the MediaPipe hand, face and hair models are not exercised, and neither are real');
p('  cameras, lighting, skin tones, hairstyles, head coverings, glasses, or the user turning away.');
p('- One synthetic person and head size; one camera geometry.');
p('- No real hair-pulling or BFRB behaviour was recorded. Real behaviour is varied and often subtle.');
p('- Resource use was measured on one machine with no GPU. It has not been measured on typical student laptops');
p('  (Windows and macOS, integrated graphics, on battery).');
p('- What would make this stronger: consented landmark-only recordings (no video) from pilot participants, labelled');
p('  by the participant, replayed with `npm run replay`; `npm run soak` on a few real laptops; and the per-session');
p('  average frame rate the pilot already records.');
p();

const md = lines.join('\n');
console.log(summary.map((x) => `${x.condition.padEnd(28)} caught ${x.positivesCaught}/${x.positives}  false ${x.falseAlerts}  median ${s(x.medianLatencyMs)}  worst ${s(x.maxLatencyMs)}`).join('\n'));
console.log(`detection logic: ${usPerFrame.toFixed(1)} µs/frame`);
if (write) {
  writeFileSync(OUT, md + '\n');
  console.log(`wrote ${OUT}`);
}
