export function LevelMeter({ rms }: { rms: number }) {
  const db = 20 * Math.log10(Math.max(rms, 1e-5));
  const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  return <div className="meter" role="meter" aria-label="Microphone level" aria-valuenow={Math.round(pct)}><div style={{ width: `${pct}%` }} /></div>;
}
