// Keeps the design tokens accessible: every text/background pair the UI uses must meet WCAG AA (4.5:1),
// and borders that identify controls must reach 3:1, in both the light and the dark theme.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/ui/tokens.css', 'utf8');
function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}
const light = tokens(css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)')));
const dark = { ...light, ...tokens(css.slice(css.indexOf('@media (prefers-color-scheme: dark)'))) };

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const TEXT_PAIRS: [string, string][] = [
  ['text', 'bg'], ['text', 'surface'], ['text', 'surface-2'], ['text', 'surface-3'], ['text', 'accent-soft'],
  ['muted', 'bg'], ['muted', 'surface'], ['muted', 'surface-2'],
  ['accent', 'bg'], ['accent', 'surface'], ['accent-strong', 'accent-soft'], ['accent-ink', 'accent'],
  ['ok-text', 'ok-soft'], ['warn-text', 'warn-soft'], ['danger-text', 'danger-soft'], ['danger-text', 'surface'],
];

describe('design token contrast (WCAG AA)', () => {
  for (const [name, t] of [['light', light], ['dark', dark]] as const) {
    it(`${name} theme: text pairs ≥ 4.5:1, control borders ≥ 3:1`, () => {
      for (const [fg, bg] of TEXT_PAIRS) {
        expect(t[fg], fg).toBeDefined();
        expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(t['border-strong'], t.surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(t.focus, t.bg)).toBeGreaterThanOrEqual(3);
    });
  }
});
