// Plain-language monitoring status for the dashboard and the popup.
import { COPY } from '../shared/copy';
import type { DeskState } from '../shared/messages';
import type { CamPermission } from './hooks';

export interface StatusView { title: string; detail: string; tone: '' | 'ok' | 'warn' | 'danger' | 'accent'; camera: string }

export function statusView(d: DeskState, cam: CamPermission): StatusView {
  if (!d.wanted && d.status === 'paused') {
    const until = d.pausedUntil ? new Date(d.pausedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    return { title: until ? `Paused until ${until}` : 'Paused', detail: 'Monitoring starts again by itself. The camera is off until then.', tone: 'warn', camera: 'Off' };
  }
  if (!d.wanted) {
    return { title: 'Monitoring is off', detail: cam === 'denied' ? 'The camera is blocked for TrichFree. Allow it to start monitoring.' : 'The camera is not in use.', tone: '', camera: cam === 'denied' ? 'Blocked' : 'Off' };
  }
  switch (d.status) {
    case 'starting': return { title: 'Starting…', detail: 'Loading the on-device detector. This can take a few seconds.', tone: 'accent', camera: 'On' };
    case 'watching': return { title: 'Watching', detail: 'TrichFree is noticing possible hand-to-hair movements. You can switch to any app.', tone: 'ok', camera: 'In use by TrichFree' };
    case 'slow': return { title: 'Watching (slowly)', detail: COPY.slow, tone: 'warn', camera: 'In use by TrichFree' };
    case 'camera_busy': return { title: 'Waiting for the camera', detail: 'Another app is using the camera. TrichFree keeps trying for 5 minutes.', tone: 'warn', camera: 'Busy (another app)' };
    case 'problem': return { title: 'Needs a restart', detail: d.errorKind === 'models' ? 'The detector could not start.' : 'The camera stopped sending pictures.', tone: 'danger', camera: 'Not responding' };
    case 'error': return { title: 'Could not start', detail: d.error ?? 'Something went wrong.', tone: 'danger', camera: d.errorKind === 'camera_permission' ? 'Blocked' : d.errorKind === 'camera_unavailable' ? 'Not found' : 'Off' };
    default: return { title: 'Monitoring is off', detail: '', tone: '', camera: 'Off' };
  }
}

