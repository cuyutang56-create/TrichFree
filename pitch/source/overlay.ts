import { readFileSync, writeFileSync } from 'node:fs';
import { computeFaceGeom, uvToPx } from '/tmp/claude-0/ra/repo/src/core/faceFrame';
import { zoneRects } from '/tmp/claude-0/ra/repo/src/core/zones';
const W = 640, H = 480;
const fx = JSON.parse(readFileSync('/tmp/claude-0/ra/repo/test/fixtures/pinch-at-crown.json', 'utf8'));
let face: any = null; let pick: any = null;
for (const f of fx.frames) { if (f.face) face = f.face; if (f.hands.length && face && f.t > 2600) { pick = f; break; } }
const g = computeFaceGeom(face, W, H)!;
const col: Record<string, string> = { crown: '6A5AA8', hairline: '8E7CD6', sides: '3F8A63', brows: 'C77D3A', lashes: 'B5487A' };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="560" viewBox="20 -90 600 560"><rect x="20" y="-90" width="600" height="560" fill="#2A2640"/>';
for (const z of ['crown', 'hairline', 'sides', 'brows', 'lashes'] as const) {
  for (const r of zoneRects(z, g)) {
    const us = r.absU ? [[Math.max(r.uMin, 0), r.uMax], [-r.uMax, -Math.max(r.uMin, 0)]] : [[r.uMin, r.uMax]];
    for (const [u0, u1] of us) {
      const v0 = clamp(r.vMin, -1.2, 2.2), v1 = clamp(r.vMax, -1.2, 1.35);
      const pts = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => uvToPx({ u, v }, g));
      svg += '<polygon points="' + pts.map((p) => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ') + '" fill="#' + col[z] + '" fill-opacity="0.28" stroke="#' + col[z] + '" stroke-width="2"/>';
    }
  }
}
// face outline points
for (const k of Object.keys(face)) { const p = face[k]; svg += '<circle cx="'+(p[0]*W)+'" cy="'+(p[1]*H)+'" r="3.2" fill="#ECE7F8"/>'; }
const bones = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const L = pick.hands[0].landmarks.map((p: number[]) => ({ x: p[0]*W, y: p[1]*H }));
for (const [a, b] of bones) svg += '<line x1="'+L[a].x+'" y1="'+L[a].y+'" x2="'+L[b].x+'" y2="'+L[b].y+'" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>';
for (const p of L) svg += '<circle cx="'+p.x+'" cy="'+p.y+'" r="4.5" fill="#F6C453"/>';
const m = { x: (L[4].x + L[8].x)/2, y: (L[4].y + L[8].y)/2 };
svg += '<circle cx="'+m.x+'" cy="'+m.y+'" r="14" fill="none" stroke="#F6C453" stroke-width="3" stroke-dasharray="5 4"/>';
const lab = (t: string, u: number, v: number, c: string) => { const p = uvToPx({ u, v }, g); svg += '<text x="'+p.x+'" y="'+p.y+'" fill="#'+c+'" font-family="Arial" font-weight="700" font-size="17" text-anchor="middle">'+t+'</text>'; };
lab('CROWN', -0.35, 1.22, 'B5A8EC'); lab('HAIRLINE', -0.5, 0.66, 'C9BFF3'); lab('SIDES', -0.78, 0.1, '7CC39A'); lab('SIDES', 0.78, 0.1, '7CC39A'); lab('BROWS', -0.55, 0.36, 'E9A867'); lab('LASHES', 0.32, -0.08, 'E58BB4');
svg += '<text x="'+(m.x+22)+'" y="'+(m.y+6)+'" fill="#F6C453" font-family="Arial" font-weight="700" font-size="17">pinch</text>';
svg += '</svg>';
writeFileSync('/tmp/claude-0/-home-user-TrichFree/0732a1a4-7bda-5570-afca-fb1f564f1cb6/scratchpad/assets/pipeline.svg', svg);
console.log('frame t', pick.t, 'origin', g.origin, 'faceW', g.faceW);
