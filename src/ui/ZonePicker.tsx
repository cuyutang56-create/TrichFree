import type { ZoneId } from '../core/types';

export const ZONE_LABELS: Record<ZoneId, string> = {
  crown: 'Crown / top', hairline: 'Front hairline', sides: 'Sides / temples', strands: 'Strands / lengths', brows: 'Eyebrows', lashes: 'Eyelashes', beard: 'Beard',
};

// Simple line illustrations: a head outline with the area highlighted.
function Head({ zone }: { zone: ZoneId }) {
  const hl: Record<ZoneId, JSX.Element> = {
    crown: <path d="M22 26 Q36 6 50 26" strokeWidth="5" />,
    hairline: <path d="M24 28 Q36 20 48 28" strokeWidth="5" />,
    sides: <><path d="M18 30 L18 44" strokeWidth="5" /><path d="M54 30 L54 44" strokeWidth="5" /></>,
    strands: <><path d="M17 34 Q12 52 16 68" strokeWidth="4" /><path d="M55 34 Q60 52 56 68" strokeWidth="4" /></>,
    brows: <><path d="M26 36 L33 35" strokeWidth="4" /><path d="M39 35 L46 36" strokeWidth="4" /></>,
    lashes: <><path d="M27 41 L33 41" strokeWidth="4" /><path d="M39 41 L45 41" strokeWidth="4" /></>,
    beard: <path d="M24 56 Q36 70 48 56" strokeWidth="5" />,
  };
  return (
    <svg viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true" width="48" height="48">
      <ellipse cx="36" cy="40" rx="18" ry="24" strokeWidth="2" />
      <g stroke="var(--accent)">{hl[zone]}</g>
    </svg>
  );
}

/** Checkbox group: which areas to watch. At least one must stay selected. */
export function ZonePicker({ value, onChange }: { value: ZoneId[]; onChange: (z: ZoneId[]) => void }) {
  const all: ZoneId[] = ['crown', 'hairline', 'sides', 'strands', 'brows', 'lashes', 'beard'];
  const toggle = (z: ZoneId) => {
    const next = value.includes(z) ? value.filter((x) => x !== z) : [...value, z];
    if (next.length) onChange(next);
  };
  return (
    <fieldset className="zones">
      <legend className="visually-hidden">Areas to watch</legend>
      {all.map((z) => {
        const on = value.includes(z);
        return (
          <label key={z} className="zone">
            <input type="checkbox" checked={on} disabled={on && value.length === 1} onChange={() => toggle(z)} />
            <Head zone={z} />
            <span>{ZONE_LABELS[z]}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
