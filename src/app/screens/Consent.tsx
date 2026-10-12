import { useState } from 'react';
import type { ScreenProps } from '../App';
import { localDate } from '../../core/arms';
import { COPY } from '../../shared/copy';
import { PARTICIPANT_CODE_RE } from '../../shared/pilot';
import { telemetryConfigured } from '../../shared/uploadQueue';
import { Mochi } from '../components/Mochi';

export function Consent({ settings, update, go }: ScreenProps) {
  const [age, setAge] = useState<'' | 'adult' | 'guardian'>('');
  const [selfHelp, setSelfHelp] = useState(false);
  const [video, setVideo] = useState(false);
  const [code, setCode] = useState(settings.participantCode ?? '');
  const [pilotOk, setPilotOk] = useState(false);
  const normCode = code.trim().toUpperCase();
  const hasCode = normCode.length > 0;
  const codeValid = !hasCode || PARTICIPANT_CODE_RE.test(normCode);
  const ready = age && selfHelp && video && codeValid && (!hasCode || pilotOk);

  const next = async () => {
    await update({
      consentAt: Date.now(), guardianHelping: age === 'guardian',
      participantCode: hasCode ? normCode : undefined, pilotConsent: hasCode && pilotOk, pilotSharing: hasCode && pilotOk,
      enrolledDate: hasCode ? settings.enrolledDate ?? localDate(Date.now()) : undefined,
      onboardingStep: 'safety',
    });
    go('safety');
  };

  return (
    <div className="card">
      <div className="say">
        <Mochi size={96} float={false} mood="happy" />
        <div className="bubble">Before we start, a few promises. Tap each one that’s true for you.</div>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="small muted">Age</legend>
        <label className="check"><input type="radio" name="age" checked={age === 'adult'} onChange={() => setAge('adult')} />I'm 18 or older.</label>
        <label className="check"><input type="radio" name="age" checked={age === 'guardian'} onChange={() => setAge('guardian')} />I'm under 18 and a parent or guardian is helping me.</label>
      </fieldset>
      <label className="check"><input type="checkbox" checked={selfHelp} onChange={(e) => setSelfHelp(e.target.checked)} />I understand this is a self-help tool, not treatment.</label>
      <label className="check"><input type="checkbox" checked={video} onChange={(e) => setVideo(e.target.checked)} />I understand video never leaves my device.</label>

      <div className="card info" style={{ marginTop: 16 }}>
        <h3>Pilot participant code (optional)</h3>
        <p className="small muted">Only if the research team gave you one. It looks like TF-AB12.</p>
        <input type="text" aria-label="Participant code" placeholder="TF-XXXX" value={code} maxLength={7} onChange={(e) => setCode(e.target.value)} />
        {!codeValid && <p className="small" style={{ color: 'var(--warn)', marginTop: 6 }}>That doesn't look like a code. It should be TF- then 4 letters or numbers.</p>}
        {hasCode && codeValid && (
          <>
            <p className="small" style={{ marginTop: 12 }}>{COPY.pilotNotice}</p>
            {!telemetryConfigured && <p className="small muted">This build has no research server set up, so your pilot log stays here. You can export it from Settings and email it.</p>}
            <label className="check"><input type="checkbox" checked={pilotOk} onChange={(e) => setPilotOk(e.target.checked)} />I agree to share this pilot data.</label>
          </>
        )}
      </div>
      <button className="primary big" disabled={!ready} onClick={next}>I agree, continue</button>
    </div>
  );
}
