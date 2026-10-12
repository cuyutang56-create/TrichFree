// Passwordless sign-in with a 6-digit email code. Used by the extension (via its service worker) and the website.
// Codes are used instead of magic links because a link opened on a phone cannot sign in a laptop; a code can.
import { useId, useState } from 'react';
import { CODE_RE, EMAIL_RE } from '../sync/remote';

export type AuthResult = { ok: true } | { ok: false; message: string };

export function SignInForm({ sendCode, verify, privacyHref, onDone, compact = false }: {
  sendCode: (email: string) => Promise<AuthResult>;
  verify: (email: string, code: string) => Promise<AuthResult>;
  privacyHref?: string;
  onDone?: () => void;
  compact?: boolean;
}) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const id = useId();

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!EMAIL_RE.test(v)) { setError('Please enter a valid email address.'); return; }
    setBusy(true); setError('');
    const r = await sendCode(v).catch((err) => ({ ok: false as const, message: String(err) }));
    setBusy(false);
    if (r.ok) { setStep('code'); setInfo(`We sent a 6-digit code to ${v}. It expires in 10 minutes.`); }
    else setError(r.message);
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.replace(/\s+/g, '');
    if (!CODE_RE.test(c)) { setError('The code has 6 digits.'); return; }
    setBusy(true); setError('');
    const r = await verify(email.trim().toLowerCase(), c).catch((err) => ({ ok: false as const, message: String(err) }));
    setBusy(false);
    if (r.ok) onDone?.();
    else setError(r.message);
  };

  if (step === 'email') {
    return (
      <form className="stack" onSubmit={submitEmail} noValidate aria-describedby={`${id}-desc`}>
        {!compact && <p id={`${id}-desc`} className="muted small">No password needed. We email you a one-time code. Creating an account lets you use your settings on other computers.</p>}
        <div className="field">
          <label htmlFor={`${id}-email`}>Email</label>
          <input id={`${id}-email`} type="email" autoComplete="email" inputMode="email" value={email} required
            aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}
            onChange={(e) => { setEmail(e.target.value); setError(''); }} />
          {error && <span id={`${id}-err`} className="error" role="alert">{error}</span>}
        </div>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
        {privacyHref && <p className="small muted">By continuing you agree to the <a href={privacyHref} target="_blank" rel="noopener noreferrer">privacy policy</a>.</p>}
      </form>
    );
  }
  return (
    <form className="stack" onSubmit={submitCode} noValidate>
      {info && <p className="small" role="status">{info}</p>}
      <div className="field">
        <label htmlFor={`${id}-code`}>6-digit code</label>
        <input id={`${id}-code`} className="code-input" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code}
          aria-invalid={!!error} aria-describedby={error ? `${id}-err2` : undefined}
          onChange={(e) => { setCode(e.target.value.replace(/[^\d ]/g, '')); setError(''); }} />
        {error && <span id={`${id}-err2`} className="error" role="alert">{error}</span>}
      </div>
      <div className="row">
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
        <button className="btn ghost" type="button" onClick={() => { setStep('email'); setCode(''); setError(''); setInfo(''); }}>Use a different email</button>
        <button className="btn ghost" type="button" disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          const r = await sendCode(email.trim().toLowerCase());
          setBusy(false);
          if (r.ok) setInfo('We sent a new code.'); else setError(r.message);
        }}>Send a new code</button>
      </div>
    </form>
  );
}
