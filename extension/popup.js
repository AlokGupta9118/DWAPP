const $ = id => document.getElementById(id);
let state = {};
let ticker = null;
let selectedMinutes = 45;

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

async function fetchState() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, response => {
      if (response && response.ok && response.state) {
        state = response.state;
      } else {
        chrome.storage.local.get({
          enabled: false,
          paused: false,
          isBreak: false,
          domains: ['instagram.com', 'youtube.com', 'reddit.com', 'x.com'],
          blockedCount: 0,
          endsAt: 0,
          durationMinutes: 45,
          activeTaskTitle: 'Deep Study Session'
        }, res => {
          state = res;
        });
      }
      resolve(state);
    });
  });
}

function checkWebsiteSync() {
  try {
    chrome.tabs.query({ url: ['http://localhost/*', 'http://127.0.0.1/*', 'https://*/*'] }, tabs => {
      if (!tabs || !tabs.length) return;
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'QUERY_SESSION' }, resp => {
          if (chrome.runtime.lastError || !resp) return;
          if (resp.hasActiveSession && resp.session) {
            state.enabled = true;
            state.activeTaskTitle = resp.session.title;
            render();
          } else if (resp.hasActiveSession === false && state.enabled) {
            chrome.runtime.sendMessage({ type: 'STOP_SHIELD' }, async () => {
              await fetchState();
              render();
            });
          }
        });
      });
    });
  } catch (e) {}
}

function fmtRemaining(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function render() {
  const on = !!state.enabled;
  const isBreak = !!state.isBreak;
  const isPaused = !!state.paused;

  // Status banner
  const statusCard = $('statusCard');
  statusCard.classList.toggle('active', on && !isBreak && !isPaused);

  if (on) {
    if (isBreak) {
      $('statusText').textContent = 'Break Phase';
      $('statusSub').textContent = 'Websites accessible during your break';
    } else if (isPaused) {
      $('statusText').textContent = 'Shield Paused';
      $('statusSub').textContent = 'Session paused in Focus Room';
    } else {
      $('statusText').textContent = 'Shield is Active (Synced)';
      $('statusSub').textContent = 'Distracting websites are blocked';
    }
  } else {
    $('statusText').textContent = 'Shield is Off';
    $('statusSub').textContent = 'Starts with Focus Room or manually below';
  }

  // Active details
  $('activeDetails').classList.toggle('hidden', !on);
  $('durationSection').classList.toggle('hidden', on);

  if (on) {
    $('taskTitle').textContent = state.activeTaskTitle || 'Focus Session';
    startTicker();
  } else {
    stopTicker();
  }

  // Action buttons
  $('toggleBtn').textContent = on ? 'Shield Active (Synced)' : 'Start Blocking';
  $('toggleBtn').disabled = on;
  $('unlockBtn').classList.toggle('hidden', !on);

  // Stats
  const count = state.blockedCount || 0;
  $('countDisplay').textContent = count;
  $('timeSavedDisplay').textContent = `~${count * 15}m`;

  // Domains
  const domains = state.domains || [];
  $('domainCount').textContent = domains.length;

  const chipsContainer = $('domainChips');
  chipsContainer.innerHTML = '';
  domains.forEach(domain => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<span>${domain}</span><button data-domain="${domain}" title="Remove ${domain}">×</button>`;
    chipsContainer.appendChild(chip);
  });

  // Attach delete events
  chipsContainer.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async e => {
      const target = e.currentTarget.dataset.domain;
      await removeDomain(target);
    });
  });

  // Update quick preset chips
  document.querySelectorAll('.quick-chip').forEach(btn => {
    const d = btn.dataset.domain;
    btn.classList.toggle('blocked', domains.includes(d));
  });
}

function startTicker() {
  stopTicker();
  function updateTimer() {
    const endsAt = state.endsAt || 0;
    const remaining = Math.max(0, endsAt - Date.now());
    $('countdownVal').textContent = fmtRemaining(remaining);
    if (remaining <= 0) {
      stopTicker();
      refresh();
    }
  }
  updateTimer();
  ticker = setInterval(updateTimer, 1000);
}

function stopTicker() {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

async function refresh() {
  await fetchState();
  render();
}

// Preset duration selection
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMinutes = Number(btn.dataset.minutes);
    $('customMinutes').value = selectedMinutes;
  });
});

$('customMinutes').addEventListener('input', e => {
  const val = Number(e.target.value);
  if (val > 0) {
    selectedMinutes = val;
    document.querySelectorAll('.preset-btn').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.minutes) === val);
    });
  }
});

// Start Blocking manually from popup
$('toggleBtn').addEventListener('click', async () => {
  const minutes = selectedMinutes || Number($('customMinutes').value) || 45;
  chrome.runtime.sendMessage({
    type: 'START_SHIELD',
    minutes,
    taskTitle: state.activeTaskTitle || 'Focus Study Session'
  }, async () => {
    await refresh();
    setSyncStatus('Shield started! Sites are now blocked.');
  });
});

// Emergency Unlock
$('unlockBtn').addEventListener('click', async () => {
  chrome.runtime.sendMessage({ type: 'STOP_SHIELD' }, async () => {
    await refresh();
    setSyncStatus('Emergency unlock completed. Websites available.');
  });
});

// Add Domain
async function addDomain(raw) {
  const domain = cleanDomain(raw);
  if (!domain || !domain.includes('.')) {
    setSyncStatus('Enter a valid domain, e.g. instagram.com');
    return;
  }
  const current = state.domains || [];
  if (current.includes(domain)) {
    setSyncStatus(`${domain} is already on the list.`);
    return;
  }
  const updated = [...current, domain];
  chrome.runtime.sendMessage({ type: 'UPDATE_DOMAINS', domains: updated }, async () => {
    await refresh();
    setSyncStatus(`Added ${domain}`);
  });
}

// Remove Domain
async function removeDomain(domain) {
  const current = state.domains || [];
  const updated = current.filter(d => d !== domain);
  chrome.runtime.sendMessage({ type: 'UPDATE_DOMAINS', domains: updated }, async () => {
    await refresh();
    setSyncStatus(`Removed ${domain}`);
  });
}

$('addDomainBtn').addEventListener('click', () => {
  const input = $('newDomainInput');
  addDomain(input.value);
  input.value = '';
});

$('newDomainInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    addDomain(e.target.value);
    e.target.value = '';
  }
});

// Quick preset chips toggle
document.querySelectorAll('.quick-chip').forEach(chip => {
  chip.addEventListener('click', async () => {
    const domain = chip.dataset.domain;
    const current = state.domains || [];
    if (current.includes(domain)) {
      await removeDomain(domain);
    } else {
      await addDomain(domain);
    }
  });
});

// Reset Stats
$('resetStatsBtn').addEventListener('click', () => {
  if (confirm('Reset blocked attempt count?')) {
    chrome.runtime.sendMessage({ type: 'RESET_STATS' }, async () => {
      await refresh();
      setSyncStatus('Attempt counter reset.');
    });
  }
});

// Export Config
$('exportConfigBtn').addEventListener('click', () => {
  const config = {
    product: 'DigiCalm Shield',
    version: 2,
    blockedDomains: state.domains || [],
    defaultDurationMinutes: selectedMinutes || 45,
    blockedCount: state.blockedCount || 0,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'digicalm-shield-config.json';
  a.click();
  URL.revokeObjectURL(url);
  setSyncStatus('Config exported successfully.');
});

// Copy Config
$('copyConfigBtn').addEventListener('click', async () => {
  const config = {
    product: 'DigiCalm Shield',
    version: 2,
    blockedDomains: state.domains || [],
    defaultDurationMinutes: selectedMinutes || 45,
    blockedCount: state.blockedCount || 0,
    exportedAt: new Date().toISOString()
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setSyncStatus('Config copied to clipboard!');
  } catch (err) {
    setSyncStatus('Could not copy to clipboard.');
  }
});

// Import Config
$('configFile').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const config = JSON.parse(text);
    if (!config || !Array.isArray(config.blockedDomains)) {
      throw new Error('Invalid config file format.');
    }
    const cleanDomains = [...new Set(config.blockedDomains.map(cleanDomain).filter(d => d.includes('.')))];
    const duration = Number(config.defaultDurationMinutes) || selectedMinutes;

    chrome.runtime.sendMessage({ type: 'UPDATE_DOMAINS', domains: cleanDomains }, async () => {
      if (config.defaultDurationMinutes) {
        selectedMinutes = duration;
        $('customMinutes').value = duration;
        document.querySelectorAll('.preset-btn').forEach(b => {
          b.classList.toggle('active', Number(b.dataset.minutes) === duration);
        });
      }
      await refresh();
      setSyncStatus(`Imported ${cleanDomains.length} sites successfully!`);
    });
  } catch (err) {
    setSyncStatus(err.message || 'Error reading config file.');
  }
  event.target.value = '';
});

function setSyncStatus(msg) {
  const el = $('syncStatus');
  el.textContent = msg;
  setTimeout(() => {
    if (el.textContent === msg) {
      el.textContent = 'Syncs with FocusFlow website';
    }
  }, 3500);
}

// Initial setup
refresh().then(() => {
  checkWebsiteSync();
});
