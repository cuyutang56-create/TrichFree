/// <reference lib="webworker" />
// Vision worker: MediaPipe HandLandmarker + FaceLandmarker (+ hair segmenter) on camera frames, then the core
// pipeline. Frames arrive either as a transferred VideoFrame stream (Chrome/Edge: MediaStreamTrackProcessor) or
// one ImageBitmap at a time (other browsers). Touches no chrome.* APIs. Closes every frame it receives.
import { FaceLandmarker, FilesetResolver, HandLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';
import { USED_FACE_INDICES } from '../core/faceIndices';
import { HAIR_CONF, hairContact, smoothContact, type HairMask } from '../core/hair';
import { DetectorPipeline } from '../core/pipeline';
import type { FaceLandmarks, FrameInput, HandObs, Vec3 } from '../core/types';
import type { WorkerIn, WorkerOut } from './protocol';

const post = (m: WorkerOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

let hand: HandLandmarker | null = null;
let face: FaceLandmarker | null = null;
let hairSeg: ImageSegmenter | null = null;
const HAIR_EVERY_N = 3; // ≈ 5 fps at 15 fps, and only while a hand is visible
const HAIR_MAX_AGE_MS = 450;
let delegate: 'GPU' | 'CPU' = 'GPU';
let pipeline: DetectorPipeline | null = null;
let emitFrames = false;
let running = false;
let initDone: Promise<void> | null = null;

/**
 * True when WebGL is emulated on the CPU (SwiftShader, llvmpipe, Microsoft Basic Render Driver: no GPU, or
 * hardware acceleration turned off). There, MediaPipe's own CPU path is faster and uses far less CPU than
 * running its GPU path through the emulator.
 */
function softwareWebGl(): boolean {
  try {
    const gl = new OffscreenCanvas(1, 1).getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return true;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = `${gl.getParameter(gl.RENDERER)} ${info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : ''}`;
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
  } catch {
    return false;
  }
}

async function createModels(m: Extract<WorkerIn, { type: 'init' }>) {
  const t0 = performance.now();
  // useModule=true: module workers cannot importScripts, so load the ES-module WASM loader.
  const fileset = await FilesetResolver.forVisionTasks(m.wasmBase, true);
  // An ES module only executes once, and tasks-vision clears self.ModuleFactory after each task is created.
  // Keep the factory and restore it before every createFromOptions call.
  const g = self as unknown as { ModuleFactory?: unknown };
  const loader = await import(/* @vite-ignore */ fileset.wasmLoaderPath);
  const factory = loader.default ?? g.ModuleFactory;
  const withFactory = <T>(fn: () => Promise<T>) => { g.ModuleFactory = factory; return fn(); };
  const make = async (d: 'GPU' | 'CPU') => {
    const canvas = d === 'GPU' ? { canvas: new OffscreenCanvas(1, 1) } : {};
    const h = await withFactory(() => HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: m.handModel, delegate: d }, runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5, ...canvas,
    }));
    const f = await withFactory(() => FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: m.faceModel, delegate: d }, runningMode: 'VIDEO', numFaces: 1,
      ...(d === 'GPU' ? { canvas: new OffscreenCanvas(1, 1) } : {}),
    }));
    return { h, f };
  };
  const first: 'GPU' | 'CPU' = m.delegate === 'CPU' || m.delegate === 'GPU' ? m.delegate : softwareWebGl() ? 'CPU' : 'GPU';
  const second = first === 'GPU' ? 'CPU' : 'GPU';
  try {
    ({ h: hand, f: face } = await make(first));
    delegate = first;
  } catch (e) {
    console.warn(`[vision] ${first} delegate failed, falling back to ${second}`, e);
    ({ h: hand, f: face } = await make(second));
    delegate = second;
  }
  // Hair segmenter (optional): without it, detection falls back to the position-based zones.
  if (m.hairModel) {
    const mk = (d: 'GPU' | 'CPU') => withFactory(() => ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: m.hairModel!, delegate: d }, runningMode: 'VIDEO',
      outputCategoryMask: false, outputConfidenceMasks: true, ...(d === 'GPU' ? { canvas: new OffscreenCanvas(1, 1) } : {}),
    }));
    try { hairSeg = await mk(delegate); } catch (e) {
      try { hairSeg = await mk('CPU'); } catch (e2) { console.warn('[vision] hair segmenter unavailable', e, e2); }
    }
  }
  post({ type: 'ready', delegate, loadMs: Math.round(performance.now() - t0) });
}

// hair_segmenter.tflite: confidence mask 0 = background, 1 = hair.
const HAIR_CATEGORY = 1;

const toVec = (l: { x: number; y: number; z: number }): Vec3 => [l.x, l.y, l.z];

// ---------- per-frame state (reset for every new camera stream) ----------
let lastTs = -1;
let frameNo = 0;
let stat = { frames: 0, face: 0, faceRuns: 0, hairRuns: 0, inferMs: 0, since: performance.now() };
let lastMask: (HairMask & { t: number }) | null = null;
const prevContact: Record<'Left' | 'Right', number | undefined> = { Left: undefined, Right: undefined };

function resetFrameState() {
  lastTs = -1;
  frameNo = 0;
  stat = { frames: 0, face: 0, faceRuns: 0, hairRuns: 0, inferMs: 0, since: performance.now() };
  lastMask = null;
  prevContact.Left = prevContact.Right = undefined;
}

/** Runs the models and the pipeline on one frame. The caller closes the frame. */
function processFrame(frame: VideoFrame | ImageBitmap, width: number, height: number, nowPerf: number) {
  if (!hand || !face || !pipeline) return;
  const cfg = pipeline.cfg;
  try {
    const ts = Math.max(lastTs + 1, Math.round(nowPerf));
    lastTs = ts;
    const t0 = performance.now();
    const hr = hand.detectForVideo(frame, ts);
    const runFace = frameNo % cfg.faceEveryNFrames === 0;
    let faceLms: FaceLandmarks | null = null;
    if (runFace) {
      stat.faceRuns++;
      const fr = face.detectForVideo(frame, ts);
      const lm = fr.faceLandmarks[0];
      if (lm) {
        faceLms = {};
        for (const i of USED_FACE_INDICES) faceLms[i] = toVec(lm[i]);
        stat.face++;
      }
    }
    const hands: HandObs[] = hr.landmarks.map((lms, i) => ({
      handedness: (hr.handedness[i]?.[0]?.categoryName as 'Left' | 'Right') ?? 'Right',
      landmarks: lms.map(toVec),
    }));
    if (hairSeg && hands.length) {
      if (!lastMask || frameNo % HAIR_EVERY_N === 0 || nowPerf - lastMask.t > HAIR_MAX_AGE_MS) {
        const res = hairSeg.segmentForVideo(frame, ts);
        const cm = res.confidenceMasks?.[HAIR_CATEGORY];
        if (cm) {
          const conf = cm.getAsFloat32Array();
          const data = new Uint8Array(conf.length);
          for (let i = 0; i < conf.length; i++) data[i] = conf[i] >= HAIR_CONF ? 1 : 0;
          lastMask = { width: cm.width, height: cm.height, data, t: nowPerf };
        }
        res.close();
        stat.hairRuns++;
      }
      if (lastMask && nowPerf - lastMask.t <= HAIR_MAX_AGE_MS) {
        for (const h of hands) {
          const c = smoothContact(prevContact[h.handedness], hairContact(h, lastMask));
          prevContact[h.handedness] = c;
          h.hairContact = Math.round(c * 100) / 100;
        }
      }
    } else if (!hands.length) {
      lastMask = null;
      prevContact.Left = prevContact.Right = undefined;
    }
    stat.inferMs += performance.now() - t0;
    const input: FrameInput = { t: Math.round(performance.timeOrigin + nowPerf), width, height, hands, face: faceLms, faceRan: runFace };
    const out = pipeline.process(input);
    if (out.events.length) post({ type: 'events', events: out.events });
    if (emitFrames) {
      post({ type: 'frame', data: { frame: input, features: out.features, tipsUV: out.tipsUV, p: out.p, pSmooth: out.pSmooth, phase: out.phase } });
    }
    frameNo++;
    stat.frames++;
  } catch (e) {
    post({ type: 'error', message: `inference: ${String(e)}` });
  }
  const el = performance.now() - stat.since;
  if (el >= 1000) {
    post({ type: 'stats', stats: {
      fps: (stat.frames * 1000) / el, delegate, frames: stat.frames,
      faceSeenRatio: stat.faceRuns ? stat.face / stat.faceRuns : 0, inferMs: stat.frames ? stat.inferMs / stat.frames : 0,
      hairRuns: stat.hairRuns, hair: !!hairSeg,
    } });
    stat = { frames: 0, face: 0, faceRuns: 0, hairRuns: 0, inferMs: 0, since: performance.now() };
  }
}

async function loop(readable: ReadableStream<VideoFrame>) {
  await initDone;
  const reader = readable.getReader();
  running = true;
  resetFrameState();
  // Token bucket: earn targetFps tokens per second (capped at 1.5 to absorb camera jitter); a frame costs 1.
  let allowance = 1;
  let lastArrival = performance.now();
  while (running) {
    const { value: frame, done } = await reader.read();
    if (done || !frame) break;
    const nowPerf = performance.now();
    // Frame skipping: at most targetFps on average; never queue frames.
    allowance = Math.min(1.5, allowance + ((nowPerf - lastArrival) * pipeline!.cfg.targetFps) / 1000);
    lastArrival = nowPerf;
    if (allowance < 1 || !hand || !face) { frame.close(); continue; }
    allowance -= 1;
    try { processFrame(frame, frame.displayWidth, frame.displayHeight, nowPerf); } finally { frame.close(); }
  }
  try { reader.releaseLock(); } catch { /* ignore */ }
  if (running) post({ type: 'streamEnded' });
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      pipeline = new DetectorPipeline(m.cfg, m.calib, m.zones);
      emitFrames = m.emitFrames;
      initDone = createModels(m).catch((err) => post({ type: 'error', message: `model load: ${String(err)}` }));
      break;
    case 'stream':
      loop(m.readable).catch((err) => post({ type: 'error', message: `loop: ${String(err)}` }));
      break;
    case 'bitmap':
      // One frame at a time; the page waits for 'done' before sending the next (natural back-pressure).
      await initDone;
      if (!running) { running = true; resetFrameState(); }
      try { processFrame(m.bitmap, m.bitmap.width, m.bitmap.height, performance.now()); } finally { m.bitmap.close(); }
      post({ type: 'done' });
      break;
    case 'update':
      if (pipeline) {
        if (m.cfg) pipeline.setConfig(m.cfg);
        if (m.calib !== undefined || m.zones) pipeline.setCalibration(m.calib ?? pipeline.calib, m.zones);
      }
      if (m.emitFrames !== undefined) emitFrames = m.emitFrames;
      if (m.model !== undefined) pipeline?.setModel(m.model);
      break;
    case 'stop':
      running = false;
      hand?.close(); face?.close(); hairSeg?.close();
      hand = null; face = null; hairSeg = null;
      break;
  }
};
