# Chrome Web Store: permission justifications

**Single purpose:** TrichFree helps people with trichotillomania notice when a hand goes to their hair while they
work at a computer. It watches the webcam on the device and gives a gentle reminder the user chose, such as a short
clip in their own voice.

| Permission | Why it is needed |
|---|---|
| `offscreen` | Camera frames are processed in a hidden offscreen document (reasons `USER_MEDIA` and `AUDIO_PLAYBACK`), so detection and the reminder sound keep working while the user is in another app or tab. This is the core feature. |
| `storage` | Small, fast-changing state the popup and background worker share: monitoring on or off, frame rate, today's counts, and the optional account's sign-in session and sync status. |
| `unlimitedStorage` | The user's voice recordings (audio) and their history live in IndexedDB on the device and can exceed the default quota. |
| `notifications` | The visual reminder ("Hands down?") with **Not a pull** / **I just pulled** buttons, so the user can respond from any app. Also tells the user when monitoring stopped (camera taken by another app, 3-hour break reminder, nobody in view) and, only if they turn it on, a daily check-in reminder. |
| `alarms` | A 30-second heartbeat that checks the camera document is alive; the 3-hour break reminder; resuming after "Pause 15 min"; the optional daily check-in; and, with an account, syncing settings every 15 minutes. |
| `idle` | Stops monitoring (and the camera) when the screen locks, or when the computer has been idle for 10 minutes and nobody was seen for 2 minutes, so the camera is never left on unattended. |
| Host permission for the project's own Supabase URL (builds with accounts only) | Sign-in with an emailed code, syncing the user's settings, and, for pilot participants who opt in, uploading pilot rows (timestamps and outcomes; never video, images or audio). Builds without a backend do not request it. |
| `externally_connectable` (the TrichFree website's origin only) | Lets the TrichFree website show whether the extension is installed and running, ask it to sync after the user changes a setting on the site, open it, or stop monitoring. A web page can never start the camera. |
| Camera (user prompt) | Hand, face and hair detection, entirely on the device with MediaPipe. No frame is stored or sent. |
| Microphone (user prompt) | Recording the user's own reminder lines on the Voice page only. Recordings stay on the device. |

**Not requested:** no content scripts, no `tabs`, `history`, `webRequest`, `scripting` or `<all_urls>`, and no
web-accessible resources. The extension never reads or changes the pages you browse.

**Remote code:** none. MediaPipe WebAssembly and models are bundled in the package (models pinned and
checksum-verified at build time). The CSP is `script-src 'self' 'wasm-unsafe-eval'` (WebAssembly only, no eval).
