// Plain-SVG bar chart: one bar per day. Neutral colour only (no red for "bad" days).
export function BarChart({ data, unit }: { data: { label: string; value: number | null }[]; unit: string }) {
  const W = 560, H = 180, pad = { l: 36, r: 8, t: 12, b: 28 };
  const max = Math.max(1, ...data.map((d) => d.value ?? 0));
  const nice = max <= 1 ? 1 : max <= 2 ? 2 : max <= 5 ? 5 : Math.ceil(max / 5) * 5;
  const bw = (W - pad.l - pad.r) / data.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / nice);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Bar chart, ${unit} by day`}>
      {[0, nice / 2, nice].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--border)" />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{Number.isInteger(v) ? v : v.toFixed(1)}</text>
        </g>
      ))}
      {data.map((d, i) => (
        <g key={d.label}>
          {d.value != null && d.value > 0 && (
            <rect x={pad.l + i * bw + bw * 0.2} width={bw * 0.6} y={y(d.value)} height={y(0) - y(d.value)} rx="4" fill="var(--accent)">
              <title>{`${d.label}: ${d.value.toFixed(1)} ${unit}`}</title>
            </rect>
          )}
          <text x={pad.l + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{d.label}</text>
        </g>
      ))}
    </svg>
  );
}
