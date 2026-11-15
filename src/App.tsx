import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, ArrowRight, Bell, BookOpen, Brain, CalendarDays, Check, CheckCircle2,
  CircleHelp, Clock3, Coffee, Flame, Heart, Home, Leaf, ListTodo, Menu, Moon,
  Download, MoreHorizontal, Pause, Play, Plus, RotateCcw, Shield, ShieldCheck, Sparkles,
  Sprout, Sun, Target, Timer, Trash2, TrendingUp, Volume2, Waves, X, Zap
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Task = { id: number; title: string; time: string; done: boolean; tag: string };
type Phase = 'study' | 'break';
type SessionPlan = { title: string; subject: string; totalMinutes: number; blockMinutes: number; breakMinutes: number; breaks: number };
type ActiveSession = SessionPlan & { phase: Phase; phaseRemaining: number; phaseTotal: number; elapsedSeconds: number; completedBlocks: number; breaksTaken: number; lastTick: number };
type SessionSummary = SessionPlan & { date: string; actualMinutes: number; completedBlocks: number; breaksTaken: number; completed: boolean; reflection: string };
type Page = 'overview' | 'focus' | 'planner' | 'distractions' | 'notifications' | 'winddown' | 'insights';
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

function useSaved<T>(key: string, initial: T): [T, (value: T | ((old: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : initial; } catch { return initial; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue];
}

function App() {
  const [page, setPage] = useState<Page>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [tasks, setTasks] = useSaved<Task[]>('ff_tasks', initialTasks);
  const [apps, setApps] = useSaved<string[]>('ff_apps', defaultApps);
  const [allowed, setAllowed] = useSaved<string[]>('ff_allowed', ['Calls', 'Family', 'Calendar']);
  const [sessions, setSessions] = useSaved<SessionSummary[]>('ff_sessions', []);
  const [reflections, setReflections] = useSaved<string[]>('ff_reflections', []);
  const [bedtime, setBedtime] = useSaved('ff_bedtime', '10:30 PM');
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
  const [setup, setSetup] = useState<SessionPlan>({ title: '', subject: '', totalMinutes: 60, blockMinutes: 25, breakMinutes: 5, breaks: 1 });

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2400); };
  const todayKey = new Date().toISOString().slice(0, 10);
  const totalMinutes = sessions.reduce((sum, session) => sum + session.actualMinutes, 0);
  const today = sessions.filter(session => session.date === todayKey).reduce((sum, session) => sum + session.actualMinutes, 0);
  const completed = tasks.filter(task => task.done).length;
  const progress = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  const chartData = useMemo(() => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => ({ day, minutes: [35, 55, 25, 75, 45, 90, today || 30][i] })), [today]);
  const nav = [
    { id: 'overview' as Page, label: 'Overview', icon: Home }, { id: 'focus' as Page, label: 'Focus room', icon: Target },
    { id: 'planner' as Page, label: 'Study planner', icon: CalendarDays }, { id: 'distractions' as Page, label: 'Distraction lab', icon: Shield },
    { id: 'notifications' as Page, label: 'Notification audit', icon: Bell }, { id: 'winddown' as Page, label: 'Wind-down', icon: Moon },
    { id: 'insights' as Page, label: 'My insights', icon: TrendingUp }
  ];
  const title = nav.find(item => item.id === page)?.label || 'Overview';

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
        if (remaining > 0) return { ...current, phaseRemaining: remaining, elapsedSeconds: current.elapsedSeconds + elapsed, lastTick: now };
        if (current.phase === 'study' && current.breaksTaken < current.breaks) {
          notify('Study block complete. Your planned break starts now.');
          return { ...current, phase: 'break', phaseRemaining: current.breakMinutes * 60, phaseTotal: current.breakMinutes * 60, breaksTaken: current.breaksTaken + 1, completedBlocks: current.completedBlocks + 1, elapsedSeconds: current.elapsedSeconds + Math.max(0, current.phaseRemaining), lastTick: now };
        }
        if (current.phase === 'break') {
          notify('Break complete. Welcome back to your next study block.');
          const plannedStudySeconds = current.totalMinutes * 60 - current.breaks * current.breakMinutes * 60;
          const remainingStudySeconds = plannedStudySeconds - current.completedBlocks * current.blockMinutes * 60;
          const nextStudySeconds = Math.min(current.blockMinutes * 60, Math.max(1, remainingStudySeconds));
          return { ...current, phase: 'study', phaseRemaining: nextStudySeconds, phaseTotal: nextStudySeconds, elapsedSeconds: current.elapsedSeconds + Math.max(0, current.phaseRemaining), lastTick: now };
        }
        const summary: SessionSummary = { ...current, date: todayKey, actualMinutes: Math.max(1, Math.round(current.elapsedSeconds / 60)), completedBlocks: current.completedBlocks + 1, completed: true, reflection: '' };
        setSessions(old => [...old, summary]); setLastSummary(summary); setShowSummary(true); notify('Your study session is complete.');
        return null;
      });
    }, 500);
    return () => clearInterval(timer);
  }, [active, setActive, setSessions, setLastSummary, todayKey]);

  const startPlan = (plan: SessionPlan) => {
    const validPlan = { ...plan, title: plan.title.trim() || 'Focused study session', totalMinutes: Math.max(1, plan.totalMinutes), blockMinutes: Math.max(1, plan.blockMinutes), breakMinutes: Math.max(1, plan.breakMinutes), breaks: Math.max(0, plan.breaks) };
    const session: ActiveSession = { ...validPlan, phase: 'study', phaseRemaining: validPlan.blockMinutes * 60, phaseTotal: validPlan.blockMinutes * 60, elapsedSeconds: 0, completedBlocks: 0, breaksTaken: 0, lastTick: Date.now() };
    setLastSummary(null); setActive(session); setPage('focus'); notify('Your study plan is ready. Begin when you are settled.');
  };
  const startQuickSession = () => startPlan({ title: 'Focused study session', subject: tasks.find(task => !task.done)?.title || '', totalMinutes: duration, blockMinutes: duration, breakMinutes: 5, breaks: 0 });
  const pauseSession = () => setActive(current => current ? { ...current, lastTick: 0 } : current);
  const resumeSession = () => setActive(current => current ? { ...current, lastTick: Date.now() } : current);
  const endSession = () => {
    if (!active) return;
    const summary: SessionSummary = { ...active, date: todayKey, actualMinutes: Math.max(1, Math.round(active.elapsedSeconds / 60)), completedBlocks: active.completedBlocks + (active.phase === 'study' ? 0 : 1), completed: false, reflection: '' };
    setSessions(old => [...old, summary]); setLastSummary(summary); setActive(null); setShowSummary(true);
  };
  const finishTask = (id: number) => setTasks(old => old.map(task => task.id === id ? { ...task, done: !task.done } : task));
  const addTask = () => { if (!newTask.trim()) return; setTasks(old => [...old, { id: Date.now(), title: newTask.trim(), time: 'Anytime', done: false, tag: 'Personal' }]); setNewTask(''); };
  const addApp = () => { if (!newApp.trim()) return; setApps(old => [...old, newApp.trim()]); setNewApp(''); };
  const fmt = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const updateSummary = (reflection: string) => { if (!lastSummary) return; const saved = { ...lastSummary, reflection }; setLastSummary(saved); setSessions(old => old.map(item => item.date === lastSummary.date && item.title === lastSummary.title ? saved : item)); setShowSummary(false); notify('Reflection saved.'); };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'mobile-show' : ''}`}><div className="brand"><div className="brand-mark"><Sprout size={23} /></div><div><b>focusflow</b><span>make space to focus</span></div><button className="icon-btn mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <div className="workspace-label">WORKSPACE</div><nav>{nav.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => { setPage(item.id); setMobileOpen(false); }}><item.icon size={18} /><span>{item.label}</span>{item.id === 'focus' && active && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-quote"><div className="quote-icon"><Leaf size={17} /></div><p>Small steps create space for big things.</p><span>YOUR DAILY REMINDER</span></div><div className="profile"><div className="avatar">A</div><div><b>My space</b><span>Personal workspace</span></div><MoreHorizontal size={19} className="muted" /></div></div>
    </aside>
    <main className="main"><header className="topbar"><button className="icon-btn menu-btn" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="crumb">Workspace <span>/</span> <b>{title}</b></div><div className="top-actions"><div className="date-chip"><Sun size={15} /> {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>{!installed && <button className="install-btn" onClick={installApp} aria-label="Install FocusFlow" title="Install FocusFlow"><Download size={16} /><span>Install app</span></button>}<button className="icon-btn" title="Help" onClick={() => notify('FocusFlow is your calm space to build better digital habits.')}><CircleHelp size={18} /></button><div className="avatar small">A</div></div></header>
      <div className="content"><AnimatePresence mode="wait"><motion.div key={page} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .2 }}>
        {page === 'overview' && <><div className="welcome-row"><div><div className="eyebrow"><Sparkles size={14} /> YOUR PERSONAL WELLNESS SPACE</div><h1>A little more focus.<br /><em>A little less noise.</em></h1><p className="subhead">Build a calmer relationship with your screen, one session at a time.</p></div><div className="welcome-art"><div className="sun-disc" /><div className="plant plant-one">✳</div><div className="plant plant-two">✦</div><div className="art-note">breathe in.<br />begin again.</div></div></div>
          <div className="stat-grid"><Stat icon={Clock3} label="FOCUS TODAY" value={`${today} min`} hint="Time well spent" /><Stat icon={Flame} label="TOTAL FOCUS" value={`${totalMinutes} min`} hint="Your effort adds up" /><Stat icon={CheckCircle2} label="TASKS DONE" value={`${completed}/${tasks.length}`} hint={`${progress}% of today's list`} /><Stat icon={Sprout} label="STUDY SESSIONS" value={`${sessions.length}`} hint="Every start counts" /></div>
          <div className="dashboard-grid"><section className="panel focus-card"><div className="panel-head"><div><span className="eyebrow">READY WHEN YOU ARE</span><h2>Make room for deep work</h2></div><span className="pill green"><span /> FOCUS MODE</span></div><div className="focus-card-body"><div className="mini-timer"><div className="timer-ring"><div><b>{duration}</b><span>MINUTES</span></div></div></div><div className="focus-copy"><p>Plan your study blocks and intentional breaks in under a minute.</p><div className="duration-row">{[15, 25, 45].map(value => <button key={value} className={duration === value ? 'duration active' : 'duration'} onClick={() => setDuration(value)}>{value} min</button>)}</div><button className="primary-btn" onClick={startQuickSession}><Play size={16} fill="currentColor" /> Start a focus session <ArrowRight size={16} /></button></div></div></section>
            <section className="panel task-panel"><div className="panel-head"><div><span className="eyebrow">YOUR NEXT STEPS</span><h2>Today's planner</h2></div><button className="text-btn" onClick={() => setPage('planner')}>View all <ArrowRight size={14} /></button></div><div className="task-list">{tasks.slice(0, 4).map(task => <TaskRow key={task.id} task={task} onToggle={() => finishTask(task.id)} />)}</div><button className="add-inline" onClick={() => setPage('planner')}><Plus size={15} /> Add a task</button></section></div>
          <div className="dashboard-grid lower-grid"><section className="panel"><div className="panel-head"><div><span className="eyebrow">A GENTLE CHECK-IN</span><h2>How's your digital day?</h2></div><Heart size={19} className="soft-icon" /></div><p className="body-copy">No grades, no guilt. Just notice how you feel.</p><div className="mood-row">{['Drained', 'Distracted', 'Okay', 'Good', 'Energised'].map(value => <button key={value} onClick={() => setMood(value)} className={`mood ${mood === value ? 'selected' : ''}`}>{value === 'Drained' ? '😮‍💨' : value === 'Distracted' ? '🫠' : value === 'Okay' ? '🙂' : value === 'Good' ? '😊' : '⚡'}<span>{value}</span></button>)}</div><textarea className="reflection-input" value={note} onChange={event => setNote(event.target.value)} placeholder="What's one thing you noticed today? (optional)" /><button className="secondary-btn" onClick={() => { setReflections(old => [...old, `${new Date().toLocaleDateString()}: ${mood} — ${note || 'Quick mood check-in'}`]); setNote(''); notify('Check-in saved. Thanks for noticing.'); }}>Save check-in <Check size={15} /></button></section><section className="panel rescue-card"><div className="rescue-icon"><Zap size={20} /></div><span className="eyebrow">WHEN DISTRACTION STRIKES</span><h2>Feeling the scroll<br />pull?</h2><p>Pause the autopilot. A tiny reset can help you choose what happens next.</p><button className="dark-btn" onClick={() => setRescue(true)}>Try Distraction Rescue <ArrowRight size={15} /></button></section></div></>}
        {page === 'focus' && <FocusPage active={active} sound={sound} setSound={setSound} onStart={active ? resumeSession : startQuickSession} onPause={pauseSession} onEnd={endSession} onReset={() => setActive(null)} onPlanner={() => setPage('planner')} onBreathing={() => setBreathing(true)} fmt={fmt} />}
        {page === 'planner' && <PlannerPage setup={setup} setSetup={setSetup} onStart={startPlan} tasks={tasks} completed={completed} progress={progress} newTask={newTask} setNewTask={setNewTask} addTask={addTask} onToggle={finishTask} onDelete={id => setTasks(old => old.filter(task => task.id !== id))} />}
        {page === 'distractions' && <><PageIntro eyebrow="UNDERSTAND YOUR TRIGGERS" title="Make distractions easier to notice." desc="Build awareness of the apps and moments that pull you away. No shame, just useful signals." /><div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><span className="eyebrow">YOUR DISTRACTION LIST</span><h2>Apps that pull your attention</h2></div><ShieldCheck className="soft-icon" /></div><p className="body-copy">Add the apps you tend to open without meaning to.</p><div className="add-task-row"><input value={newApp} onChange={event => setNewApp(event.target.value)} onKeyDown={event => event.key === 'Enter' && addApp()} placeholder="Add an app or website" /><button className="primary-btn" onClick={addApp}><Plus size={15} /> Add</button></div><div className="app-chip-list">{apps.map((app, index) => <div className="app-chip" key={`${app}-${index}`}><span className="app-dot">{app.slice(0, 1).toUpperCase()}</span>{app}<button onClick={() => setApps(old => old.filter((_, i) => i !== index))}><X size={14} /></button></div>)}</div></section><section className="panel rescue-card"><div className="rescue-icon"><Zap size={20} /></div><span className="eyebrow">THE 30-SECOND PAUSE</span><h2>Interrupt the<br />autopilot loop.</h2><p>Before opening a distracting app, pause and ask: What was I here to do?</p><button className="dark-btn" onClick={() => setRescue(true)}>Start rescue <ArrowRight size={15} /></button></section></div></>}
        {page === 'notifications' && <><PageIntro eyebrow="YOUR ATTENTION, YOUR RULES" title="Let the important things through." desc="Choose what you want to treat as important. This is a planning tool; it won't change device settings." /><section className="panel"><div className="audit-header"><div><span className="eyebrow">NOTIFICATION AUDIT</span><h2>Your notification boundaries</h2></div><div className="audit-count"><b>{allowed.length}</b><span>kept important</span></div></div><div className="notification-options">{['Calls', 'Family', 'Calendar', 'College / work', 'Banking alerts', 'Delivery updates', 'Social media likes', 'Promotional messages', 'News alerts', 'Group chats'].map((value, index) => <button key={value} className={`notification-option ${allowed.includes(value) ? 'chosen' : ''}`} onClick={() => setAllowed(old => old.includes(value) ? old.filter(item => item !== value) : [...old, value])}><span className="notification-symbol">{index < 3 ? <Bell size={17} /> : index < 6 ? <Activity size={17} /> : <MoreHorizontal size={17} />}</span><span>{value}<small>{index < 3 ? 'Often time-sensitive' : index < 6 ? 'Useful when expected' : 'Can usually wait'}</small></span><span className="check-circle">{allowed.includes(value) && <Check size={13} />}</span></button>)}</div></section></>}
        {page === 'winddown' && <><PageIntro eyebrow="MAKE SPACE TO REST" title="Give your day a softer ending." desc="A small wind-down routine can make it easier to step away from the scroll." /><section className="panel bedtime-panel"><div className="moon-art"><Moon size={34} /><span>✦</span></div><span className="eyebrow">YOUR BEDTIME GOAL</span><h2>When would you like to wind down?</h2><select value={bedtime} onChange={event => setBedtime(event.target.value)} className="select-input">{['09:00 PM', '09:30 PM', '10:00 PM', '10:30 PM', '11:00 PM', '11:30 PM', '12:00 AM'].map(value => <option key={value}>{value}</option>)}</select></section></>}
        {page === 'insights' && <><PageIntro eyebrow="PROGRESS WITHOUT PRESSURE" title="Look at what you're building." desc="Your patterns are information, not a score. Celebrate what is working and adjust what isn't." /><div className="stat-grid"><Stat icon={Clock3} label="TOTAL FOCUS" value={`${totalMinutes} min`} hint="Across saved sessions" /><Stat icon={Target} label="SESSIONS" value={`${sessions.length}`} hint="Completed or ended" /><Stat icon={CheckCircle2} label="TASK COMPLETION" value={`${progress}%`} hint="Today's planner" /><Stat icon={Heart} label="REFLECTIONS" value={`${reflections.length + sessions.filter(session => session.reflection).length}`} hint="Moments of awareness" /></div><section className="panel chart-panel"><div className="panel-head"><div><span className="eyebrow">YOUR WEEK AT A GLANCE</span><h2>Time spent focusing</h2></div><span className="pill">MINUTES / DAY</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9ece5" /><XAxis dataKey="day" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip /><Area type="monotone" dataKey="minutes" stroke="#557c61" fill="#83a98b55" /></AreaChart></ResponsiveContainer></div></section><section className="panel session-history"><div className="panel-head"><div><span className="eyebrow">SESSION HISTORY</span><h2>Recent study sessions</h2></div><Timer className="soft-icon" /></div>{sessions.length ? sessions.slice(-8).reverse().map((session, index) => <div className="history-row" key={`${session.date}-${index}`}><div><b>{session.title}</b><span>{session.date} · {session.completed ? 'Completed' : 'Ended early'}</span></div><strong>{session.actualMinutes} min</strong><small>{session.completedBlocks} blocks · {session.breaksTaken} breaks</small></div>) : <div className="empty-state"><Timer size={26} /><b>No study sessions yet</b><span>Your completed sessions will appear here.</span></div>}</section></>}
      </motion.div></AnimatePresence></div>
    </main>
    <AnimatePresence>{rescue && <Modal title="Distraction Rescue" onClose={() => setRescue(false)}><div className="modal-hero"><div className="rescue-icon large"><Zap size={25} /></div><h2>Pause. Notice. Choose.</h2><p>You don't have to fight the urge. Just create a little space before acting on it.</p></div><div className="rescue-steps"><div><b>01</b><span>Take one slow breath. Relax your shoulders.</span></div><div><b>02</b><span>Ask: What was I planning to do right now?</span></div><div><b>03</b><span>Choose one tiny action to return to your task.</span></div></div><button className="primary-btn full" onClick={() => { setRescue(false); setPage('focus'); notify('Welcome back. Start with just 2 minutes.'); }}>I'm ready to refocus <ArrowRight size={16} /></button></Modal>}</AnimatePresence>
    <AnimatePresence>{breathing && <Modal title="Breathing reset" onClose={() => setBreathing(false)}><Breathing onDone={() => { setBreathing(false); notify('Nice work. Take your next step gently.'); }} /></Modal>}</AnimatePresence>
    <AnimatePresence>{showSummary && lastSummary && <Modal title="Session summary" onClose={() => setShowSummary(false)}><div className="summary-hero"><CheckCircle2 size={28} /><h2>{lastSummary.completed ? 'You made space for your goal.' : 'You made a useful start.'}</h2><p>{lastSummary.title}</p></div><div className="summary-grid"><div><b>{lastSummary.totalMinutes} min</b><span>planned</span></div><div><b>{lastSummary.actualMinutes} min</b><span>actual time</span></div><div><b>{lastSummary.completedBlocks}</b><span>study blocks</span></div><div><b>{lastSummary.breaksTaken}</b><span>breaks taken</span></div></div><label className="summary-label">Optional reflection<textarea className="reflection-input" defaultValue={lastSummary.reflection} placeholder="What helped you focus? What might you try next time?" onBlur={event => updateSummary(event.target.value)} /></label><button className="primary-btn full" onClick={() => setShowSummary(false)}>Done <Check size={15} /></button></Modal>}</AnimatePresence>
    <AnimatePresence>{showInstallHelp && <Modal title="Install FocusFlow" onClose={() => setShowInstallHelp(false)}><div className="install-help"><p>Add FocusFlow to your home screen for a full-screen app experience.</p><ol><li><b>iPhone or iPad:</b> Open this page in Safari, tap <b>Share</b>, then choose <b>Add to Home Screen</b>.</li><li><b>Android:</b> Open your browser menu and tap <b>Install app</b> or <b>Add to Home screen</b>.</li></ol><button className="primary-btn full" onClick={() => setShowInstallHelp(false)}>Got it <Check size={15} /></button></div></Modal>}</AnimatePresence>
    <AnimatePresence>{toast && <motion.div className="toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}><CheckCircle2 size={17} />{toast}</motion.div>}</AnimatePresence>
  </div>;
}

function FocusPage({ active, sound, setSound, onStart, onPause, onEnd, onReset, onPlanner, onBreathing, fmt }: { active: ActiveSession | null; sound: boolean; setSound: (value: boolean) => void; onStart: () => void; onPause: () => void; onEnd: () => void; onReset: () => void; onPlanner: () => void; onBreathing: () => void; fmt: (seconds: number) => string }) {
  const paused = Boolean(active && active.lastTick === 0);
  return <><PageIntro eyebrow="YOUR FOCUS ROOM" title="Protect a little time for what matters." desc="Your plan stays visible while you study. Breaks are part of the plan, not an interruption." /><div className="focus-layout"><section className={`panel timer-panel session-${active?.phase || 'study'}`}><div className="timer-top"><span className="pill green"><span /> {active ? (paused ? 'SESSION PAUSED' : active.phase === 'study' ? 'STUDY TIME' : 'PLANNED BREAK') : 'READY TO BEGIN'}</span><button className={`sound-toggle ${sound ? 'on' : ''}`} onClick={() => setSound(!sound)}><Volume2 size={15} />{sound ? 'Sound on' : 'Ambient sound'}</button></div>{active ? <><div className="active-goal"><span className="eyebrow">CURRENT STUDY GOAL</span><h2>{active.title}</h2>{active.subject && <p>{active.subject}</p>}</div><div className="big-timer"><svg viewBox="0 0 260 260"><circle cx="130" cy="130" r="112" className="timer-track" /><circle cx="130" cy="130" r="112" className="timer-progress" style={{ strokeDashoffset: 704 * (1 - active.phaseRemaining / active.phaseTotal) }} /></svg><div className="timer-readout"><strong>{fmt(active.phaseRemaining)}</strong><span>{active.phase === 'study' ? 'STUDY TIME' : 'TAKE YOUR BREAK'}</span></div></div><div className="phase-banner"><span>{active.phase === 'study' ? <BookOpen size={17} /> : <Coffee size={17} />}</span><div><b>{active.phase === 'study' ? 'Stay with your study block' : 'Step away for your planned break'}</b><small>Overall progress: {Math.min(100, Math.round(active.elapsedSeconds / (active.totalMinutes * 60) * 100))}% · {active.completedBlocks} blocks complete</small></div></div><div className="timer-controls">{paused ? <button className="primary-btn" onClick={onStart}><Play size={17} fill="currentColor" /> Resume</button> : <button className="primary-btn" onClick={onPause}><Pause size={17} fill="currentColor" /> Pause</button>}<button className="secondary-btn" onClick={onEnd}>End session</button><button className="round-btn" onClick={onReset} title="Reset session"><RotateCcw size={17} /></button></div></> : <><div className="empty-focus"><Timer size={34} /><h2>Ready for a focused session?</h2><p>Choose a plan in the Study planner, or start a quick {25} minute session.</p><button className="primary-btn" onClick={onStart}><Play size={17} fill="currentColor" /> Start quick session</button><button className="text-btn" onClick={onPlanner}>Create a planned session <ArrowRight size={14} /></button></div></>}</section><section className="focus-side"><div className="panel"><span className="eyebrow">YOUR PLAN</span><h2>{active ? active.title : 'What are you focusing on?'}</h2><p className="small-muted">{active ? `${active.totalMinutes} minutes total · ${active.breaks} planned break${active.breaks === 1 ? '' : 's'}` : 'Keep one goal visible. If another thought appears, gently return here.'}</p>{active ? <div className="plan-progress"><div className="progress-bar"><i style={{ width: `${Math.min(100, active.elapsedSeconds / (active.totalMinutes * 60) * 100)}%` }} /></div><span>{active.completedBlocks} study blocks · {active.breaksTaken} breaks</span></div> : <button className="secondary-btn full" onClick={onPlanner}>Build a study plan <CalendarDays size={15} /></button>}</div><div className="panel break-panel"><div className="break-icon"><Coffee size={19} /></div><h3>Intentional breaks</h3><p>Stretch, drink water, or look outside. You will get a gentle reminder when it is time to return.</p></div><div className="panel"><h3>Need a reset?</h3><p className="small-muted">A quick breathing exercise can help you return without judging yourself.</p><button className="secondary-btn full" onClick={onBreathing}><Waves size={15} /> Start breathing reset</button></div></section></div></>;
}

function PlannerPage({ setup, setSetup, onStart, tasks, completed, progress, newTask, setNewTask, addTask, onToggle, onDelete }: { setup: SessionPlan; setSetup: (value: SessionPlan) => void; onStart: (plan: SessionPlan) => void; tasks: Task[]; completed: number; progress: number; newTask: string; setNewTask: (value: string) => void; addTask: () => void; onToggle: (id: number) => void; onDelete: (id: number) => void }) {
  return <><PageIntro eyebrow="MAKE IT MANAGEABLE" title="Plan your study session." desc="Set a goal, add intentional breaks, and keep the structure visible while you work." /><div className="planner-layout"><section className="panel session-builder"><div className="panel-head"><div><span className="eyebrow">SESSION BUILDER</span><h2>Under one minute to set up</h2></div><Sparkles className="soft-icon" /></div><label>Study goal<input value={setup.title} onChange={event => setSetup({ ...setup, title: event.target.value })} placeholder="e.g. Complete DBMS revision" /></label><label>Subject or task description <span className="optional">(optional)</span><textarea value={setup.subject} onChange={event => setSetup({ ...setup, subject: event.target.value })} placeholder="What would a good session help you finish?" /></label><div className="form-grid"><label>Total duration<select value={setup.totalMinutes} onChange={event => setSetup({ ...setup, totalMinutes: Number(event.target.value) })}>{[30, 45, 60, 90, 120].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label><label>Study block<select value={setup.blockMinutes} onChange={event => setSetup({ ...setup, blockMinutes: Number(event.target.value) })}>{[15, 20, 25, 30, 45, 60].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label><label>Break length<select value={setup.breakMinutes} onChange={event => setSetup({ ...setup, breakMinutes: Number(event.target.value) })}>{[3, 5, 10, 15].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label><label>Planned breaks<select value={setup.breaks} onChange={event => setSetup({ ...setup, breaks: Number(event.target.value) })}>{[0, 1, 2, 3].map(value => <option key={value} value={value}>{value}</option>)}</select></label></div><div className="plan-preview"><b>Your structure</b><span>{setup.blockMinutes} min study {setup.breaks ? `→ ${setup.breakMinutes} min break `.repeat(setup.breaks) : ''}→ finish within {setup.totalMinutes} min</span></div><button className="primary-btn" onClick={() => onStart(setup)}><Play size={16} fill="currentColor" /> Start this study plan <ArrowRight size={16} /></button></section><section className="panel task-panel"><div className="panel-head"><div><span className="eyebrow">YOUR NEXT STEPS</span><h2>Today's planner</h2></div><span className="pill">{progress}% DONE</span></div><div className="add-task-row"><input value={newTask} onChange={event => setNewTask(event.target.value)} onKeyDown={event => event.key === 'Enter' && addTask()} placeholder="What would you like to get done?" /><button className="primary-btn" onClick={addTask}><Plus size={16} /> Add</button></div><div className="planner-progress"><div><b>{completed} of {tasks.length} completed</b><span>{progress}% done</span></div><div className="progress-bar"><i style={{ width: `${progress}%` }} /></div></div><div className="task-list large">{tasks.map(task => <div className="task-line" key={task.id}><TaskRow task={task} onToggle={() => onToggle(task.id)} /><button className="delete-btn" onClick={() => onDelete(task.id)}><Trash2 size={16} /></button></div>)}</div>{!tasks.length && <div className="empty-state"><ListTodo size={30} /><b>Your list is clear</b><span>Add one small task to get started.</span></div>}</section></div></>;
}

function Stat({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint: string }) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><Icon size={17} /></div><b>{value}</b><small>{hint}</small></div>; }
function PageIntro({ eyebrow, title, desc }: { eyebrow: string; title: string; desc: string }) { return <div className="page-intro"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{desc}</p></div>; }
function TaskRow({ task, onToggle }: { task: Task; onToggle: () => void }) { return <div className={`task-row ${task.done ? 'done' : ''}`}><button className="task-check" onClick={onToggle} aria-label={`Mark ${task.title} ${task.done ? 'not done' : 'done'}`}>{task.done && <Check size={13} />}</button><div className="task-info"><b>{task.title}</b><span><Clock3 size={12} />{task.time} <i /> {task.tag}</span></div></div>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}><motion.div className="modal" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onClick={event => event.stopPropagation()}><div className="modal-head"><b>{title}</b><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>{children}</motion.div></motion.div>; }
function Breathing({ onDone }: { onDone: () => void }) { const [step, setStep] = useState(0); const [count, setCount] = useState(4); useEffect(() => { const id = window.setInterval(() => setCount(value => { if (value <= 1) { setStep(current => (current + 1) % 3); return [4, 4, 6][(step + 1) % 3]; } return value - 1; }), 1000); return () => clearInterval(id); }, [step]); const labels = ['Breathe in', 'Hold gently', 'Breathe out']; return <div className="breathing"><div className={`breath-orb phase-${step}`}><div><b>{count}</b><span>{labels[step]}</span></div></div><p>Follow the circle. Let your breathing find its own pace.</p><button className="primary-btn full" onClick={onDone}>Finish reset <Check size={15} /></button></div>; }

export default App;
