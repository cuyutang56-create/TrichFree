// Hair-contact tuning harness. Input: real hair-confidence masks + face points (test/hair/masks-demo.json).
// Usage: node scripts/tune-hair.mjs test/hair/masks-demo.json
import { readFileSync } from 'node:fs';
const frames = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let seed = 1; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

function build(fr, thr) {
  const { w, h } = fr; const raw = Buffer.from(fr.conf, 'base64');
  const m = new Uint8Array(w * h); for (let i = 0; i < m.length; i++) m[i] = raw[i] >= thr * 255 ? 1 : 0;
  return m;
}
// distance transform (brute-force BFS) to nearest hair pixel
function distToHair(m, w, h) {
  const d = new Float32Array(w * h).fill(1e9); const q = [];
  for (let i = 0; i < m.length; i++) if (m[i]) { d[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) { const i = q[k], x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x+dx, ny = y+dy; if (nx<0||ny<0||nx>=w||ny>=h) continue; const j = ny*w+nx; if (d[j] > d[i]+1) { d[j] = d[i]+1; q.push(j); } } }
  return d;
}
/** occlude: the hand covers a blob below/around the fingertips (fingers + palm hide hair) */
function occluded(m, w, h, ax, ay, hs) {
  const o = m.slice(); const r = 0.22 * hs;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // fingertip blob + finger/palm column going down
    const inTip = (x-ax)**2 + (y-ay)**2 < r*r;
    const inPalm = Math.abs(x-ax) < 0.35*hs && y > ay && y < ay + 1.6*hs;
    if (inTip || inPalm) o[y*w+x] = 0;
  }
  return o;
}
const ring = (m, w, h, ax, ay, hs, radii = [0.25, 0.45]) => { let hit=0,n=0; for (const rr of radii) for (let k=0;k<16;k++){const a=2*Math.PI*k/16; const x=Math.round(ax+rr*hs*Math.cos(a)), y=Math.round(ay+rr*hs*Math.sin(a)); if(x<0||y<0||x>=w||y>=h)continue; n++; if(m[y*w+x])hit++;} return n?hit/n:0; };
const disk = (m, w, h, ax, ay, hs, R, full) => { let hit=0,n=0; const r=R*hs; for (let y=Math.floor(ay-r);y<=ay+r;y++) for (let x=Math.floor(ax-r);x<=ax+r;x++){ if((x-ax)**2+(y-ay)**2>r*r)continue; if(x<0||y<0||x>=w||y>=h)continue; n++; if(m[y*w+x])hit++; } return n?Math.min(1,(hit/n)/full):0; };

function samples(thr) {
  const out = [];
  for (const fr of frames) {
    if (!fr.face) continue;
    const { w, h } = fr; const m = build(fr, thr); const P = fr.face.map(([x,y]) => [x*w, y*h]);
    const faceW = Math.hypot(P[2][0]-P[3][0], P[2][1]-P[3][1]); const hs = 0.63 * faceW;
    const dist = distToHair(build(fr, 0.5), w, h);
    const add = (cls, ax, ay) => out.push({ cls, m: occluded(m, w, h, ax, ay, hs), w, h, ax, ay, hs });
    // positives: fingertips on hair (pinching a strand / in the scalp)
    for (let k=0;k<40;k++){ const i=Math.floor(rnd()*w*h); if (dist[i]===0) add('hair', i%w, (i/w)|0); }
    // negatives on the face (nose, mouth, cheeks, between brows)
    const [top, chin, L, R, bridge, nose, mouth] = P;
    for (const [x,y] of [bridge, nose, mouth, [(L[0]+nose[0])/2,(L[1]+nose[1])/2], [(R[0]+nose[0])/2,(R[1]+nose[1])/2]]) add('face', x, y);
    add('chin', chin[0], chin[1] + 0.12*faceW); add('chin', chin[0] - 0.2*faceW, chin[1]);
    // hard negatives: just beside the hair (0.15–0.35 face widths away)
    for (let k=0;k<400 && out.filter(s=>s.cls==='near'&&s.w===w&&s.m!==m).length<0;k++);
    let near = 0; for (let k=0;k<4000 && near<20;k++){ const i=Math.floor(rnd()*w*h); const d=dist[i]/faceW; if (d>0.15&&d<0.35){ add('near', i%w,(i/w)|0); near++; } }
    let bg = 0; for (let k=0;k<4000 && bg<20;k++){ const i=Math.floor(rnd()*w*h); if (dist[i]/faceW>0.6){ add('bg', i%w,(i/w)|0); bg++; } }
  }
  return out;
}
function evaluate(name, score, thr) {
  seed = 1; const S = samples(thr).map((s) => ({ ...s, v: score(s) }));
  const pos = S.filter(s=>s.cls==='hair'), neg = S.filter(s=>s.cls!=='hair');
  let best = { ba: 0, t: 0 };
  for (let t = 0.05; t <= 0.95; t += 0.025) {
    const tpr = pos.filter(s=>s.v>=t).length/pos.length, tnr = neg.filter(s=>s.v<t).length/neg.length;
    if ((tpr+tnr)/2 > best.ba) best = { ba: (tpr+tnr)/2, t, tpr, tnr };
  }
  const by = (c, t) => { const g = S.filter(s=>s.cls===c); return (g.filter(s=>s.v>=t).length/g.length*100).toFixed(0)+'%'; };
  console.log(`${name.padEnd(34)} conf≥${thr}  best thr ${best.t.toFixed(3)}  bal.acc ${(best.ba*100).toFixed(1)}%  | fires on: hair ${by('hair',best.t)} near ${by('near',best.t)} face ${by('face',best.t)} chin ${by('chin',best.t)} bg ${by('bg',best.t)}`);
  return best;
}

function at(name, score, thr, t) {
  seed = 1; const S = samples(thr).map((s) => ({ ...s, v: score(s) }));
  const r = (c) => { const g = S.filter(s=>s.cls===c); return g.filter(s=>s.v>=t).length/g.length; };
  const pos = r('hair'); const negs = ['near','face','chin','bg'].map((c)=>[c,r(c)]);
  const all = S.filter(s=>s.cls!=='hair'); const tnr = all.filter(s=>s.v<t).length/all.length;
  console.log(name.padEnd(36), 'thr', t, ' hair', (pos*100).toFixed(0)+'%', negs.map(([c,v])=>c+' '+(v*100).toFixed(0)+'%').join(' '), ' bal.acc', (((pos+tnr)/2)*100).toFixed(1)+'%');
}
at('CURRENT ring .25/.45 conf.5', (s) => ring(s.m,s.w,s.h,s.ax,s.ay,s.hs), 0.5, 0.25);
const rows = [];
for (const thr of [0.35, 0.4, 0.45, 0.5]) for (const radii of [[0.2,0.35],[0.25,0.45],[0.3,0.5],[0.2,0.4,0.6],[0.3,0.45]]) {
  const b = evaluate('ring '+radii.join('/'), (s) => ring(s.m,s.w,s.h,s.ax,s.ay,s.hs,radii), thr); rows.push({thr, radii, ...b});
}
rows.sort((a,b)=>b.ba-a.ba); console.log('TOP 5'); for (const r of rows.slice(0,5)) console.log(r.radii.join('/'), 'conf', r.thr, 'thr', r.t.toFixed(3), (r.ba*100).toFixed(1)+'%');
