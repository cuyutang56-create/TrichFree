// Debug overlay drawing: landmarks, zone polygons (face units projected back to pixels) and readouts.
import { computeFaceGeom, uvToPx } from '../core/faceFrame';
import { USED_FACE_INDICES } from '../core/faceIndices';
import type { Calibration, FaceGeom, ZoneId } from '../core/types';
import { zoneRects } from '../core/zones';
import { HAIR_TOUCH } from '../core/hair';
import type { OverlayFrame } from '../shared/messages';

const HAND_EDGES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const ZONE_COLORS: Record<ZoneId, string> = { crown: '#5fb58e', hairline: '#7fb3e0', sides: '#c9a0e0', strands: '#f0a35e', brows: '#e0c070', lashes: '#e08a8a', beard: '#9aa0a6' };

let lastGeom: FaceGeom | null = null;

/** Canvas is drawn in un-mirrored image space; CSS mirrors it together with the video. */
export function drawOverlay(canvas: HTMLCanvasElement, d: OverlayFrame | null, zones: ZoneId[], calib: Calibration | null) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (!d) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
  const { width: W, height: H } = d.frame;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  ctx.clearRect(0, 0, W, H);

  const geom = (d.frame.face && computeFaceGeom(d.frame.face, W, H)) || lastGeom;
  if (d.frame.face && geom) lastGeom = geom;

  if (geom) {
    for (const z of zones) {
      for (const r of zoneRects(z, geom, calib)) {
        const vMin = Number.isFinite(r.vMin) ? r.vMin : r.vMax - 1.2;
        const vMax = Number.isFinite(r.vMax) ? r.vMax : r.vMin + 0.9;
        const spans = r.absU ? [[Math.max(r.uMin, 0), r.uMax], [-r.uMax, -Math.max(r.uMin, 0)]] : [[r.uMin, r.uMax]];
        for (const [u0, u1] of spans) {
          const pts = [uvToPx({ u: u0, v: vMin }, geom), uvToPx({ u: u1, v: vMin }, geom), uvToPx({ u: u1, v: vMax }, geom), uvToPx({ u: u0, v: vMax }, geom)];
          ctx.beginPath();
          pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.closePath();
          ctx.fillStyle = ZONE_COLORS[z] + (d.features.zone === z ? '66' : '26');
          ctx.strokeStyle = ZONE_COLORS[z];
          ctx.lineWidth = 1.5;
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }
  if (d.frame.face) {
    ctx.fillStyle = '#ffffffcc';
    for (const i of USED_FACE_INDICES) {
      const p = d.frame.face[i];
      if (p) { ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, 2, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  for (const h of d.frame.hands) {
    ctx.strokeStyle = d.p >= 0.6 ? '#ffcc66' : '#ffffff';
    ctx.lineWidth = 2;
    for (const [a, b] of HAND_EDGES) {
      ctx.beginPath();
      ctx.moveTo(h.landmarks[a][0] * W, h.landmarks[a][1] * H);
      ctx.lineTo(h.landmarks[b][0] * W, h.landmarks[b][1] * H);
      ctx.stroke();
    }
    // Fingertips turn orange-gold when they are in hair (hair segmenter), red otherwise.
    const inHair = (h.hairContact ?? 0) >= HAIR_TOUCH;
    for (const i of [4, 8, 12]) {
      ctx.fillStyle = inHair ? '#f0a35e' : '#ff7a59';
      if (inHair) { ctx.beginPath(); ctx.arc(h.landmarks[i][0] * W, h.landmarks[i][1] * H, 9, 0, Math.PI * 2); ctx.strokeStyle = '#f0a35e'; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(h.landmarks[i][0] * W, h.landmarks[i][1] * H, 4, 0, Math.PI * 2); ctx.fill();
    }
  }
}

export function readouts(d: OverlayFrame | null, fps?: number, delegate?: string): [string, string][] {
  if (!d) return [['fps', fps ? fps.toFixed(1) : '–']];
  const f = d.features;
  return [
    ['fps', fps ? fps.toFixed(1) : '–'], ['delegate', delegate ?? '–'], ['zone', f.zone ?? '–'],
    ['r', f.hasHand ? f.r.toFixed(2) : '–'], ['pinch', f.hasHand ? f.pinch.toFixed(2) : '–'],
    ['depth ok', f.hasHand ? String(f.depthConsistent) : '–'], ['hair', f.hasHand ? f.hairContact.toFixed(2) : '–'], ['veto', String(f.occlusionVeto)],
    ['face', f.faceMissing ? 'missing' : f.faceHeld ? 'held' : 'seen'],
    ['p', d.p.toFixed(2)], ['pSmooth', d.pSmooth.toFixed(2)], ['state', d.enginePhase ?? d.phase], ['jitter', f.tipJitter.toFixed(3)],
  ];
}
