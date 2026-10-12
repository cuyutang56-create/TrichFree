import type { ScreenProps } from '../App';
import { COPY } from '../../shared/copy';
import { db } from '../../shared/db';
import { PROMPTS } from '../../shared/prompts';
import { Notice } from '../../ui/controls';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { updateSettings, useClips } from '../hooks';

export function Voice({ settings }: ScreenProps) {
  const clips = useClips() ?? [];
  const clipFor = (c: string) => clips.filter((x) => x.category === c).at(-1);
  return (
    <div className="stack" style={{ '--gap': '16px' } as React.CSSProperties}>
      <h1>Your voice</h1>
      <p>Record a few short lines in your own voice. When a reminder plays, you hear one of them after the chime. One line is enough to start; more lines keep it from getting old.</p>
      <Notice tone="info">{COPY.voiceLocal}</Notice>
      {settings.intervention !== 'voice' && (
        <Notice tone="info" action={<button className="btn" onClick={() => void updateSettings({ intervention: 'voice' })}>Use my voice</button>}>
          Your reminder is currently set to “{settings.intervention}”. Recordings are only played when it is set to your voice.
        </Notice>
      )}
      <p className="small muted">{COPY.kindWords} Tip: ask someone who cares about you to record “Your reason”. Hearing their voice can land differently.</p>
      <div className="grid">
        {PROMPTS.map((p) => {
          const clip = clipFor(p.category);
          return (
            <section className="card stack" key={p.category} aria-labelledby={`v-${p.category}`}>
              <div className="row">
                <h2 id={`v-${p.category}`} className="h3">{p.title}</h2>
                <span className="spacer" />
                {clip ? <span className="pill ok"><span className="dot" aria-hidden="true" />Saved</span> : p.required ? <span className="pill accent">Start here</span> : null}
              </div>
              <p className="hand quote">“{p.example}”</p>
              <p className="small muted">{p.hint}</p>
              <VoiceRecorder prompt={p} clip={clip} />
              {clip && (
                <label className="check small">
                  <input type="checkbox" checked={!!clip.recordedBySomeoneElse} onChange={() => void db.clips.update(clip.id, { recordedBySomeoneElse: !clip.recordedBySomeoneElse })} />
                  Recorded by someone else (a parent, partner or friend)
                </label>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
