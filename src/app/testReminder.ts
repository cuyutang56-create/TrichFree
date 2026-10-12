// "Test reminder": plays exactly what a real reminder would, from the page the user clicked on.
import { CHIME_MS, Player } from '../offscreen/player';
import type { AppSettings, ClipRow } from '../shared/db';
import { send } from '../shared/messages';
import { ALERT_CATEGORIES } from '../core/clipPicker';

export async function testReminder(s: Pick<AppSettings, 'intervention' | 'chimeVolume'>, clips: ClipRow[]): Promise<string> {
  if (s.intervention === 'off') return 'Reminders are off, so nothing plays. TrichFree will only keep a private log.';
  if (s.intervention === 'visual') {
    await send({ target: 'sw', type: 'TEST_VISUAL' });
    return 'A notification should appear on your screen. If it does not, check that notifications are allowed for your browser in your system settings.';
  }
  const player = new Player(s.chimeVolume / 100);
  await player.resume();
  player.chime();
  let note = 'Played the chime.';
  if (s.intervention === 'voice') {
    const pool = clips.filter((c) => ALERT_CATEGORIES[1].includes(c.category));
    const clip = (pool.length ? pool : clips)[0];
    if (clip) {
      await player.load([clip]);
      player.clip(clip.id, CHIME_MS + 250);
      note = 'Played the chime and your voice.';
    } else {
      note = 'Played the chime. Record a voice line on this device to hear your own voice too.';
    }
  }
  window.setTimeout(() => void player.close(), 15_000);
  return note;
}
