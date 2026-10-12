# Chrome Web Store: permission justifications

**Single purpose:** TrichFree Desk helps people with trichotillomania notice when a hand rests at their hair while they work. It watches the webcam on the device and plays short clips the user recorded in their own voice.

| Permission | Why it is needed |
|---|---|
| `offscreen` | Camera frames are processed in a hidden offscreen document (reasons `USER_MEDIA` and `AUDIO_PLAYBACK`), so detection and audio keep working while the user is in another app or tab. This is the core feature. |
| `storage` | Stores small, fast-changing status (desk mode on/off, frames per second, today's counts) that the toolbar popup and background worker read. |
| `unlimitedStorage` | The user's voice clips (audio) and landmark-only debug recordings live in IndexedDB on the device and can exceed the default quota. |
| `notifications` | A quiet "Hands down?" notification with **Not a pull** / **I just pulled** buttons, so the user can give feedback from any app. Also tells the user when detection paused (camera taken by another app, 3-hour auto-stop). |
| `alarms` | A 30-second heartbeat that checks the offscreen document is alive and restarts it if Chrome closed it; the 3-hour auto-stop; resuming after "Pause 15 min". |
| `idle` | Stops desk mode (and the camera) when the computer is idle for 10 minutes or locked, so the camera is never left on unattended. |
| Host permission for the Supabase project URL (pilot builds only) | Insert-only upload of pilot study rows (timestamps and outcomes; never video, images or audio). Absent from builds without a research backend. |
| Camera (user prompt) | Hand and face landmark detection, entirely on the device with MediaPipe. No frames are stored or sent. |
| Microphone (user prompt) | Recording the user's own voice clips on the voice-library page only. Clips stay on the device. |

**Not requested:** no content scripts, no `tabs`, `history`, `<all_urls>` or `webRequest`. The extension never reads the pages you browse.

**Remote code:** none. MediaPipe WASM and models are bundled in the package; the CSP is `script-src 'self' 'wasm-unsafe-eval'` (WASM only).
