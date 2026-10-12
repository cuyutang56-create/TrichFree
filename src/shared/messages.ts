// Typed message contracts between the service worker, offscreen document, popup and app page.
import type { EnginePhase } from '../core/engine';
import type { FrameFeatures, FrameInput, OutputMode, UV } from '../core/types';

export type DeskStatus = 'off' | 'starting' | 'watching' | 'paused' | 'camera_busy' | 'slow' | 'problem' | 'error';

/** Fast-changing state in chrome.storage.local, written only by the service worker. */
export interface DeskState {
  wanted: boolean; // the user wants desk mode on
  status: DeskStatus;
  fps: number;
  delegate?: string;
  phase?: EnginePhase;
  startedAt?: number;
  pausedUntil?: number;
  interrupted?: boolean; // Chrome restarted while desk mode was on
  lastHeartbeat?: number;
  today: { detections: number; interrupted: number };
  outputMode: OutputMode;
  error?: string;
}

export const INITIAL_DESK: DeskState = { wanted: false, status: 'off', fps: 0, today: { detections: 0, interrupted: 0 }, outputMode: 'speakers' };

export interface OverlayFrame {
  frame: FrameInput;
  features: FrameFeatures;
  tipsUV: UV[] | null;
  p: number;
  pSmooth: number;
  phase: string;
  enginePhase?: EnginePhase;
}

export type FeedbackKind = 'not_a_pull' | 'i_pulled';

export type Msg =
  // → service worker
  | { target: 'sw'; type: 'DESK_START' }
  | { target: 'sw'; type: 'DESK_STOP'; reason?: 'user' | 'auto_stop' | 'idle' }
  | { target: 'sw'; type: 'DESK_PAUSE'; minutes: number }
  | { target: 'sw'; type: 'FEEDBACK'; kind: FeedbackKind }
  | { target: 'sw'; type: 'SET_OUTPUT_MODE'; mode: OutputMode }
  | { target: 'sw'; type: 'SETTINGS_CHANGED' }
  | { target: 'sw'; type: 'OFFSCREEN_READY' }
  | { target: 'sw'; type: 'STATUS'; status: DeskStatus; fps: number; delegate?: string; phase: EnginePhase; today: DeskState['today']; error?: string }
  | { target: 'sw'; type: 'ALERT'; episodeId: string }
  | { target: 'sw'; type: 'EPISODE_END'; episodeId: string }
  | { target: 'sw'; type: 'CAMERA_LOST' }
  | { target: 'sw'; type: 'STOPPED' }
  // → offscreen document
  | { target: 'offscreen'; type: 'OFF_START' }
  | { target: 'offscreen'; type: 'OFF_STOP' }
  | { target: 'offscreen'; type: 'OFF_FEEDBACK'; kind: FeedbackKind }
  | { target: 'offscreen'; type: 'OFF_SETTINGS_CHANGED' }
  | { target: 'offscreen'; type: 'OFF_OVERLAY'; on: boolean }
  // → UI pages
  | { target: 'ui'; type: 'OVERLAY'; data: OverlayFrame };

export type Target = Msg['target'];
export type MsgOf<T extends Target> = Extract<Msg, { target: T }>;

/** Send a message to another extension context. Never throws if nobody is listening. */
export async function send<M extends Msg>(msg: M): Promise<unknown> {
  try {
    return await chrome.runtime.sendMessage(msg);
  } catch {
    return undefined; // "Receiving end does not exist" when the target isn't open
  }
}

/** Listen for messages addressed to one context. Return a value (or a promise) to reply. */
export function on<T extends Target>(target: T, handler: (msg: MsgOf<T>) => unknown | Promise<unknown>): () => void {
  const listener = (msg: unknown, _sender: chrome.runtime.MessageSender, reply: (r?: unknown) => void) => {
    if (!isMsg(msg) || msg.target !== target) return false;
    const out = handler(msg as MsgOf<T>);
    if (out instanceof Promise) { out.then(reply, (e) => reply({ error: String(e) })); return true; }
    if (out !== undefined) reply(out);
    return false;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

export function isMsg(x: unknown): x is Msg {
  return !!x && typeof x === 'object' && typeof (x as Msg).type === 'string' && ['sw', 'offscreen', 'ui'].includes((x as Msg).target);
}

export async function readDesk(): Promise<DeskState> {
  const { deskState } = await chrome.storage.local.get('deskState');
  return { ...INITIAL_DESK, ...(deskState as Partial<DeskState> | undefined) };
}

export function onDeskChange(cb: (s: DeskState) => void): () => void {
  const l = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes.deskState) cb({ ...INITIAL_DESK, ...(changes.deskState.newValue as Partial<DeskState>) });
  };
  chrome.storage.onChanged.addListener(l);
  return () => chrome.storage.onChanged.removeListener(l);
}
