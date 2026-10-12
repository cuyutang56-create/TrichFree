import { HELPLINES_CHECKED, LOCAL_HELPLINES, SAFETY_LINES, SUPPORT_LINKS } from '../../shared/safety';

export function SupportList() {
  return (
    <div className="stack small">
      {SAFETY_LINES.map((l) => <p key={l} style={{ margin: 0 }}>{l}</p>)}
      <h3 style={{ marginTop: 12 }}>In Singapore</h3>
      <ul>
        {LOCAL_HELPLINES.map((h) => (
          <li key={h.label}>{h.label}: <a href={`tel:${h.phone}`}>{h.phone}</a>{h.note ? `. ${h.note}` : ''}</li>
        ))}
      </ul>
      <h3>Learn more</h3>
      <ul>
        {SUPPORT_LINKS.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>{l.note ? `. ${l.note}` : ''}</li>)}
      </ul>
      <p className="muted">Contacts checked {HELPLINES_CHECKED}. Outside Singapore, contact your local emergency number.</p>
    </div>
  );
}

export function SupportCard() {
  return (
    <section className="card" aria-labelledby="support-h">
      <h2 id="support-h">Support and safety</h2>
      <SupportList />
    </section>
  );
}
