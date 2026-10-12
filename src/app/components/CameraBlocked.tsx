export function CameraBlocked() {
  const url = `chrome://settings/content/siteDetails?site=${encodeURIComponent(`chrome-extension://${chrome.runtime.id}`)}`;
  return (
    <div className="card warn">
      <h3>The camera is blocked</h3>
      <p className="small">TrichFree needs the camera to notice your hand. It never saves or sends video.</p>
      <ol className="small">
        <li>Open the extension's site settings: <button className="ghost" style={{ padding: 0 }} onClick={() => chrome.tabs.create({ url })}>open settings</button> (or paste <code>{url}</code>).</li>
        <li>Set <b>Camera</b> to <b>Allow</b>. Choose "Allow" rather than "Allow this time", so desk mode can use it in the background.</li>
        <li>Come back and reload this page.</li>
      </ol>
      <button onClick={() => location.reload()}>Reload</button>
    </div>
  );
}
