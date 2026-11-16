const END_ALARM = 'focusflow-shield-end';
const TICK_ALARM = 'focusflow-shield-tick';

const DEFAULT_DOMAINS = [
  'instagram.com',
  'youtube.com',
  'reddit.com',
  'x.com',
  'twitter.com',
  'tiktok.com'
];

function cleanDomain(val) {
  if (!val) return '';
  return String(val)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0];
}

async function readState() {
  const defaults = {
    enabled: false,
    paused: false,
    isBreak: false,
    domains: DEFAULT_DOMAINS,
    blockedCount: 0,
    endsAt: 0,
    durationMinutes: 45,
    activeTaskTitle: 'Deep Study Session',
    blockedHistory: []
  };
  return await chrome.storage.local.get(defaults);
}

function broadcastState(state) {
  try {
    chrome.tabs.query({}, tabs => {
      if (!tabs || !tabs.length) return;
      tabs.forEach(tab => {
        try {
          chrome.tabs.sendMessage(tab.id, { type: 'STATE_CHANGED', state }, () => {
            if (chrome.runtime.lastError) { /* tab might not have content script */ }
          });
        } catch (e) {}
      });
    });
  } catch (e) {}
}

async function updateBadge(state) {
  try {
    if (state.enabled && !state.paused && !state.isBreak) {
      const remainingMs = Math.max(0, (state.endsAt || 0) - Date.now());
      const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));
      await chrome.action.setBadgeText({ text: `${remainingMin}m` });
      await chrome.action.setBadgeBackgroundColor({ color: '#426b4c' });
      await chrome.action.setTitle({ title: `FocusFlow Shield: Active (${remainingMin} min left)` });
    } else if (state.enabled && state.isBreak) {
      await chrome.action.setBadgeText({ text: 'BRK' });
      await chrome.action.setBadgeBackgroundColor({ color: '#c79644' });
      await chrome.action.setTitle({ title: 'FocusFlow: Break Phase' });
    } else if (state.enabled && state.paused) {
      await chrome.action.setBadgeText({ text: 'PAUS' });
      await chrome.action.setBadgeBackgroundColor({ color: '#88988d' });
      await chrome.action.setTitle({ title: 'FocusFlow: Session Paused' });
    } else if (state.blockedCount > 0) {
      await chrome.action.setBadgeText({ text: String(state.blockedCount) });
      await chrome.action.setBadgeBackgroundColor({ color: '#7a887d' });
      await chrome.action.setTitle({ title: `FocusFlow Shield: ${state.blockedCount} urges deflected` });
    } else {
      await chrome.action.setBadgeText({ text: '' });
      await chrome.action.setTitle({ title: 'FocusFlow Shield — Website Blocker' });
    }
  } catch (err) {
    console.error('Badge update error:', err);
  }
}

async function applyRules() {
  const state = await readState();
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map(rule => rule.id);

  const rawDomains = state.domains && state.domains.length ? state.domains : DEFAULT_DOMAINS;
  const domains = [...new Set(rawDomains.map(cleanDomain).filter(d => d.includes('.')))];

  const addRules = [];
  // Only enforce blocking if shield is enabled, NOT paused, and NOT in break phase!
  if (state.enabled && !state.paused && !state.isBreak && domains.length > 0) {
    domains.forEach((domain, index) => {
      // Main frame navigation -> redirect to blocked.html boundary
      addRules.push({
        id: 1000 + (index * 2),
        priority: 1,
        action: {
          type: 'redirect',
          redirect: { extensionPath: '/blocked.html' }
        },
        condition: {
          requestDomains: [domain],
          resourceTypes: ['main_frame']
        }
      });

      // Sub-frame requests -> block
      addRules.push({
        id: 1000 + (index * 2) + 1,
        priority: 1,
        action: { type: 'block' },
        condition: {
          requestDomains: [domain],
          resourceTypes: ['sub_frame']
        }
      });
    });
  }

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  await updateBadge(state);
  broadcastState(state);
}

chrome.runtime.onInstalled.addListener(async () => {
  const state = await readState();
  await chrome.storage.local.set({ domains: state.domains });
  await applyRules();
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === TICK_ALARM) {
    const state = await readState();
    if (state.enabled && !state.paused) {
      if (Date.now() >= state.endsAt) {
        await finishSession();
      } else {
        await updateBadge(state);
      }
    } else {
      await chrome.alarms.clear(TICK_ALARM);
    }
    return;
  }

  if (alarm.name === END_ALARM) {
    await finishSession();
  }
});

async function finishSession() {
  await chrome.alarms.clear(END_ALARM);
  await chrome.alarms.clear(TICK_ALARM);
  await chrome.storage.local.set({ enabled: false, endsAt: 0, paused: false, isBreak: false });
  await applyRules();

  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'FocusFlow Shield · Session Complete',
      message: 'Your focus block has finished. Blocked websites are now unlocked. Great job staying with your plan!'
    });
  } catch (err) {
    console.log('Notification error:', err);
  }
}

async function handleActionMessage(message) {
  if (!message || !message.type) return { ok: false, error: 'No message type provided' };

  if (message.type === 'START_SHIELD') {
    const minutes = Math.min(180, Math.max(1, Number(message.minutes) || 45));
    const endsAt = message.endsAt && message.endsAt > Date.now()
      ? Number(message.endsAt)
      : Date.now() + minutes * 60 * 1000;
    const taskTitle = message.taskTitle ? String(message.taskTitle).trim() : 'Focus Session';

    await chrome.storage.local.set({
      enabled: true,
      paused: false,
      isBreak: false,
      endsAt,
      durationMinutes: minutes,
      activeTaskTitle: taskTitle
    });

    await chrome.alarms.clear(END_ALARM);
    chrome.alarms.create(END_ALARM, { when: endsAt });

    await chrome.alarms.clear(TICK_ALARM);
    chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });

    await applyRules();
    const state = await readState();
    return { ok: true, endsAt, state };
  }

  if (message.type === 'STOP_SHIELD') {
    await chrome.alarms.clear(END_ALARM);
    await chrome.alarms.clear(TICK_ALARM);
    await chrome.storage.local.set({ enabled: false, endsAt: 0, paused: false, isBreak: false });
    await applyRules();
    const state = await readState();
    return { ok: true, state };
  }

  if (message.type === 'PAUSE_SHIELD') {
    await chrome.storage.local.set({ paused: true });
    await applyRules();
    const state = await readState();
    return { ok: true, state };
  }

  if (message.type === 'RESUME_SHIELD') {
    let updateObj = { paused: false, isBreak: false };
    if (message.endsAt && message.endsAt > Date.now()) {
      updateObj.endsAt = Number(message.endsAt);
      await chrome.alarms.clear(END_ALARM);
      chrome.alarms.create(END_ALARM, { when: updateObj.endsAt });
    }
    await chrome.storage.local.set(updateObj);
    await applyRules();
    const state = await readState();
    return { ok: true, state };
  }

  if (message.type === 'BREAK_PHASE') {
    // Unblock websites during break so student can relax
    await chrome.storage.local.set({ isBreak: true, paused: false });
    await applyRules();
    const state = await readState();
    return { ok: true, state };
  }

  if (message.type === 'CHECK_SYNC') {
    // Synchronize with website session state
    const state = await readState();
    if (!message.hasActiveSession && state.enabled) {
      // Website has no active session, stop the orphan shield timer!
      await chrome.alarms.clear(END_ALARM);
      await chrome.alarms.clear(TICK_ALARM);
      await chrome.storage.local.set({ enabled: false, endsAt: 0, paused: false, isBreak: false });
      await applyRules();
      const updated = await readState();
      return { ok: true, synced: true, state: updated };
    }
    return { ok: true, state };
  }

  if (message.type === 'BLOCKED_VISIT') {
    const state = await readState();
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const attempt = {
      timestamp: now,
      timeStr,
      domain: message.domain || 'Protected website'
    };
    const history = [attempt, ...(state.blockedHistory || [])].slice(0, 30);
    const newCount = (state.blockedCount || 0) + 1;

    await chrome.storage.local.set({
      blockedCount: newCount,
      lastBlockedAt: now,
      blockedHistory: history
    });
    await updateBadge({ ...state, blockedCount: newCount });
    return { ok: true, blockedCount: newCount, endsAt: state.endsAt };
  }

  if (message.type === 'GET_STATE') {
    const state = await readState();
    return { ok: true, state };
  }

  if (message.type === 'UPDATE_DOMAINS') {
    if (Array.isArray(message.domains)) {
      const clean = [...new Set(message.domains.map(cleanDomain).filter(d => d.includes('.')))];
      await chrome.storage.local.set({ domains: clean });
      await applyRules();
      return { ok: true, domains: clean };
    }
    return { ok: false, error: 'Invalid domains array' };
  }

  if (message.type === 'RESET_STATS') {
    await chrome.storage.local.set({ blockedCount: 0, blockedHistory: [] });
    const state = await readState();
    await updateBadge(state);
    return { ok: true };
  }

  return { ok: false, error: 'Unknown message type' };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleActionMessage(message).then(sendResponse);
  return true;
});

if (chrome.runtime.onMessageExternal) {
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    handleActionMessage(message).then(sendResponse);
    return true;
  });
}
