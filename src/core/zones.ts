import type { Calibration, FaceGeom, UV, ZoneAdjust, ZoneId } from './types';

/**
 * A zone is a union of rectangles in face units. `absU` rectangles are mirrored left/right (they test |u|).
 * Unbounded sides use ±Infinity; absU zones centred on the midline use uMin = -1 (|u| is never below it).
 * Bounds are exclusive below and inclusive above on v, exclusive on u (matching Section 4.4).
 */
export interface ZoneRect { uMin: number; uMax: number; vMin: number; vMax: number; absU: boolean }

type ZoneGeom = Pick<FaceGeom, 'v10' | 'vBrow' | 'eyes'>;
type ZoneCalib = { zoneAdjust?: Calibration['zoneAdjust'] } | null | undefined;

const INF = Number.POSITIVE_INFINITY;

export function baseZoneRects(zone: ZoneId, g: ZoneGeom): ZoneRect[] {
  switch (zone) {
    case 'crown':
      return [{ absU: true, uMin: -1, uMax: 0.9, vMin: g.v10 + 0.1, vMax: INF }];
    case 'hairline':
      return [{ absU: true, uMin: -1, uMax: 0.75, vMin: g.v10 - 0.1, vMax: g.v10 + 0.25 }];
    case 'sides':
      return [{ absU: true, uMin: 0.45, uMax: 1.05, vMin: g.vBrow - 0.1, vMax: INF }];
    case 'brows':
      return [{ absU: true, uMin: 0.05, uMax: 0.55, vMin: g.vBrow - 0.12, vMax: g.vBrow + 0.12 }];
    case 'lashes':
      return g.eyes.map((e) => ({ absU: false, uMin: e.u - 0.18, uMax: e.u + 0.18, vMin: e.v - 0.08, vMax: e.v + 0.08 }));
    case 'beard':
      return [{ absU: true, uMin: -1, uMax: 0.6, vMin: -INF, vMax: -0.55 }];
    case 'strands':
      return []; // defined by hair contact, not by position (see features.ts)
  }
}

export function applyAdjust(r: ZoneRect, a: ZoneAdjust | undefined): ZoneRect {
  if (!a) return r;
  return {
    ...r,
    uMin: r.uMin - a.du,
    uMax: r.uMax + a.du,
    vMin: r.vMin - a.dvDown,
    vMax: r.vMax + a.dvUp,
  };
}

export function zoneRects(zone: ZoneId, g: ZoneGeom, calib?: ZoneCalib): ZoneRect[] {
  return baseZoneRects(zone, g).map((r) => applyAdjust(r, calib?.zoneAdjust?.[zone]));
}

export function inRect(p: UV, r: ZoneRect): boolean {
  const u = r.absU ? Math.abs(p.u) : p.u;
  return u > r.uMin && u < r.uMax && p.v > r.vMin && p.v <= r.vMax;
}

/** Pure zone test (Section 4.4). */
export function inZone(zone: ZoneId, p: UV, g: ZoneGeom, calib?: ZoneCalib): boolean {
  return zoneRects(zone, g, calib).some((r) => inRect(p, r));
}

/** First enabled zone containing the point, in a fixed priority (small zones first). */
const PRIORITY: ZoneId[] = ['lashes', 'brows', 'hairline', 'sides', 'crown', 'beard'];
export function zoneOf(p: UV, enabled: ZoneId[], g: ZoneGeom, calib?: ZoneCalib): ZoneId | null {
  for (const z of PRIORITY) if (enabled.includes(z) && inZone(z, p, g, calib)) return z;
  return null;
}

/** A representative centre of a zone (unbounded sides clamped), used for distance features. */
export function zoneCentre(zone: ZoneId, g: ZoneGeom, calib?: ZoneCalib): UV {
  const r = zoneRects(zone, g, calib)[0];
  if (!r) return { u: 0, v: 0 };
  const vMin = Number.isFinite(r.vMin) ? r.vMin : r.vMax - 0.5;
  const vMax = Number.isFinite(r.vMax) ? r.vMax : r.vMin + 0.5;
  const u = r.absU ? (Math.max(0, r.uMin) + r.uMax) / 2 : (r.uMin + r.uMax) / 2;
  return { u, v: (vMin + vMax) / 2 };
}

/** Distance from a point to the nearest rectangle of a zone (0 if inside). */
export function distToZone(zone: ZoneId, p: UV, g: ZoneGeom, calib?: ZoneCalib): { d: number; du: number; dv: number } {
  let best = { d: INF, du: 0, dv: 0 };
  for (const r of zoneRects(zone, g, calib)) {
    const u = r.absU ? Math.abs(p.u) : p.u;
    const du = u <= r.uMin ? u - r.uMin : u > r.uMax ? u - r.uMax : 0; // signed: <0 inside-ward / >0 outward
    const dv = p.v < r.vMin ? p.v - r.vMin : p.v > r.vMax ? p.v - r.vMax : 0;
    const d = Math.hypot(du, dv);
    if (d < best.d) best = { d, du, dv };
  }
  return best;
}
