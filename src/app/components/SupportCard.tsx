import { LOCAL_HELPLINES, SAFETY_LINES, SUPPORT_LINKS } from '../../shared/safety';

export function SupportCard() {
  return (
    <div className="card">
      <h2>Support and safety</h2>
      {SAFETY_LINES.map((l) => <p key={l}>{l}</p>)}
      <ul>
        {SUPPORT_LINKS.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noreferrer">{l.label}</a></li>)}
        {LOCAL_HELPLINES.map((h) => <li key={h.label}>{h.label}{h.phone ? `: ${h.phone}` : ''}</li>)}
      </ul>
    </div>
  );
}
