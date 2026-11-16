let state = {};
let countdownInterval = null;

// Send blocked visit notification immediately
chrome.runtime.sendMessage({ type: 'BLOCKED_VISIT' }, response => {
  if (response && response.ok) {
    if (response.blockedCount) {
      document.getElementById('blockedCountDisplay').textContent = response.blockedCount;
      document.getElementById('savedMinutesDisplay').textContent = `~${response.blockedCount * 15}m`;
    }
  }
});

// Load state and populate UI
async function init() {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, response => {
    if (response && response.ok && response.state) {
      state = response.state;
      renderState();
    }
  });
}

function renderState() {
  const count = state.blockedCount || 1;
  document.getElementById('blockedCountDisplay').textContent = count;
  document.getElementById('savedMinutesDisplay').textContent = `~${count * 15}m`;

  if (state.activeTaskTitle) {
    document.getElementById('taskTitle').textContent = state.activeTaskTitle;
  }

  startCountdown();
}

function fmtTime(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);

  function tick() {
    const endsAt = state.endsAt || 0;
    const now = Date.now();
    const remaining = Math.max(0, endsAt - now);

    const headerTimer = document.getElementById('headerTimer');
    const countdownDisplay = document.getElementById('countdownDisplay');
    const progressFill = document.getElementById('progressFill');

    if (remaining <= 0) {
      headerTimer.textContent = 'Session Complete';
      countdownDisplay.textContent = '00:00 · Session Finished!';
      progressFill.style.width = '100%';
      document.getElementById('timerChip').style.background = '#eaf2e8';
      document.getElementById('sessionPhase').textContent = 'Unlocked';
      return;
    }

    const durationMs = (state.durationMinutes || 45) * 60 * 1000;
    const elapsed = durationMs - remaining;
    const progressPct = Math.min(100, Math.max(0, Math.round((elapsed / durationMs) * 100)));

    const timeStr = fmtTime(remaining);
    headerTimer.textContent = `${timeStr} remaining`;
    countdownDisplay.textContent = `${timeStr} remaining`;
    progressFill.style.width = `${progressPct}%`;
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

// Return to Task
document.getElementById('backBtn').addEventListener('click', () => {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = 'http://localhost:5173';
  }
});

// 10-Second Breathing Reset
let breathingActive = false;
document.getElementById('startBreatheBtn').addEventListener('click', () => {
  if (breathingActive) return;
  breathingActive = true;

  const wrap = document.getElementById('breathVisualWrap');
  const orb = document.getElementById('breathOrb');
  const countSpan = document.getElementById('breathCount');
  const instr = document.getElementById('breathInstruction');
  const triggerBtn = document.getElementById('startBreatheBtn');

  wrap.classList.add('active');
  triggerBtn.disabled = true;

  let secondsLeft = 10;
  countSpan.textContent = secondsLeft;

  const breatheTimer = setInterval(() => {
    secondsLeft--;
    countSpan.textContent = Math.max(0, secondsLeft);

    if (secondsLeft > 6) {
      orb.className = 'breath-orb inhale';
      instr.textContent = 'Breathe in slowly... notice what you feel.';
    } else if (secondsLeft > 4) {
      orb.className = 'breath-orb';
      instr.textContent = 'Hold gently... create space.';
    } else if (secondsLeft > 0) {
      orb.className = 'breath-orb exhale';
      instr.textContent = 'Breathe out slowly... relax your shoulders.';
    } else {
      clearInterval(breatheTimer);
      orb.className = 'breath-orb';
      instr.textContent = '✨ Urge reset complete. You have control over what happens next.';
      triggerBtn.disabled = false;
      triggerBtn.textContent = 'Done!';
      breathingActive = false;
    }
  }, 1000);
});

// Emergency Unlock Accordion & 5-Second Friction Safety Hatch
const emergencyToggle = document.getElementById('emergencyToggle');
const emergencyPanel = document.getElementById('emergencyPanel');
const emergencyUnlockBtn = document.getElementById('emergencyUnlockBtn');
const unlockBtnLabel = document.getElementById('unlockBtnLabel');
const unlockedMessage = document.getElementById('unlockedMessage');

emergencyToggle.addEventListener('click', () => {
  emergencyPanel.classList.toggle('hidden');
});

let unlockCountdownTimer = null;
emergencyUnlockBtn.addEventListener('click', () => {
  if (emergencyUnlockBtn.dataset.confirming === 'true') {
    // If user clicked again after timer or during
    return;
  }

  emergencyUnlockBtn.dataset.confirming = 'true';
  let delay = 5;
  unlockBtnLabel.textContent = `Unlocking in ${delay}s... (Pause to reflect)`;
  emergencyUnlockBtn.disabled = true;

  unlockCountdownTimer = setInterval(() => {
    delay--;
    if (delay > 0) {
      unlockBtnLabel.textContent = `Unlocking in ${delay}s... (Pause to reflect)`;
    } else {
      clearInterval(unlockCountdownTimer);
      unlockBtnLabel.textContent = 'Unlocking now...';

      chrome.runtime.sendMessage({ type: 'STOP_SHIELD' }, resp => {
        emergencyPanel.classList.add('hidden');
        unlockedMessage.classList.remove('hidden');
        document.getElementById('headerTimer').textContent = 'Shield Disabled';
        document.getElementById('countdownDisplay').textContent = 'Shield Ended Early';
        document.getElementById('sessionPhase').textContent = 'Ended';
        if (countdownInterval) clearInterval(countdownInterval);
      });
    }
  }, 1000);
});

init();
