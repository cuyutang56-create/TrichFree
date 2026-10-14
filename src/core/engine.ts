import { pickClip } from './clipPicker';
import type { Arm, ClipMeta, DetectorEvent, Episode, EpisodeStats, Outcome } from './types';

export type EnginePhase = 'IDLE' | 'CANDIDATE' | 'ALERT_1' | 'ALERT_2' | 'PERSIST' | 'COOLDOWN';

export interface EngineState {
  phase: EnginePhase;
  episode: Episode | null;
  alertAt?: number;
  alert2At?: number;
  cooldownUntil: number;
  lastClipId?: string;
}

export type EngineEvent =
  | DetectorEvent
  | { type: 'tick'; t: number }
  | { type: 'feedback'; kind: 'not_a_pull' | 'i_pulled'; t: number };

export type Effect =
  | { type: 'play'; sound: 'chime' }
  | { type: 'play'; sound: 'clip'; clipId: string; delayMs: number }
  | { type: 'clipPlayed'; clipId: string; t: number }
  /** Show the on-screen cue. Never emitted for the SILENT arm (pilot baseline, "off"): silent means silent. */
  | { type: 'notifyAlert'; episodeId: string; arm: Arm; alertNo: 1 | 2 }
  | { type: 'closeNotify'; episodeId: string }
  | { type: 'logEpisode'; episode: Episode }
  | { type: 'logEvent'; eventType: 'manual_pull' | 'false_alarm'; t: number; episodeId?: string; missed?: boolean };

export interface EngineContext {
  sessionId: string;
  participantCode?: string;
  /** Called once per episode, at ALERT_1. */
  decideArm: () => { arm: Arm; pilotDay?: number };
  clips: ClipMeta[];
  checkMs: number;
  cooldownMs: number;
  /** One more cue if the hand is still up after checkMs. Off: a single cue per episode. */
  followUp: boolean;
  chimeMs: number;
  chimeToClipGapMs: number;
  newId: () => string;
}

export function initialEngine(): EngineState {
  return { phase: 'IDLE', episode: null, cooldownUntil: -Infinity };
}

const ACTIVE: EnginePhase[] = ['CANDIDATE', 'ALERT_1', 'ALERT_2', 'PERSIST'];

/** Pure intervention reducer (Section 5.1). Timers advance on every call, so feed it periodic ticks. */
export function reduce(prev: EngineState, ev: EngineEvent, now: number, ctx: EngineContext): { state: EngineState; effects: Effect[] } {
  let s: EngineState = { ...prev, episode: prev.episode ? { ...prev.episode } : null };
  const effects: Effect[] = [];

  // 1. Advance timers first so events are judged against the right phase.
  s = advance(s, now, ctx, effects);

  const applyStats = (st: EpisodeStats) => {
    if (!s.episode) return;
    s.episode.zone = st.zone ?? s.episode.zone;
    s.episode.pinchFraction = st.pinchFraction;
    s.episode.rMedian = st.rMedian;
    s.episode.pSmoothMax = Math.max(s.episode.pSmoothMax, st.pSmoothMax);
  };

  switch (ev.type) {
    case 'tick':
      break;

    case 'candidateStart':
      if (s.phase === 'IDLE') {
        s.episode = newEpisode(ev.t, ctx, ev.zone);
        s.phase = 'CANDIDATE';
      }
      break;

    case 'alertThresholdReached':
      if (s.phase === 'IDLE') { s.episode = newEpisode(ev.t, ctx, ev.stats.zone); s.phase = 'CANDIDATE'; }
      if (s.phase === 'CANDIDATE' && s.episode) {
        applyStats(ev.stats);
        const { arm, pilotDay } = ctx.decideArm();
        s.episode.arm = arm;
        if (pilotDay != null) s.episode.pilotDay = pilotDay;
        s.episode.alertAt = now;
        s.alertAt = now;
        s.phase = 'ALERT_1';
        playAlert(s, 1, now, ctx, effects);
        if (arm !== 'SILENT') effects.push({ type: 'notifyAlert', episodeId: s.episode.id, arm, alertNo: 1 });
      }
      break;

    case 'handLeft':
      if (!s.episode || !ACTIVE.includes(s.phase)) break;
      applyStats(ev.stats);
      if (s.phase === 'CANDIDATE') {
        finish(s, 'brief_touch', now, effects, undefined);
        s.phase = 'IDLE';
      } else {
        const outcome: Outcome = s.phase === 'ALERT_1' ? 'interrupted' : s.phase === 'ALERT_2' ? 'interrupted_after_2' : 'not_interrupted';
        finish(s, outcome, now, effects, ev.leftAt);
        toCooldown(s, now, ctx);
      }
      break;

    case 'feedback':
      if (ev.kind === 'not_a_pull') {
        const episodeId = s.episode && ACTIVE.includes(s.phase) ? s.episode.id : undefined;
        effects.push({ type: 'logEvent', eventType: 'false_alarm', t: ev.t, episodeId });
        if (episodeId) { finish(s, 'false_alarm', now, effects, undefined); toCooldown(s, now, ctx); }
      } else {
        const active = !!s.episode && ACTIVE.includes(s.phase);
        if (active && s.episode) s.episode.pulledDuring = true;
        effects.push({ type: 'logEvent', eventType: 'manual_pull', t: ev.t, episodeId: active ? s.episode?.id : undefined, missed: !active });
      }
      break;
  }
  return { state: s, effects };
}

// At most two cues per continuous episode (ALERT_1, then ALERT_2 if followUp), then PERSIST stays quiet until
// the hand leaves. A cue never repeats in a loop while the same gesture continues.
function advance(s: EngineState, now: number, ctx: EngineContext, effects: Effect[]): EngineState {
  if (s.phase === 'ALERT_1' && s.alertAt != null && now - s.alertAt >= ctx.checkMs) {
    if (!ctx.followUp) {
      s.phase = 'PERSIST';
    } else {
      s.phase = 'ALERT_2';
      s.alert2At = now;
      playAlert(s, 2, now, ctx, effects);
      if (s.episode?.arm === 'VISUAL') effects.push({ type: 'notifyAlert', episodeId: s.episode.id, arm: 'VISUAL', alertNo: 2 });
    }
  }
  if (s.phase === 'ALERT_2' && s.alert2At != null && now - s.alert2At >= ctx.checkMs) {
    s.phase = 'PERSIST';
  }
  if (s.phase === 'COOLDOWN' && now >= s.cooldownUntil) {
    s.phase = 'IDLE';
  }
  return s;
}

function newEpisode(t: number, ctx: EngineContext, zone: Episode['zone']): Episode {
  return {
    id: ctx.newId(), sessionId: ctx.sessionId, participantCode: ctx.participantCode, startedAt: t, endedAt: t,
    zone, arm: null, clipIds: [], outcome: 'brief_touch', pinchFraction: 0, rMedian: 0, pSmoothMax: 0,
  };
}

function playAlert(s: EngineState, alertNo: 1 | 2, now: number, ctx: EngineContext, effects: Effect[]) {
  const ep = s.episode;
  if (!ep || !ep.arm || ep.arm === 'SILENT' || ep.arm === 'VISUAL') return;
  const voice = ep.arm === 'VOICE';
  // ALERT_1: chime then own voice (VOICE arm). ALERT_2: chime again (CHIME arms) or the next clip (VOICE arm).
  const chime = alertNo === 1 || !voice;
  if (chime) effects.push({ type: 'play', sound: 'chime' });
  if (voice) {
    // Only the follow-up avoids the clip just played. A new episode may replay it: with a single recorded line
    // (what onboarding records) the voice would otherwise play once per session and then only the chime.
    const clip = pickClip(ctx.clips, alertNo, alertNo === 2 ? s.lastClipId : undefined);
    if (clip) {
      effects.push({ type: 'play', sound: 'clip', clipId: clip.id, delayMs: chime ? ctx.chimeMs + ctx.chimeToClipGapMs : 0 });
      effects.push({ type: 'clipPlayed', clipId: clip.id, t: now });
      ep.clipIds = [...ep.clipIds, clip.id];
      s.lastClipId = clip.id;
    } else if (!chime) {
      effects.push({ type: 'play', sound: 'chime' });
    }
  }
}

function finish(s: EngineState, outcome: Outcome, now: number, effects: Effect[], leftAt: number | undefined) {
  const ep = s.episode;
  if (!ep) return;
  ep.outcome = outcome;
  ep.endedAt = now;
  if (leftAt != null && ep.alertAt != null) ep.secondsToHandDown = Math.max(0, (leftAt - ep.alertAt) / 1000);
  effects.push({ type: 'logEpisode', episode: ep });
  if (ep.alertAt != null) effects.push({ type: 'closeNotify', episodeId: ep.id });
  s.episode = null;
  s.alertAt = undefined;
  s.alert2At = undefined;
}

function toCooldown(s: EngineState, now: number, ctx: EngineContext) {
  s.phase = 'COOLDOWN';
  s.cooldownUntil = now + ctx.cooldownMs;
}
