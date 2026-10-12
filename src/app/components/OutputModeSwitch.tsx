import type { OutputMode } from '../../core/types';
import { send } from '../../shared/messages';

const MODES: { id: OutputMode; label: string }[] = [
  { id: 'speakers', label: 'Speakers' },
  { id: 'earbuds', label: 'Earbuds' },
  { id: 'chime_only', label: 'Chime only' },
  { id: 'silent_log', label: 'Silent' },
];

export function OutputModeSwitch({ value }: { value: OutputMode }) {
  return (
    <div className="seg" role="radiogroup" aria-label="Sound">
      {MODES.map((m) => (
        <button key={m.id} role="radio" aria-checked={value === m.id} className={value === m.id ? 'on' : ''}
          onClick={() => send({ target: 'sw', type: 'SET_OUTPUT_MODE', mode: m.id })}>{m.label}</button>
      ))}
    </div>
  );
}
