// Renders the static artwork the website uses (Mochi) from the same component the extension draws.
// Run: npx tsx scripts/make-site-art.tsx
import { writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MochiArt } from '../src/app/components/Mochi';

const svg = (mood: 'wave' | 'happy') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="Mochi, a small round rice-cake character">${renderToStaticMarkup(createElement("svg", null, createElement(MochiArt, { mood, body: "#F4F1E8", blush: "#F6B8C8" }))).replace(/^<svg>|<\/svg>$/g, "")}</svg>\n`;
writeFileSync('web/src/assets/mochi.svg', svg('wave'));
console.log('[make-site-art] wrote web/src/assets/mochi.svg');
