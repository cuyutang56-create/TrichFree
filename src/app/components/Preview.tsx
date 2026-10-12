import { useEffect, useRef, useState } from 'react';
import type { Calibration } from '../../core/types';
import { activeCalibration, getSettings } from '../../shared/db';
import { on, send, type OverlayFrame } from '../../shared/messages';
import { openCamera } from '../../shared/visionClient';
import { drawOverlay, readouts } from '../overlay';
import { useDesk } from '../useDesk';

/** Live camera preview with the detection overlay streamed from desk mode (landmarks only, never pixels). */
export function Preview({ zones }: { zones: Calibration['zones'] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [last, setLast] = useState<OverlayFrame | null>(null);
  const [calib, setCalib] = useState<Calibration | null>(null);
  const desk = useDesk();

  useEffect(() => {
    let stream: MediaStream | null = null;
    openCamera().then((s) => { stream = s; if (videoRef.current) { videoRef.current.srcObject = s; void videoRef.current.play(); } }).catch(() => {});
    getSettings().then(async (s) => setCalib(await activeCalibration(s)));
    const ping = () => send({ target: 'offscreen', type: 'OFF_OVERLAY', on: true });
    ping();
    const t = setInterval(ping, 3000);
    const off = on('ui', (m) => { if (m.type === 'OVERLAY') setLast(m.data); });
    return () => { clearInterval(t); off(); stream?.getTracks().forEach((x) => x.stop()); send({ target: 'offscreen', type: 'OFF_OVERLAY', on: false }); };
  }, []);

  useEffect(() => { if (canvasRef.current) drawOverlay(canvasRef.current, last, zones, calib); }, [last, calib, zones]);

  return (
    <div style={{ marginTop: 12 }}>
      <div className="videoWrap">
        <video ref={videoRef} muted playsInline />
        <canvas ref={canvasRef} />
        <div className="hud">{desk.wanted ? readouts(last, desk.fps, desk.delegate).map(([k, v]) => `${k} ${v}`).join(' · ') : 'Start desk mode to see the overlay.'}</div>
      </div>
    </div>
  );
}
