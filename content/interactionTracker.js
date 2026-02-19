/**
 * Content script: tracks actions (click, copy, paste). No page visits.
 * Background logs tab_switch and reload.
 */

(function () {
  const SOURCE = 'workflow_intelligence_content';

  function send(type, metadata) {
    const url = window.location.href;
    try {
      chrome.runtime.sendMessage(
        { source: SOURCE, type, url, metadata: metadata || {} },
        function () {
          if (chrome.runtime.lastError) {
            // Extension context invalid or not installed
          }
        }
      );
    } catch (_) {}
  }

  function onCopy() {
    const selection = window.getSelection ? window.getSelection().toString() : '';
    const snippet = selection ? selection.slice(0, 200) : undefined;
    send('copy', { snippet });
  }

  function onPaste() {
    send('paste', {});
  }

  // Fallback: sites like Google Docs intercept paste; Ctrl+V still fires keydown
  function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      send('paste', { via: 'keyboard' });
    }
  }

  function onClick(e) {
    if (window.__wi_clickCount === undefined) window.__wi_clickCount = 0;
    if (window.__wi_clickLast === undefined) window.__wi_clickLast = 0;
    const now = Date.now();
    if (now - window.__wi_clickLast < 300) {
      window.__wi_clickCount++;
      if (window.__wi_clickCount > 5) return;
    } else {
      window.__wi_clickCount = 1;
    }
    window.__wi_clickLast = now;
    send('click', { tag: (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : undefined });
  }

  document.addEventListener('copy', onCopy, true);
  document.addEventListener('paste', onPaste, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('click', onClick, true);
})();
