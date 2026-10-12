// Mochi's voice. Two registers, on purpose:
//  · PLAYFUL (teasing) is only ever about showing up (streaks, reminders, sessions). That's Duo's charm, aimed somewhere safe.
//  · About pulling, Mochi is always plain and kind, whatever tone the user picked. No jokes, no guilt.
export type Tone = 'playful' | 'gentle';
export type LineKind =
  | 'hello' | 'reminder' | 'sessionStart' | 'sessionEnd' | 'streakSaved' | 'freezeUsed'
  | 'afterCatch' | 'afterPull' | 'afterNotPull' | 'levelUp' | 'idle' | 'reminderFresh';

type Ctx = { streak?: number; minutes?: number; flavour?: string };

const LINES: Record<LineKind, Record<Tone, ((c: Ctx) => string)[]>> = {
  hello: {
    playful: [
      () => "Oh, you're here. I was absolutely not waiting by the door.",
      (c) => c.streak ? `${c.streak}-day streak. Not to brag, but I carried some of that.` : 'New day. Clean slate. I fluffed myself for this.',
      () => "Desk time? I'll guard the hair. You guard the deadline.",
    ],
    gentle: [
      () => "Hi. I'm here whenever you're ready to sit down.",
      (c) => c.streak ? `${c.streak} days of showing up. That counts.` : 'A new day. We can start small.',
      () => "Let's do a little focus time together.",
    ],
  },
  reminder: {
    playful: [
      (c) => `Your ${c.streak}-day streak is looking at me. I'm looking at you. Desk session?`,
      (c) => `Not to be dramatic, but our ${c.streak}-day streak ends at midnight. Ten minutes. That's all I ask.`,
      () => "I've been sitting here all day. Squishy. Unbothered. Mildly abandoned.",
      () => "Ten minutes at your desk keeps the streak alive. I don't make the rules. (I do make the rules.)",
    ],
    gentle: [
      (c) => c.streak ? `Ten minutes today keeps your ${c.streak}-day streak going. No pressure.` : 'Got ten minutes? I can keep you company.',
      () => "Whenever you're ready, I'm here.",
    ],
  },
  reminderFresh: {
    playful: [() => "I've been sitting here all day. Squishy. Unbothered. Mildly abandoned. Ten minutes?", () => 'A streak starts with one desk session. I’m just saying. Loudly.'],
    gentle: [() => 'Got ten minutes? I can keep you company.', () => 'Whenever you’re ready, I’m here.'],
  },
  sessionStart: {
    playful: [() => "Okay. You study, I watch the hair. Nobody touches the hair.", () => "Session on. I'm in my focus era."],
    gentle: [() => "I'm watching quietly. Focus on your work.", () => "Here with you. Take your time."],
  },
  sessionEnd: {
    playful: [(c) => `${c.minutes} minutes. Look at us, being functional.`, () => 'Session done. I need a nap and so do you.'],
    gentle: [(c) => `${c.minutes} minutes together. Thank you for showing up.`, () => 'Nice session. Rest a little.'],
  },
  streakSaved: {
    playful: [(c) => `Streak: ${c.streak}. Saved. You may now go about your day.`],
    gentle: [(c) => `That's ${c.streak} days. Well done for showing up.`],
  },
  freezeUsed: {
    playful: [() => "You missed a day. I used a streak freeze. You're welcome. Don't make it a habit."],
    gentle: [() => 'You missed a day, so a streak freeze kept your streak safe. Rest days are allowed.'],
  },
  afterCatch: {
    playful: [() => 'Hands down. Iconic.', () => 'You heard it, you did it. That was all you.'],
    gentle: [() => 'You noticed, and you chose. That was all you.', () => 'Hands down. Nicely done.'],
  },
  // Never sass here, whatever the tone setting says.
  afterPull: {
    playful: [() => "Thanks for telling me. One moment doesn't undo anything. Hands down, keep going."],
    gentle: [() => "Thanks for telling me. One moment doesn't undo anything. Hands down, keep going."],
  },
  afterNotPull: {
    playful: [() => "My bad. Noted. I'm learning your hands.", () => 'False alarm, got it. I’ll know better next time.'],
    gentle: [() => "Thanks, that helps me learn your hands.", () => 'Got it. I’ll remember that one.'],
  },
  levelUp: {
    playful: [(c) => `New flavour unlocked: ${c.flavour}. I look incredible.`],
    gentle: [(c) => `You unlocked ${c.flavour} Mochi. Thank you for sticking with it.`],
  },
  idle: {
    playful: [() => 'Squeeze me. I dare you.', () => "I'm a stress ball with opinions.", () => 'Hands busy, hair safe. Squish.'],
    gentle: [() => 'Squeeze me when your hands need something to do.', () => 'Hands busy, hair safe.'],
  },
};

/** Picks a line; `seed` keeps it stable within a day/render (pass Date-based seeds). */
export function mochiSays(kind: LineKind, tone: Tone, ctx: Ctx = {}, seed = 0): string {
  const opts = LINES[kind][tone];
  return opts[Math.abs(seed) % opts.length](ctx);
}
