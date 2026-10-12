import { useEffect, useRef, useState } from 'react';
import { FLAVOURS } from '../../core/gamify';
import { addSqueeze } from '../../shared/progress';

export type Mood = 'happy' | 'proud' | 'sleepy' | 'alert' | 'wave' | 'squish' | 'cheer';
/** One-shot body animations (Duolingo-style): cheer = "Yeahh!" jump, roll, spin, wiggle, hop, rollIn (entrance). */
export type Action = 'cheer' | 'roll' | 'spin' | 'wiggle' | 'hop' | 'rollIn';

const INK = '#1d1b3a';

interface ArtProps { mood: Mood; body: string; blush: string; eye?: { x: number; y: number }; blink?: boolean; armsUp?: boolean }

/** Mochi drawn in a 200×200 box, as an SVG group, so it can be embedded (e.g. riding a scooter). */
export function MochiArt({ mood, body, blush, eye = { x: 0, y: 0 }, blink = false, armsUp = false }: ArtProps) {
  const dotEyes = mood === 'happy' || mood === 'wave';
  const eyes = blink && (dotEyes || mood === 'alert')
    ? <><path d="M75 105 H89" stroke={INK} strokeWidth="5" strokeLinecap="round" /><path d="M111 105 H125" stroke={INK} strokeWidth="5" strokeLinecap="round" /></>
    : {
      happy: <g transform={`translate(${eye.x} ${eye.y})`}><circle cx="82" cy="104" r="6" fill={INK} /><circle cx="118" cy="104" r="6" fill={INK} /></g>,
      wave: <g transform={`translate(${eye.x} ${eye.y})`}><circle cx="82" cy="104" r="6" fill={INK} /><circle cx="118" cy="104" r="6" fill={INK} /></g>,
      proud: <><path d="M74 106 Q82 96 90 106" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" /><path d="M110 106 Q118 96 126 106" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" /></>,
      cheer: <><path d="M74 106 Q82 94 90 106" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" /><path d="M110 106 Q118 94 126 106" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" /></>,
      sleepy: <><path d="M75 105 H89" stroke={INK} strokeWidth="5" strokeLinecap="round" /><path d="M111 105 H125" stroke={INK} strokeWidth="5" strokeLinecap="round" /></>,
      alert: <><circle cx="82" cy="102" r="8" fill="#fff" stroke={INK} strokeWidth="4" /><circle cx={83 + eye.x * 0.6} cy={103 + eye.y * 0.6} r="3.5" fill={INK} /><circle cx="118" cy="102" r="8" fill="#fff" stroke={INK} strokeWidth="4" /><circle cx={119 + eye.x * 0.6} cy={103 + eye.y * 0.6} r="3.5" fill={INK} /></>,
      squish: <><path d="M75 98 L88 105 L75 112" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M125 98 L112 105 L125 112" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>,
    }[mood];
  const mouth = {
    happy: <path d="M90 120 Q100 130 110 120" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />,
    wave: <path d="M90 120 Q100 130 110 120" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />,
    proud: <path d="M86 117 Q100 136 114 117 Z" fill={INK} />,
    cheer: <><path d="M82 116 Q100 146 118 116 Z" fill={INK} /><path d="M92 128 Q100 138 108 128 Z" fill="#ff8aa8" /></>,
    sleepy: <circle cx="100" cy="123" r="4" fill={INK} />,
    alert: <ellipse cx="100" cy="124" rx="6" ry="7" fill={INK} />,
    squish: <path d="M84 117 Q100 138 116 117 Z" fill={INK} />,
  }[mood];
  const up = armsUp || mood === 'cheer';
  return (
    <g>
      <path d="M82 160 L78 182" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M118 160 L122 182" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="74" cy="184" rx="9" ry="5" fill={INK} /><ellipse cx="126" cy="184" rx="9" ry="5" fill={INK} />
      {up ? (
        <>
          <path d="M46 108 Q30 92 26 70" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" /><circle cx="25" cy="67" r="6" fill={INK} />
          <path d="M154 108 Q170 92 174 70" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" /><circle cx="175" cy="67" r="6" fill={INK} />
        </>
      ) : (
        <>
          <path d="M44 120 Q28 126 22 140" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />
          <circle cx="21" cy="142" r="6" fill={INK} />
          <g className={mood === 'wave' ? 'arm-wave' : ''}>
            <path d="M156 116 Q172 104 178 86" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />
            <circle cx="179" cy="84" r="6" fill={INK} />
          </g>
        </>
      )}
      <path d="M100 52 C146 52 162 70 162 112 C162 150 142 164 100 164 C58 164 38 150 38 112 C38 70 54 52 100 52 Z" fill={body} stroke={INK} strokeWidth="5" />
      <ellipse cx="70" cy="74" rx="12" ry="7" fill="#fff" opacity="0.65" transform="rotate(-20 70 74)" />
      <ellipse cx="68" cy="122" rx="10" ry="6" fill={blush} opacity="0.85" />
      <ellipse cx="132" cy="122" rx="10" ry="6" fill={blush} opacity="0.85" />
      {eyes}
      {mouth}
    </g>
  );
}

interface Props {
  size?: number;
  mood?: Mood;
  body?: string;
  blush?: string;
  squeezable?: boolean;
  float?: boolean;
  /** Play a one-shot animation; Mochi calls onActionEnd when it finishes. */
  action?: Action | null;
  onActionEnd?: () => void;
  /** Speech burst shown during an action, e.g. "Yeahh!" */
  shout?: string;
  onSqueeze?: (count: number) => void;
  onDoubleClick?: () => void;
  /** Eyes follow the mouse and blink now and then. */
  alive?: boolean;
  title?: string;
}

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Mochi: a squishy rice-cake buddy. Squeezing it is a tiny "hands' plan B" (helper #3: something with your hands). */
export function Mochi({
  size = 160, mood = 'happy', body = FLAVOURS[0].body, blush = FLAVOURS[0].blush, squeezable = false, float = true,
  action = null, onActionEnd, shout, onSqueeze, onDoubleClick, alive = true, title = 'Mochi',
}: Props) {
  const [pressed, setPressed] = useState(false);
  const [pops, setPops] = useState<number[]>([]);
  const [eye, setEye] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);
  const squeezes = useRef(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const m: Mood = pressed ? 'squish' : action === 'cheer' ? 'cheer' : mood;

  // Eyes follow the pointer (big Mochis only: tiny icons stay still).
  useEffect(() => {
    if (!alive || size < 90 || reduced()) return;
    const onMove = (e: PointerEvent) => {
      const r = svgRef.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * 0.52);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 300);
      setEye({ x: (dx / d) * 4 * k, y: (dy / d) * 3 * k });
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [alive, size]);

  // Blink every few seconds.
  useEffect(() => {
    if (!alive || size < 60 || reduced()) return;
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => { setBlink(true); window.setTimeout(() => setBlink(false), 130); loop(); }, 2500 + Math.random() * 3500);
    };
    loop();
    return () => clearTimeout(t);
  }, [alive, size]);

  // Reduced motion: skip the animation but still report it as finished.
  useEffect(() => { if (action && reduced()) onActionEnd?.(); }, [action, onActionEnd]);

  const down = () => {
    if (!squeezable) return;
    setPressed(true);
    addSqueeze();
    squeezes.current++;
    onSqueeze?.(squeezes.current);
    const id = Date.now() + Math.random();
    setPops((p) => [...p.slice(-4), id]);
    setTimeout(() => setPops((p) => p.filter((x) => x !== id)), 750);
  };
  const up = () => setPressed(false);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div className={`mochi-act ${action && !reduced() ? `act-${action}` : ''}`} onAnimationEnd={(e) => { if (e.target === e.currentTarget) onActionEnd?.(); }}>
        <svg
          ref={svgRef}
          className={`mochi ${pressed ? 'squish' : ''} ${float && !action ? 'float' : ''}`} viewBox="0 0 200 200" width={size} height={size}
          role="img" aria-label={squeezable ? `${title}. Press to squeeze.` : title}
          onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} onDoubleClick={onDoubleClick}
          tabIndex={squeezable ? 0 : undefined}
          onKeyDown={(e) => { if (squeezable && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); down(); setTimeout(up, 120); } }}
        >
          <ellipse className="shadow" cx="100" cy="190" rx="52" ry="7" fill={INK} opacity="0.12" />
          <g className="bod"><MochiArt mood={m} body={body} blush={blush} eye={eye} blink={blink && !pressed} /></g>
        </svg>
      </div>
      {mood === 'sleepy' && !action && <div className="zzz" aria-hidden="true"><span>z</span><span>z</span><span>Z</span></div>}
      {action === 'cheer' && !reduced() && (
        <div className="stars" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--a': `${i * 45}deg` } as React.CSSProperties} />)}
        </div>
      )}
      {shout && action && <span className="burst shout" style={{ right: -size * 0.18, top: -size * 0.12 }}>{shout}</span>}
      {pops.map((id) => <span key={id} className="plus1" style={{ left: size * 0.62, top: size * 0.08 }} aria-hidden="true">squish!</span>)}
    </div>
  );
}
