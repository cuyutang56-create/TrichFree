import type { ClipCategory } from '../core/types';

export interface PromptCard { category: ClipCategory; title: string; example: string; hint: string; required: boolean }

export const PROMPTS: PromptCard[] = [
  { category: 'notice', title: 'Notice', example: "Hey, it's me. Your hand is up there.", hint: 'A gentle heads-up, the way you would say it to a friend.', required: true },
  { category: 'need', title: 'Name the need', example: "You're probably stressed or bored right now. That's okay.", hint: 'What are you usually feeling when your hand goes up?', required: false },
  { category: 'instead', title: 'Do this instead', example: 'Hands flat on the desk, or squeeze your putty for 30 seconds.', hint: 'One small thing your hands can do right now.', required: false },
  { category: 'reason', title: 'Your reason', example: 'Remember why: [your own reason, e.g., wearing my hair down at graduation].', hint: 'Why this matters to you, in your words. Or ask someone who loves you to record it.', required: false },
  { category: 'compassion', title: 'If you already pulled', example: "One hair doesn't undo anything. Hands down, keep going.", hint: 'What would help you move on without guilt?', required: false },
  { category: 'custom', title: 'Custom (optional)', example: 'Anything you want to hear.', hint: 'A line of your own, or one from someone you trust.', required: false },
];

export const REQUIRED_CATEGORIES: ClipCategory[] = PROMPTS.filter((p) => p.required).map((p) => p.category);
export const MAX_RECORD_MS = 15_000;
