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
    "During the pilot, the app sends the research team, labelled only with your participant code: when each possible pull was detected and which day of the pilot it was; which area of your head it was near; which reminder played and how many of your voice clips; whether and how quickly your hand came down; a few detector measurements of the movement; your 'Not a pull' and 'I just pulled' taps; when TrichFree was started, paused, resumed and stopped, your desk minutes and other app events (such as camera problems); the reminder type you chose, how fast detection runs on your computer and the app version; and calibration quality scores, the areas you chose to watch and the detection timing. It never sends video, images or your voice. You can stop sending at any time in Settings: anything not yet sent then stays on this computer.",
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
