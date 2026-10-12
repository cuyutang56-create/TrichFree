// UI copy. Tone: warm, calm, second person, short sentences. Never shame, never pressure.
// Accuracy rule: TrichFree notices *possible* hand-to-hair movements. It cannot tell every pull from ordinary touching.
export const COPY = {
  appName: 'TrichFree',
  tagline: 'A little reminder, right when you need it.',
  privacy: 'Your camera is analysed on this device. No video or images are ever saved or sent anywhere.',
  bestIn: 'Works best in Chrome or Edge on a laptop or desktop.',
  loggedNeutral: 'Logged. Thank you for telling me.',
  notAPullThanks: 'Got it. That helps TrichFree learn your movements.',
  alertTitle: 'Hands down?',
  alertFallback: 'A gentle reminder from TrichFree.',
  pausedTitle: 'TrichFree needs a restart',
  cameraLost: 'Another app is using your camera, so TrichFree stopped. Start again when the camera is free.',
  autoStop: "You've been at your desk for 3 hours. Time for a stretch? Monitoring has stopped.",
  awayStop: 'Nobody was in view for a while, so TrichFree switched the camera off.',
  lockedStop: 'Your computer locked, so TrichFree switched the camera off.',
  dailyNudge: 'Ready for a focused session? TrichFree can keep you company.',
  slow: 'Detection is running slowly on this computer. It still works, but may react a little later. Closing other tabs can help.',
  kindWords: 'Kind words tend to help more than harsh ones. Try lines about what you can do, not about damage or appearance.',
  limits: 'TrichFree notices possible hand-to-hair movements. It cannot tell every pull apart from ordinary touching, and it is not a medical device.',
  pilotNotice:
    "During the pilot, the app sends the research team: your participant code; the times episodes were detected; which reminder played; whether your hand came down within 10 seconds; your 'Not a pull' and 'I just pulled' taps; desk minutes; and calibration quality scores. It never sends video, images or your voice. You can stop sending at any time in Settings.",
  voiceLocal: 'Voice recordings stay on this device. They are not uploaded, so on another computer you record them again.',
};

export const STOP_REASON_TEXT: Record<string, string> = {
  away: COPY.awayStop,
  locked: COPY.lockedStop,
  idle: COPY.awayStop,
  auto_stop: COPY.autoStop,
  camera_lost: COPY.cameraLost,
  restart: 'TrichFree restarted (after a browser restart or an update), so monitoring stopped. Start again when you are ready.',
};
