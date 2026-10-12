import { useEffect, useState } from 'react';
import type { AppSettings } from '../shared/db';
import { ACCOUNTS_CONFIGURED } from '../shared/config';
import { send } from '../shared/messages';
import { Notice } from '../ui/controls';
import { startMonitoring, useAccount, useSettings } from './hooks';
import { Calibrate } from './screens/Calibrate';
import { Debug } from './screens/Debug';
import { Home } from './screens/Home';
import { Insights } from './screens/Insights';
import { Start, Welcome } from './screens/Onboarding';
import { Settings } from './screens/Settings';
import { Voice } from './screens/Voice';

export type Route = 'welcome' | 'start' | 'home' | 'voice' | 'insights' | 'settings' | 'tune' | 'camera' | 'debug';
const ROUTES: Route[] = ['welcome', 'start', 'home', 'voice', 'insights', 'settings', 'tune', 'camera', 'debug'];
const ALIASES: Record<string, Route> = { desk: 'home', journey: 'insights', progress: 'insights', record: 'voice', calibrate: 'tune' };
const TITLES: Record<Route, string> = {
  welcome: 'Welcome', start: 'Choose your reminder', home: 'Dashboard', voice: 'Your voice', insights: 'Insights',
  settings: 'Settings', tune: 'Tune-up', camera: 'Camera access', debug: 'Debug',
};

export interface ScreenProps {
  settings: AppSettings;
  go: (r: Route) => void;
}

const routeFromHash = (): Route => {
  const r = location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';
  const route = (ALIASES[r] ?? r) as Route;
  return ROUTES.includes(route) ? route : 'home';
};

export function App() {
  const settings = useSettings();
  const [route, setRoute] = useState<Route>(routeFromHash());

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('reduce-motion', !!settings?.reduceMotion); }, [settings?.reduceMotion]);
  // Show settings changed on another device as soon as this page is opened or looked at again
  // (the service worker skips it if it synced within the last minute).
  useEffect(() => {
    if (!ACCOUNTS_CONFIGURED) return;
    const nudge = () => { if (document.visibilityState === 'visible') void send({ target: 'sw', type: 'SYNC_IF_STALE' }).catch(() => {}); };
    nudge();
    window.addEventListener('focus', nudge);
    document.addEventListener('visibilitychange', nudge);
    return () => { window.removeEventListener('focus', nudge); document.removeEventListener('visibilitychange', nudge); };
  }, []);

  if (!settings) return <p className="loading" role="status">Loading…</p>;
  let r = route;
  if (!settings.onboarded && r !== 'welcome' && r !== 'start') r = settings.onboardingStep === 'start' ? 'start' : 'welcome';
  if (settings.onboarded && (r === 'welcome' || r === 'start')) r = 'home';
  if (r === 'debug' && !settings.debug) r = 'settings';
  return <Shell settings={settings} route={r} />;
}

function Shell({ settings, route }: { settings: AppSettings; route: Route }) {
  const go = (r: Route) => { location.hash = `#/${r}`; };
  useEffect(() => {
    document.title = `${TITLES[route]} · TrichFree`;
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [route]);
  const props: ScreenProps = { settings, go };
  const screens: Record<Route, JSX.Element> = {
    welcome: <Welcome {...props} />, start: <Start {...props} />, home: <Home {...props} />, voice: <Voice {...props} />,
    insights: <Insights {...props} />, settings: <Settings {...props} />, tune: <Calibrate {...props} />, camera: <CameraAccess />, debug: <Debug {...props} />,
  };
  const onboarding = route === 'welcome' || route === 'start';
  const nav: [Route, string][] = [['home', 'Dashboard'], ['voice', 'Voice'], ['insights', 'Insights'], ['settings', 'Settings'], ...(settings.debug ? [['debug', 'Debug'] as [Route, string]] : [])];
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <a className="brand" href={onboarding ? undefined : '#/home'} aria-label="TrichFree, dashboard">
          <img src="/icons/48.png" alt="" width="28" height="28" />
          <span>TrichFree</span>
        </a>
        {!onboarding && (
          <nav aria-label="Main">
            <ul>
              {nav.map(([id, label]) => (
                <li key={id}><a href={`#/${id}`} aria-current={route === id ? 'page' : undefined}>{label}</a></li>
              ))}
            </ul>
          </nav>
        )}
        <span className="spacer" />
        {!onboarding && <AccountChip />}
      </header>
      <main id="main" tabIndex={-1} className={onboarding ? 'page narrow' : 'page'}>{screens[route]}</main>
    </>
  );
}

function AccountChip() {
  const a = useAccount();
  if (!ACCOUNTS_CONFIGURED) return <span className="pill" title="Everything is saved on this computer">This device only</span>;
  if (!a.signedIn) return <a className="pill" href="#/settings?section=account" data-testid="account-chip">Guest · <span className="underline">Save across devices</span></a>;
  const map: Record<string, [string, string]> = {
    ok: ['ok', 'Synced'], syncing: ['accent', 'Syncing…'], idle: ['accent', 'Signed in'], offline: ['warn', 'Offline · will sync'],
    error: ['warn', 'Sync problem'], auth: ['warn', 'Sign in again'],
  };
  const [tone, text] = map[a.sync] ?? ['', 'Signed in'];
  return (
    <a className={`pill ${tone}`} href="#/settings?section=account" data-testid="account-chip" title={`Signed in as ${a.email}`}>
      <span className="dot" aria-hidden="true" />{text}
    </a>
  );
}

/** Opened by the popup when monitoring needs the camera: asks for it on a visible page, then starts. */
function CameraAccess() {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const auto = new URLSearchParams(location.hash.split('?')[1] ?? '').get('start') === '1';
  const go = async () => {
    setState('busy');
    const r = await startMonitoring();
    if (r.ok) { location.hash = '#/home'; return; }
    setState('error');
    setMsg(r.message);
  };
  return (
    <div className="stack narrow-content">
      <h1>Allow the camera</h1>
      <p>TrichFree needs your camera to notice possible hand-to-hair movements. The video is analysed on this computer and is never saved or sent anywhere.</p>
      <p>When your browser asks, choose the option that <strong>always allows</strong> the camera for TrichFree (not “Allow this time”). Monitoring runs in the background, so it needs a lasting permission.</p>
      {state === 'error' && <Notice tone="warn">{msg}</Notice>}
      <button className="btn primary big" disabled={state === 'busy'} onClick={() => void go()}>{auto ? 'Allow camera and start monitoring' : 'Allow camera'}</button>
    </div>
  );
}
