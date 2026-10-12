import { FI } from './faceIndices';
import type { FaceGeom, FaceLandmarks, UV, Vec2, Vec3 } from './types';

const px = (p: Vec3, w: number, h: number): Vec2 => ({ x: p[0] * w, y: p[1] * h });
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Builds the face-normalised frame (Section 4.3). Returns null if required landmarks are missing. */
export function computeFaceGeom(face: FaceLandmarks, width: number, height: number): FaceGeom | null {
  const need = [FI.foreheadTop, FI.chin, FI.faceEdgeL, FI.faceEdgeR, FI.noseBridge];
  if (need.some((i) => !face[i])) return null;
  const P = (i: number) => px(face[i], width, height);
  const origin = P(FI.noseBridge);
  const faceW = dist(P(FI.faceEdgeL), P(FI.faceEdgeR));
  if (!(faceW > 1)) return null;
  const upRaw = sub(P(FI.foreheadTop), P(FI.chin));
  const len = Math.hypot(upRaw.x, upRaw.y) || 1;
  const up = { x: upRaw.x / len, y: upRaw.y / len };
  // Image y points down, so with up = (0,-1) this gives right = (1,0) (image right).
  const right = { x: -up.y, y: up.x };
  const geomBase = { origin, faceW, up, right };
  const uvOf = (i: number) => toUV(P(i), geomBase);
  const mean = (idx: readonly number[]) => {
    const pts = idx.filter((i) => face[i]).map(uvOf);
    return pts.length ? pts.reduce((s, p) => s + p.v, 0) / pts.length : 0.35;
  };
  const vBrow = (mean(FI.browL) + mean(FI.browR)) / 2;
  const eyeUV = (e: { upperLid: number; outer: number; inner: number }) => {
    const lid = face[e.upperLid] ? uvOf(e.upperLid) : null;
    const o = face[e.outer] ? uvOf(e.outer) : null;
    const n = face[e.inner] ? uvOf(e.inner) : null;
    const u = o && n ? (o.u + n.u) / 2 : lid?.u ?? 0;
    return { u, v: lid?.v ?? 0.15 };
  };
  const pts = Object.values(face).map((p) => px(p, width, height));
  const faceBoxPx = {
    x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)),
    x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)),
  };
  return {
    ...geomBase,
    v10: uvOf(FI.foreheadTop).v,
    vBrow,
    eyes: [eyeUV(FI.eyeL), eyeUV(FI.eyeR)],
    noseTipPx: face[FI.noseTip] ? P(FI.noseTip) : origin,
    mouthPx: face[FI.upperLipInner] ? P(FI.upperLipInner) : origin,
    faceBoxPx,
  };
}

export function toUV(p: Vec2, g: Pick<FaceGeom, 'origin' | 'faceW' | 'up' | 'right'>): UV {
  const d = sub(p, g.origin);
  return { u: dot(d, g.right) / g.faceW, v: dot(d, g.up) / g.faceW };
}

export function uvToPx(uv: UV, g: Pick<FaceGeom, 'origin' | 'faceW' | 'up' | 'right'>): Vec2 {
  return {
    x: g.origin.x + (uv.u * g.right.x + uv.v * g.up.x) * g.faceW,
    y: g.origin.y + (uv.u * g.right.y + uv.v * g.up.y) * g.faceW,
  };
}

export const landmarkPx = px;
