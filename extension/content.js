// FocusFlow Extension Content Script Bridge
const WEB_SOURCE = 'focusflow-web';
const EXT_SOURCE = 'focusflow-extension';

// Mark the page so FocusFlow web app immediately detects the extension
try {
  document.documentElement.setAttribute('data-focushaven-shield-connected', 'true');
  document.documentElement.setAttribute('data-digicalm-shield-connected', 'true');
  document.documentElement.setAttribute('data-focusflow-shield-connected', 'true');
  window.__FOCUSHAVEN_SHIELD_INSTALLED__ = true;
  window.__DIGICALM_SHIELD_INSTALLED__ = true;
  window.__FOCUSFLOW_SHIELD_INSTALLED__ = true;
  window.dispatchEvent(new CustomEvent('focushaven-extension-ready'));
  window.dispatchEvent(new CustomEvent('digicalm-extension-ready'));
  window.dispatchEvent(new CustomEvent('focusflow-extension-ready'));
} catch (e) {}

// Check initial sync on load: if no active session in localStorage, clear orphan shield
try {
  const savedActive = localStorage.getItem('ff_active_session');
  let hasActive = false;
  if (savedActive) {
    try {
      const parsed = JSON.parse(savedActive);
      hasActive = parsed && typeof parsed === 'object' && parsed.lastTick !== 0 && parsed.phaseRemaining > 0;
    } catch (e) {}
  }
  if (!hasActive) {
    chrome.runtime.sendMessage({ type: 'CHECK_SYNC', hasActiveSession: false });
  }
} catch (e) {}

// Relay messages from FocusFlow web app to Extension Background Worker
function handleWebMessage(data) {
  if (!data || typeof data !== 'object') return;
  chrome.runtime.sendMessage(data, response => {
    try {
      window.postMessage({
        source: EXT_SOURCE,
        type: 'RESPONSE',
        replyTo: data.type,
        response
      }, '*');
      window.dispatchEvent(new CustomEvent('focusflow-extension-response', { detail: { replyTo: data.type, response } }));
    } catch (e) {}
  });
}

// 1. Listen to window.postMessage
window.addEventListener('message', event => {
  if (event.source !== window || !event.data || (event.data.source !== 'focusflow-web' && event.data.source !== 'digicalm-web' && event.data.source !== 'focushaven-web')) return;
  handleWebMessage(event.data);
});

// 2. Listen to CustomEvent
window.addEventListener('focushaven-web-sync', event => { if (event.detail) handleWebMessage(event.detail); });
window.addEventListener('digicalm-web-sync', event => { if (event.detail) handleWebMessage(event.detail); });
window.addEventListener('focusflow-web-sync', event => {
  if (event.detail) {
    handleWebMessage(event.detail);
  }
});

// 3. Listen to messages from background.js and popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'QUERY_SESSION') {
    // Check if website has an active session in localStorage
    try {
      const raw = localStorage.getItem('ff_active_session');
      if (raw && raw !== 'null') {
        const session = JSON.parse(raw);
        if (session && session.phaseRemaining > 0) {
          sendResponse({
            hasActiveSession: true,
            session: {
              title: session.title || 'Focus Session',
              phase: session.phase || 'study',
              blockMinutes: session.blockMinutes || 25,
              phaseRemaining: session.phaseRemaining || 0,
              lastTick: session.lastTick || Date.now()
            }
          });
          return true;
        }
      }
    } catch (e) {}
    sendResponse({ hasActiveSession: false, session: null });
    return true;
  }

  try {
    window.postMessage({
      source: EXT_SOURCE,
      ...message
    }, '*');
    window.dispatchEvent(new CustomEvent('focusflow-extension-sync', { detail: message }));
    sendResponse({ ok: true });
  } catch (e) {}
  return true;
});

// Announce presence to background
chrome.runtime.sendMessage({ type: 'GET_STATE' }, response => {
  if (response && response.state) {
    try {
      window.postMessage({
        source: EXT_SOURCE,
        type: 'SYNC_STATE',
        state: response.state
      }, '*');
    } catch (e) {}
  }
});
