import type { ScreenProps } from '../App';
import { COPY } from '../../shared/copy';
import { Mochi } from '../components/Mochi';
import { useEffect } from 'react';
import { useMochiShow } from '../useMochiShow';

/** Full-screen welcome: one big stage, Mochi in the middle, one button. */
export function Welcome({ update, go }: ScreenProps) {
  const show = useMochiShow();
  useEffect(() => { show.play('rollIn'); }, [show.play]);
  return (
    <div className="stage">
      <h1 className="hand">A pause, in your own voice</h1>
      <p className="lead muted">{COPY.welcomeLines[0]}</p>
      <div className="actor">
        <div style={{ position: 'relative' }}>
          <span className="burst" style={{ left: -26, top: -6, transform: 'rotate(-12deg)', zIndex: 1, width: 84, height: 84, fontSize: 19 }}>Hello!</span>
          <Mochi size={260} mood="wave" squeezable action={show.action} shout={show.shout} onActionEnd={show.end}
            onSqueeze={(n) => { if (n % 5 === 0) show.play('cheer', 'Yeahh!'); }} onDoubleClick={() => show.play('spin', 'Wheee!')} />
        </div>
        <div className="bubble" style={{ marginBottom: 110 }}>I’m Mochi. I sit with you while you work, and squish when you squeeze me. Go on, try.</div>
      </div>
      <p className="muted" style={{ maxWidth: 520 }}>{COPY.privacy}</p>
      <button className="lime big" style={{ maxWidth: 420, marginTop: 8 }} onClick={async () => { await update({ onboardingStep: 'consent' }); go('consent'); }}>Let’s start</button>
      <p className="muted small" style={{ marginTop: 6 }}>{COPY.bestIn}</p>
    </div>
  );
}
