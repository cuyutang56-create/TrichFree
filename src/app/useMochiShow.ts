import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action } from './components/Mochi';

const IDLE: Action[] = ['wiggle', 'hop', 'roll', 'spin', 'hop'];

/** Directs Mochi's one-shot animations: explicit triggers plus the occasional idle move so it feels alive. */
export function useMochiShow({ idle = true, paused = false }: { idle?: boolean; paused?: boolean } = {}) {
  const [action, setAction] = useState<Action | null>(null);
  const [shout, setShout] = useState<string | undefined>();
  const [ride, setRide] = useState<string | null>(null);
  const busy = useRef(false);

  const play = useCallback((a: Action, s?: string) => {
    busy.current = true;
    setAction(null);
    setShout(s);
    requestAnimationFrame(() => setAction(a)); // restart even if the same action is playing
  }, []);
  const end = useCallback(() => { busy.current = false; setAction(null); setShout(undefined); }, []);

  useEffect(() => {
    if (!idle || paused) return;
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => {
        if (!busy.current && document.visibilityState === 'visible') play(IDLE[Math.floor(Math.random() * IDLE.length)]);
        loop();
      }, 14_000 + Math.random() * 12_000);
    };
    loop();
    return () => clearTimeout(t);
  }, [idle, paused, play]);

  return { action, shout, play, end, ride, startRide: (label: string) => setRide(label), endRide: useCallback(() => setRide(null), []) };
}
