// Typed message contracts between the service worker, offscreen document, popup and app page.
import type { EnginePhase } from '../core/engine';
import type { Arm, FrameFeatures, FrameInput, UV } from '../core/types';

export type DeskStatus = 'off' | 'starting' | 'watching' | 'paused' | 'camera_busy' | 'slow' | 'problem' | 'error';
export type DeskErrorKind = 'camera_permission' | 'camera_unavailable' | 'models' | 'stalled' | 'other';
export type StopReason = 'user' | 'auto_stop' | 'idle' | 'away' | 'locked' | 'camera_lost' | 'restart';

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
  /** Last time a face was in view (presence; never an image). */
  lastFaceAt?: number;
  today: { detections: number; interrupted: number };
  error?: string;
  errorKind?: DeskErrorKind;
  /** Why desk mode last stopped on its own (shown once on the dashboard). */
  stopReason?: StopReason;
}

export const INITIAL_DESK: DeskState = { wanted: false, status: 'off', fps: 0, today: { detections: 0, interrupted: 0 } };

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'offline' | 'error' | 'auth';

/** Account + sync status in chrome.storage.local, written only by the service worker. Never holds tokens. */
export interface AccountState {
  configured: boolean;
  signedIn: boolean;
  email?: string;
  userId?: string;
  sync: SyncStatus;
  lastSyncAt?: number;
  message?: string;
  /** Preference keys changed on this device and not yet saved to the account. */
  pending: string[];
  notice?: { kind: 'conflict' | 'adopted' | 'remote'; keys: string[]; at: number };
}

export const INITIAL_ACCOUNT: AccountState = { configured: false, signedIn: false, sync: 'idle', pending: [] };

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
  | { target: 'sw'; type: 'DESK_STOP' }
  | { target: 'sw'; type: 'DESK_PAUSE'; minutes: number }
  | { target: 'sw'; type: 'FEEDBACK'; kind: FeedbackKind }
  | { target: 'sw'; type: 'SETTINGS_CHANGED' }
  | { target: 'sw'; type: 'OFFSCREEN_READY' }
  | { target: 'sw'; type: 'STATUS'; status: DeskStatus; fps: number; delegate?: string; phase: EnginePhase; today: DeskState['today']; error?: string; errorKind?: DeskErrorKind; lastFaceAt?: number }
  | { target: 'sw'; type: 'ALERT'; episodeId: string; arm: Arm; alertNo: 1 | 2; n: number }
  | { target: 'sw'; type: 'EPISODE_END'; episodeId: string }
  | { target: 'sw'; type: 'CAMERA_LOST' }
  | { target: 'sw'; type: 'STOPPED' }
  | { target: 'sw'; type: 'TEST_VISUAL' }
  | { target: 'sw'; type: 'DISMISS_STOP_REASON' }
  | { target: 'sw'; type: 'ACCOUNT_SEND_CODE'; email: string }
  | { target: 'sw'; type: 'ACCOUNT_VERIFY'; email: string; code: string }
  | { target: 'sw'; type: 'ACCOUNT_SIGN_OUT' }
  | { target: 'sw'; type: 'ACCOUNT_DELETE' }
  | { target: 'sw'; type: 'ACCOUNT_EXPORT' }
  | { target: 'sw'; type: 'SYNC_NOW' }
  /** A TrichFree page was opened or came back into view: sync if the last sync is older than 15 seconds. */
  | { target: 'sw'; type: 'SYNC_IF_STALE' }
  | { target: 'sw'; type: 'NOTICE_DISMISS' }
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

/** Replies from the service worker's account handlers. */
export type AccountReply = { ok: true; data?: unknown } | { ok: false; message: string };

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
  const listener = (msg: unknown, sender: chrome.runtime.MessageSender, reply: (r?: unknown) => void) => {
    // Only this extension's own pages can reach here (no content scripts); the website uses onMessageExternal.
    if (sender.id !== chrome.runtime.id || !isMsg(msg) || msg.target !== target) return false;
    const out = handler(msg as MsgOf<T>);
    if (out instanceof Promise) { out.then(reply, (e) => reply({ ok: false, message: String(e) })); return true; }
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

export async function readAccount(): Promise<AccountState> {
  const { accountState } = await chrome.storage.local.get('accountState');
  return { ...INITIAL_ACCOUNT, ...(accountState as Partial<AccountState> | undefined) };
}

export function onAccountChange(cb: (s: AccountState) => void): () => void {
  const l = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes.accountState) cb({ ...INITIAL_ACCOUNT, ...(changes.accountState.newValue as Partial<AccountState>) });
  };
  chrome.storage.onChanged.addListener(l);
  return () => chrome.storage.onChanged.removeListener(l);
}
