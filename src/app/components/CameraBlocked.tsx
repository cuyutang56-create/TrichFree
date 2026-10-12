export function CameraBlocked() {
  const url = `chrome://settings/content/siteDetails?site=${encodeURIComponent(`chrome-extension://${chrome.runtime.id}`)}`;
  return (
    <div className="notice warn" role="alert">
      <div className="notice-body stack">
        <strong>The camera is blocked for TrichFree</strong>
        <p className="small">TrichFree needs the camera to notice your hand. Video is analysed on this computer and never saved or sent.</p>
        <ol className="small">
          <li>Open TrichFree’s site settings: <button className="btn ghost" onClick={() => chrome.tabs.create({ url })}>Open settings</button></li>
          <li>Set <strong>Camera</strong> to <strong>Allow</strong> (not “Allow this time”), so monitoring can keep running in the background.</li>
          <li>Come back and reload this page.</li>
        </ol>
        <button className="btn" onClick={() => location.reload()}>Reload</button>
      </div>
    </div>
  );
}
