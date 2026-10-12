import type { ScreenProps } from '../App';
import { SupportCard } from '../components/SupportCard';
import { Mochi } from '../components/Mochi';

export function Safety({ update, go }: ScreenProps) {
  return (
    <div>
      <div className="say">
        <Mochi size={96} float={false} mood="happy" />
        <div className="bubble">I’m a helper, not a doctor. Here’s where to find people who are.</div>
      </div>
      <SupportCard />
      <div className="card">
        <p>If you ever swallow hair, please talk to a doctor.</p>
        <button className="primary big" onClick={async () => { await update({ onboardingStep: 'record' }); go('record'); }}>Continue</button>
      </div>
    </div>
  );
}
