// Runs a local camera + vision worker while a screen (Calibrate / Debug) is open.
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_CONFIG } from '../core/detectorConfig';
import type { Calibration, ZoneId } from '../core/types';
import type { OverlayFrame } from '../shared/messages';
import { openCamera, VisionClient } from '../shared/visionClient';
import type { WorkerStats } from '../workers/protocol';

export interface LocalVision {
  videoRef: React.RefObject<HTMLVideoElement>;
  ready: boolean;
  error: string | null;
  denied: boolean;
  stats: WorkerStats | null;
  delegate: string | null;
  /** Subscribe to every processed frame (landmarks + features). */
  subscribe: (fn: (f: OverlayFrame) => void) => () => void;
}

export function useLocalVision(active: boolean, zones: ZoneId[], calib: Calibration | null = null): LocalVision {
  const videoRef = useRef<HTMLVideoElement>(null);
  const subs = useRef(new Set<(f: OverlayFrame) => void>());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [stats, setStats] = useState<WorkerStats | null>(null);
  const [delegate, setDelegate] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let vision: VisionClient | null = null;
    let cancelled = false;
    (async () => {
      try {
        // Calling getUserMedia on this visible page grants the camera to the extension origin,
        // which lets the hidden offscreen document use it later (it cannot prompt).
        stream = await openCamera();
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
        vision = new VisionClient({
          cfg: DEFAULT_CONFIG, calib, zones, emitFrames: true,
          onMessage: (m) => {
            if (m.type === 'frame') subs.current.forEach((fn) => fn(m.data));
            else if (m.type === 'stats') setStats(m.stats);
            else if (m.type === 'ready') { setDelegate(m.delegate); setReady(true); }
            else if (m.type === 'error') setError(m.message);
          },
        });
        // The worker gets its own clone so the preview <video> keeps running.
        vision.attach(stream.getVideoTracks()[0].clone());
      } catch (e) {
        const name = (e as DOMException).name;
        if (name === 'NotAllowedError') setDenied(true);
        else setError(`Couldn't open the camera (${name || (e as Error).message}). Is another app using it?`);
      }
    })();
    return () => {
      cancelled = true;
      vision?.terminate();
      stream?.getTracks().forEach((t) => t.stop());
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return {
    videoRef, ready, error, denied, stats, delegate,
    subscribe: (fn) => { subs.current.add(fn); return () => subs.current.delete(fn); },
  };
}
