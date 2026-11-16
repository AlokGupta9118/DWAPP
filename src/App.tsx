import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, ArrowRight, Bell, BookOpen, Brain, CalendarDays, Check, CheckCircle2,
  CircleHelp, Clock3, Coffee, Flame, Heart, Home, Leaf, ListTodo, Menu, Moon,
  Copy, Download, Eye, HelpCircle, MoreHorizontal, Pause, Play, Plus, RotateCcw, Shield, ShieldAlert, ShieldCheck, Sparkles, Upload,
  Sprout, Sun, Target, Timer, Trash2, TrendingUp, Volume2, Waves, X, Zap
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Task = { id: number; title: string; time: string; done: boolean; tag: string; plannedFor?: string; carriedFrom?: string };
type Phase = 'study' | 'break';
type SessionPlan = { title: string; subject: string; description: string; totalMinutes: number; blockMinutes: number; breakMinutes: number; breaks: number };
type ActiveSession = SessionPlan & { id: string; startAt: string; phase: Phase; phaseRemaining: number; phaseTotal: number; elapsedSeconds: number; studySeconds: number; breakSeconds: number; completedBlocks: number; breaksTaken: number; lastTick: number };
type SessionStatus = 'completed' | 'ended-early' | 'interrupted';
type SessionSummary = SessionPlan & { id: string; date: string; startAt: string; endAt: string; plannedStudyMinutes: number; actualStudyMinutes: number; plannedBreakMinutes: number; actualBreakMinutes: number; actualMinutes: number; completedBlocks: number; breaksTaken: number; completed: boolean; status: SessionStatus; reflection: string };
type Goal = { id: string; title: string; type: 'minutes' | 'sessions'; target: number; subject: string; weekKey: string; createdAt: string };
type Page = 'overview' | 'focus' | 'planner' | 'distractions' | 'habits' | 'winddown' | 'insights';
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const initialTasks: Task[] = [
  { id: 1, title: 'Revise operating systems notes', time: '09:00 AM', done: false, tag: 'Study' },
  { id: 2, title: 'Solve 2 graph problems', time: '11:30 AM', done: false, tag: 'DSA' },
  { id: 3, title: 'Review project wireframes', time: '04:00 PM', done: true, tag: 'Project' }
];
const defaultApps = ['Instagram', 'YouTube', 'WhatsApp', 'Reddit'];
const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const playAlertTone = (kind: 'break' | 'bedtime' | 'done' = 'break') => {
  try {
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const notes = kind === 'bedtime' ? [659.25, 523.25, 440] : kind === 'done' ? [523.25, 659.25, 783.99] : [587.33, 783.99, 659.25];
    notes.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + index * 0.22);
      gain.gain.exponentialRampToValueAtTime(0.13, ctx.currentTime + index * 0.22 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + index * 0.22 + 0.20);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.start(ctx.currentTime + index * 0.22); oscillator.stop(ctx.currentTime + index * 0.22 + 0.22);
    });
    window.setTimeout(() => ctx.close(), 1200);
  } catch { /* Audio may need a prior user interaction in this browser. */ }
};

const speakMessage = (text: string) => {
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  } catch {}
};

const syncToExtension = (payload: { type: string; [key: string]: any }) => {
  try {
    window.postMessage({ source: 'focusflow-web', ...payload }, '*');
    window.dispatchEvent(new CustomEvent('focusflow-web-sync', { detail: payload }));
  } catch {}
};

const to12Hour = (time24: string) => {
  if (!time24 || !time24.includes(':')) return '10:30 PM';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
};

const to24Hour = (time12: string) => {
  if (!time12) return '22:30';
  if (!time12.includes('AM') && !time12.includes('PM')) return time12;
  const [clock, meridiem] = time12.split(' ');
  let [h, m] = (clock || '10:30').split(':').map(Number);
  if (meridiem === 'PM' && h !== 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
};

let ambientNode: AudioNode | null = null;
let ambientCtx: AudioContext | null = null;

const playAmbientSound = (soundType: string, volume: number = 0.5) => {
  stopAmbientSound();
  try {
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    ambientCtx = new AudioContextClass();
    const bufferSize = ambientCtx.sampleRate * 2;
    const noiseBuffer = ambientCtx.createBuffer(1, bufferSize, ambientCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const whiteNoise = ambientCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = ambientCtx.createBiquadFilter();
    const gainNode = ambientCtx.createGain();
    gainNode.gain.value = volume * 0.15;

    if (soundType === 'rain') {
      filter.type = 'lowpass';
      filter.frequency.value = 1000;
    } else if (soundType === 'brown') {
      filter.type = 'lowpass';
      filter.frequency.value = 350;
    } else if (soundType === 'waves') {
      filter.type = 'bandpass';
      filter.frequency.value = 400;
      filter.Q.value = 1.0;
    } else {
      filter.type = 'bandpass';
      filter.frequency.value = 800;
    }

    whiteNoise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ambientCtx.destination);
    whiteNoise.start();
    ambientNode = whiteNoise;
  } catch {}
};

const stopAmbientSound = () => {
  try {
    if (ambientNode) {
      (ambientNode as AudioBufferSourceNode).stop();
      ambientNode = null;
    }
    if (ambientCtx) {
      ambientCtx.close();
      ambientCtx = null;
    }
  } catch {}
};
const defaultSubjects = ['DSA', 'DBMS', 'Mathematics', 'Computer Networks', 'Projects', 'Other'];
const toDate = (value: string | undefined) => value ? new Date(value) : new Date();
const weekStart = (date: Date) => { const result = new Date(date); const day = result.getDay(); result.setHours(0, 0, 0, 0); result.setDate(result.getDate() - (day === 0 ? 6 : day - 1)); return result; };
const weekKey = (date: Date) => localDay(weekStart(date));
const normalizeSession = (raw: Partial<SessionSummary> & { date?: string; actualMinutes?: number; completed?: boolean; title?: string; subject?: string; totalMinutes?: number; breakMinutes?: number; breaks?: number; completedBlocks?: number; breaksTaken?: number }): SessionSummary => {
  const start = raw.startAt || `${raw.date || localDay()}T00:00:00.000Z`;
  const actual = Math.max(0, Number(raw.actualStudyMinutes ?? raw.actualMinutes ?? 0));
  const status = raw.status || (raw.completed ? 'completed' : 'ended-early');
  return {
    id: raw.id || `${start}-${raw.title || 'session'}`,
    title: raw.title || 'Focused study session', subject: raw.subject || '', description: '',
    totalMinutes: Number(raw.totalMinutes || 0), blockMinutes: Number(raw.blockMinutes || raw.totalMinutes || 0),
    breakMinutes: Number(raw.breakMinutes || 0), breaks: Number(raw.breaks || 0),
    date: raw.date || start.slice(0, 10), startAt: start, endAt: raw.endAt || start,
    plannedStudyMinutes: Number(raw.plannedStudyMinutes ?? raw.totalMinutes ?? 0), actualStudyMinutes: actual,
    plannedBreakMinutes: Number(raw.plannedBreakMinutes ?? ((raw.breakMinutes || 0) * (raw.breaks || 0))),
    actualBreakMinutes: Number(raw.actualBreakMinutes || 0), actualMinutes: actual,
    completedBlocks: Number(raw.completedBlocks || 0), breaksTaken: Number(raw.breaksTaken || 0),
    completed: status === 'completed', status, reflection: raw.reflection || ''
  };
};
const buildSummary = (active: ActiveSession, status: SessionStatus, date: string, endTime: number): SessionSummary => {
  const studySeconds = active.studySeconds + (active.phase === 'study' ? Math.max(0, active.phaseTotal - active.phaseRemaining) : 0);
  const breakSeconds = active.breakSeconds + (active.phase === 'break' ? Math.max(0, active.phaseTotal - active.phaseRemaining) : 0);
  return { ...active, date, endAt: new Date(endTime).toISOString(), plannedStudyMinutes: active.totalMinutes, actualStudyMinutes: Math.round(studySeconds / 60), plannedBreakMinutes: active.breakMinutes * active.breaks, actualBreakMinutes: Math.round(breakSeconds / 60), actualMinutes: Math.round(studySeconds / 60), completedBlocks: active.completedBlocks + (status === 'completed' && active.phase === 'study' ? 1 : 0), completed: status === 'completed', status, reflection: '' };
};

function useSaved<T>(key: string, initial: T): [T, (value: T | ((old: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : initial; } catch { return initial; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue];
}

function App() {
  const [savedPage, setSavedPage] = useSaved<string>('ff_active_page', 'overview');
  const page: Page = (savedPage === 'notifications' || !['overview', 'focus', 'planner', 'distractions', 'habits', 'winddown', 'insights'].includes(savedPage))
    ? 'habits'
    : (savedPage as Page);
  const setPage = (p: Page) => setSavedPage(p);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [tasks, setTasks] = useSaved<Task[]>('ff_tasks', initialTasks);
  const [apps, setApps] = useSaved<string[]>('ff_apps', defaultApps);
  const [allowed, setAllowed] = useSaved<string[]>('ff_allowed', ['Calls', 'Family', 'Calendar']);
  const [sessions, setSessions] = useSaved<SessionSummary[]>('ff_sessions', []);
  const [goals, setGoals] = useSaved<Goal[]>('ff_goals', []);
  const [subjects, setSubjects] = useSaved<string[]>('ff_subjects', defaultSubjects);
  const [reflections, setReflections] = useSaved<string[]>('ff_reflections', []);
  const [bedtime, setBedtime] = useSaved('ff_bedtime', '10:30 PM');
  const [bedtimeEnabled, setBedtimeEnabled] = useSaved('ff_bedtime_enabled', true);
  const [soundEnabled, setSoundEnabled] = useSaved('ff_sound_enabled', true);
  const [lastBedtimeAlert, setLastBedtimeAlert] = useSaved('ff_last_bedtime_alert', '');
  const [lastRollover, setLastRollover] = useSaved('ff_last_task_rollover', localDay());
  const [active, setActive] = useSaved<ActiveSession | null>('ff_active_session', null);
  const [lastSummary, setLastSummary] = useSaved<SessionSummary | null>('ff_last_summary', null);
  const [duration, setDuration] = useSaved('ff_duration', 25);
  const [newTask, setNewTask] = useState('');
  const [newApp, setNewApp] = useState('');
  const [mood, setMood] = useState('Okay');
  const [note, setNote] = useState('');
  const [rescue, setRescue] = useState(false);
  const [breathing, setBreathing] = useState(false);
  const [sound, setSound] = useState(false);
  const [toast, setToast] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [setup, setSetup] = useState<SessionPlan>({ title: '', subject: '', description: '', totalMinutes: 60, blockMinutes: 25, breakMinutes: 5, breaks: 1 });
  const [goalDraft, setGoalDraft] = useState({ title: '', type: 'minutes' as Goal['type'], target: 120, subject: '' });
  const [selectedDay, setSelectedDay] = useState(localDay());
  const [newSubject, setNewSubject] = useState('');
  const [scrollReason, setScrollReason] = useState('Automatic scrolling');
  const [scrollEvents, setScrollEvents] = useSaved<{ id: number; reason: string; time: string }[]>('ff_scroll_events', []);
  const [blockedSites, setBlockedSites] = useSaved<string[]>('ff_blocked_sites', ['instagram.com', 'youtube.com', 'reddit.com', 'x.com']);
  const [newBlockedSite, setNewBlockedSite] = useState('');
  type Habit = { id: string; title: string; category: string; icon: string; completedDays: string[] };
  const [habits, setHabits] = useSaved<Habit[]>('ff_habits_v2', [
    { id: '1', title: 'Phone-free first 30 minutes of morning', category: 'Morning Clarity', icon: '🌅', completedDays: [] },
    { id: '2', title: 'Run Focus Shield for at least 1 study block', category: 'Deep Work', icon: '🛡️', completedDays: [] },
    { id: '3', title: 'Distraction-free meals (no screen scrolling)', category: 'Mindful Eating', icon: '🍽️', completedDays: [] },
    { id: '4', title: 'Screen-off 30 mins before scheduled bedtime', category: 'Restorative Sleep', icon: '🌙', completedDays: [] }
  ]);
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [activeSound, setActiveSound] = useState<string | null>(null);
  const [soundVolume, setSoundVolume] = useState<number>(0.5);
  const [selectedTrigger, setSelectedTrigger] = useState<string>('Boredom');
  const [shieldMinutes, setShieldMinutes] = useSaved('ff_shield_minutes', 45);
  const [shieldStats, setShieldStats] = useSaved('ff_shield_stats', { blockedCount: 0, timeSavedMinutes: 0, lastSyncAt: '' });
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const popularPresetSites = [
    { domain: 'instagram.com', label: 'Instagram' },
    { domain: 'youtube.com', label: 'YouTube' },
    { domain: 'reddit.com', label: 'Reddit' },
    { domain: 'x.com', label: 'X / Twitter' },
    { domain: 'tiktok.com', label: 'TikTok' },
    { domain: 'netflix.com', label: 'Netflix' },
    { domain: 'twitch.tv', label: 'Twitch' },
    { domain: 'linkedin.com', label: 'LinkedIn' },
    { domain: 'facebook.com', label: 'Facebook' },
    { domain: 'pinterest.com', label: 'Pinterest' }
  ];

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2400); };
  const requestReminderPermission = async () => {
    if (!("Notification" in window)) { notify('This browser does not support desktop notifications.'); return; }
    const permission = await Notification.requestPermission();
    notify(permission === 'granted' ? 'Study reminders are enabled.' : 'Browser notifications were not enabled.');
  };
  const logScrollPause = () => {
    setScrollEvents(old => [...old, { id: Date.now(), reason: scrollReason, time: new Date().toLocaleString() }]);
    setRescue(true);
    notify('Urge noticed. Take a moment before deciding what to do.');
  };
  const sendReminder = (message: string, kind: 'break' | 'bedtime' | 'done' = 'break') => {
    notify(message);
    if (soundEnabled) playAlertTone(kind);
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification('DigiCalm', { body: message, icon: '/icons/focusflow-192.png' });
  };
  const todayKey = localDay();
  useEffect(() => {
    const rollover = () => {
      const today = localDay();
      if (lastRollover === today) return;
      setTasks(old => old.map(task => {
        const planned = task.plannedFor || lastRollover;
        if (!task.done && planned < today) return { ...task, plannedFor: today, carriedFrom: planned };
        return task;
      }));
      setLastRollover(today);
    };
    rollover();
    const id = window.setInterval(rollover, 60_000);
    return () => window.clearInterval(id);
  }, [lastRollover, setTasks, setLastRollover]);

  const triggerBedtimeRolloverAndAlert = (isTest = false) => {
    const today = localDay();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = localDay(tomorrow);

    // 1. Move leftover uncompleted tasks to tomorrow
    let count = 0;
    setTasks(old => old.map(task => {
      const planned = task.plannedFor || today;
      if (!task.done && planned <= today) {
        count++;
        return { ...task, plannedFor: tomorrowKey, carriedFrom: planned };
      }
      return task;
    }));

    // 2. Play sound tone & voice
    if (soundEnabled) {
      playAlertTone('bedtime');
      speakMessage("It's time to sleep. Wrap up your work and get some rest.");
    }

    // 3. Desktop / Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification("DigiCalm · Time to Sleep", {
          body: count > 0 
            ? `It's time to sleep! ${count} leftover tasks have been moved to tomorrow.`
            : "It's time to sleep. Wrap up your work and get some rest.",
          icon: '/icons/focusflow-192.png',
          tag: 'focusflow-bedtime-alert',
          requireInteraction: true
        });
      } catch {}
    }

    // 4. In-app toast
    notify(count > 0 
      ? `Bedtime reached! ${count} leftover tasks moved to tomorrow. Time to sleep.`
      : `Bedtime reached! It is time to wind down and sleep.`
    );

    // 5. Deactivate Focus Shield for the night
    syncToExtension({ type: 'STOP_SHIELD' });
  };

  useEffect(() => {
    if (!bedtimeEnabled) return;
    const checkBedtime = () => {
      const now = new Date();
      let hours = 0;
      let minutes = 0;
      if (bedtime.includes('AM') || bedtime.includes('PM')) {
        const [clock, meridiem] = bedtime.split(' ');
        let [h, m] = (clock || '10:30').split(':').map(Number);
        if (meridiem === 'PM' && h !== 12) h += 12;
        if (meridiem === 'AM' && h === 12) h = 0;
        hours = h;
        minutes = m;
      } else {
        const [h, m] = bedtime.split(':').map(Number);
        hours = h || 0;
        minutes = m || 0;
      }
      const key = `${localDay(now)}-${hours}:${minutes}`;
      if (now.getHours() === hours && now.getMinutes() === minutes && lastBedtimeAlert !== key) {
        setLastBedtimeAlert(key);
        triggerBedtimeRolloverAndAlert(false);
      }
    };
    checkBedtime();
    const id = window.setInterval(checkBedtime, 10_000);
    return () => window.clearInterval(id);
  }, [bedtime, bedtimeEnabled, lastBedtimeAlert, soundEnabled, tasks]);

  // Synchronize Focus Shield with active session in website
  useEffect(() => {
    if (active) {
      if (active.phase === 'break') {
        syncToExtension({ type: 'BREAK_PHASE' });
      } else if (active.lastTick === 0) {
        syncToExtension({ type: 'PAUSE_SHIELD' });
      } else {
        syncToExtension({
          type: 'START_SHIELD',
          minutes: Math.ceil(active.phaseRemaining / 60),
          endsAt: Date.now() + active.phaseRemaining * 1000,
          taskTitle: active.title || 'Focus Study Session'
        });
      }
    } else {
      syncToExtension({ type: 'CHECK_SYNC', hasActiveSession: false });
    }
  }, [active?.id, active?.phase, active?.lastTick]);
  useEffect(() => {
    // Clean up 0-minute aborted sessions and normalize sessions
    setSessions(old => {
      const valid = old.filter(s => {
        const mins = Number(s.actualStudyMinutes ?? s.actualMinutes ?? 0);
        return mins > 0 || s.completed;
      }).map(item => normalizeSession(item));
      return valid;
    });
  }, [setSessions]);
  const normalizedSessions = useMemo(() => sessions.map(item => normalizeSession(item)), [sessions]);
  const validSessions = useMemo(() => normalizedSessions.filter(item => item.actualStudyMinutes > 0 || item.completed), [normalizedSessions]);
  const totalMinutes = validSessions.reduce((sum, session) => sum + session.actualStudyMinutes, 0);
  const today = validSessions.filter(session => session.date === todayKey).reduce((sum, session) => sum + session.actualStudyMinutes, 0);
  const completed = tasks.filter(task => task.done).length;
  const progress = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  const currentWeek = weekKey(new Date());
  const previousWeek = weekKey(new Date(weekStart(new Date()).getTime() - 86400000 * 7));
  const weekSessions = useMemo(() => validSessions.filter(session => {
    const sessionDate = session.date || (session.startAt ? session.startAt.slice(0, 10) : '');
    const d = session.startAt ? toDate(session.startAt) : new Date(sessionDate + 'T12:00:00');
    return weekKey(d) === currentWeek;
  }), [validSessions, currentWeek]);
  const previousWeekSessions = useMemo(() => validSessions.filter(session => {
    const sessionDate = session.date || (session.startAt ? session.startAt.slice(0, 10) : '');
    const d = session.startAt ? toDate(session.startAt) : new Date(sessionDate + 'T12:00:00');
    return weekKey(d) === previousWeek;
  }), [validSessions, previousWeek]);
  const weekMinutes = weekSessions.reduce((sum, session) => sum + session.actualStudyMinutes, 0);
  const completedWeekSessions = weekSessions.filter(session => session.status === 'completed');
  const chartData = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart(new Date()));
    date.setDate(date.getDate() + index);
    const key = localDay(date);
    const daySessions = validSessions.filter(session => session.date === key);
    const minutes = daySessions.reduce((sum, session) => sum + session.actualStudyMinutes, 0);
    return {
      day: date.toLocaleDateString('en-US', { weekday: 'short' }),
      date: key,
      dayNumber: date.getDate(),
      monthName: date.toLocaleDateString('en-US', { month: 'short' }),
      minutes,
      sessionCount: daySessions.length,
      isToday: key === todayKey,
      isFuture: key > todayKey
    };
  }), [validSessions, todayKey]);
  const subjectData = useMemo(() => subjects.map(subject => ({ subject, minutes: weekSessions.filter(session => (session.subject || 'Uncategorized') === subject).reduce((sum, session) => sum + session.actualStudyMinutes, 0), sessions: weekSessions.filter(session => (session.subject || 'Uncategorized') === subject).length })).concat([{ subject: 'Uncategorized', minutes: weekSessions.filter(session => !session.subject).reduce((sum, session) => sum + session.actualStudyMinutes, 0), sessions: weekSessions.filter(session => !session.subject).length }]).filter(item => item.minutes || item.sessions), [subjects, weekSessions]);
  const goalProgress = (goal: Goal) => goal.type === 'minutes' ? weekSessions.filter(session => !goal.subject || session.subject === goal.subject).reduce((sum, session) => sum + session.actualStudyMinutes, 0) : weekSessions.filter(session => session.status === 'completed' && (!goal.subject || session.subject === goal.subject)).length;
  const nav = [
    { id: 'overview' as Page, label: 'Overview', icon: Home }, { id: 'focus' as Page, label: 'Focus room', icon: Target },
    { id: 'planner' as Page, label: 'Study planner', icon: CalendarDays }, { id: 'distractions' as Page, label: 'Focus Shield', icon: Shield },
    { id: 'habits' as Page, label: 'Habit Lab', icon: Brain }, { id: 'winddown' as Page, label: 'Wind-down', icon: Moon },
    { id: 'insights' as Page, label: 'My insights', icon: TrendingUp }
  ];
  const title = nav.find(item => item.id === page)?.label || 'Overview';

  useEffect(() => {
    setActive(current => current ? { ...current, id: current.id || `${Date.now()}`, startAt: current.startAt || new Date().toISOString(), studySeconds: current.studySeconds || 0, breakSeconds: current.breakSeconds || 0, description: current.description || '' } : current);
  }, [setActive]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) {
      setShowInstallHelp(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === 'accepted') setInstalled(true);
  };

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      setActive(current => {
        if (!current) return current;
        if (current.lastTick === 0) return current;
        const now = Date.now();
        const elapsed = Math.max(0, Math.floor((now - current.lastTick) / 1000));
        if (!elapsed) return current;
        const remaining = current.phaseRemaining - elapsed;
        if (remaining > 0) return { ...current, phaseRemaining: remaining, elapsedSeconds: current.elapsedSeconds + elapsed, studySeconds: current.studySeconds + (current.phase === 'study' ? elapsed : 0), breakSeconds: current.breakSeconds + (current.phase === 'break' ? elapsed : 0), lastTick: now };
        if (current.phase === 'study' && current.breaksTaken < current.breaks) {
          sendReminder('Study block complete. Your planned break starts now. Step away and recharge.', 'break');
          if (soundEnabled) {
            playAlertTone('break');
            speakMessage('Study block complete. Your planned break starts now.');
          }
          syncToExtension({ type: 'BREAK_PHASE' });
          return { ...current, phase: 'break', phaseRemaining: current.breakMinutes * 60, phaseTotal: current.breakMinutes * 60, breaksTaken: current.breaksTaken + 1, completedBlocks: current.completedBlocks + 1, elapsedSeconds: current.elapsedSeconds + Math.max(0, current.phaseRemaining), studySeconds: current.studySeconds + Math.max(0, current.phaseRemaining), lastTick: now };
        }
        if (current.phase === 'break') {
          notify('Break is over! Welcome back to your next study block.');
          if (soundEnabled) {
            playAlertTone('break');
            speakMessage('Break is over, get back to your work.');
          }
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('DigiCalm · Break Over', {
                body: 'Break is over, get back to your work.',
                icon: '/icons/focusflow-192.png',
                tag: 'focusflow-break-end',
                requireInteraction: true
              });
            } catch {}
          }
          const plannedStudySeconds = current.totalMinutes * 60 - current.breaks * current.breakMinutes * 60;
          const remainingStudySeconds = plannedStudySeconds - current.completedBlocks * current.blockMinutes * 60;
          const nextStudySeconds = Math.min(current.blockMinutes * 60, Math.max(1, remainingStudySeconds));
          
          syncToExtension({
            type: 'START_SHIELD',
            minutes: Math.ceil(nextStudySeconds / 60),
            endsAt: now + nextStudySeconds * 1000,
            taskTitle: current.title
          });

          return { ...current, phase: 'study', phaseRemaining: nextStudySeconds, phaseTotal: nextStudySeconds, elapsedSeconds: current.elapsedSeconds + Math.max(0, current.phaseRemaining), breakSeconds: current.breakSeconds + Math.max(0, current.phaseRemaining), lastTick: now };
        }
        const summary = buildSummary(current, 'completed', todayKey, now);
        setSessions(old => [...old, summary]); setLastSummary(summary); setShowSummary(true); sendReminder('Your study session is complete. Great work.', 'done');
        return null;
      });
    }, 500);
    return () => clearInterval(timer);
  }, [active, setActive, setSessions, setLastSummary, todayKey, soundEnabled]);

  const startPlan = (plan: SessionPlan) => {
    const validPlan = { ...plan, title: plan.title.trim() || 'Focused study session', totalMinutes: Math.max(1, plan.totalMinutes), blockMinutes: Math.max(1, plan.blockMinutes), breakMinutes: Math.max(1, plan.breakMinutes), breaks: Math.max(0, plan.breaks) };
    const now = new Date();
    const session: ActiveSession = { ...validPlan, id: `${now.toISOString()}-${Math.random().toString(36).slice(2, 8)}`, startAt: now.toISOString(), phase: 'study', phaseRemaining: validPlan.blockMinutes * 60, phaseTotal: validPlan.blockMinutes * 60, elapsedSeconds: 0, studySeconds: 0, breakSeconds: 0, completedBlocks: 0, breaksTaken: 0, lastTick: now.getTime() };
    setLastSummary(null); setActive(session); setPage('focus');
    notify('Your study plan is ready. Focus Shield activated.');
    syncToExtension({
      type: 'START_SHIELD',
      minutes: validPlan.blockMinutes,
      endsAt: Date.now() + validPlan.blockMinutes * 60 * 1000,
      taskTitle: validPlan.title
    });
  };
  const startQuickSession = () => startPlan({ title: 'Focused study session', subject: '', description: tasks.find(task => !task.done)?.title || '', totalMinutes: duration, blockMinutes: duration, breakMinutes: 5, breaks: 0 });
  const pauseSession = () => {
    setActive(current => current ? { ...current, lastTick: 0 } : current);
    syncToExtension({ type: 'PAUSE_SHIELD' });
  };
  const resumeSession = () => {
    setActive(current => current ? { ...current, lastTick: Date.now() } : current);
    if (active) {
      if (active.phase === 'break') {
        syncToExtension({ type: 'BREAK_PHASE' });
      } else {
        syncToExtension({
          type: 'RESUME_SHIELD',
          endsAt: Date.now() + active.phaseRemaining * 1000,
          taskTitle: active.title
        });
      }
    }
  };
  const endSession = () => {
    if (!active) return;
    const currentStudySeconds = active.studySeconds + (active.phase === 'study' ? Math.max(0, active.phaseTotal - active.phaseRemaining) : 0);
    if (currentStudySeconds < 40) {
      setActive(null);
      syncToExtension({ type: 'STOP_SHIELD' });
      notify('Session cancelled (under 1 minute). No study time recorded.');
      return;
    }
    const summary = buildSummary(active, 'ended-early', todayKey, Date.now());
    setSessions(old => [...old, summary]);
    setLastSummary(summary);
    setActive(null);
    setShowSummary(true);
    syncToExtension({ type: 'STOP_SHIELD' });
  };
  const deleteSession = (id: string) => {
    setSessions(old => old.filter(s => s.id !== id));
    notify('Study session removed.');
  };
  const finishTask = (id: number) => setTasks(old => old.map(task => task.id === id ? { ...task, done: !task.done } : task));
  const addTask = () => { if (!newTask.trim()) return; setTasks(old => [...old, { id: Date.now(), title: newTask.trim(), time: 'Anytime', done: false, tag: 'Personal', plannedFor: todayKey }]); setNewTask(''); };
  const addApp = () => { if (!newApp.trim()) return; setApps(old => [...old, newApp.trim()]); setNewApp(''); };
  const addBlockedSite = () => {
    const raw = newBlockedSite.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
    if (!raw || !raw.includes('.') || blockedSites.includes(raw)) { notify('Enter a valid domain, e.g. instagram.com'); return; }
    setBlockedSites(old => [...old, raw]); setNewBlockedSite('');
    notify('Added ' + raw + ' to Focus Shield.');
  };
  const toggleBlockedSite = (domain: string) => {
    if (blockedSites.includes(domain)) {
      setBlockedSites(old => old.filter(d => d !== domain));
      notify('Removed ' + domain + ' from Focus Shield.');
    } else {
      setBlockedSites(old => [...old, domain]);
      notify('Added ' + domain + ' to Focus Shield.');
    }
  };
  const copyShieldConfig = () => {
    const config = {
      product: 'DigiCalm Shield',
      version: 2,
      blockedDomains: blockedSites,
      defaultDurationMinutes: shieldMinutes,
      activeTask: active?.title || tasks.find(t => !t.done)?.title || 'Deep Study Session',
      blockedCount: shieldStats.blockedCount,
      exportedAt: new Date().toISOString()
    };
    navigator.clipboard.writeText(JSON.stringify(config, null, 2)).then(() => {
      notify('Shield configuration copied to clipboard!');
    }).catch(() => {
      notify('Could not copy to clipboard.');
    });
  };
  const handleImportStats = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data && (typeof data.blockedCount === 'number' || Array.isArray(data.blockedDomains))) {
          const count = typeof data.blockedCount === 'number' ? data.blockedCount : (shieldStats.blockedCount || 1);
          if (Array.isArray(data.blockedDomains) && data.blockedDomains.length > 0) {
            setBlockedSites([...new Set([...blockedSites, ...data.blockedDomains])]);
          }
          setShieldStats({
            blockedCount: count,
            timeSavedMinutes: count * 15,
            lastSyncAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
          notify('Shield synced! ' + count + ' urges deflected so far.');
        } else {
          notify('Invalid Focus Shield file format.');
        }
      } catch {
        notify('Could not read JSON file.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };
  const exportShieldConfig = () => {
    const config = {
      product: 'DigiCalm Shield',
      version: 2,
      blockedDomains: blockedSites,
      defaultDurationMinutes: shieldMinutes,
      activeTask: active?.title || tasks.find(t => !t.done)?.title || 'Deep Study Session',
      blockedCount: shieldStats.blockedCount,
      exportedAt: new Date().toISOString()
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'digicalm-shield-config.json'; link.click(); URL.revokeObjectURL(url);
    notify('Shield configuration downloaded. Import it in the DigiCalm browser extension.');
  };
  const fmt = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const updateSummary = (reflection: string) => { if (!lastSummary) return; const saved = { ...lastSummary, reflection }; setLastSummary(saved); setSessions(old => old.map(item => item.id === lastSummary.id ? saved : item)); setShowSummary(false); notify('Reflection saved.'); };
  const addGoal = () => {
    if (!goalDraft.title.trim() || goalDraft.target <= 0) return;
    const duplicate = goals.some(goal => goal.weekKey === currentWeek && goal.type === goalDraft.type && goal.subject === goalDraft.subject);
    if (duplicate) { notify('A goal of this type already exists for this week.'); return; }
    setGoals(old => [...old, { ...goalDraft, id: `${Date.now()}`, title: goalDraft.title.trim(), weekKey: currentWeek, createdAt: new Date().toISOString() }]);
    setGoalDraft({ title: '', type: 'minutes', target: 120, subject: '' }); notify('Weekly goal added.');
  };
  const addSubject = () => { const subject = newSubject.trim(); if (!subject || subjects.includes(subject)) return; setSubjects(old => [...old, subject]); setNewSubject(''); };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'mobile-show' : ''}`}><div className="brand"><div className="brand-mark"><Sprout size={23} /></div><div><b>digicalm</b><span>make space to focus</span></div><button className="icon-btn mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <div className="workspace-label">WORKSPACE</div><nav>{nav.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => { setPage(item.id); setMobileOpen(false); }}><item.icon size={18} /><span>{item.label}</span>{item.id === 'focus' && active && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-quote"><div className="quote-icon"><Leaf size={17} /></div><p>Small steps create space for big things.</p><span>YOUR DAILY REMINDER</span></div><div className="profile"><div className="avatar">A</div><div><b>My space</b><span>Personal workspace</span></div><MoreHorizontal size={19} className="muted" /></div></div>
    </aside>
    <main className="main"><header className="topbar"><button className="icon-btn menu-btn" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="crumb">Workspace <span>/</span> <b>{title}</b></div><div className="top-actions"><div className="date-chip"><Sun size={15} /> {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>{!installed && <button className="install-btn" onClick={installApp} aria-label="Install DigiCalm" title="Install DigiCalm"><Download size={16} /><span>Install app</span></button>}<button className="icon-btn" title="Help" onClick={() => notify('DigiCalm is your calm space to build better digital habits.')}><CircleHelp size={18} /></button><div className="avatar small">A</div></div></header>
      <div className="content"><AnimatePresence mode="wait"><motion.div key={page} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .2 }}>
        {page === 'overview' && <><div className="welcome-row"><div><div className="eyebrow"><Sparkles size={14} /> YOUR PERSONAL WELLNESS SPACE</div><h1>A little more focus.<br /><em>A little less noise.</em></h1><p className="subhead">Build a calmer relationship with your screen, one session at a time.</p></div><div className="welcome-art"><div className="sun-disc" /><div className="plant plant-one">✳</div><div className="plant plant-two">✦</div><div className="art-note">breathe in.<br />begin again.</div></div></div>
          <div className="stat-grid"><Stat icon={Clock3} label="FOCUS TODAY" value={`${today} min`} hint="Time well spent" /><Stat icon={Flame} label="TOTAL FOCUS" value={`${totalMinutes} min`} hint="Your effort adds up" /><Stat icon={CheckCircle2} label="TASKS DONE" value={`${completed}/${tasks.length}`} hint={`${progress}% of today's list`} /><Stat icon={Sprout} label="STUDY SESSIONS" value={`${sessions.length}`} hint="Every start counts" /></div>
          {goals.filter(goal => goal.weekKey === currentWeek).length > 0 && <section className="panel compact-goals"><div className="panel-head"><div><span className="eyebrow">THIS WEEK'S GOALS</span><h2>Small progress, visible</h2></div><button className="text-btn" onClick={() => setPage('insights')}>View details <ArrowRight size={14} /></button></div>{goals.filter(goal => goal.weekKey === currentWeek).slice(0, 2).map(goal => <div className="compact-goal" key={goal.id}><div><b>{goal.title}</b><span>{goalProgress(goal)} / {goal.target} {goal.type === 'minutes' ? 'min' : 'sessions'}</span></div><div className="progress-bar"><i style={{ width: `${Math.min(100, goalProgress(goal) / goal.target * 100)}%` }} /></div></div>)}</section>}
          <div className="dashboard-grid"><section className="panel focus-card"><div className="panel-head"><div><span className="eyebrow">READY WHEN YOU ARE</span><h2>Make room for deep work</h2></div><span className="pill green"><span /> FOCUS MODE</span></div><div className="focus-card-body"><div className="mini-timer"><div className="timer-ring"><div><b>{duration}</b><span>MINUTES</span></div></div></div><div className="focus-copy"><p>Plan your study blocks and intentional breaks in under a minute.</p><div className="duration-row">{[15, 25, 45].map(value => <button key={value} className={duration === value ? 'duration active' : 'duration'} onClick={() => setDuration(value)}>{value} min</button>)}</div><button className="primary-btn" onClick={startQuickSession}><Play size={16} fill="currentColor" /> Start a focus session <ArrowRight size={16} /></button></div></div></section>
            <section className="panel task-panel"><div className="panel-head"><div><span className="eyebrow">YOUR NEXT STEPS</span><h2>Today's planner</h2></div><button className="text-btn" onClick={() => setPage('planner')}>View all <ArrowRight size={14} /></button></div><div className="task-list">{tasks.slice(0, 4).map(task => <TaskRow key={task.id} task={task} onToggle={() => finishTask(task.id)} />)}</div><button className="add-inline" onClick={() => setPage('planner')}><Plus size={15} /> Add a task</button></section></div>
          <div className="dashboard-grid lower-grid"><section className="panel"><div className="panel-head"><div><span className="eyebrow">A GENTLE CHECK-IN</span><h2>How's your digital day?</h2></div><Heart size={19} className="soft-icon" /></div><p className="body-copy">No grades, no guilt. Just notice how you feel.</p><div className="mood-row">{['Drained', 'Distracted', 'Okay', 'Good', 'Energised'].map(value => <button key={value} onClick={() => setMood(value)} className={`mood ${mood === value ? 'selected' : ''}`}>{value === 'Drained' ? '😮‍💨' : value === 'Distracted' ? '🫠' : value === 'Okay' ? '🙂' : value === 'Good' ? '😊' : '⚡'}<span>{value}</span></button>)}</div><textarea className="reflection-input" value={note} onChange={event => setNote(event.target.value)} placeholder="What's one thing you noticed today? (optional)" /><button className="secondary-btn" onClick={() => { setReflections(old => [...old, `${new Date().toLocaleDateString()}: ${mood} — ${note || 'Quick mood check-in'}`]); setNote(''); notify('Check-in saved. Thanks for noticing.'); }}>Save check-in <Check size={15} /></button></section><section className="panel rescue-card"><div className="rescue-icon"><Zap size={20} /></div><span className="eyebrow">WHEN DISTRACTION STRIKES</span><h2>Feeling the scroll<br />pull?</h2><p>Pause the autopilot. A tiny reset can help you choose what happens next.</p><button className="dark-btn" onClick={() => setRescue(true)}>Try Distraction Rescue <ArrowRight size={15} /></button></section></div></>}
        {page === 'focus' && <FocusPage active={active} sound={sound} setSound={setSound} onStart={active ? resumeSession : startQuickSession} onPause={pauseSession} onEnd={endSession} onReset={() => setActive(null)} onPlanner={() => setPage('planner')} onBreathing={() => setBreathing(true)} fmt={fmt} notify={notify} />}
        {page === 'planner' && <PlannerPage setup={setup} setSetup={setSetup} onStart={startPlan} tasks={tasks} completed={completed} progress={progress} newTask={newTask} setNewTask={setNewTask} addTask={addTask} onToggle={finishTask} onDelete={id => setTasks(old => old.filter(task => task.id !== id))} subjects={subjects} newSubject={newSubject} setNewSubject={setNewSubject} addSubject={addSubject} />}
        {page === 'distractions' && <>
          <PageIntro
            eyebrow="FOCUS SHIELD · REAL NETWORK INTERVENTION"
            title="Put distracting websites behind a real boundary."
            desc="Passive screen-time logs tell students what happened after hours are lost. DigiCalm Shield intercepts navigation at the network level and automatically unblocks when your timer ends."
          />

          <div className="shield-stats-banner">
            <div className="shield-stat-box">
              <span>GUARDED WEBSITES</span>
              <b>{blockedSites.length}</b>
              <small>Active in block list</small>
            </div>
            <div className="shield-stat-box">
              <span>FOCUS BLOCK</span>
              <b>{shieldMinutes}m</b>
              <small>Auto-unblocks when done</small>
            </div>
            <div className="shield-stat-box">
              <span>URGES DEFLECTED</span>
              <b>{shieldStats.blockedCount}</b>
              <small>Attempts intercepted</small>
            </div>
            <div className="shield-stat-box">
              <span>FLOW PRESERVED</span>
              <b>~{shieldStats.blockedCount * 15}m</b>
              <small>Gloria Mark Index</small>
            </div>
          </div>

          <div className="shield-grid">
            {/* Left Column: Shield Configuration & Controls */}
            <div className="panel" style={{ padding: '20px' }}>
              <div className="panel-head">
                <div>
                  <span className="eyebrow">CHROME EXTENSION COMPANION</span>
                  <h2>Focus Shield Control Center</h2>
                </div>
                <ShieldCheck size={22} className="soft-icon" />
              </div>
              <p className="body-copy">
                Select your focus duration and customize the sites that steal your study time. Export to the DigiCalm Shield extension for timed blocking.
              </p>

              {/* Duration selector */}
              <label className="summary-label" style={{ marginTop: '14px' }}>
                Session duration
                <div className="duration-row" style={{ marginTop: '6px' }}>
                  {[25, 45, 60, 90].map(val => (
                    <button
                      key={val}
                      className={`duration ${shieldMinutes === val ? 'active' : ''}`}
                      onClick={() => setShieldMinutes(val)}
                    >
                      {val} min {val === 25 ? '(Pomodoro)' : val === 45 ? '(Standard)' : val === 60 ? '(Deep Work)' : '(Ultra)'}
                    </button>
                  ))}
                </div>
              </label>

              {/* 1-Click Popular Presets */}
              <div style={{ marginTop: '16px' }}>
                <span className="eyebrow" style={{ display: 'block', marginBottom: '8px' }}>
                  1-CLICK POPULAR DISTRACTION PRESETS
                </span>
                <div className="preset-chip-group">
                  {popularPresetSites.map(item => {
                    const isBlocked = blockedSites.includes(item.domain);
                    return (
                      <button
                        key={item.domain}
                        className={`site-toggle-btn ${isBlocked ? 'blocked' : ''}`}
                        onClick={() => toggleBlockedSite(item.domain)}
                        title={`Click to ${isBlocked ? 'remove' : 'add'} ${item.label}`}
                      >
                        <span className="toggle-dot" />
                        <span>{item.label}</span>
                        {isBlocked ? <Check size={12} /> : <Plus size={12} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Add Custom Domain */}
              <div className="add-task-row" style={{ marginTop: '14px' }}>
                <input
                  value={newBlockedSite}
                  onChange={event => setNewBlockedSite(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && addBlockedSite()}
                  placeholder="Add custom domain (e.g. twitch.tv, pinterest.com)"
                />
                <button className="primary-btn" onClick={addBlockedSite}>
                  <Plus size={15} /> Add
                </button>
              </div>

              {/* Active Blocked Domains List */}
              <div style={{ marginTop: '14px' }}>
                <span className="eyebrow">ACTIVE GUARDED SITES ({blockedSites.length})</span>
                <div className="app-chip-list">
                  {blockedSites.map((site, index) => (
                    <div className="app-chip" key={`${site}-${index}`}>
                      <span className="app-dot">🛡️</span>
                      {site}
                      <button
                        aria-label={`Remove ${site}`}
                        onClick={() => setBlockedSites(old => old.filter((_, i) => i !== index))}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons Bar */}
              <div className="shield-actions-bar">
                <button className="primary-btn" onClick={exportShieldConfig} title="Download JSON configuration">
                  <Download size={14} /> Export Config (.json)
                </button>
                <button className="secondary-btn" onClick={copyShieldConfig} title="Copy JSON to clipboard">
                  <Copy size={14} /> Copy Config
                </button>
                <label className="secondary-btn" style={{ cursor: 'pointer', margin: 0 }} title="Import deflection stats from extension">
                  <Upload size={14} /> Import Extension Stats
                  <input type="file" accept="application/json" onChange={handleImportStats} style={{ display: 'none' }} />
                </label>
                <button className="secondary-btn" onClick={() => setShowGuideModal(true)} title="View setup instructions">
                  <HelpCircle size={14} /> Setup Guide
                </button>
                <button className="secondary-btn" onClick={() => setShowPreviewModal(true)} title="Preview blocked screen">
                  <Eye size={14} /> Preview Blocked Page
                </button>
              </div>

              <div className="tip-strip" style={{ marginTop: '16px' }}>
                <Shield size={16} />
                <span>
                  Load <b>DWAPP-main/extension</b> in <b>chrome://extensions</b> with Developer mode. Data stays 100% local on your machine.
                </span>
              </div>
            </div>

            {/* Right Column: Academic Justification & Rescue */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Research Justification Card */}
              <section className="panel academic-matrix">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">RESEARCH METHODOLOGY & ASSIGNMENT DEFENSE</span>
                    <h2 style={{ fontSize: '15px' }}>Why Focus Shield is a Stronger Solution</h2>
                  </div>
                  <Sparkles size={18} className="soft-icon" />
                </div>
                <p className="body-copy" style={{ fontSize: '11px', marginTop: '4px' }}>
                  Survey research proves passive screen-time alerts fail because they only trigger <em>after</em> attention has already been lost.
                </p>

                <div className="matrix-row">
                  <div className="matrix-col old">
                    <b>Traditional Screen Trackers</b>
                    <p>• Post-hoc guilt reports ("You wasted 2 hours")<br />• Basic notification silencers easily bypassed<br />• Passive graphs without active boundaries</p>
                  </div>
                  <div className="matrix-col new">
                    <b>DigiCalm Shield Intervention</b>
                    <p>• Proactive network boundary before scrolling starts<br />• Timed focus blocks with automatic unblocking<br />• Mindful 10-second cognitive speedbump</p>
                  </div>
                </div>

                <div style={{ marginTop: '12px', padding: '10px', background: '#fff', borderRadius: '8px', border: '1px solid #e7ecdf', fontSize: '11px', color: '#68776b' }}>
                  <b>Attention Recovery Lag:</b> Dr. Gloria Mark (UC Irvine) showed recovering deep focus after a social media interruption takes <b>23 minutes and 15 seconds</b>. Deflecting 4 urges saves ~1.5 hours of fragmented study time.
                </div>
              </section>

              {/* Mobile / Other Distractions List */}
              <section className="panel" style={{ padding: '16px' }}>
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">OFFLINE & MOBILE APP TRIGGERS</span>
                    <h2 style={{ fontSize: '14px' }}>Other apps to notice</h2>
                  </div>
                  <Moon size={16} className="soft-icon" />
                </div>
                <div className="add-task-row" style={{ marginTop: '8px' }}>
                  <input
                    value={newApp}
                    onChange={event => setNewApp(event.target.value)}
                    onKeyDown={event => event.key === 'Enter' && addApp()}
                    placeholder="Add phone app (e.g. WhatsApp, Discord)"
                  />
                  <button className="primary-btn" onClick={addApp}><Plus size={14} /> Add</button>
                </div>
                <div className="app-chip-list">
                  {apps.map((app, index) => (
                    <div className="app-chip" key={`${app}-${index}`}>
                      <span className="app-dot">{app.slice(0, 1).toUpperCase()}</span>
                      {app}
                      <button onClick={() => setApps(old => old.filter((_, i) => i !== index))}><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Distraction Rescue Card */}
              <section className="panel rescue-card" style={{ padding: '18px' }}>
                <div className="rescue-icon"><Zap size={20} /></div>
                <span className="eyebrow">THE 30-SECOND PAUSE</span>
                <h2>Feeling the scroll pull?</h2>
                <p>Pause the autopilot loop. A tiny reset helps you choose what happens next.</p>
                <button className="dark-btn" onClick={() => setRescue(true)}>
                  Try Distraction Rescue <ArrowRight size={15} />
                </button>
              </section>
            </div>
          </div>
        </>}
        {page === 'habits' && <>
          <PageIntro
            eyebrow="HABIT LAB · MINDFUL BEHAVIORAL TOOLS"
            title="Build digital habits that actually last."
            desc="Cognitive tools to tame compulsive phone checking, reflect on urge triggers, listen to ambient focus soundscapes, and keep your daily digital wellness commitments."
          />

          <div className="shield-stats-banner">
            <div className="shield-stat-box">
              <span>HABITS COMPLETED</span>
              <b>{habits.filter(h => h.completedDays.includes(todayKey)).length} / {habits.length}</b>
              <small>Today's wellness check</small>
            </div>
            <div className="shield-stat-box">
              <span>CURRENT STREAK</span>
              <b>🔥 {habits.filter(h => h.completedDays.includes(todayKey)).length > 0 ? 'Active' : 'Ready'}</b>
              <small>Daily commitment</small>
            </div>
            <div className="shield-stat-box">
              <span>URGES OVERCOME</span>
              <b>{shieldStats.blockedCount}</b>
              <small>Impulses caught in time</small>
            </div>
            <div className="shield-stat-box">
              <span>AMBIENT SOUNDSCAPE</span>
              <b>{activeSound ? activeSound.toUpperCase() : 'OFF'}</b>
              <small>{activeSound ? 'Focus audio active' : 'Choose below'}</small>
            </div>
          </div>

          <div className="habit-grid">
            {/* Left Column: Daily Wellness Commitments & Ambient Audio */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <section className="panel" style={{ padding: '20px' }}>
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">DAILY COMMITMENTS</span>
                    <h2>Your digital wellness habits</h2>
                  </div>
                  <Sparkles size={18} className="soft-icon" />
                </div>
                <p className="body-copy">
                  Micro-commitments designed to protect your cognitive energy and break autopilot habits.
                </p>

                                <div className="habit-card-list">
                  {habits.length === 0 && (
                    <div className="empty-state" style={{ padding: '24px 0' }}>
                      <Sparkles size={24} style={{ opacity: 0.5 }} />
                      <b>No habits added yet</b>
                      <span>Add a custom wellness commitment below to begin.</span>
                    </div>
                  )}
                  {habits.map(habit => {
                    const isDone = habit.completedDays.includes(todayKey);
                    return (
                      <div key={habit.id} className={`habit-row-item ${isDone ? 'done' : ''}`}>
                        <div className="habit-left">
                          <div className="habit-emoji">{habit.icon}</div>
                          <div className="habit-info">
                            <b>{habit.title}</b>
                            <span>{habit.category}</span>
                          </div>
                        </div>
                        <div className="habit-right-actions">
                          <button
                            className={`habit-check-btn ${isDone ? 'checked' : ''}`}
                            onClick={() => {
                              setHabits(old => old.map(h => {
                                if (h.id === habit.id) {
                                  const completed = h.completedDays.includes(todayKey)
                                    ? h.completedDays.filter(d => d !== todayKey)
                                    : [...h.completedDays, todayKey];
                                  return { ...h, completedDays: completed };
                                }
                                return h;
                              }));
                              notify(isDone ? 'Habit uncompleted.' : 'Habit completed for today! Great commitment.');
                            }}
                            aria-label={`Toggle ${habit.title}`}
                            title={isDone ? 'Mark uncompleted' : 'Mark completed today'}
                          >
                            {isDone ? <Check size={16} /> : null}
                          </button>
                          <button
                            className="delete-btn habit-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setHabits(old => old.filter(h => h.id !== habit.id));
                              notify('Habit removed: ' + habit.title);
                            }}
                            aria-label={`Delete ${habit.title}`}
                            title="Delete habit"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="add-task-row" style={{ marginTop: '14px' }}>
                  <input
                    value={newHabitTitle}
                    onChange={e => setNewHabitTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newHabitTitle.trim()) {
                        setHabits(old => [...old, { id: `${Date.now()}`, title: newHabitTitle.trim(), category: 'Custom Habit', icon: '✨', completedDays: [todayKey] }]);
                        setNewHabitTitle('');
                        notify('New commitment added!');
                      }
                    }}
                    placeholder="Add personal commitment (e.g. No phone during lectures)"
                  />
                  <button
                    className="primary-btn"
                    onClick={() => {
                      if (!newHabitTitle.trim()) return;
                      setHabits(old => [...old, { id: `${Date.now()}`, title: newHabitTitle.trim(), category: 'Custom Habit', icon: '✨', completedDays: [todayKey] }]);
                      setNewHabitTitle('');
                      notify('New commitment added!');
                    }}
                  >
                    <Plus size={15} /> Add
                  </button>
                </div>
              </section>

              {/* Ambient Soundscapes Lab */}
              <section className="panel soundscape-box">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">AMBIENT AUDIO LAB</span>
                    <h2>Focus soundscapes</h2>
                  </div>
                  <Volume2 size={18} className="soft-icon" />
                </div>
                <p className="body-copy" style={{ fontSize: '11px' }}>
                  Synthesized directly with browser audio to mask background distractions and induce flow.
                </p>

                <div className="sound-preset-btns">
                  {[
                    { id: 'rain', label: '🌧️ Rain', desc: 'Gentle raindrops' },
                    { id: 'brown', label: '🟤 Brown Noise', desc: 'Deep focus roar' },
                    { id: 'waves', label: '🌊 Ocean', desc: 'Calming tides' },
                    { id: 'breeze', label: '🍃 Breeze', desc: 'Soft air stream' }
                  ].map(s => (
                    <button
                      key={s.id}
                      className={`sound-btn ${activeSound === s.id ? 'playing' : ''}`}
                      onClick={() => {
                        if (activeSound === s.id) {
                          stopAmbientSound();
                          setActiveSound(null);
                          notify('Soundscape stopped.');
                        } else {
                          playAmbientSound(s.id, soundVolume);
                          setActiveSound(s.id);
                          notify(`Playing ${s.label} soundscape.`);
                        }
                      }}
                    >
                      <div>{s.label}</div>
                      <small style={{ fontSize: '9px', color: '#88988d' }}>{activeSound === s.id ? '▶ Playing' : s.desc}</small>
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#6a7d70', fontWeight: 600 }}>Volume</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={soundVolume}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      setSoundVolume(v);
                      if (activeSound) {
                        playAmbientSound(activeSound, v);
                      }
                    }}
                    style={{ flex: 1, accentColor: '#426b4c' }}
                  />
                  {activeSound && (
                    <button
                      className="secondary-btn"
                      style={{ fontSize: '11px', padding: '4px 10px' }}
                      onClick={() => {
                        stopAmbientSound();
                        setActiveSound(null);
                      }}
                    >
                      Stop
                    </button>
                  )}
                </div>
              </section>
            </div>

            {/* Right Column: Urge Reframer & Grounding Tools */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Urge Reframing Center */}
              <section className="panel urge-reframe-card">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow" style={{ color: '#c79644' }}>COGNITIVE SPEEDBUMP</span>
                    <h2 style={{ fontSize: '16px' }}>Notice your urge trigger</h2>
                  </div>
                  <Brain size={18} className="soft-icon" style={{ color: '#c79644' }} />
                </div>
                <p className="body-copy" style={{ fontSize: '11px', margin: '4px 0 8px' }}>
                  Why do you feel the pull to reach for your screen right now?
                </p>

                <div className="urge-chips">
                  {[
                    { key: 'Boredom', label: '🥱 Boredom' },
                    { key: 'Problem', label: '🤯 Tough Problem' },
                    { key: 'Autopilot', label: '⚡ Habit / Reflex' },
                    { key: 'Procrastination', label: '😰 Overwhelm' },
                    { key: 'Fatigue', label: '😴 Mental Fatigue' }
                  ].map(item => (
                    <button
                      key={item.key}
                      className={`urge-chip ${selectedTrigger === item.key ? 'selected' : ''}`}
                      onClick={() => setSelectedTrigger(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="reframe-bubble">
                  {selectedTrigger === 'Boredom' && <>
                    <b>💡 Cognitive Reframe:</b> Boredom is just your brain searching for low-effort dopamine. Breathe through the dip for 30 seconds — natural focus returns once the impulse subsides.
                  </>}
                  {selectedTrigger === 'Problem' && <>
                    <b>💡 Cognitive Reframe:</b> Resistance means your brain is actively forging new neural pathways. Stepping away to a feed aborts the learning curve. Sit with the confusion for 2 more minutes.
                  </>}
                  {selectedTrigger === 'Autopilot' && <>
                    <b>💡 Cognitive Reframe:</b> You caught the reflex before it took control of your afternoon. That conscious awareness is already a neuroplastic win.
                  </>}
                  {selectedTrigger === 'Procrastination' && <>
                    <b>💡 Cognitive Reframe:</b> You don't have to finish the entire project right now. Lower the threshold: just write one paragraph or solve one small sub-problem.
                  </>}
                  {selectedTrigger === 'Fatigue' && <>
                    <b>💡 Cognitive Reframe:</b> You don't need a screen; your nervous system needs real physical rest. Close your eyes, drink a glass of water, or do a gentle stretch.
                  </>}
                </div>

                <button
                  className="primary-btn full"
                  style={{ marginTop: '12px', background: '#c79644' }}
                  onClick={() => {
                    setShieldStats(old => ({
                      ...old,
                      blockedCount: (old.blockedCount || 0) + 1,
                      timeSavedMinutes: (old.blockedCount || 0) * 15 + 15
                    }));
                    notify('Urge noticed and overcome! +15m focus preserved.');
                  }}
                >
                  <Check size={15} /> Acknowledge & Deflect Urge (+1 Urge Deflected)
                </button>
              </section>

              {/* Mindful Grounding Toolbox */}
              <section className="panel" style={{ padding: '18px' }}>
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">MICRO-RESETS</span>
                    <h2 style={{ fontSize: '15px' }}>Mindful body resets</h2>
                  </div>
                  <Waves size={18} className="soft-icon" />
                </div>
                <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                  <div style={{ background: '#fafbfa', border: '1px solid #e9eee6', borderRadius: '8px', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <b style={{ fontSize: '11px', color: '#354b3d', display: 'block' }}>🫁 4-4-4 Box Breathing</b>
                      <small style={{ fontSize: '10px', color: '#88988d' }}>Calm your sympathetic fight-or-flight reflex</small>
                    </div>
                    <button className="secondary-btn" style={{ fontSize: '11px', padding: '5px 10px' }} onClick={() => setBreathing(true)}>
                      Start
                    </button>
                  </div>
                  <div style={{ background: '#fafbfa', border: '1px solid #e9eee6', borderRadius: '8px', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <b style={{ fontSize: '11px', color: '#354b3d', display: 'block' }}>👁️ 20-20-20 Eye Strain Reset</b>
                      <small style={{ fontSize: '10px', color: '#88988d' }}>Look at an object 20 feet away for 20 seconds</small>
                    </div>
                    <button className="secondary-btn" style={{ fontSize: '11px', padding: '5px 10px' }} onClick={() => notify('Rest your gaze 20 feet away. Blink softly.')}>
                      Take break
                    </button>
                  </div>
                  <div style={{ background: '#fafbfa', border: '1px solid #e9eee6', borderRadius: '8px', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <b style={{ fontSize: '11px', color: '#354b3d', display: 'block' }}>🧘 5-4-3-2-1 Sensory Grounding</b>
                      <small style={{ fontSize: '10px', color: '#88988d' }}>Notice 5 things seen, 4 felt, 3 heard, 2 smelled, 1 tasted</small>
                    </div>
                    <button className="secondary-btn" style={{ fontSize: '11px', padding: '5px 10px' }} onClick={() => notify('Notice: 5 seen, 4 felt, 3 heard, 2 smelled, 1 tasted.')}>
                      Guide
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </>}

        {page === 'winddown' && <>
          <PageIntro
            eyebrow="SCHEDULED BEDTIME & AUTOMATIC TASK ROLLOVER"
            title="Give your day a softer, worry-free ending."
            desc="Schedule your bedtime. When bedtime arrives, DigiCalm sounds a voice and chime reminder ('It\'s time to sleep') and automatically rolls over today's unfinished tasks to tomorrow so you can rest with peace of mind."
          />
          <section className="panel bedtime-panel">
            <div className="moon-art"><Moon size={34} /><span>✦</span></div>
            <span className="eyebrow">CUSTOMIZABLE BEDTIME GOAL</span>
            <h2>When is it time to sleep?</h2>

            {/* Fully customizable time picker */}
            <div className="custom-bedtime-row">
              <label className="time-picker-label">
                <span>Set exact bedtime:</span>
                <input
                  type="time"
                  className="custom-time-input"
                  value={to24Hour(bedtime)}
                  onChange={event => {
                    if (event.target.value) {
                      const formatted = to12Hour(event.target.value);
                      setBedtime(formatted);
                      notify(`Bedtime customized to ${formatted}`);
                    }
                  }}
                />
              </label>
              <span className="current-badge">🕒 Scheduled: {bedtime}</span>
            </div>

            {/* Quick 1-click preset chips */}
            <div className="preset-chip-row">
              {['08:30 PM', '09:00 PM', '09:30 PM', '10:00 PM', '10:30 PM', '11:00 PM', '11:30 PM', '12:00 AM', '12:30 AM', '01:00 AM'].map(value => (
                <button
                  key={value}
                  className={`bedtime-chip ${bedtime === value ? 'active' : ''}`}
                  onClick={() => {
                    setBedtime(value);
                    notify(`Bedtime scheduled for ${value}`);
                  }}
                >
                  {value}
                </button>
              ))}
            </div>

            <div style={{ background: '#f5f8f3', border: '1px solid #e1ecdd', borderRadius: '12px', padding: '16px', maxWidth: '560px', margin: '0 auto 16px', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <b style={{ color: '#385340', fontSize: '13px' }}>🌙 Scheduled Bedtime: {bedtime}</b>
                <span className="pill green" style={{ fontSize: '9px' }}>ACTIVE SCHEDULE</span>
              </div>
              <p style={{ fontSize: '11px', color: '#687b6d', lineHeight: '1.5', margin: '0 0 10px' }}>
                At <b>{bedtime}</b>, DigiCalm automatically performs your evening wind-down routine:
              </p>
              <div style={{ display: 'grid', gap: '6px', fontSize: '11px', color: '#4a5e50' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span>💤</span>
                  <span><b>Automatic Task Rollover:</b> {tasks.filter(t => !t.done && (!t.plannedFor || t.plannedFor <= todayKey)).length} unfinished tasks will be safely rescheduled for <b>Tomorrow</b>.</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span>🔊</span>
                  <span><b>Voice & Chime Alert:</b> Plays sleep tone and says: <em>"It\'s time to sleep. Wrap up your work and get some rest."</em></span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span>🛡️</span>
                  <span><b>Focus Shield Reset:</b> Stops any active website blocking so daytime boundaries don\'t linger overnight.</span>
                </div>
              </div>
            </div>

            <div className="bedtime-actions">
              <label className="toggle-line">
                <input type="checkbox" checked={bedtimeEnabled} onChange={event => setBedtimeEnabled(event.target.checked)} />
                Enable daily scheduled bedtime & task rollover
              </label>
              <label className="toggle-line">
                <input type="checkbox" checked={soundEnabled} onChange={event => setSoundEnabled(event.target.checked)} />
                Play sound & voice alerts
              </label>

              <div className="bedtime-buttons">
                <button className="primary-btn" onClick={() => triggerBedtimeRolloverAndAlert(true)}>
                  <Moon size={15} /> Test Bedtime & Rollover Now
                </button>
                <button className="secondary-btn" onClick={() => {
                  playAlertTone('bedtime');
                  speakMessage("It's time to sleep. Wrap up your work and get some rest.");
                  notify("Previewing voice: 'It\'s time to sleep. Wrap up your work and get some rest.'");
                }}>
                  <Volume2 size={15} /> Test Bedtime Voice Alert
                </button>
                <button className="secondary-btn" onClick={requestReminderPermission}>
                  <Bell size={15} /> {('Notification' in window && Notification.permission === 'granted') ? 'Notifications Enabled' : 'Enable Notifications'}
                </button>
              </div>

              {tasks.filter(t => !t.done && (!t.plannedFor || t.plannedFor <= todayKey)).length > 0 && (
                <div style={{ marginTop: '14px', background: '#fff', border: '1px solid #e7ecdf', borderRadius: '10px', padding: '12px', fontSize: '11px', textAlign: 'left', maxWidth: '560px', margin: '14px auto 0' }}>
                  <span className="eyebrow" style={{ color: '#7a8f7c' }}>TASKS READY FOR ROLLOVER ({tasks.filter(t => !t.done && (!t.plannedFor || t.plannedFor <= todayKey)).length})</span>
                  <div style={{ display: 'grid', gap: '4px', marginTop: '6px' }}>
                    {tasks.filter(t => !t.done && (!t.plannedFor || t.plannedFor <= todayKey)).map(t => (
                      <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', color: '#526258' }}>
                        <span>• {t.title}</span>
                        <small style={{ color: '#9aa59d' }}>Moves to tomorrow</small>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </>}

        {page === 'insights' && <><PageIntro eyebrow="PROGRESS WITHOUT PRESSURE" title="Look at what you're building." desc="Your patterns are real information, not a score. Celebrate what is working and adjust what isn't." /><div className="stat-grid"><Stat icon={Clock3} label="TOTAL FOCUS" value={`${totalMinutes} min`} hint="Across saved sessions" /><Stat icon={Target} label="FOCUS SESSIONS" value={`${validSessions.length}`} hint="Active study sessions" /><Stat icon={CheckCircle2} label="TASK COMPLETION" value={`${progress}%`} hint="Today's planner" /><Stat icon={Heart} label="REFLECTIONS" value={`${reflections.length + sessions.filter(session => session.reflection).length}`} hint="Moments of awareness" /></div><section className="panel chart-panel"><div className="panel-head"><div><span className="eyebrow">YOUR WEEK AT A GLANCE</span><h2>Time spent focusing</h2></div><span className="pill">MINUTES / DAY</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 16, right: 12, left: -22, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8ede5" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={({ x, y, payload }) => { const item = chartData.find(d => d.day === payload.value); const isToday = item?.isToday; return (<g transform={`translate(${x},${y})`}><text x={0} y={12} textAnchor="middle" fill={isToday ? '#2a4d33' : '#738377'} fontWeight={isToday ? 700 : 500} fontSize={12}>{payload.value}</text>{isToday && <circle cx={0} cy={22} r={2.5} fill="#3d6749" />}</g>); }} /><YAxis axisLine={false} tickLine={false} unit="m" allowDecimals={false} tick={{ fill: '#738377', fontSize: 11 }} /><Tooltip content={({ active, payload }) => { if (!active || !payload || !payload.length) return null; const d = payload[0].payload; return (<div className="custom-chart-tooltip"><div className="tooltip-head"><b>{d.day}, {d.monthName} {d.dayNumber}</b>{d.isToday && <span className="today-badge">TODAY</span>}{d.isFuture && <span className="future-badge">UPCOMING</span>}</div><div className="tooltip-val"><strong>{d.minutes} min</strong> focused</div><small className="tooltip-sub">{d.isFuture ? 'Plan a session in Study Planner' : d.minutes > 0 ? `${d.sessionCount} session${d.sessionCount === 1 ? '' : 's'} recorded` : 'No study recorded on this day'}</small></div>); }} /><Bar dataKey="minutes" radius={[6, 6, 0, 0]} maxBarSize={44}>{chartData.map((entry) => (<Cell key={entry.date} fill={entry.isToday ? '#3d6749' : entry.minutes > 0 ? '#638e6e' : entry.isFuture ? '#edf2eb' : '#e0e7de'} />))}</Bar></BarChart></ResponsiveContainer></div></section><section className="panel session-history"><div className="panel-head"><div><span className="eyebrow">SESSION HISTORY</span><h2>Recent study sessions</h2></div><Timer className="soft-icon" /></div>{validSessions.length ? validSessions.slice(-8).reverse().map((session, index) => <div className="history-row" key={`${session.date}-${session.id || index}`}><div><b>{session.title}</b><span>{session.date} · {session.status === 'completed' ? 'Completed block' : 'Ended early'}{session.subject ? ` · ${session.subject}` : ''}</span></div><strong>{session.actualStudyMinutes} min</strong><small>{session.completedBlocks} blocks · {session.breaksTaken} breaks</small><button className="delete-btn session-delete" onClick={() => deleteSession(session.id)} title="Delete session"><Trash2 size={14} /></button></div>) : <div className="empty-state"><Timer size={26} /><b>No study sessions yet</b><span>Your completed sessions will appear here.</span></div>}</section></>}
        {page === 'insights' && <InsightsExtras sessions={validSessions} weekSessions={weekSessions} previousWeekSessions={previousWeekSessions} chartData={chartData} subjectData={subjectData} goals={goals} goalProgress={goalProgress} goalDraft={goalDraft} setGoalDraft={setGoalDraft} addGoal={addGoal} onDeleteGoal={id => setGoals(old => old.filter(goal => goal.id !== id))} selectedDay={selectedDay} setSelectedDay={setSelectedDay} onDeleteSession={deleteSession} todayKey={todayKey} />}
      </motion.div></AnimatePresence></div>
    </main>
    <AnimatePresence>{rescue && <Modal title="Distraction Rescue" onClose={() => setRescue(false)}><div className="modal-hero"><div className="rescue-icon large"><Zap size={25} /></div><h2>Pause. Notice. Choose.</h2><p>You don't have to fight the urge. Just create a little space before acting on it.</p></div><div className="rescue-steps"><div><b>01</b><span>Take one slow breath. Relax your shoulders.</span></div><div><b>02</b><span>Ask: What was I planning to do right now?</span></div><div><b>03</b><span>Choose one tiny action to return to your task.</span></div></div><button className="primary-btn full" onClick={() => { setRescue(false); setPage('focus'); notify('Welcome back. Start with just 2 minutes.'); }}>I'm ready to refocus <ArrowRight size={16} /></button></Modal>}</AnimatePresence>
    <AnimatePresence>{breathing && <Modal title="Breathing reset" onClose={() => setBreathing(false)}><Breathing onDone={() => { setBreathing(false); notify('Nice work. Take your next step gently.'); }} /></Modal>}</AnimatePresence>
    <AnimatePresence>{showSummary && lastSummary && <Modal title="Session summary" onClose={() => setShowSummary(false)}><div className="summary-hero"><CheckCircle2 size={28} /><h2>{lastSummary.completed ? 'You made space for your goal.' : 'You made a useful start.'}</h2><p>{lastSummary.title}</p></div><div className="summary-grid"><div><b>{lastSummary.totalMinutes} min</b><span>planned</span></div><div><b>{lastSummary.actualMinutes} min</b><span>actual time</span></div><div><b>{lastSummary.completedBlocks}</b><span>study blocks</span></div><div><b>{lastSummary.breaksTaken}</b><span>breaks taken</span></div></div><label className="summary-label">Optional reflection<textarea className="reflection-input" defaultValue={lastSummary.reflection} placeholder="What helped you focus? What might you try next time?" onBlur={event => updateSummary(event.target.value)} /></label><button className="primary-btn full" onClick={() => setShowSummary(false)}>Done <Check size={15} /></button></Modal>}</AnimatePresence>
    <AnimatePresence>{showGuideModal && <Modal title="How to Install & Run DigiCalm Shield" onClose={() => setShowGuideModal(false)}>
      <div style={{ textAlign: 'left', padding: '6px 0' }}>
        <p style={{ fontSize: '12px', color: '#738377', marginBottom: '16px' }}>
          Follow these 3 quick steps to enable real website blocking in Google Chrome for your study sessions:
        </p>
        <div className="guide-step-card">
          <div className="guide-num">1</div>
          <div className="guide-text">
            <b>Open Extensions in Google Chrome</b>
            <p>Navigate to <code className="guide-code">chrome://extensions</code> in your Chrome address bar and toggle on <b>Developer mode</b> in the top right corner.</p>
          </div>
        </div>
        <div className="guide-step-card">
          <div className="guide-num">2</div>
          <div className="guide-text">
            <b>Load the DigiCalm Extension Folder</b>
            <p>Click the <b>Load unpacked</b> button in the top left and select the extension folder:</p>
            <span className="guide-code">DWAPP-main/extension</span>
          </div>
        </div>
        <div className="guide-step-card">
          <div className="guide-num">3</div>
          <div className="guide-text">
            <b>Import Config & Start Blocking</b>
            <p>Click the <b>DigiCalm Shield</b> puzzle icon in your Chrome toolbar. Click <b>Import Config</b> and choose your exported <code className="guide-code">digicalm-shield-config.json</code> (or use the built-in defaults). Pick a focus duration (e.g. 45 min) and click <b>Start blocking</b>!</p>
          </div>
        </div>
        <div style={{ marginTop: '14px', background: '#f5f8f3', padding: '10px 12px', borderRadius: '8px', fontSize: '11px', color: '#556b5a' }}>
          💡 <b>Assignment Tip:</b> Demonstrate visiting <code className="guide-code">instagram.com</code> or <code className="guide-code">youtube.com</code> in another tab to show evaluators the live boundary redirection, urge counter, and automatic expiry in real time!
        </div>
        <button className="primary-btn full" style={{ marginTop: '16px' }} onClick={() => setShowGuideModal(false)}>
          Got it! <Check size={15} />
        </button>
      </div>
    </Modal>}</AnimatePresence>
    <AnimatePresence>{showPreviewModal && <Modal title="DigiCalm Shield Boundary (Preview)" onClose={() => setShowPreviewModal(false)}>
      <div className="preview-blocked-frame">
        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#eaf2e8', margin: '0 auto 10px', display: 'grid', placeItems: 'center', fontSize: '24px' }}>
          🛡️
        </div>
        <span className="eyebrow" style={{ color: '#426b4c' }}>LIVE BOUNDARY PREVIEW</span>
        <h2 style={{ fontSize: '19px', margin: '6px 0', color: '#263a30' }}>You planned to focus.<br /><em style={{ color: '#5b8766', fontStyle: 'normal' }}>Let's protect that time.</em></h2>
        <p style={{ fontSize: '12px', color: '#7c8b80', maxWidth: '380px', margin: '0 auto 14px' }}>
          This website is on your focus list. DigiCalm has safely paused navigation so you can keep your momentum.
        </p>
        <div style={{ background: '#fff', border: '1px solid #e1e7dc', borderRadius: '10px', padding: '12px', margin: '0 auto 14px', textAlign: 'left', maxWidth: '400px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 700, color: '#426b4c' }}>
            <span>🎯 ACTIVE GOAL</span>
            <span>45 min Study Block</span>
          </div>
          <b style={{ fontSize: '14px', color: '#2a3a31', display: 'block', margin: '4px 0 2px' }}>
            {active?.title || tasks.find(t => !t.done)?.title || 'Deep Study Session'}
          </b>
          <small style={{ color: '#88988d' }}>Resisted 1 urge • ~15m focus preserved</small>
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button className="primary-btn" style={{ fontSize: '12px' }} onClick={() => setShowPreviewModal(false)}>
            ← Back to My Task
          </button>
          <button className="secondary-btn" style={{ fontSize: '12px' }} onClick={() => { notify('Emergency unlock previewed.'); setShowPreviewModal(false); }}>
            Emergency Unlock (5s)
          </button>
        </div>
      </div>
    </Modal>}</AnimatePresence>
    <AnimatePresence>{showInstallHelp && <Modal title="Install DigiCalm" onClose={() => setShowInstallHelp(false)}><div className="install-help"><p>Add DigiCalm to your home screen for a full-screen app experience.</p><ol><li><b>iPhone or iPad:</b> Open this page in Safari, tap <b>Share</b>, then choose <b>Add to Home Screen</b>.</li><li><b>Android:</b> Open your browser menu and tap <b>Install app</b> or <b>Add to Home screen</b>.</li></ol><button className="primary-btn full" onClick={() => setShowInstallHelp(false)}>Got it <Check size={15} /></button></div></Modal>}</AnimatePresence>
    <AnimatePresence>{toast && <motion.div className="toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}><CheckCircle2 size={17} />{toast}</motion.div>}</AnimatePresence>
  </div>;
}

function FocusPage({ active, sound, setSound, onStart, onPause, onEnd, onReset, onPlanner, onBreathing, fmt, notify }: { active: ActiveSession | null; sound: boolean; setSound: (value: boolean) => void; onStart: () => void; onPause: () => void; onEnd: () => void; onReset: () => void; onPlanner: () => void; onBreathing: () => void; fmt: (seconds: number) => string; notify: (message: string) => void }) {
  const paused = Boolean(active && active.lastTick === 0);
  return <><PageIntro eyebrow="YOUR FOCUS ROOM" title="Protect a little time for what matters." desc="Your plan stays visible while you study. Breaks are part of the plan, not an interruption." /><div className="focus-layout"><section className={`panel timer-panel session-${active?.phase || 'study'}`}><div className="timer-top"><span className="pill green"><span /> {active ? (paused ? 'SESSION PAUSED' : active.phase === 'study' ? 'STUDY TIME · FOCUS SHIELD ACTIVE' : 'PLANNED BREAK · WEBSITES AVAILABLE') : 'READY TO BEGIN'}</span><button className={`sound-toggle ${sound ? 'on' : ''}`} onClick={() => setSound(!sound)}><Volume2 size={15} />{sound ? 'Sound on' : 'Ambient sound'}</button></div>{active ? <><div className="active-goal"><span className="eyebrow">CURRENT STUDY GOAL</span><h2>{active.title}</h2>{active.subject && <p>{active.subject}</p>}</div><div className="big-timer"><svg viewBox="0 0 260 260"><circle cx="130" cy="130" r="112" className="timer-track" /><circle cx="130" cy="130" r="112" className="timer-progress" style={{ strokeDashoffset: 704 * (1 - active.phaseRemaining / active.phaseTotal) }} /></svg><div className="timer-readout"><strong>{fmt(active.phaseRemaining)}</strong><span>{active.phase === 'study' ? 'STUDY TIME' : 'TAKE YOUR BREAK'}</span></div></div><div className="phase-banner"><span>{active.phase === 'study' ? <BookOpen size={17} /> : <Coffee size={17} />}</span><div><b>{active.phase === 'study' ? 'Stay with your study block' : 'Step away for your planned break'}</b><small>Overall progress: {Math.min(100, Math.round(active.elapsedSeconds / (active.totalMinutes * 60) * 100))}% · {active.completedBlocks} blocks complete</small></div></div><div className="timer-controls">{paused ? <button className="primary-btn" onClick={onStart}><Play size={17} fill="currentColor" /> Resume</button> : <button className="primary-btn" onClick={onPause}><Pause size={17} fill="currentColor" /> Pause</button>}<button className="secondary-btn" onClick={onEnd}>End session</button><button className="round-btn" onClick={onReset} title="Reset session"><RotateCcw size={17} /></button></div></> : <><div className="empty-focus"><Timer size={34} /><h2>Ready for a focused session?</h2><p>Choose a plan in the Study planner, or start a quick {25} minute session.</p><button className="primary-btn" onClick={onStart}><Play size={17} fill="currentColor" /> Start quick session</button><button className="text-btn" onClick={onPlanner}>Create a planned session <ArrowRight size={14} /></button></div></>}</section><section className="focus-side"><div className="panel"><span className="eyebrow">YOUR PLAN</span><h2>{active ? active.title : 'What are you focusing on?'}</h2><p className="small-muted">{active ? `${active.totalMinutes} minutes total · ${active.breaks} planned break${active.breaks === 1 ? '' : 's'}` : 'Keep one goal visible. If another thought appears, gently return here.'}</p>{active ? <div className="plan-progress"><div className="progress-bar"><i style={{ width: `${Math.min(100, active.elapsedSeconds / (active.totalMinutes * 60) * 100)}%` }} /></div><span>{active.completedBlocks} study blocks · {active.breaksTaken} breaks</span></div> : <button className="secondary-btn full" onClick={onPlanner}>Build a study plan <CalendarDays size={15} /></button>}</div><div className="panel break-panel"><div className="break-icon"><Coffee size={19} /></div><h3>Intentional breaks</h3><p>Stretch, drink water, or look outside. When your break ends, a voice says: <b>"Break is over, get back to your work"</b> and Focus Shield resumes.</p><button className="secondary-btn" style={{ marginTop: '10px', fontSize: '11px', padding: '6px 12px' }} onClick={() => { playAlertTone('break'); speakMessage('Break is over, get back to your work.'); notify("Testing voice: 'Break is over, get back to your work.'"); }}><Volume2 size={13} /> Test Break Voice Alert</button></div><div className="panel"><h3>Need a reset?</h3><p className="small-muted">A quick breathing exercise can help you return without judging yourself.</p><button className="secondary-btn full" onClick={onBreathing}><Waves size={15} /> Start breathing reset</button></div></section></div></>;
}

function PlannerPage({ setup, setSetup, onStart, tasks, completed, progress, newTask, setNewTask, addTask, onToggle, onDelete, subjects, newSubject, setNewSubject, addSubject }: { setup: SessionPlan; setSetup: (value: SessionPlan) => void; onStart: (plan: SessionPlan) => void; tasks: Task[]; completed: number; progress: number; newTask: string; setNewTask: (value: string) => void; addTask: () => void; onToggle: (id: number) => void; onDelete: (id: number) => void; subjects: string[]; newSubject: string; setNewSubject: (value: string) => void; addSubject: () => void }) {
  return <><PageIntro eyebrow="MAKE IT MANAGEABLE" title="Plan your study session." desc="Set a goal, add intentional breaks, and keep the structure visible while you work." /><div className="planner-layout"><section className="panel session-builder"><div className="panel-head"><div><span className="eyebrow">SESSION BUILDER</span><h2>Under one minute to set up</h2></div><Sparkles className="soft-icon" /></div><label>Study goal<input value={setup.title} onChange={event => setSetup({ ...setup, title: event.target.value })} placeholder="e.g. Complete DBMS revision" /></label><label>Subject <span className="optional">(optional)</span><select value={setup.subject} onChange={event => setSetup({ ...setup, subject: event.target.value })}><option value="">No subject</option>{subjects.map(subject => <option key={subject}>{subject}</option>)}</select></label><div className="subject-add"><input value={newSubject} onChange={event => setNewSubject(event.target.value)} onKeyDown={event => event.key === 'Enter' && addSubject()} placeholder="Add your own subject" /><button className="secondary-btn" onClick={addSubject}><Plus size={14} /> Add subject</button></div><label>Subject or task description <span className="optional">(optional)</span><textarea value={setup.description} onChange={event => setSetup({ ...setup, description: event.target.value })} placeholder="What would a good session help you finish?" /></label><div className="form-grid"><label>Total duration<select value={setup.totalMinutes} onChange={event => setSetup({ ...setup, totalMinutes: Number(event.target.value) })}>{[30, 45, 60, 90, 120].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label><label>Study block<select value={setup.blockMinutes} onChange={event => setSetup({ ...setup, blockMinutes: Number(event.target.value) })}>{[15, 20, 25, 30, 45, 60].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label><label>Break length<select value={setup.breakMinutes} onChange={event => setSetup({ ...setup, breakMinutes: Number(event.target.value) })}>{[3, 5, 10, 15].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label><label>Planned breaks<select value={setup.breaks} onChange={event => setSetup({ ...setup, breaks: Number(event.target.value) })}>{[0, 1, 2, 3].map(value => <option key={value} value={value}>{value}</option>)}</select></label></div><div className="plan-preview"><b>Your structure</b><span>{setup.blockMinutes} min study {setup.breaks ? `→ ${setup.breakMinutes} min break `.repeat(setup.breaks) : ''}→ finish within {setup.totalMinutes} min</span></div><button className="primary-btn" onClick={() => onStart(setup)}><Play size={16} fill="currentColor" /> Start this study plan <ArrowRight size={16} /></button></section><section className="panel task-panel"><div className="panel-head"><div><span className="eyebrow">YOUR NEXT STEPS</span><h2>Today's planner</h2></div><span className="pill">{progress}% DONE</span></div><div className="add-task-row"><input value={newTask} onChange={event => setNewTask(event.target.value)} onKeyDown={event => event.key === 'Enter' && addTask()} placeholder="What would you like to get done?" /><button className="primary-btn" onClick={addTask}><Plus size={16} /> Add</button></div><div className="planner-progress"><div><b>{completed} of {tasks.length} completed</b><span>{progress}% done</span></div><div className="progress-bar"><i style={{ width: `${progress}%` }} /></div></div><div className="task-list large">{tasks.filter(task => !task.plannedFor || task.plannedFor <= localDay()).map(task => <div className="task-line" key={task.id}><TaskRow task={task} onToggle={() => onToggle(task.id)} /><button className="delete-btn" onClick={() => onDelete(task.id)}><Trash2 size={16} /></button></div>)}</div>{tasks.some(task => task.plannedFor && task.plannedFor > localDay()) && <div className="tomorrow-plan"><div className="eyebrow"><CalendarDays size={13}/> CARRIED FORWARD · TOMORROW</div>{tasks.filter(task => task.plannedFor && task.plannedFor > localDay()).map(task => <div className="task-line" key={task.id}><TaskRow task={task} onToggle={() => onToggle(task.id)} /><button className="delete-btn" onClick={() => onDelete(task.id)}><Trash2 size={16} /></button></div>)}</div>}{!tasks.length && <div className="empty-state"><ListTodo size={30} /><b>Your list is clear</b><span>Add one small task to get started.</span></div>}</section></div></>;
}

function InsightsExtras({ sessions, weekSessions, previousWeekSessions, chartData, subjectData, goals, goalProgress, goalDraft, setGoalDraft, addGoal, onDeleteGoal, selectedDay, setSelectedDay, onDeleteSession, todayKey }: { sessions: SessionSummary[]; weekSessions: SessionSummary[]; previousWeekSessions: SessionSummary[]; chartData: { day: string; date: string; dayNumber: number; monthName: string; minutes: number; sessionCount: number; isToday: boolean; isFuture: boolean }[]; subjectData: { subject: string; minutes: number; sessions: number }[]; goals: Goal[]; goalProgress: (goal: Goal) => number; goalDraft: { title: string; type: Goal['type']; target: number; subject: string }; setGoalDraft: (value: { title: string; type: Goal['type']; target: number; subject: string }) => void; addGoal: () => void; onDeleteGoal: (id: string) => void; selectedDay: string; setSelectedDay: (value: string) => void; onDeleteSession: (id: string) => void; todayKey: string }) {
  const weekMinutes = weekSessions.reduce((sum, session) => sum + session.actualStudyMinutes, 0);
  const previousMinutes = previousWeekSessions.reduce((sum, session) => sum + session.actualStudyMinutes, 0);
  const selectedSessions = sessions.filter(session => session.date === selectedDay);
  const maxSubjectMinutes = Math.max(1, ...subjectData.map(item => item.minutes));
  const activeDaysCount = new Set(weekSessions.map(session => session.date)).size;
  const avgSession = weekSessions.length ? Math.round(weekMinutes / weekSessions.length) : 0;

  return <div className="analytics-stack">
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">WEEKLY STUDY CONSISTENCY</span><h2>This week's rhythm</h2></div><CalendarDays className="soft-icon" /></div><div className="week-heatmap">{chartData.map(day => <button key={day.date} className={`week-day ${day.minutes ? 'studied' : ''} ${day.isToday ? 'today' : ''} ${day.isFuture ? 'future' : ''} ${selectedDay === day.date ? 'selected' : ''}`} onClick={() => setSelectedDay(day.date)}><div className="week-day-top"><b>{day.day}</b><span className="day-num">{day.dayNumber}</span></div><div className="week-day-val">{day.minutes > 0 ? <strong>{day.minutes}m</strong> : <span className="empty-dash">{day.isFuture ? '·' : '—'}</span>}</div>{day.isToday && <span className="today-badge-pill">TODAY</span>}</button>)}</div><div className="analytics-stats"><div><b>{weekMinutes} min</b><span>Actual study</span></div><div><b>{weekSessions.length}</b><span>Focus sessions</span></div><div><b>{activeDaysCount} of 7</b><span>Days active</span></div><div><b>{avgSession} min</b><span>Avg session</span></div></div>{selectedSessions.length ? <div className="day-summary"><div className="day-summary-header"><b>{selectedDay === todayKey ? `${selectedDay} (Today)` : selectedDay}</b><span>{selectedSessions.reduce((sum, s) => sum + s.actualStudyMinutes, 0)} min across {selectedSessions.length} session{selectedSessions.length === 1 ? '' : 's'}</span></div><div className="day-session-list">{selectedSessions.map(session => <div key={session.id} className="day-session-item"><div><b>{session.title}</b><small>{session.subject ? `${session.subject} · ` : ''}{session.actualStudyMinutes} min · {session.status === 'completed' ? 'Completed block' : 'Ended early'}</small></div><button className="delete-btn session-delete" onClick={() => onDeleteSession(session.id)} title="Delete session"><Trash2 size={13} /></button></div>)}</div></div> : <div className="analytics-empty">{selectedDay === todayKey ? "Today: No sessions recorded yet. Start a study session in the Focus Room to begin your rhythm!" : selectedDay > todayKey ? "Upcoming day. Plan your goals and tasks in the Study Planner." : "Rest day — no recorded sessions for this date."}</div>}</section>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">WEEKLY COMPARISON</span><h2>Current week vs previous week</h2></div><TrendingUp className="soft-icon" /></div><div className="comparison-grid"><div><span>Actual study time</span><b>{weekMinutes} vs {previousMinutes} min</b><small>{previousMinutes ? `${Math.round((weekMinutes - previousMinutes) / previousMinutes * 100)}% change` : 'No previous-week baseline yet'}</small></div><div><span>Active sessions</span><b>{weekSessions.length} vs {previousWeekSessions.length}</b><small>Based on recorded study sessions</small></div></div></section>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">STUDY GOALS</span><h2>Progress for this week</h2></div><Target className="soft-icon" /></div><div className="goal-form"><input value={goalDraft.title} onChange={event => setGoalDraft({ ...goalDraft, title: event.target.value })} placeholder="e.g. Study consistently this week" /><select value={goalDraft.type} onChange={event => setGoalDraft({ ...goalDraft, type: event.target.value as Goal['type'] })}><option value="minutes">Study minutes</option><option value="sessions">Completed sessions</option></select><input type="number" min="1" value={goalDraft.target} onChange={event => setGoalDraft({ ...goalDraft, target: Number(event.target.value) })} /><select value={goalDraft.subject} onChange={event => setGoalDraft({ ...goalDraft, subject: event.target.value })}><option value="">All subjects</option>{subjectData.map(item => <option key={item.subject}>{item.subject}</option>)}</select><button className="primary-btn" onClick={addGoal}><Plus size={15} /> Add goal</button></div><div className="goal-list">{goals.filter(goal => goal.weekKey === localDay() || goal.weekKey === weekKey(new Date())).map(goal => { const value = goalProgress(goal); const percent = Math.min(100, Math.round(value / goal.target * 100)); return <div className="goal-item" key={goal.id}><div><b>{goal.title}</b><span>{value} / {goal.target} {goal.type === 'minutes' ? 'minutes' : 'sessions'}{goal.subject ? ` · ${goal.subject}` : ''}</span></div><strong>{percent}%</strong><div className="progress-bar"><i style={{ width: `${percent}%` }} /></div><button className="delete-btn" onClick={() => onDeleteGoal(goal.id)} aria-label={`Delete ${goal.title}`}><Trash2 size={15} /></button></div>; })}</div>{!goals.length && <div className="analytics-empty">Create a weekly goal to turn your actual study time into a useful progress view.</div>}</section>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">SUBJECT-WISE ANALYTICS</span><h2>Where your study time went</h2></div><BookOpen className="soft-icon" /></div>{subjectData.length ? <div className="subject-bars">{subjectData.map(item => <div className="subject-bar" key={item.subject}><div><b>{item.subject}</b><span>{item.minutes} min · {item.sessions} sessions</span></div><div className="progress-bar"><i style={{ width: `${item.minutes / maxSubjectMinutes * 100}%` }} /></div></div>)}</div> : <div className="analytics-empty">Subject analytics will appear after you record a session.</div>}</section>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">PLANNED VS ACTUAL</span><h2>A realistic view of your plan</h2></div><Clock3 className="soft-icon" /></div>{weekSessions.length ? <div className="comparison-grid"><div><span>Planned study time</span><b>{weekSessions.reduce((sum, session) => sum + session.plannedStudyMinutes, 0)} min</b><small>Actual: {weekMinutes} min</small></div><div><span>Planned sessions</span><b>{weekSessions.length}</b><small>Completed: {weekSessions.filter(session => session.status === 'completed').length}</small></div><div><span>Planned breaks</span><b>{weekSessions.reduce((sum, session) => sum + session.breaks, 0)}</b><small>Taken: {weekSessions.reduce((sum, session) => sum + session.breaksTaken, 0)}</small></div></div> : <div className="analytics-empty">Complete or end a study session to see planned and actual time together.</div>}</section>
  </div>;
}

function Stat({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint: string }) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><Icon size={17} /></div><b>{value}</b><small>{hint}</small></div>; }
function PageIntro({ eyebrow, title, desc }: { eyebrow: string; title: string; desc: string }) { return <div className="page-intro"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{desc}</p></div>; }
function TaskRow({ task, onToggle }: { task: Task; onToggle: () => void }) { return <div className={`task-row ${task.done ? 'done' : ''}`}><button className="task-check" onClick={onToggle} aria-label={`Mark ${task.title} ${task.done ? 'not done' : 'done'}`}>{task.done && <Check size={13} />}</button><div className="task-info"><b>{task.title}</b><span><Clock3 size={12} />{task.time} <i /> {task.tag}{task.carriedFrom && <><i /> Carried forward</>}</span></div></div>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}><motion.div className="modal" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onClick={event => event.stopPropagation()}><div className="modal-head"><b>{title}</b><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>{children}</motion.div></motion.div>; }
function Breathing({ onDone }: { onDone: () => void }) { const [step, setStep] = useState(0); const [count, setCount] = useState(4); useEffect(() => { const id = window.setInterval(() => setCount(value => { if (value <= 1) { setStep(current => (current + 1) % 3); return [4, 4, 6][(step + 1) % 3]; } return value - 1; }), 1000); return () => clearInterval(id); }, [step]); const labels = ['Breathe in', 'Hold gently', 'Breathe out']; return <div className="breathing"><div className={`breath-orb phase-${step}`}><div><b>{count}</b><span>{labels[step]}</span></div></div><p>Follow the circle. Let your breathing find its own pace.</p><button className="primary-btn full" onClick={onDone}>Finish reset <Check size={15} /></button></div>; }

export default App;
