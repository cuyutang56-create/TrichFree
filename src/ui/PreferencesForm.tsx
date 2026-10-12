// The settings that follow the user across devices. Rendered by the extension's Settings page and the website's
// account page, so both behave the same. Device-only actions (test buttons, tune-up) are passed in as slots.
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  COOLDOWN_OPTIONS, MICRO_PROMPT_TEXT, SUPPORTIVE_TEXT_MAX, isValidPref, normalizePref,
  type Intervention, type MicroPrompt, type PrefKey, type SyncedPrefs,
} from '../sync/prefs';
import type { Sensitivity } from '../core/types';
import { Choices, Seg, Switch } from './controls';
import { ZonePicker } from './ZonePicker';

export const INTERVENTION_OPTIONS: { value: Intervention; title: string; desc: string }[] = [
  { value: 'chime', title: 'Gentle chime', desc: 'A soft two-note sound.' },
  { value: 'voice', title: 'Your own voice', desc: 'A short line you record. Stays on this device.' },
  { value: 'visual', title: 'Visual only', desc: 'A quiet on-screen notification. No sound.' },
  { value: 'off', title: 'Off', desc: 'No reminder. TrichFree only keeps a private log.' },
];

const fmtCooldown = (s: number) => (s < 60 ? `${s} seconds` : s === 60 ? '1 minute' : `${s / 60} minutes`);

type Change = <K extends PrefKey>(key: K, value: SyncedPrefs[K]) => void;

export function PreferencesForm({ prefs, onChange, slots = {}, sections = ['reminder', 'detection', 'companion', 'accessibility'] }: {
  prefs: SyncedPrefs;
  onChange: Change;
  slots?: { afterVolume?: ReactNode; afterIntervention?: ReactNode; afterZones?: ReactNode };
  sections?: ('reminder' | 'detection' | 'companion' | 'accessibility')[];
}) {
  return (
    <div className="stack" style={{ '--gap': '16px' } as React.CSSProperties}>
      {sections.includes('reminder') && <ReminderSection prefs={prefs} onChange={onChange} slots={slots} />}
      {sections.includes('detection') && <DetectionSection prefs={prefs} onChange={onChange} afterZones={slots.afterZones} />}
      {sections.includes('companion') && <CompanionSection prefs={prefs} onChange={onChange} />}
      {sections.includes('accessibility') && (
        <section className="card" aria-labelledby="pref-a11y">
          <h2 id="pref-a11y">Accessibility</h2>
          <Switch label="Reduce motion" hint="Turns off animations even if your system setting allows them." checked={prefs.reduceMotion} onChange={(v) => onChange('reduceMotion', v)} />
        </section>
      )}
    </div>
  );
}

export function ReminderSection({ prefs, onChange, slots = {} }: { prefs: SyncedPrefs; onChange: Change; slots?: { afterVolume?: ReactNode; afterIntervention?: ReactNode } }) {
  const id = useId();
  const sound = prefs.intervention === 'voice' || prefs.intervention === 'chime';
  return (
    <section className="card stack" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Reminder</h2>
      <p className="muted small" id={`${id}-d`}>What happens when TrichFree notices a possible hand-to-hair movement.</p>
      <Choices legend="Reminder type" value={prefs.intervention} options={INTERVENTION_OPTIONS} onChange={(v) => onChange('intervention', v)} describedBy={`${id}-d`} />
      {slots.afterIntervention}
      {sound && (
        <div className="field">
          <label htmlFor={`${id}-vol`}>Volume <span className="muted">({prefs.chimeVolume}%)</span></label>
          <input id={`${id}-vol`} type="range" min={0} max={100} step={5} value={prefs.chimeVolume}
            onChange={(e) => onChange('chimeVolume', Number(e.target.value))} aria-valuetext={`${prefs.chimeVolume} percent`} />
        </div>
      )}
      {slots.afterVolume}
      <div className="field">
        <label htmlFor={`${id}-prompt`}>Suggestion shown with the reminder</label>
        <select id={`${id}-prompt`} value={prefs.microPrompt} onChange={(e) => onChange('microPrompt', e.target.value as MicroPrompt)}>
          {(Object.keys(MICRO_PROMPT_TEXT) as (keyof typeof MICRO_PROMPT_TEXT)[]).map((k) => <option key={k} value={k}>{MICRO_PROMPT_TEXT[k]}</option>)}
          <option value="rotate">A different one each time</option>
          <option value="none">No suggestion</option>
        </select>
        <span className="help">Optional prompts, not instructions. Pick what feels helpful.</span>
      </div>
      <SupportiveText value={prefs.supportiveText} onCommit={(v) => onChange('supportiveText', v)} />
      {prefs.intervention !== 'visual' && prefs.intervention !== 'off' && (
        <Switch label="Also show an on-screen notification" hint="Includes “Not a pull” and “I just pulled” buttons, which help TrichFree learn."
          checked={prefs.visualNotifications} onChange={(v) => onChange('visualNotifications', v)} />
      )}
      <Switch label="One follow-up reminder" hint="If your hand is still there 10 seconds later, remind once more. Never more than two reminders for one movement."
        checked={prefs.followUp} onChange={(v) => onChange('followUp', v)} />
      <div className="field">
        <label htmlFor={`${id}-cool`}>Quiet time between reminders</label>
        <select id={`${id}-cool`} value={prefs.cooldownSeconds} onChange={(e) => onChange('cooldownSeconds', Number(e.target.value))}>
          {(COOLDOWN_OPTIONS.includes(prefs.cooldownSeconds) ? COOLDOWN_OPTIONS : [...COOLDOWN_OPTIONS, prefs.cooldownSeconds].sort((a, b) => a - b))
            .map((s) => <option key={s} value={s}>{fmtCooldown(s)}</option>)}
        </select>
        <span className="help">After a reminder ends, TrichFree waits this long before it can remind you again.</span>
      </div>
    </section>
  );
}

function SupportiveText({ value, onCommit }: { value: string | null; onCommit: (v: string | null) => void }) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  const id = useId();
  const norm = normalizePref('supportiveText', text);
  const valid = isValidPref('supportiveText', norm);
  const left = SUPPORTIVE_TEXT_MAX - [...text.trim()].length;
  const commit = () => { if (valid && norm !== value) onCommit(norm); };
  return (
    <div className="field">
      <label htmlFor={id}>Your supportive words <span className="muted">(optional)</span></label>
      <input id={id} type="text" value={text} maxLength={SUPPORTIVE_TEXT_MAX * 2} placeholder="e.g. You’re doing fine. Hands down, keep going."
        aria-invalid={!valid} aria-describedby={`${id}-help`} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
      <span id={`${id}-help`} className={valid ? 'help' : 'error'}>{valid ? `Shown with visual reminders. ${left} characters left.` : `Please keep it under ${SUPPORTIVE_TEXT_MAX} characters, on one line.`}</span>
    </div>
  );
}

export function DetectionSection({ prefs, onChange, afterZones }: { prefs: SyncedPrefs; onChange: Change; afterZones?: ReactNode }) {
  const id = useId();
  return (
    <section className="card stack" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Detection</h2>
      <div className="field">
        <span className="label" id={`${id}-sens`}>Sensitivity</span>
        <Seg<Sensitivity> label="Sensitivity" value={prefs.sensitivity} onChange={(v) => onChange('sensitivity', v)}
          options={[['relaxed', 'Relaxed'], ['balanced', 'Balanced'], ['sensitive', 'Sensitive']]} />
        <span className="help">Relaxed waits about 2.5 s before reminding, Balanced 1.5 s, Sensitive 1 s. Sensitive catches more, but also more ordinary touches.</span>
      </div>
      <div className="field">
        <span className="label">Areas to watch</span>
        <ZonePicker value={prefs.zones} onChange={(z) => onChange('zones', z)} />
        <span className="help">“Strands / lengths” covers hair held away from the scalp, like a lock beside your face.</span>
      </div>
      {afterZones}
    </section>
  );
}

export function CompanionSection({ prefs, onChange }: { prefs: SyncedPrefs; onChange: Change }) {
  const id = useId();
  return (
    <section className="card stack" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Mochi (optional companion)</h2>
      <p className="muted small">Mochi is a small squishable character that keeps you company, celebrates showing up and gives your hands something to do. It is entirely optional.</p>
      <Switch label="Show Mochi" checked={prefs.companionEnabled} onChange={(v) => onChange('companionEnabled', v)} />
      {prefs.companionEnabled && (
        <>
          <div className="field">
            <span className="label">Mochi’s tone</span>
            <Seg label="Mochi’s tone" value={prefs.companionTone} onChange={(v) => onChange('companionTone', v)} options={[['gentle', 'Gentle'], ['playful', 'Playful']]} />
            <span className="help">Playful Mochi only teases about showing up, never about pulling.</span>
          </div>
          <div className="field">
            <label htmlFor={`${id}-goal`}>Daily focus goal</label>
            <select id={`${id}-goal`} value={prefs.dailyGoalMinutes} onChange={(e) => onChange('dailyGoalMinutes', Number(e.target.value))}>
              {[15, 30, 50, 90, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select>
          </div>
        </>
      )}
      <Switch label="Daily check-in reminder" hint="A quiet notification at a time you choose, only if you have not started a session that day."
        checked={!!prefs.reminderTime} onChange={(v) => onChange('reminderTime', v ? '19:00' : null)} />
      {prefs.reminderTime && (
        <div className="field" style={{ maxWidth: 200 }}>
          <label htmlFor={`${id}-time`}>Time</label>
          <input id={`${id}-time`} type="time" value={prefs.reminderTime} onChange={(e) => { if (isValidPref('reminderTime', e.target.value)) onChange('reminderTime', e.target.value); }} />
        </div>
      )}
    </section>
  );
}
