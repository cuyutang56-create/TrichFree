import { useCallback, useEffect, useState } from 'react';
import { getSettings, setSettings, type AppSettings } from '../shared/db';
import { send } from '../shared/messages';
import { IconBug, IconGear, IconHome, IconJourney, IconMic } from './components/Icons';
import { Mochi } from './components/Mochi';
import { SideStats } from './components/SideStats';
import { Calibrate } from './screens/Calibrate';
import { Consent } from './screens/Consent';
import { Debug } from './screens/Debug';
import { Home } from './screens/Home';
import { Progress } from './screens/Progress';
import { Record } from './screens/Record';
import { Safety } from './screens/Safety';
import { Settings } from './screens/Settings';
import { Welcome } from './screens/Welcome';
import { useProgress } from './useProgress';

export type Route = 'welcome' | 'consent' | 'safety' | 'record' | 'calibrate' | 'home' | 'progress' | 'settings' | 'debug';
const ONBOARDING: Route[] = ['welcome', 'consent', 'safety', 'record', 'calibrate'];
const ALIASES: Record<string, Route> = { desk: 'home', journey: 'progress' };

export interface ScreenProps {
  settings: AppSettings;
  update: (p: Partial<AppSettings>) => Promise<void>;
  go: (r: Route) => void;
  progress?: ReturnType<typeof useProgress>;
}

const routeFromHash = (): Route => {
  const r = location.hash.replace(/^#\//, '').split('?')[0] || 'home';
  return (ALIASES[r] ?? r) as Route;
};

export function App() {
  const [settings, setS] = useState<AppSettings | null>(null);
  const [route, setRoute] = useState<Route>(routeFromHash());

  useEffect(() => {
    getSettings().then(setS);
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const update = useCallback(async (p: Partial<AppSettings>) => {
    await setSettings(p);
    setS(await getSettings());
    await send({ target: 'sw', type: 'SETTINGS_CHANGED' });
  }, []);
  const go = useCallback((r: Route) => { location.hash = `#/${r}`; }, []);

  if (!settings) return null;
  return <Shell settings={settings} update={update} go={go} route={route} />;
}

/** Decorative shapes scattered across a full-screen background. */
export function Scatter({ dense = false, edges = false }: { dense?: boolean; edges?: boolean }) {
  // On content pages the shapes hug the window edges so they never sit behind panels.
  const shapes: [string, number, string, string][] = edges ? [
    ['var(--pink)', 160, '-90px', '70%'], ['var(--lilac)', 90, '-50px', '90%'], ['var(--peach)', 70, 'calc(100% - 40px)', '82%'], ['var(--lime)', 120, 'calc(100% - 70px)', '-50px'],
  ] : [
    ['var(--pink)', 150, '-50px', '62%'], ['var(--lime)', 34, '8%', '28%'], ['var(--lilac)', 80, '-30px', '84%'],
    ['var(--peach)', 46, '88%', '14%'], ['var(--lime)', 22, '78%', '74%'],
    ...(dense ? [['var(--pink)', 26, '20%', '88%'], ['var(--lilac)', 60, '92%', '52%']] as [string, number, string, string][] : []),
  ];
  return (
    <div className="scatter" aria-hidden="true">
      {shapes.map(([c, s, left, top], i) => <span key={i} className="blob" style={{ background: c, width: s, height: s, left, top, opacity: 0.9 }} />)}
    </div>
  );
}

function Shell({ settings, update, go, route }: ScreenProps & { route: Route }) {
  const progress = useProgress(settings);
  let r = route;
  if (!settings.onboarded && !ONBOARDING.includes(r)) r = settings.onboardingStep === 'done' ? 'calibrate' : settings.onboardingStep;
  if (r === 'debug' && !settings.debug) r = 'settings';
  const props: ScreenProps = { settings, update, go, progress };
  const screens: Record<Route, JSX.Element> = {
    welcome: <Welcome {...props} />, consent: <Consent {...props} />, safety: <Safety {...props} />, record: <Record {...props} />,
    calibrate: <Calibrate {...props} />, home: <Home {...props} />, progress: <Progress {...props} />, settings: <Settings {...props} />, debug: <Debug {...props} />,
  };

  if (!settings.onboarded) {
    // Full-screen, edge-to-edge steps (no floating cards), each with its own colour.
    const look: Record<string, string> = { welcome: 'indigo', consent: 'lilac flat', safety: 'lime flat', record: 'white', calibrate: 'indigo' };
    return (
      <div className={`screen ${look[r] ?? 'white'}`}>
        <Scatter dense={r === 'welcome'} />
        <header className="screen-top">
          <span className="logo" style={{ padding: 0 }}><Mochi size={40} float={false} />TrichFree</span>
          <div className="steps" aria-hidden="true">{ONBOARDING.map((s, i) => <span key={s} className={ONBOARDING.indexOf(r) >= i ? 'done' : ''} />)}</div>
        </header>
        <main key={r} className={`screen-inner ${r === 'record' || r === 'calibrate' ? 'wide' : ''}`}>{screens[r]}</main>
      </div>
    );
  }

  const nav: [Route, string, JSX.Element][] = [
    ['home', 'Home', <IconHome />], ['progress', 'Journey', <IconJourney />], ['record', 'Voice', <IconMic />], ['settings', 'Settings', <IconGear />],
    ...(settings.debug ? [['debug', 'Debug', <IconBug />] as [Route, string, JSX.Element]] : []),
  ];
  const showRight = r === 'home' || r === 'progress';
  // Every page is full-screen colour, edge to edge (no cream page with floating widgets).
  const theme = ({ home: 'indigo', record: 'indigo', calibrate: 'indigo', progress: 'lilac', settings: 'lime', debug: 'white' } as Record<string, string>)[r] ?? 'white';
  return (
    <div className={`screen ${theme} ${theme === 'indigo' ? 'theme-indigo' : 'theme-light'}`}>
    <Scatter edges />
    <div className={`app ${showRight ? '' : 'no-right'}`}>
      <nav className="rail" aria-label="Main">
        <div className="logo"><Mochi size={40} float={false} body={progress.progress?.level.flavour.body} blush={progress.progress?.level.flavour.blush} />TrichFree</div>
        {nav.map(([id, label, icon]) => (
          <a key={id} href={`#/${id}`} className={`navlink ${r === id ? 'active' : ''}`} aria-current={r === id ? 'page' : undefined}>{icon}<span>{label}</span></a>
        ))}
      </nav>
      <main className="main" key={r}>{screens[r]}</main>
      {showRight && <aside className="right" aria-label="Your progress"><SideStats settings={settings} progress={progress.progress} /></aside>}
    </div>
    </div>
  );
}
