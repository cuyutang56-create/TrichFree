import type { DeskState } from '../../shared/messages';

export function statusText(d: DeskState): { text: string; tone: '' | 'ok' | 'warn' } {
  if (!d.wanted && d.status !== 'paused') return { text: 'Off', tone: '' };
  switch (d.status) {
    case 'starting': return { text: 'Starting…', tone: '' };
    case 'watching': return { text: `Watching · ${Math.round(d.fps)} fps`, tone: 'ok' };
    case 'slow': return { text: `Slow · ${Math.round(d.fps)} fps`, tone: 'warn' };
    case 'paused': return { text: d.pausedUntil ? `Paused until ${new Date(d.pausedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Paused', tone: 'warn' };
    case 'camera_busy': return { text: 'Camera busy', tone: 'warn' };
    case 'problem': return { text: 'Needs a restart', tone: 'warn' };
    case 'error': return { text: 'Something went wrong', tone: 'warn' };
    default: return { text: 'Off', tone: '' };
  }
}

export function StatusPill({ desk }: { desk: DeskState }) {
  const s = statusText(desk);
  return <span className={`pill ${s.tone}`} role="status"><span className="dot" />{s.text}</span>;
}
