import { useEffect, useRef, useState } from 'react';
import { MochiArt } from './Mochi';

// Hand-drawn tracks in a 600×200 box; one has a loop-de-loop.
const TRACKS = [
  'M-20 150 C 60 150, 90 60, 170 70 S 260 170, 330 150 S 430 40, 500 70 S 580 140, 640 120',
  'M-20 120 C 80 120, 120 170, 200 160 C 280 150, 300 60, 340 60 C 390 60, 400 130, 350 130 C 300 130, 320 40, 400 50 S 560 160, 640 140',
  'M-20 80 C 70 80, 120 160, 210 160 S 330 60, 400 90 S 520 170, 640 150',
];

interface Props { body: string; blush: string; onDone?: () => void; label?: string }

/** "Line Rider" moment: a line draws itself fast, then Mochi zooms along it on a scooter. */
export function LineRider({ body, blush, onDone, label = 'Wheee!' }: Props) {
  const [track] = useState(() => TRACKS[Math.floor(Math.random() * TRACKS.length)]);
  const pathRef = useRef<SVGPathElement>(null);
  const riderRef = useRef<SVGGElement>(null);
  const [phase, setPhase] = useState<'draw' | 'ride' | 'done'>('draw');
  const [len, setLen] = useState(0);
  const [cheer, setCheer] = useState(false);

  useEffect(() => { if (pathRef.current) setLen(pathRef.current.getTotalLength()); }, []);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { onDone?.(); return; }
    const t = setTimeout(() => setPhase('ride'), 650);
    return () => clearTimeout(t);
  }, [onDone]);

  useEffect(() => {
    if (phase !== 'ride' || !pathRef.current || !riderRef.current) return;
    const p = pathRef.current, L = p.getTotalLength(), dur = 2300;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; // ease in-out: speeds up downhill feel
      const s = e * L;
      const a = p.getPointAtLength(s), b = p.getPointAtLength(Math.min(L, s + 1));
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      riderRef.current!.setAttribute('transform', `translate(${a.x} ${a.y}) rotate(${ang})`);
      if (k > 0.85) setCheer(true);
      if (k < 1) raf = requestAnimationFrame(step);
      else { setPhase('done'); setTimeout(() => onDone?.(), 600); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, onDone]);

  return (
    <div className={`rider ${phase === 'done' ? 'out' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 600 200" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">
        <path ref={pathRef} d={track} fill="none" stroke="#d5f25a" strokeWidth="6" strokeLinecap="round"
          style={len ? { strokeDasharray: len, strokeDashoffset: phase === 'draw' ? len : 0, transition: 'stroke-dashoffset 600ms cubic-bezier(.6,0,.3,1)' } : { opacity: 0 }} />
        <g ref={riderRef} transform="translate(-100 -100)">
          {/* speed lines */}
          <g stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity={phase === 'ride' ? 0.8 : 0}>
            <path d="M-70 -30 H-46" /><path d="M-78 -16 H-50" /><path d="M-66 -44 H-50" />
          </g>
          {/* scooter */}
          <g transform="translate(0 -8)">
            <path d="M-34 0 H30" stroke="#1d1b3a" strokeWidth="6" strokeLinecap="round" />
            <path d="M26 0 L34 -46" stroke="#1d1b3a" strokeWidth="5" strokeLinecap="round" />
            <path d="M26 -46 H42" stroke="#1d1b3a" strokeWidth="5" strokeLinecap="round" />
            <circle cx="-28" cy="6" r="8" fill="#ff8ad6" stroke="#1d1b3a" strokeWidth="4" />
            <circle cx="26" cy="6" r="8" fill="#ff8ad6" stroke="#1d1b3a" strokeWidth="4" />
          </g>
          <g transform="translate(-30 -86) scale(0.36)"><MochiArt mood={cheer ? 'cheer' : 'happy'} body={body} blush={blush} /></g>
          {cheer && <text x="-10" y="-96" fontFamily="Gochi Hand, cursive" fontSize="28" fill="#d5f25a">{label}</text>}
        </g>
      </svg>
    </div>
  );
}
