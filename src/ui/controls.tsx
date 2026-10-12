// Small accessible form controls shared by the extension and the website.
// Radio groups use real <input type="radio"> elements, so arrow keys, screen readers and forms work natively.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** Shows a new choice immediately, before the saved value comes back (settings are saved asynchronously). */
function useOptimistic<T>(value: T): [T, (v: T) => void] {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return [local, setLocal];
}

export function Seg<T extends string>({ label, value, options, onChange, hideLabel = false }: {
  label: string; value: T; options: [T, string][]; onChange: (v: T) => void; hideLabel?: boolean;
}) {
  const name = useId();
  const [cur, setCur] = useOptimistic(value);
  return (
    <fieldset className="seg" aria-label={hideLabel ? label : undefined}>
      {!hideLabel && <legend className="visually-hidden">{label}</legend>}
      {options.map(([v, text]) => (
        <label key={v}>
          <input type="radio" name={name} value={v} checked={cur === v} onChange={() => { setCur(v); onChange(v); }} />
          {text}
        </label>
      ))}
    </fieldset>
  );
}

export function Choices<T extends string>({ legend, value, options, onChange, describedBy }: {
  legend: string; value: T; options: { value: T; title: string; desc?: string }[]; onChange: (v: T) => void; describedBy?: string;
}) {
  const name = useId();
  const [cur, setCur] = useOptimistic(value);
  return (
    <fieldset className="choices" aria-describedby={describedBy}>
      <legend className="visually-hidden">{legend}</legend>
      {options.map((o) => (
        // Name = the title, description = the explanation (read once, after the name).
        <label className="choice" key={o.value}>
          <input type="radio" name={name} value={o.value} checked={cur === o.value} aria-labelledby={`${name}${o.value}-t`}
            aria-describedby={o.desc ? `${name}${o.value}-d` : undefined} onChange={() => { setCur(o.value); onChange(o.value); }} />
          <span><span className="choice-title" id={`${name}${o.value}-t`}>{o.title}</span>{o.desc && <span className="choice-desc" id={`${name}${o.value}-d`}>{o.desc}</span>}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function Switch({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  const [cur, setCur] = useOptimistic(checked);
  return (
    // The label wraps the hint too (so clicking either toggles), but the name is the label alone and the hint is
    // the description: otherwise screen readers read the hint twice.
    <label className="switch" htmlFor={id}>
      <span className="switch-text"><span id={`${id}-label`}>{label}</span>{hint && <small id={`${id}-hint`}>{hint}</small>}</span>
      <input id={id} type="checkbox" role="switch" checked={cur} disabled={disabled} aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => { setCur(e.target.checked); onChange(e.target.checked); }} />
    </label>
  );
}

export function Notice({ tone = 'info', title, children, action }: { tone?: 'info' | 'ok' | 'warn' | 'danger'; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`notice ${tone}`} role={tone === 'danger' || tone === 'warn' ? 'alert' : 'status'}>
      <div className="notice-body">
        {title && <strong style={{ display: 'block' }}>{title}</strong>}
        {children}
      </div>
      {action}
    </div>
  );
}

/** Modal confirmation: focus moves in, Escape cancels, focus returns to the opener. */
export function ConfirmDialog({ title, children, confirmLabel, danger = false, busy = false, onConfirm, onCancel }: {
  title: string; children: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Tab' && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select')).filter((x) => !x.hasAttribute('disabled'));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus(); };
  }, [onCancel]);
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="dialog stack" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <h2 id={titleId}>{title}</h2>
        <div>{children}</div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function Toast({ text }: { text: string }) {
  return text ? <div className="toast" role="status" aria-live="polite">{text}</div> : null;
}
