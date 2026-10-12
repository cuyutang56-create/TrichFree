// Test fixture: an unrelated extension that tries to message TrichFree. The test drives it through evaluate().
// TrichFree ignores it (no reply at all), so the callback may never run: give up after 3 s.
self.ask = (id, msg) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve({ resp: null, err: 'no reply' }), 3000);
  try {
    chrome.runtime.sendMessage(id, msg, (resp) => { clearTimeout(timer); resolve({ resp: resp ?? null, err: chrome.runtime.lastError?.message ?? null }); });
  } catch (e) {
    clearTimeout(timer);
    resolve({ resp: null, err: String(e) });
  }
});
