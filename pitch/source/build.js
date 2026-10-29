const pptxgen = require('pptxgenjs');
const React = require('react');
const RDS = require('react-dom/server');
const sharp = require('sharp');
const md = require('react-icons/md');
const gi = require('react-icons/gi');
const path = require('path');
const { applyTheme } = require('/root/.claude/skills/synced/35174bef-1950-4811-85ea-2eaa2ae5c783_96592328-e285-4c24-83a8-5fd2984e2fc1/pptx/scripts/apply_theme.js');

const A = (f) => path.join(__dirname, 'assets', f);
const OUT = process.argv[2] || path.join(__dirname, 'TrichFree_NUSC_Pitch.pptx');

// TrichFree brand tokens (src/ui/tokens.css) + highlight yellow used for "the moment" motif.
const HEX = { ink: '2A2640', white: 'FFFFFF', strong: '56478F', paper: 'FBF8F4', accent: '6A5AA8', green: '3F8A63', yellow: 'F6C453', soft: 'ECE7F8', lilac: 'B5A8EC', muted: '5F5A75', mid: '8E7CD6', pale: 'C9BFF3', night: '363245' };
const THEME = {
  name: 'TrichFree', headFontFace: 'Calibri', bodyFontFace: 'Calibri',
  colors: { dk1: HEX.ink, lt1: HEX.white, dk2: HEX.strong, lt2: HEX.paper, accent1: HEX.accent, accent2: HEX.green, accent3: HEX.yellow, accent4: HEX.soft, accent5: HEX.lilac, accent6: HEX.muted, hlink: HEX.accent, folHlink: HEX.strong },
};

async function icon(Comp, color, size = 256) {
  const svg = RDS.renderToStaticMarkup(React.createElement(Comp, { color: '#' + color, size }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return 'image/png;base64,' + buf.toString('base64');
}

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = 'TrichFree — NUSC Impact Incubator pitch';
  pres.author = 'TrichFree team';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;

  const footer = (dark) => ({ text: { text: 'TrichFree  ·  NUSC Impact Incubator 2026', options: { x: 0.6, y: 7.02, w: 6, h: 0.3, fontSize: 10, color: dark ? C.accent5 : C.accent6, margin: 0 } } });
  pres.defineSlideMaster({
    title: 'TF_LIGHT', background: { color: HEX.paper },
    objects: [footer(false)],
    slideNumber: { x: 12.3, y: 7.02, w: 0.5, h: 0.3, fontSize: 10, color: HEX.muted, align: 'right' },
    placeholders: [],
  });
  pres.defineSlideMaster({
    title: 'TF_LIGHT_TITLE', background: { color: HEX.paper },
    objects: [footer(false), { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.4, w: 12.1, h: 0.85, fontSize: 36, bold: true, color: C.text1, valign: 'middle', align: 'left', margin: 0 }, text: '' } }],
    slideNumber: { x: 12.3, y: 7.02, w: 0.5, h: 0.3, fontSize: 10, color: HEX.muted, align: 'right' },
  });
  pres.defineSlideMaster({
    title: 'TF_DARK', background: { color: HEX.ink },
    objects: [footer(true)],
    slideNumber: { x: 12.3, y: 7.02, w: 0.5, h: 0.3, fontSize: 10, color: HEX.lilac, align: 'right' },
  });

  const T = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, valign: 'top', ...o });
  const card = (s, o, name) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { rectRadius: 0.18, line: { color: HEX.soft, width: 1 }, fill: { color: C.background1 }, shadow: { type: 'outer', color: HEX.ink, opacity: 0.08, blur: 8, offset: 2, angle: 90 }, objectName: name, ...o });
  const ring = (s, x, y, d, name) => s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { type: 'none' }, line: { color: C.accent3, width: 2.5, dashType: 'dash' }, objectName: name });
  const disc = async (s, x, y, d, Comp, fill, ic, name) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { type: 'none' }, objectName: name + ' circle' });
    const p = d * 0.58;
    s.addImage({ data: await icon(Comp, ic), x: x + (d - p) / 2, y: y + (d - p) / 2, w: p, h: p, altText: name, objectName: name + ' icon' });
  };

  // ---------------- 1. Hook ----------------
  pres.addSection({ title: 'Problem' });
  let s = pres.addSlide({ masterName: 'TF_DARK', sectionTitle: 'Problem' });
  s.addImage({ path: path.join('/tmp/claude-0/ra/repo/public/icons/128.png'), x: 0.7, y: 0.66, w: 0.34, h: 0.34, altText: 'TrichFree logo', objectName: 'Logo' });
  T(s, 'TRICHFREE  ·  NUSC IMPACT INCUBATOR 2026', { x: 1.15, y: 0.7, w: 6, h: 0.3, fontSize: 12, bold: true, color: C.accent5, charSpacing: 2, objectName: 'Eyebrow' });
  T(s, 'It starts before you notice', { x: 0.7, y: 1.55, w: 6.4, h: 2.1, fontSize: 54, bold: true, color: C.background1, fontFace: '+mj-lt', valign: 'bottom', objectName: 'Headline' });
  T(s, 'Studying. Reading. Working. And somewhere in the middle, a hand drifts to the hair.', { x: 0.7, y: 3.95, w: 5.9, h: 1.0, fontSize: 20, color: HEX.pale, objectName: 'Sub' });
  T(s, [{ text: 'TrichFree: when your hand moves, ', options: { color: C.background1 } }, { text: 'support responds.', options: { color: C.accent3 } }], { x: 0.7, y: 5.4, w: 6.2, h: 0.5, fontSize: 22, bold: true, objectName: 'Tagline' });
  s.addImage({ path: A('hero.png'), x: 7.0, y: 1.0, w: 5.9, h: 5.6, altText: 'Line drawing: a student at a laptop late at night, one hand raised to the crown of the head, circled', objectName: 'Hero illustration' });
  T(s, '11:42 pm', { x: 10.6, y: 0.7, w: 2.1, h: 0.5, fontSize: 26, bold: true, color: C.accent3, align: 'right', objectName: 'Clock' });
  s.addNotes(`[~25 s] Open with a pause.
"Quick question: did you touch your hair in the last five minutes? ... Most of us honestly don't know — and for most of us it doesn't matter. But for about one in sixty adults, that unnoticed touch is where trichotillomania begins: hair pulling they desperately want to stop, and often don't notice starting. We're TrichFree, and we build support for exactly that moment."

Notes: "1 in 60" = 1.7% current prevalence (Grant, Dougherty & Chamberlain 2020, n = 10,169 US adults). Do not share founder lived experience unless the founder has approved it.`);

  // ---------------- 2. Unmet need ----------------
  s = pres.addSlide({ masterName: 'TF_LIGHT_TITLE', sectionTitle: 'Problem' });
  s.addText('Help arrives after the moment has passed', { placeholder: 'title' });
  const stats = [['1.7%', 'of adults live with trichotillomania: about 1 in 60'], ['17.7', 'mean age it begins, right at university age'], ['1 in 4', 'report daily interference with their work']];
  stats.forEach(([n, c], i) => {
    const y = 1.6 + i * 1.42;
    T(s, n, { x: 0.6, y, w: 4.6, h: 0.72, fontSize: 44, bold: true, color: C.accent1, objectName: `Stat ${i + 1}` });
    T(s, c, { x: 0.6, y: y + 0.74, w: 4.6, h: 0.5, fontSize: 15, color: C.text1, objectName: `Stat ${i + 1} caption` });
  });
  T(s, 'Sources: Grant, Dougherty & Chamberlain, Psychiatry Res. 2020 (n = 10,169); Woods et al., Trichotillomania Impact Project, J Clin Psychiatry 2006.', { x: 0.6, y: 5.9, w: 4.6, h: 0.5, fontSize: 10, color: C.accent6, objectName: 'Stat sources' });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.6, y: 1.6, w: 7.1, h: 4.3, rectRadius: 0.25, fill: { color: C.accent4 }, line: { type: 'none' }, objectName: 'Quote panel' });
  T(s, '“', { x: 5.95, y: 1.55, w: 1, h: 1.0, fontSize: 96, bold: true, color: C.accent1, fontFace: 'Cambria', objectName: 'Quote mark' });
  T(s, 'If you could get each individual to record something for themselves which would help them at the moment of the behaviour and somehow AUTOMATICALLY play it back to them when they began pulling, I think it would stop them.', { x: 6.05, y: 2.45, w: 6.25, h: 2.55, fontSize: 21, italic: true, color: C.text1, fontFace: 'Cambria', objectName: 'Practitioner quote' });
  T(s, 'Practitioner with 30+ years of experience supporting people with trichotillomania', { x: 6.05, y: 5.15, w: 6.25, h: 0.55, fontSize: 14, bold: true, color: C.text2, objectName: 'Quote attribution' });
  T(s, [{ text: 'Habit-reversal therapy works, and its first step is awareness. ', options: { bold: true } }, { text: 'But automatic pulling skips that step, and therapy is weekly while urges are not.' }], { x: 0.6, y: 6.42, w: 12.1, h: 0.45, fontSize: 15, color: C.text1, objectName: 'Gap line' });
  s.addNotes(`[~40 s]
"Trichotillomania affects about 1.7 percent of adults. It typically begins around seventeen, just as people arrive at university, and one in four say it interferes with their work every day. The best-evidenced treatment, habit reversal training, starts with awareness. But much pulling is automatic: it happens while you read or study, and you only notice afterwards. Therapy is weekly. Urges are not. A practitioner with more than thirty years of experience wrote to us — [read the quote slowly]. That is what we had already begun to build."

Evidence: prevalence 1.7%, mean onset 17.7 y (Grant et al. 2020, PMC7212053). 23% daily interference with job duties (Trichotillomania Impact Project, Woods et al. 2006). HRT effect: meta-analysis of 24 RCTs, large benefit vs control (PMC12854921).
The quotation is one expert's opinion and an intervention idea, not evidence of effectiveness. Do not name or describe the practitioner beyond the attribution; this is early interest, not a partnership.`);

  // ---------------- 3. Meet TrichFree ----------------
  pres.addSection({ title: 'Solution' });
  s = pres.addSlide({ masterName: 'TF_LIGHT_TITLE', sectionTitle: 'Solution' });
  s.addText('Meet TrichFree', { placeholder: 'title' });
  T(s, 'A browser extension that uses the webcam you already have. When your hand moves, support responds.', { x: 0.6, y: 1.2, w: 12.1, h: 0.4, fontSize: 16, italic: true, color: C.text2, objectName: 'Subtitle' });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 1.8, w: 5.0, h: 5.0, rectRadius: 0.2, fill: { color: C.text1 }, line: { type: 'none' }, objectName: 'Sees panel' });
  T(s, 'WHAT TRICHFREE SEES', { x: 0.85, y: 1.98, w: 4.5, h: 0.3, fontSize: 12, bold: true, color: C.accent3, charSpacing: 2, objectName: 'Sees label' });
  s.addImage({ path: A('pipeline_c.png'), x: 0.85, y: 2.38, w: 2.95, h: 2.95, altText: 'Detector view: 21 hand landmarks pinching inside the crown zone, with hairline, sides, brow and lash zones drawn relative to the face', objectName: 'Pipeline view' });
  s.addImage({ path: A('hairmask.png'), x: 3.95, y: 2.38, w: 1.45, h: 1.09, altText: 'Hair segmentation confidence mask from the team demo video', objectName: 'Hair mask' });
  T(s, 'Hair mask from the hair-segmentation model on our demo video', { x: 3.95, y: 3.55, w: 1.45, h: 1.0, fontSize: 10, color: HEX.pale, objectName: 'Hair caption' });
  T(s, [
    { text: '21 hand points · face reference frame · hair segmentation', options: { bold: true, color: C.background1, breakLine: true } },
    { text: 'Zones are measured in face units, so they follow your head as you move. Shown: a synthetic test recording.', options: { color: HEX.pale } },
  ], { x: 0.85, y: 5.5, w: 4.55, h: 1.15, fontSize: 12, objectName: 'Sees caption' });

  const steps = [
    ['Notice', 'Finds a pinch in the areas you choose, including a lock held beside the face. A 0.8–1.5 s pause keeps brief touches quiet.', 'zones.png', 3.45, 1.385],
    ['Hear yourself', 'A soft chime, then a line you recorded: “Hey, it’s me. Your hand is up there.”', 'voice1.png', 1.28, 1.39],
    ['Stay in control', 'Your voice, a chime, a visual cue or off. Video never leaves the laptop; voice clips are never uploaded.', 'remind.png', 3.45, 1.07],
  ];
  steps.forEach(([title, body, img, iw, ih], i) => {
    const y = 1.8 + i * 1.7;
    s.addShape(pres.shapes.OVAL, { x: 5.95, y: y + 0.05, w: 0.48, h: 0.48, fill: { color: C.accent1 }, line: { type: 'none' }, objectName: `Step ${i + 1} badge` });
    T(s, String(i + 1), { x: 5.95, y: y + 0.05, w: 0.48, h: 0.48, fontSize: 18, bold: true, color: C.background1, align: 'center', valign: 'middle', objectName: `Step ${i + 1} number` });
    T(s, title, { x: 6.6, y: y + 0.05, w: 2.7, h: 0.45, fontSize: 19, bold: true, color: C.text1, objectName: `Step ${i + 1} title` });
    T(s, body, { x: 6.6, y: y + 0.52, w: 2.75, h: 1.05, fontSize: 13, color: C.accent6, objectName: `Step ${i + 1} text` });
    s.addImage({ path: A(img), x: 12.75 - iw, y: y + (1.45 - ih) / 2, w: iw, h: ih, altText: `Screenshot: ${title}`, objectName: `Step ${i + 1} screenshot` });
  });
  s.addNotes(`[~50 s] Point at the left panel first, then walk down the three steps.
"This is TrichFree: a browser extension that uses the webcam already on your laptop. On the left is what it sees: twenty-one points on your hand, your face as a reference frame, and a hair-segmentation model that knows where your hair is, even a lock held beside your face. You choose your areas: crown, hairline, temples, strands, brows, lashes. When your fingers pinch there for about a second, it doesn't buzz at you. It plays a soft chime, then your own voice: 'Hey, it's me. Your hand is up there.' Everything runs on the laptop. Video is never stored or sent."

Implementation references (claude/release-audit branch): MediaPipe hand/face landmarkers + hair_segmenter in src/workers/vision.worker.ts; zone geometry src/core/zones.ts + faceFrame.ts; hair contact src/core/hair.ts; scoring/dwell src/core/scorer.ts, temporal.ts, detectorConfig.ts (dwell 0.8 s pinch / 1.5 s open hand at Balanced); reminder engine src/core/engine.ts; clip choice src/core/clipPicker.ts; voice prompts src/shared/prompts.ts.
The left image is drawn from the real zone code on the synthetic fixture pinch-at-crown.json; the hair mask is a real model output from test/hair/masks-demo.json (no pixels stored). Screenshots are from the real extension build.
Option: replace the left panel with a 10-second live demo clip recorded on a real laptop.`);

  // ---------------- 4. Competitive positioning ----------------
  s = pres.addSlide({ masterName: 'TF_LIGHT', sectionTitle: 'Solution' });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 4.4, h: 7.5, fill: { color: C.accent1 }, line: { type: 'none' }, objectName: 'Left panel' });
  T(s, 'Competitive Positioning', { x: 0.55, y: 0.6, w: 3.5, h: 1.5, fontSize: 36, bold: true, color: C.background1, fontFace: '+mj-lt', objectName: 'Title' });
  T(s, 'Where support meets the moment', { x: 0.55, y: 2.15, w: 3.5, h: 0.4, fontSize: 16, color: C.accent4, objectName: 'Subtitle' });
  T(s, [
    { text: 'TrichFree is the only option that is both ' }, { text: 'in the moment', options: { bold: true } }, { text: ' and ' }, { text: 'personal', options: { bold: true } }, { text: ', on the webcam students already own.' },
  ], { x: 0.55, y: 2.85, w: 3.45, h: 2.0, fontSize: 19, color: C.background1, objectName: 'Positioning statement' });
  T(s, 'Bubble size = cost to the user', { x: 0.55, y: 5.35, w: 3.4, h: 0.3, fontSize: 12, color: C.accent4, objectName: 'Legend label' });
  [[0.25, 0.85], [0.42, 1.95], [0.62, 3.15]].forEach(([d, x], i) => s.addShape(pres.shapes.OVAL, { x, y: 5.95 - d / 2 + 0.3, w: d, h: d, fill: { color: C.accent4 }, line: { type: 'none' }, objectName: `Legend ${i}` }));
  T(s, 'Low', { x: 0.6, y: 6.65, w: 0.8, h: 0.3, fontSize: 11, color: C.accent4, objectName: 'Legend low' });
  T(s, 'High', { x: 3.0, y: 6.65, w: 0.9, h: 0.3, fontSize: 11, color: C.accent4, objectName: 'Legend high' });

  const cx = 8.85, cy = 3.65;
  s.addShape(pres.shapes.LINE, { x: 4.95, y: cy, w: 7.85, h: 0, line: { color: C.text1, width: 2, beginArrowType: 'triangle', endArrowType: 'triangle' }, objectName: 'X axis' });
  s.addShape(pres.shapes.LINE, { x: cx, y: 0.75, w: 0, h: 5.8, line: { color: C.text1, width: 2, beginArrowType: 'triangle', endArrowType: 'triangle' }, objectName: 'Y axis' });
  T(s, 'In the moment', { x: 11.0, y: cy + 0.1, w: 1.8, h: 0.35, fontSize: 15, bold: true, color: C.text1, align: 'right', objectName: 'X right' });
  T(s, 'After the moment', { x: 4.95, y: cy + 0.1, w: 2.0, h: 0.35, fontSize: 15, bold: true, color: C.text1, objectName: 'X left' });
  T(s, 'Personal', { x: cx + 0.15, y: 0.62, w: 1.6, h: 0.35, fontSize: 15, bold: true, color: C.text1, objectName: 'Y top' });
  T(s, 'Generic', { x: cx + 0.15, y: 6.25, w: 1.6, h: 0.35, fontSize: 15, bold: true, color: C.text1, objectName: 'Y bottom' });

  const comps = [
    ['Therapy (HRT)', 'personal, but between sessions', 6.55, 1.75, 1.3, md.MdPsychology],
    ['Habit-tracking apps', 'log it afterwards', 6.15, 4.65, 0.7, md.MdChecklist],
    ['Timers & generic reminders', 'not tied to the moment', 7.75, 5.45, 0.55, md.MdAlarm],
    ['Wearables (e.g. Keen2)', 'generic buzz · ~US$149–179', 11.0, 5.0, 1.15, md.MdWatch],
  ];
  for (const [name, sub, x, y, d, Comp] of comps) {
    s.addShape(pres.shapes.OVAL, { x: x - d / 2, y: y - d / 2, w: d, h: d, fill: { color: C.background1 }, line: { color: C.accent5, width: 1.5 }, objectName: name + ' bubble' });
    const p = d * 0.55;
    s.addImage({ data: await icon(Comp, HEX.accent), x: x - p / 2, y: y - p / 2, w: p, h: p, altText: name, objectName: name + ' icon' });
    T(s, [{ text: name, options: { bold: true, breakLine: true } }, { text: sub, options: { color: HEX.muted } }], { x: x - 1.3, y: y + d / 2 + 0.06, w: 2.6, h: 0.6, fontSize: 12, color: C.text1, align: 'center', objectName: name + ' label' });
  }
  const tx = 11.1, ty = 1.75, td = 0.95;
  ring(s, tx - td / 2 - 0.13, ty - td / 2 - 0.13, td + 0.26, 'TrichFree ring');
  s.addShape(pres.shapes.OVAL, { x: tx - td / 2, y: ty - td / 2, w: td, h: td, fill: { color: C.accent1 }, line: { type: 'none' }, objectName: 'TrichFree bubble' });
  s.addImage({ path: A('mochi.png'), x: tx - 0.38, y: ty - 0.42, w: 0.76, h: 0.76, altText: 'Mochi, the TrichFree companion', objectName: 'TrichFree icon' });
  T(s, [{ text: 'TrichFree', options: { bold: true, breakLine: true, color: C.accent1 } }, { text: 'own voice, own zones, no new device', options: { color: HEX.muted } }], { x: tx - 1.35, y: ty + td / 2 + 0.2, w: 2.7, h: 0.6, fontSize: 13, align: 'center', objectName: 'TrichFree label' });
  T(s, 'Positions are our assessment. Therapy stays the gold standard, and TrichFree complements it. Wearables go everywhere; we only see the desk.', { x: 4.95, y: 6.7, w: 7.85, h: 0.3, fontSize: 11, italic: true, color: C.accent6, objectName: 'Honesty caption' });
  s.addNotes(`[~32 s]
"Here's the landscape. Trackers and timers work after the moment. Wearables catch the moment, but with a generic buzz, and cost around a hundred and fifty US dollars. Therapy is deeply personal, but it lives between sessions. TrichFree sits alone in the top right: in the moment, and personal, on hardware students already own. Honestly, it only works at a desk, and we haven't yet measured real-world accuracy."

Evidence: HabitAware Keen2 launched at US$179 with an optional subscription (2020); other listings show ~US$149–150. Check habitaware.com for the current price before pitching. Keen2 detects gestures and vibrates; it is the closest direct competitor, so don't dismiss it — its strength is portability.
Positions are the team's qualitative judgment, not measured data.`);

  // ---------------- 5. Traction ----------------
  pres.addSection({ title: 'Evidence' });
  s = pres.addSlide({ masterName: 'TF_LIGHT_TITLE', sectionTitle: 'Evidence' });
  s.addText('Built, tested, and ready to be proven', { placeholder: 'title' });
  const tiles = [
    [md.MdExtension, 'Working extension + website', 'Chrome/Edge extension, companion site and an in-browser demo.'],
    [md.MdVerifiedUser, '283 automated tests', '192 unit · 57 database · 34 browser. Software reliability, not detection accuracy.'],
    [md.MdInsights, '350 / 350 simulated reaches', 'Caught by our evaluation harness, with 0 false alerts on everyday moves. Synthetic data.'],
    [gi.GiHairStrands, 'Hair-aware detection', 'Added hair segmentation after our first user test missed a strand pull.'],
    [md.MdLock, 'Private by design', 'Video never stored or sent. Our own release audit found and fixed 11 issues.'],
    [md.MdHandshake, 'Expert engagement', 'A practitioner with 30+ years of experience offered to stay in touch and help.'],
  ];
  for (let i = 0; i < tiles.length; i++) {
    const [Comp, head, body] = tiles[i];
    const x = 0.6 + (i % 3) * 4.1, y = 1.55 + Math.floor(i / 3) * 2.35;
    card(s, { x, y, w: 3.9, h: 2.15 }, `Tile ${i + 1}`);
    await disc(s, x + 0.28, y + 0.3, 1.0, Comp, HEX.soft, HEX.accent, `Tile ${i + 1}`);
    T(s, head, { x: x + 1.45, y: y + 0.3, w: 2.3, h: 1.0, fontSize: 19, bold: true, color: C.text1, valign: 'middle', objectName: `Tile ${i + 1} head` });
    T(s, body, { x: x + 0.28, y: y + 1.38, w: 3.4, h: 0.7, fontSize: 13, color: C.accent6, objectName: `Tile ${i + 1} body` });
  }
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 6.3, w: 12.1, h: 0.58, rectRadius: 0.29, fill: { color: C.accent4 }, line: { type: 'none' }, objectName: 'Next panel' });
  T(s, [{ text: 'NEXT   ', options: { bold: true, color: C.accent1 } }, { text: 'Label our 100+ founder trials  →  measure real-world accuracy with new users  →  14-day pilot (already built in)' }], { x: 0.9, y: 6.3, w: 11.6, h: 0.58, fontSize: 15, color: C.text1, valign: 'middle', objectName: 'Next text' });
  s.addNotes(`[~42 s]
"And it's real. A working extension and website. 283 automated tests. An evaluation harness that runs our real detector on simulated movements, even slow, noisy cameras: 350 of 350 simulated reaches caught, zero false alerts on drinking or resting your chin. That's synthetic, not real-world; measuring that is next. Our first real-user test failed: it missed a strand pulled beside the face. Within days we'd added hair segmentation. We listen, and we fix."

Evidence (claude/release-audit branch):
- Tests: IMPACT_READINESS.md §7 lists 192 unit, 57 database and 34 browser tests in CI (283 total). 193 unit tests re-run and passing on 2026-10-29; the DB and browser suites were not re-run for this deck.
- Detection: docs/DETECTION_REPORT.md: 7/7 reaches in every condition; 350/350 over 50 seeds with noise or 20% hand misses; 343/350 at 3 fps + noise + misses; 0 false alerts in 250 negative runs. Synthetic landmarks only. Known false positive: scratching the scalp.
- First user test 2026-10-05: missed strand pull, which led to hair segmentation (DECISIONS.md). Not yet re-tested with that user.
- Audit: docs/INDEPENDENT_RELEASE_AUDIT.md: 1 high, 4 medium, 6 low found and fixed. Internal, not an external review.
- 100+ founder trials: founder-reported; no logged results, labels or participant counts in the repository. Don't quote an accuracy figure from them.`);

  // ---------------- 6. Business model ----------------
  pres.addSection({ title: 'Business' });
  s = pres.addSlide({ masterName: 'TF_LIGHT_TITLE', sectionTitle: 'Business' });
  s.addText('Support should not be a privilege', { placeholder: 'title' });
  T(s, 'WHO WE CAN REACH', { x: 0.6, y: 1.45, w: 5.6, h: 0.3, fontSize: 12, bold: true, color: C.accent1, charSpacing: 2, objectName: 'Funnel label' });
  const funnel = [
    ['~1 in 60 adults', 'live with trichotillomania worldwide', 5.6, HEX.soft, C.text1],
    ['~80,000 in Singapore', 'adults, estimated from 1.7%', 4.6, HEX.lilac, C.text1],
    ['~680 at NUS', 'students: our beachhead, estimated', 3.6, HEX.accent, C.background1],
  ];
  funnel.forEach(([big, small, w, fill, color], i) => {
    const y = 1.85 + i * 1.02, x = 0.6 + (5.6 - w) / 2;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.9, rectRadius: 0.15, fill: { color: fill }, line: { type: 'none' }, objectName: `Funnel ${i + 1}` });
    T(s, [{ text: big, options: { bold: true, fontSize: 18, breakLine: true } }, { text: small, options: { fontSize: 12 } }], { x, y: y + 0.1, w, h: 0.72, color, align: 'center', valign: 'middle', objectName: `Funnel ${i + 1} text` });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 5.0, w: 5.6, h: 1.55, rectRadius: 0.2, fill: { color: C.text1 }, line: { type: 'none' }, objectName: 'Economics panel' });
  await disc(s, 0.85, 5.25, 0.7, md.MdBolt, HEX.yellow, HEX.ink, 'Economics');
  T(s, [{ text: 'Why the economics work', options: { bold: true, color: C.accent3, breakLine: true } }, { text: 'All AI runs on the user’s laptop: no cloud GPUs, no video storage. Each extra user costs almost nothing, so a free tier is sustainable.', options: { color: C.background1 } }], { x: 1.75, y: 5.18, w: 4.3, h: 1.3, fontSize: 14, objectName: 'Economics text' });
  T(s, 'Estimates apply 1.7% (Grant et al. 2020) to Singapore’s adult population and ~40,000 NUS students. Illustrative only.', { x: 0.6, y: 6.62, w: 5.6, h: 0.35, fontSize: 10, color: C.accent6, objectName: 'Funnel source' });

  const tiers = [
    [md.MdPerson, 'Individuals', 'Free', 'Core detection and own-voice reminders. No device to buy: a wearable costs ~US$150+, a webcam is already there.', HEX.green],
    [md.MdSchool, 'Institutions', 'Paid licence · hypothesis', 'University wellbeing services and BFRB organisations offer supported access to their communities. Willingness to pay is untested: we test it in Stage 3.', HEX.accent],
    [md.MdPsychology, 'Practitioners', 'Long-term · not built', 'A between-session tool clients choose to use, with consent-based sharing. The same hand-to-face engine could later support other BFRBs.', HEX.muted],
  ];
  for (let i = 0; i < tiers.length; i++) {
    const [Comp, who, chip, body, chipColor] = tiers[i];
    const y = 1.45 + i * 1.75;
    card(s, { x: 6.6, y, w: 6.1, h: 1.58 }, `Tier ${i + 1}`);
    await disc(s, 6.85, y + 0.25, 0.75, Comp, HEX.soft, HEX.accent, `Tier ${i + 1}`);
    T(s, who, { x: 7.8, y: y + 0.2, w: 2.0, h: 0.4, fontSize: 18, bold: true, color: C.text1, objectName: `Tier ${i + 1} title` });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 9.85, y: y + 0.22, w: 2.65, h: 0.36, rectRadius: 0.18, fill: { color: chipColor }, line: { type: 'none' }, objectName: `Tier ${i + 1} chip` });
    T(s, chip, { x: 9.85, y: y + 0.22, w: 2.65, h: 0.36, fontSize: 12, bold: true, color: C.background1, align: 'center', valign: 'middle', objectName: `Tier ${i + 1} chip text` });
    T(s, body, { x: 7.8, y: y + 0.68, w: 4.75, h: 0.85, fontSize: 13, color: C.accent6, objectName: `Tier ${i + 1} body` });
  }
  s.addNotes(`[~38 s]
"Support shouldn't depend on what you can afford. Individuals get the core tool free, and that's sustainable because all the AI runs on the user's own laptop. No cloud GPUs, no video storage: each extra user costs us almost nothing. Revenue comes from institutions, like university wellbeing services and BFRB organisations offering supported access, and later from practitioners. Our beachhead is NUS: on prevalence alone, roughly six hundred students. Whether institutions will pay is our biggest open question. Testing that is exactly why we need business mentorship."

Why this answers NUSC's 'strong potential for business development' criterion:
1) Near-zero marginal cost (on-device inference; voice and video never uploaded), so a free tier doesn't burn cash.
2) B2B2C channel: one institutional deal reaches many users, and universities already fund student wellbeing.
3) Platform: the face-relative hand-tracking engine generalises to other BFRBs (skin picking, nail biting). Not built; say so.
4) Clear, testable hypotheses for incubation to resolve: price point, buyer (wellbeing office vs counselling vs BFRB org), and procurement.
Assumptions: Singapore ~80k = 1.7% × ~4.8M adults (rough); NUS ~680 = 1.7% × ~40k students (check the current enrolment). Institutional willingness to pay is a hypothesis. No clinic or university has committed. Do not imply otherwise.`);

  // ---------------- 7. Staircase roadmap ----------------
  s = pres.addSlide({ masterName: 'TF_LIGHT_TITLE', sectionTitle: 'Business' });
  s.addText('Every step earns the next', { placeholder: 'title' });
  const base = 6.55;
  const stairs = [
    ['Validate', 'Nov–Dec 2026', 'Label our 100+ trials; observe 3–5 first-time users', 'Sensitivity · false alerts per hour', 'Technical & research mentors', 2.7, HEX.soft, 'ink'],
    ['Pilot', 'Q1 2027', 'Ethics-reviewed 14-day pilot: 3-day baseline, then chime vs own voice', 'Helpfulness · acceptability · hand-down rate', 'Ethics guidance · participant costs', 3.1, HEX.pale, 'ink'],
    ['Distribute', 'Q2 2027', 'Trials with NUS wellbeing services and BFRB communities', '14-day retention · partner interest', 'Introductions · business mentorship', 3.5, HEX.mid, 'white'],
    ['Personalise', 'H2 2027 →', 'Practitioner-informed features; consent-based sharing', 'Partner uptake · zero privacy incidents', 'Clinical mentorship · funding', 3.9, HEX.strong, 'white'],
  ];
  stairs.forEach(([title, when, act, metric, nusc, h, fill, tone], i) => {
    const x = 0.6 + i * 3.05, w = 2.95, y = base - h;
    const fg = tone === 'ink' ? C.text1 : C.background1;
    const sub = tone === 'ink' ? HEX.strong : HEX.soft;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: h + 0.15, rectRadius: 0.12, fill: { color: fill }, line: { type: 'none' }, objectName: `Stair ${i + 1}` });
    T(s, `STAGE ${i + 1}  ·  ${when}`, { x: x + 0.2, y: y + 0.15, w: w - 0.4, h: 0.28, fontSize: 11, bold: true, color: sub, objectName: `Stair ${i + 1} label` });
    T(s, title, { x: x + 0.2, y: y + 0.45, w: w - 0.4, h: 0.42, fontSize: 20, bold: true, color: fg, objectName: `Stair ${i + 1} title` });
    T(s, act, { x: x + 0.2, y: y + 0.9, w: w - 0.4, h: 0.62, fontSize: 12, color: fg, objectName: `Stair ${i + 1} activity` });
    T(s, [{ text: 'Measure: ', options: { bold: true } }, { text: metric }], { x: x + 0.2, y: base - 0.62, w: w - 0.4, h: 0.5, fontSize: 11, italic: true, color: fg, valign: 'bottom', objectName: `Stair ${i + 1} metric` });
    T(s, [{ text: 'NUSC: ', options: { bold: true } }, { text: nusc }], { x: x + 0.2, y: y + 1.6, w: w - 0.4, h: 0.45, fontSize: 11, color: sub, objectName: `Stair ${i + 1} nusc` });
  });
  s.addImage({ path: A('mochi.png'), x: 1.55, y: base - 2.7 - 1.05, w: 1.05, h: 1.05, altText: 'Mochi standing on the first step', objectName: 'Mochi' });
  await disc(s, 0.6 + 3 * 3.05 + 1.05, base - 3.9 - 1.0, 0.85, md.MdFlag, HEX.yellow, HEX.ink, 'Impact flag');
  T(s, 'Engagement is not clinical effectiveness: we measure them separately. Dates are targets.', { x: 0.6, y: 6.75, w: 9, h: 0.25, fontSize: 11, italic: true, color: C.accent6, objectName: 'Footnote' });
  s.addNotes(`[~38 s]
"We'll climb one step at a time. First, label our hundred-plus founder trials and test with new users, to measure real accuracy. Second, an ethics-reviewed fourteen-day pilot, already built into the extension, comparing a chime with your own voice. Third, distribution trials with institutions. Fourth, practitioner-informed personalisation. Every step has a metric, and we never confuse engagement with clinical effect."

Pilot mode exists in code (src/core/arms.ts): days 1–3 silent baseline; days 4–14 randomise each episode to CHIME or VOICE in permuted blocks of 4 seeded per participant; outcome = hand down within 10 s. The release audit (docs/INDEPENDENT_RELEASE_AUDIT.md) says 'no-go yet' for a real-user pilot until its listed actions are done; ethics review is required first.
Dates are the team's targets. Adjust them to the incubation timeline in the Info Kit.`);

  // ---------------- 8. Team, ask, vision ----------------
  pres.addSection({ title: 'Ask' });
  s = pres.addSlide({ masterName: 'TF_DARK', sectionTitle: 'Ask' });
  T(s, 'Let’s ease suffering, one quiet moment at a time', { x: 0.6, y: 0.45, w: 12.1, h: 0.9, fontSize: 36, bold: true, color: C.background1, fontFace: '+mj-lt', valign: 'middle', objectName: 'Headline' });
  const founders = [['[Founder 1 name]', 'Robotics & engineering: built the computer-vision pipeline'], ['[Founder 2 name]', 'Statistics: designed the evaluation and randomised pilot']];
  founders.forEach(([n, r], i) => {
    const y = 1.7 + i * 1.5;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y, w: 5.6, h: 1.32, rectRadius: 0.18, fill: { color: HEX.night }, line: { type: 'none' }, objectName: `Founder ${i + 1} card` });
    s.addShape(pres.shapes.OVAL, { x: 0.85, y: y + 0.2, w: 0.92, h: 0.92, fill: { color: C.accent1 }, line: { type: 'none' }, objectName: `Founder ${i + 1} photo placeholder` });
    T(s, 'photo', { x: 0.85, y: y + 0.2, w: 0.92, h: 0.92, fontSize: 11, color: C.accent4, align: 'center', valign: 'middle', objectName: `Founder ${i + 1} photo label` });
    T(s, [{ text: n, options: { bold: true, fontSize: 18, color: C.background1, breakLine: true } }, { text: r, options: { fontSize: 14, color: HEX.pale } }], { x: 2.0, y: y + 0.2, w: 4.05, h: 0.95, objectName: `Founder ${i + 1} text` });
  });
  T(s, 'We kept building through hackathon setbacks. When our first user test failed, we fixed it within days.', { x: 0.6, y: 4.8, w: 5.6, h: 0.7, fontSize: 14, italic: true, color: C.accent4, objectName: 'Grit line' });

  T(s, 'Why incubation, not just more time', { x: 6.8, y: 1.7, w: 5.9, h: 0.4, fontSize: 18, bold: true, color: C.accent3, objectName: 'Ask head' });
  T(s, 'We can build the software. We can’t yet run an ethical study, reach institutional buyers or form clinical partnerships alone.', { x: 6.8, y: 2.15, w: 5.9, h: 0.8, fontSize: 14, color: C.background1, objectName: 'Ask body' });
  const asks = [[md.MdPsychology, 'Clinical & research mentorship'], [md.MdScience, 'Ethics-reviewed pilot design'], [md.MdGroups, 'Access to student users'], [md.MdSavings, 'Business-model & willingness-to-pay testing'], [md.MdHub, 'Introductions to wellbeing & BFRB organisations']];
  for (let i = 0; i < asks.length; i++) {
    const y = 3.1 + i * 0.5;
    await disc(s, 6.8, y, 0.38, asks[i][0], HEX.accent, HEX.white, `Ask ${i + 1}`);
    T(s, asks[i][1], { x: 7.35, y, w: 5.3, h: 0.38, fontSize: 15, color: C.background1, valign: 'middle', objectName: `Ask ${i + 1} text` });
  }
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 5.75, w: 12.1, h: 1.05, rectRadius: 0.2, fill: { color: HEX.night }, line: { type: 'none' }, objectName: 'Closing panel' });
  T(s, 'Tonight at 11:42, someone’s hand will drift to their hair. We want the next thing they hear to be their own voice: “It’s okay. I’ve got you.”', { x: 0.9, y: 5.75, w: 10.3, h: 1.05, fontSize: 19, italic: true, color: C.accent4, valign: 'middle', fontFace: 'Cambria', objectName: 'Closing line' });
  s.addImage({ path: A('mochi.png'), x: 11.45, y: 5.72, w: 1.1, h: 1.1, altText: 'Mochi waving', objectName: 'Mochi' });
  s.addNotes(`[~40 s]
"We're [names]: an engineer who built the vision pipeline, and a statistician who designed the evaluation. We kept going through hackathon setbacks because this matters to us. We can write the software. What we can't do alone is run an ethical study, reach institutions and build clinical partnerships, and that's what NUSC unlocks. Tonight at 11:42, someone's hand will drift to their hair. We want the next thing they hear to be their own voice, saying: it's okay. I've got you. Thank you."

Fill in founder names, photos and one-line backgrounds. If NUSC funding is discussed, name concrete uses, sized from the Info Kit: pilot participant reimbursement and ethics administration; real-laptop testing across skin tones, hairstyles, head coverings and lighting; external security and accessibility review; Chrome Web Store, hosting and the database; structured user interviews.
Incubation selection and the later funding decision are separate. This slide asks for incubation; funding is framed as what it would unlock at each stage.`);

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('wrote', OUT);
})();
