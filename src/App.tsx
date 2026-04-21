import { useState, useEffect } from 'react';
import { Calendar, CheckCircle, ListTodo, ChevronLeft, Lock, Star, AlertCircle, Settings, Users, RotateCcw, X, Plus, Edit3, Save, CheckSquare } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, type User } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- GLOBALS FOR CANVAS COMPATIBILITY ---
declare global {
  var __firebase_config: string | undefined;
  var __app_id: string | undefined;
  var __initial_auth_token: string | undefined;
}

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
  apiKey: "AIzaSyC_8F-_ya3cVuvUjDA3vFN7yEuPSBOmkxI",
  authDomain: "family-command-center-549d2.firebaseapp.com",
  projectId: "family-command-center-549d2",
  storageBucket: "family-command-center-549d2.firebasestorage.app",
  messagingSenderId: "412577698703",
  appId: "1:412577698703:web:76544d2967f6bd540fb1fa"
};

// Exclusively use YOUR config to bypass the preview window's sandbox entirely
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Simple, clean path for your personal database
const SHARED_DOC_PATH = 'commandCenter/familyData';

// --- HELPER ---
const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

// --- TYPES ---
type ChoreType = 'daily' | 'weekly';

type Chore = {
  id: string;
  text: string;
  type: ChoreType;
  assigneeId: number;
  done: boolean;
};

type Kid = {
  id: number;
  name: string;
  color: string;
  headerColor: string;
  pin: string;
  routines: string[];
  reminders: string[]; // E.g. "Tuesday: Bring Piano Books"
};

type AppSettings = {
  autoResetDailies: boolean;
  lastResetDate: string;
};

// --- DEFAULT DATA (For Fresh Installs) ---
const initialKids: Kid[] = [
  { id: 1, name: 'Alex', color: 'border-blue-500', headerColor: 'text-blue-400', pin: '1234', routines: ['Brush Teeth', 'Pack Backpack', 'Read 20 mins'], reminders: ['Tuesday: Library Books'] },
  { id: 2, name: 'Jordan', color: 'border-green-500', headerColor: 'text-green-400', pin: '1234', routines: ['Brush Teeth', 'Pack Backpack', 'Practice Piano'], reminders: ['Soccer Cleats for Practice'] },
  { id: 3, name: 'Taylor', color: 'border-purple-500', headerColor: 'text-purple-400', pin: '1234', routines: ['Brush Teeth', 'Pack Backpack', 'Lay out clothes'], reminders: [] },
  { id: 4, name: 'Casey', color: 'border-orange-500', headerColor: 'text-orange-400', pin: '1234', routines: ['Brush Teeth', 'Pack Backpack', 'Put shoes away'], reminders: [] }
];

const initialChores: Chore[] = [
  { id: 'c1', text: 'Load Dishwasher', type: 'daily', assigneeId: 1, done: false },
  { id: 'c2', text: 'Wipe Counters', type: 'daily', assigneeId: 1, done: false },
  { id: 'c3', text: 'Feed the Dog', type: 'daily', assigneeId: 2, done: false },
  { id: 'c4', text: 'Clear Dinner Table', type: 'daily', assigneeId: 2, done: false },
  { id: 'c5', text: 'Take out Trash', type: 'weekly', assigneeId: 1, done: false },
  { id: 'c6', text: 'Clean Downstairs Bath', type: 'weekly', assigneeId: 2, done: false }
];

type CalendarEvent = { day: string; time: string; title: string; };
const mockCalendar: CalendarEvent[] = [
  { day: 'Mon', time: '3:30 PM', title: 'Dentist - Alex' },
  { day: 'Tue', time: '4:00 PM', title: 'Soccer Practice' },
  { day: 'Wed', time: '5:00 PM', title: 'Piano Lessons' },
  { day: 'Fri', time: '6:30 PM', title: 'Family Movie Night' },
];

// --- COMPONENTS ---
type ProgressRingProps = { progress: number; label: string; colorClass: string; strokeColor: string; onClick: () => void; };

const ProgressRing = ({ progress, label, colorClass, strokeColor, onClick }: ProgressRingProps) => {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center bg-gray-800 p-6 rounded-2xl cursor-pointer hover:bg-gray-750 transition-colors" onClick={onClick}>
      <div className="relative flex items-center justify-center w-40 h-40">
        <svg className="transform -rotate-90 w-40 h-40">
          <circle cx="80" cy="80" r={radius} stroke="currentColor" strokeWidth="12" fill="transparent" className="text-gray-700" />
          <circle
            cx="80" cy="80" r={radius} stroke={strokeColor} strokeWidth="12" fill="transparent"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            className={`transition-all duration-1000 ease-out`} strokeLinecap="round"
          />
        </svg>
        <div className="absolute text-3xl font-bold text-white">{progress}%</div>
      </div>
      <h3 className={`mt-4 text-xl font-semibold ${colorClass}`}>{label}</h3>
      <p className="text-gray-400 text-sm mt-1">Tap to view cards</p>
    </div>
  );
};

export default function App() {
  const [view, setView] = useState<'dashboard' | 'kids' | 'admin-login' | 'admin'>('dashboard');
  const [adminTab, setAdminTab] = useState<'settings' | 'kids' | 'chores'>('settings');
  
  // App State
  const [kids, setKids] = useState<Kid[]>(initialKids);
  const [chores, setChores] = useState<Chore[]>(initialChores);
  const [appSettings, setAppSettings] = useState<AppSettings>({ autoResetDailies: true, lastResetDate: getTodayStr() });
  const [user, setUser] = useState<User | null>(null);
  
  // Modals & Forms
  const [pinModal, setPinModal] = useState<{ isOpen: boolean; kidId: number | null; choreId: string | null; }>({ isOpen: false, kidId: null, choreId: null });
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [pinError, setPinError] = useState<boolean>(false);

  const [enteredAdminPin, setEnteredAdminPin] = useState<string>('');
  const [adminPinError, setAdminPinError] = useState<boolean>(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);

  const [editingKid, setEditingKid] = useState<Kid | null>(null);
  const [newItemText, setNewItemText] = useState({ routine: '', reminder: '' });
  
  const [newAdminChore, setNewAdminChore] = useState({ text: '', type: 'daily' as ChoreType, assigneeId: 1 });

  // --- DATABASE SYNC & MIGRATION ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Connect to your personal Firebase
        await signInAnonymously(auth);
      } catch (error: any) {
        // If Anonymous auth isn't enabled in your console yet, proceed anyway using Test Mode rules
        setUser({ uid: 'local-test-user' } as User);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => { if (u) setUser(u); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const sharedDocRef = doc(db, SHARED_DOC_PATH);
    
    const unsubscribe = onSnapshot(sharedDocRef, (snapshot) => {
      if (snapshot.exists() && snapshot.data().kids) {
        const data = snapshot.data();
        let currentKids = data.kids as any[]; // Using any to handle old structure migration
        let currentChores = data.chores as Chore[];
        let currentSettings = data.settings as AppSettings || { autoResetDailies: true, lastResetDate: getTodayStr() };
        let needsSave = false;
        
        // MIGRATION LOGIC: If old structure (chores inside kids), migrate to master list
        if (!currentChores) {
          currentChores = [];
          const migratedKids: Kid[] = [];
          
          currentKids.forEach(k => {
            if (k.daily) k.daily.forEach((c: any) => currentChores.push({ id: c.id, text: c.text, type: 'daily', assigneeId: k.id, done: c.done }));
            if (k.weekly) k.weekly.forEach((c: any) => currentChores.push({ id: c.id, text: c.text, type: 'weekly', assigneeId: k.id, done: c.done }));
            
            migratedKids.push({
              id: k.id, name: k.name, color: k.color, headerColor: k.headerColor, pin: k.pin,
              routines: k.routines || [], reminders: k.reminders || []
            });
          });
          currentKids = migratedKids;
          needsSave = true;
        }

        // AUTO-RESET LOGIC
        const today = getTodayStr();
        if (currentSettings.autoResetDailies && currentSettings.lastResetDate !== today) {
          currentChores = currentChores.map(c => c.type === 'daily' ? { ...c, done: false } : c);
          currentSettings.lastResetDate = today;
          needsSave = true;
        }

        // Apply to UI state immediately
        setKids(currentKids);
        setChores(currentChores);
        setAppSettings(currentSettings);

        // Update DB silently if we migrated or auto-reset
        if (needsSave) {
          setDoc(sharedDocRef, { kids: currentKids, chores: currentChores, settings: currentSettings }, { merge: true });
        }
      } else {
        // Fresh start
        setDoc(sharedDocRef, { kids: initialKids, chores: initialChores, settings: { autoResetDailies: true, lastResetDate: getTodayStr() } });
      }
    });
    return () => unsubscribe();
  }, [user]);

  // --- CALCULATIONS ---
  const calculateProgress = (type: ChoreType) => {
    const filtered = chores.filter(c => c.type === type);
    if (filtered.length === 0) return 0;
    const done = filtered.filter(c => c.done).length;
    return Math.round((done / filtered.length) * 100);
  };

  const dailyProgress = calculateProgress('daily');
  const weeklyProgress = calculateProgress('weekly');

  const activeReminders = kids.flatMap(kid => 
    kid.reminders.map(rem => ({ 
      kidName: kid.name, 
      color: kid.color.replace('border-', 'bg-').replace('-500', '-500'), // Quick tailwind map
      text: rem 
    }))
  );

  // --- ADMIN SETTINGS HANDLERS ---
  const handleResetDailies = async () => {
    if (!user) return;
    const resetChores = chores.map(c => c.type === 'daily' ? { ...c, done: false } : c);
    setChores(resetChores);
    await setDoc(doc(db, SHARED_DOC_PATH), { chores: resetChores, settings: { ...appSettings, lastResetDate: getTodayStr() } }, { merge: true });
  };

  const toggleAutoReset = async () => {
    const newSettings = { ...appSettings, autoResetDailies: !appSettings.autoResetDailies };
    setAppSettings(newSettings);
    await setDoc(doc(db, SHARED_DOC_PATH), { settings: newSettings }, { merge: true });
  };

  // --- KID EDITOR HANDLERS ---
  const handleSaveKid = async () => {
    if (!editingKid || !user) return;
    const updatedKids = kids.map(k => k.id === editingKid.id ? editingKid : k);
    setKids(updatedKids); // Optimistic UI
    
    // Crucial fix: The modal immediately closes to provide snappy feedback
    setEditingKid(null);
    
    await setDoc(doc(db, SHARED_DOC_PATH), { kids: updatedKids }, { merge: true });
  };

  const handleAddItem = (field: 'routines' | 'reminders') => {
    const text = field === 'routines' ? newItemText.routine : newItemText.reminder;
    if (!text.trim() || !editingKid) return;
    setEditingKid({ ...editingKid, [field]: [...editingKid[field], text.trim()] });
    setNewItemText(prev => ({ ...prev, [field === 'routines' ? 'routine' : 'reminder']: '' }));
  };

  const handleRemoveItem = (field: 'routines' | 'reminders', idx: number) => {
    if (!editingKid) return;
    const newArr = [...editingKid[field]];
    newArr.splice(idx, 1);
    setEditingKid({ ...editingKid, [field]: newArr });
  };

  // --- MASTER CHORE HANDLERS ---
  const handleAdminAddChore = async () => {
    if (!newAdminChore.text.trim() || !user) return;
    const chore: Chore = {
      id: `c-${Date.now()}`,
      text: newAdminChore.text.trim(),
      type: newAdminChore.type,
      assigneeId: Number(newAdminChore.assigneeId),
      done: false
    };
    const updatedChores = [...chores, chore];
    setChores(updatedChores);
    await setDoc(doc(db, SHARED_DOC_PATH), { chores: updatedChores }, { merge: true });
    setNewAdminChore(prev => ({ ...prev, text: '' }));
  };

  const handleAdminDeleteChore = async (id: string) => {
    if (!user) return;
    const updatedChores = chores.filter(c => c.id !== id);
    setChores(updatedChores);
    await setDoc(doc(db, SHARED_DOC_PATH), { chores: updatedChores }, { merge: true });
  };

  // --- PIN & GENERAL HANDLERS ---
  const handleStarPressStart = () => {
    const timer = setTimeout(() => { setView('admin-login'); setEnteredAdminPin(''); setAdminPinError(false); }, 1000); 
    setLongPressTimer(timer);
  };
  const handleStarPressEnd = () => { if (longPressTimer) clearTimeout(longPressTimer); };

  const handleAdminPinPadClick = (num: string) => {
    if (enteredAdminPin.length < 6) {
      const newPin = enteredAdminPin + num;
      setEnteredAdminPin(newPin); setAdminPinError(false);
      if (newPin.length === 6) {
        if (newPin === '112358') { setView('admin'); setEnteredAdminPin(''); setAdminTab('settings'); } 
        else { setAdminPinError(true); setTimeout(() => setEnteredAdminPin(''), 500); }
      }
    }
  };

  const handlePinPadClick = (num: string) => {
    if (enteredPin.length < 4) {
      const newPin = enteredPin + num;
      setEnteredPin(newPin); setPinError(false);
      if (newPin.length === 4) {
        const kid = kids.find(k => k.id === pinModal.kidId);
        if (!kid) return; 
        if (kid.pin === newPin) {
          const updatedChores = chores.map(c => c.id === pinModal.choreId ? { ...c, done: true } : c);
          setChores(updatedChores);
          if (user) { setDoc(doc(db, SHARED_DOC_PATH), { chores: updatedChores }, { merge: true }); }
          setTimeout(() => setPinModal({ isOpen: false, kidId: null, choreId: null }), 300);
        } else {
          setPinError(true); setTimeout(() => setEnteredPin(''), 500);
        }
      }
    }
  };

  // Keyboard support 
  useEffect(() => {
    if (!pinModal.isOpen && view !== 'admin-login') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        if (pinModal.isOpen) handlePinPadClick(e.key);
        else handleAdminPinPadClick(e.key);
      } else if (e.key === 'Escape') {
        if (pinModal.isOpen) setPinModal({ isOpen: false, kidId: null, choreId: null });
        else setView('dashboard');
      } else if (e.key === 'Backspace') {
        if (pinModal.isOpen) { setEnteredPin(prev => prev.slice(0, -1)); setPinError(false); }
        else { setEnteredAdminPin(prev => prev.slice(0, -1)); setAdminPinError(false); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pinModal.isOpen, view, enteredPin, enteredAdminPin]);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 font-sans select-none">
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-100 tracking-wide flex items-center gap-3">
          <div 
            onMouseDown={handleStarPressStart} onMouseUp={handleStarPressEnd} onMouseLeave={handleStarPressEnd}
            onTouchStart={handleStarPressStart} onTouchEnd={handleStarPressEnd}
            className="cursor-pointer hover:scale-110 transition-transform active:scale-95 touch-none" title="Long press for Admin"
          >
            <Star className="text-yellow-500" fill="currentColor" />
          </div>
          Family Command Center
        </h1>
        {(view === 'kids' || view === 'admin') && (
          <button onClick={() => setView('dashboard')} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors font-semibold">
            <ChevronLeft size={20} /> Back to Dashboard
          </button>
        )}
      </div>

      {/* VIEW: DASHBOARD */}
      {view === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[80vh]">
          {/* Calendar */}
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col">
            <h2 className="text-xl font-semibold text-blue-400 flex items-center gap-2 mb-6">
              <Calendar /> This Week
            </h2>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {mockCalendar.map((event, i) => (
                <div key={i} className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                  <div className="text-sm text-blue-300 font-bold mb-1">{event.day} • {event.time}</div>
                  <div className="text-lg">{event.title}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Reminders - Now fueled by kid-specific reminders! */}
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col">
            <h2 className="text-xl font-semibold text-orange-400 flex items-center gap-2 mb-6">
              <AlertCircle /> Don't Forget
            </h2>
            <div className="flex-1 overflow-y-auto space-y-3">
              {activeReminders.length === 0 ? (
                <div className="text-gray-500 italic p-4 text-center">No active reminders.</div>
              ) : (
                activeReminders.map((reminder, i) => (
                  <div key={i} className="flex items-start gap-3 bg-gray-800 p-4 rounded-xl">
                    <div className={`w-3 h-3 rounded-full ${reminder.color} mt-1.5 flex-shrink-0`}></div>
                    <div>
                      <span className="text-xs font-bold text-gray-500 block mb-0.5">{reminder.kidName}</span>
                      <span className="text-lg leading-snug text-gray-200">{reminder.text}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          {/* Progress Rings */}
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col">
            <h2 className="text-xl font-semibold text-green-400 flex items-center gap-2 mb-6">
              <CheckCircle /> Chore Progress
            </h2>
            <div className="flex-1 flex flex-col justify-center gap-8">
              <ProgressRing progress={dailyProgress} label="Daily Chores" colorClass="text-green-400" strokeColor="#4ade80" onClick={() => setView('kids')} />
              <ProgressRing progress={weeklyProgress} label="Weekly Chores" colorClass="text-purple-400" strokeColor="#c084fc" onClick={() => setView('kids')} />
            </div>
          </div>
        </div>
      )}

      {/* VIEW: KID CARDS */}
      {view === 'kids' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 h-[80vh]">
          {kids.map(kid => {
            const kidDaily = chores.filter(c => c.assigneeId === kid.id && c.type === 'daily');
            const kidWeekly = chores.filter(c => c.assigneeId === kid.id && c.type === 'weekly');
            
            return (
              <div key={kid.id} className={`bg-gray-900 border-t-8 ${kid.color} rounded-3xl p-6 shadow-xl flex flex-col h-full`}>
                <h2 className={`text-2xl font-bold ${kid.headerColor} mb-6 border-b border-gray-800 pb-4`}>{kid.name}</h2>
                <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                  {/* Daily Chores */}
                  <div>
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2"><ListTodo size={16} /> Daily To-Do</h3>
                    <div className="space-y-2">
                      {kidDaily.length === 0 && <div className="text-gray-600 italic text-sm">No daily chores assigned.</div>}
                      {kidDaily.map(chore => (
                        <div key={chore.id} onClick={() => { if(!chore.done) { setPinModal({ isOpen: true, kidId: kid.id, choreId: chore.id }); setEnteredPin(''); setPinError(false); } }}
                          className={`p-4 rounded-xl flex items-center justify-between transition-all ${chore.done ? 'bg-gray-800 opacity-50 cursor-default' : 'bg-gray-800 hover:bg-gray-700 cursor-pointer border border-gray-700 hover:border-gray-500'}`}
                        >
                          <span className={`text-lg ${chore.done ? 'line-through text-gray-500' : 'text-gray-100'}`}>{chore.text}</span>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${chore.done ? 'border-green-500 bg-green-500 text-gray-900' : 'border-gray-500'}`}>{chore.done && <CheckCircle size={16} />}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Weekly Chores */}
                  <div>
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2"><ListTodo size={16} /> Weekly Deep Clean</h3>
                    <div className="space-y-2">
                      {kidWeekly.length === 0 && <div className="text-gray-600 italic text-sm">No weekly chores assigned.</div>}
                      {kidWeekly.map(chore => (
                        <div key={chore.id} onClick={() => { if(!chore.done) { setPinModal({ isOpen: true, kidId: kid.id, choreId: chore.id }); setEnteredPin(''); setPinError(false); } }}
                          className={`p-4 rounded-xl flex items-center justify-between transition-all ${chore.done ? 'bg-gray-800 opacity-50 cursor-default' : 'bg-gray-800 hover:bg-gray-700 cursor-pointer border border-gray-700 hover:border-gray-500'}`}
                        >
                          <span className={`text-lg ${chore.done ? 'line-through text-gray-500' : 'text-gray-100'}`}>{chore.text}</span>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${chore.done ? 'border-purple-500 bg-purple-500 text-gray-900' : 'border-gray-500'}`}>{chore.done && <CheckCircle size={16} />}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Routines */}
                  <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-800/50">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Routines (Don't Forget)</h3>
                    {kid.routines.length === 0 ? (
                       <span className="text-gray-600 italic text-sm">No routines set.</span>
                    ) : (
                      <ul className="list-disc list-inside space-y-1 text-gray-400">
                        {kid.routines.map((routine, idx) => <li key={idx}>{routine}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW: ADMIN LOGIN */}
      {view === 'admin-login' && (
        <div className="flex flex-col items-center justify-center h-[70vh]">
          <div className="bg-gray-900 border border-gray-700 rounded-3xl p-8 shadow-2xl max-w-sm w-full mx-4">
            <div className="text-center mb-6"><Settings className="mx-auto text-blue-400 mb-2" size={32} /><h2 className="text-2xl font-bold text-white">Parent Access</h2><p className="text-gray-400 mt-1">Enter Master PIN</p></div>
            <div className={`flex justify-center gap-3 mb-8 ${adminPinError ? 'animate-bounce' : ''}`}>
              {[0, 1, 2, 3, 4, 5].map(i => (<div key={i} className={`w-4 h-4 rounded-full transition-all ${i < enteredAdminPin.length ? 'bg-blue-500 scale-110' : 'bg-gray-700'} ${adminPinError ? 'bg-red-500' : ''}`} />))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (<button key={num} onClick={() => handleAdminPinPadClick(num.toString())} className="bg-gray-800 hover:bg-gray-700 text-2xl font-bold text-white py-4 rounded-2xl transition-colors active:scale-95">{num}</button>))}
              <div className="col-span-1"></div>
              <button onClick={() => handleAdminPinPadClick('0')} className="bg-gray-800 hover:bg-gray-700 text-2xl font-bold text-white py-4 rounded-2xl transition-colors active:scale-95">0</button>
              <button onClick={() => setView('dashboard')} className="text-gray-400 hover:text-white font-semibold py-4 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: ADMIN DASHBOARD */}
      {view === 'admin' && (
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-xl h-[80vh] flex flex-col">
          
          {/* Admin Navigation */}
          <div className="flex items-center gap-6 border-b border-gray-800 pb-4 mb-6">
            <h2 className="text-2xl font-semibold text-blue-400 flex items-center gap-2 border-r border-gray-800 pr-6"><Settings /> Admin</h2>
            <button onClick={() => setAdminTab('settings')} className={`font-bold transition-colors ${adminTab === 'settings' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}>Settings</button>
            <button onClick={() => setAdminTab('kids')} className={`font-bold transition-colors ${adminTab === 'kids' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}>Manage Kids</button>
            <button onClick={() => setAdminTab('chores')} className={`font-bold transition-colors ${adminTab === 'chores' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}>Master Chore List</button>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            
            {/* TAB: SETTINGS */}
            {adminTab === 'settings' && (
              <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><RotateCcw className="text-orange-400" /> Daily Resets</h3>
                <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                  <div className="flex items-center justify-between bg-gray-900 p-4 rounded-xl border border-gray-700 w-full md:w-1/2">
                    <div>
                      <span className="font-bold text-white block">Auto-Reset Dailies</span>
                      <span className="text-gray-500 text-sm">Uncheck all daily chores at midnight</span>
                    </div>
                    <button 
                      onClick={toggleAutoReset}
                      className={`w-14 h-8 rounded-full transition-colors relative ${appSettings.autoResetDailies ? 'bg-green-500' : 'bg-gray-600'}`}
                    >
                      <div className={`w-6 h-6 bg-white rounded-full absolute top-1 transition-transform ${appSettings.autoResetDailies ? 'translate-x-7' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <button onClick={handleResetDailies} className="bg-gray-900 hover:bg-gray-700 border border-gray-700 text-orange-400 px-6 py-4 rounded-xl font-bold flex items-center gap-2 transition-colors w-full md:w-auto justify-center">
                    <RotateCcw size={20} /> Force Reset Now
                  </button>
                </div>
              </div>
            )}

            {/* TAB: KIDS */}
            {adminTab === 'kids' && (
              <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Users className="text-green-400" /> Edit Profiles & Routines</h3>
                <div className="grid grid-cols-1 gap-4">
                  {kids.map(kid => (
                    <div key={kid.id} className="bg-gray-900 p-4 rounded-xl border border-gray-700 flex justify-between items-center">
                      <div>
                        <span className={`font-bold ${kid.headerColor}`}>{kid.name}</span>
                        <span className="text-gray-500 text-sm ml-3 border-l border-gray-700 pl-3">PIN: {kid.pin}</span>
                        <div className="text-xs text-gray-500 mt-1">{kid.routines.length} Routines | {kid.reminders.length} Reminders</div>
                      </div>
                      <button onClick={() => setEditingKid(kid)} className="bg-gray-800 hover:bg-gray-700 text-blue-400 p-3 rounded-lg transition-colors"><Edit3 size={18} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: CHORES MASTER LIST */}
            {adminTab === 'chores' && (
              <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 flex flex-col h-full">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><CheckSquare className="text-purple-400" /> Master Chore List</h3>
                
                {/* Add New Chore */}
                <div className="flex flex-col md:flex-row gap-3 bg-gray-900 p-4 rounded-xl border border-gray-700 mb-6">
                  <input 
                    type="text" placeholder="e.g. Empty Dishwasher" value={newAdminChore.text}
                    onChange={e => setNewAdminChore({...newAdminChore, text: e.target.value})}
                    onKeyDown={e => e.key === 'Enter' && handleAdminAddChore()}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
                  />
                  <select 
                    value={newAdminChore.assigneeId} 
                    onChange={e => setNewAdminChore({...newAdminChore, assigneeId: Number(e.target.value)})}
                    className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none"
                  >
                    {kids.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                  <select 
                    value={newAdminChore.type} 
                    onChange={e => setNewAdminChore({...newAdminChore, type: e.target.value as ChoreType})}
                    className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                  <button onClick={handleAdminAddChore} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-bold flex items-center justify-center"><Plus size={20}/></button>
                </div>

                {/* List of Chores */}
                <div className="space-y-2 overflow-y-auto pr-2">
                  {chores.length === 0 && <div className="text-center text-gray-500 py-4">No chores set yet. Add one above!</div>}
                  {chores.map(chore => {
                    const assignedKid = kids.find(k => k.id === chore.assigneeId);
                    return (
                      <div key={chore.id} className="flex justify-between items-center bg-gray-900 p-4 rounded-xl border border-gray-700">
                        <div className="flex items-center gap-4">
                          <div className={`w-2 h-2 rounded-full ${chore.type === 'daily' ? 'bg-green-500' : 'bg-purple-500'}`} title={chore.type}></div>
                          <span className="text-gray-100 font-semibold">{chore.text}</span>
                          <span className={`text-xs px-2 py-1 rounded-md bg-gray-800 border ${assignedKid?.color || 'border-gray-600'} ${assignedKid?.headerColor || 'text-gray-400'}`}>
                            {assignedKid?.name || 'Unknown'}
                          </span>
                        </div>
                        <button onClick={() => handleAdminDeleteChore(chore.id)} className="text-red-400 hover:text-red-300 p-2 bg-gray-800 rounded-lg transition-colors"><X size={18} /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* MODAL: EDIT KID */}
      {editingKid && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-3xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh]">
            
            <div className="p-6 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2"><Edit3 className="text-blue-400"/> Edit {editingKid.name}</h2>
              <button onClick={() => setEditingKid(null)} className="text-gray-400 hover:text-white"><X size={24} /></button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Profile Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">Display Name</label>
                  <input 
                    type="text" value={editingKid.name} 
                    onChange={e => setEditingKid({...editingKid, name: e.target.value})}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">4-Digit Verification PIN</label>
                  <input 
                    type="text" maxLength={4} value={editingKid.pin} 
                    onChange={e => setEditingKid({...editingKid, pin: e.target.value.replace(/[^0-9]/g, '')})}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Routines Editor */}
              <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                <h3 className="font-bold text-white mb-3 flex items-center gap-2">Personal Routines</h3>
                <p className="text-gray-400 text-sm mb-4">These show up at the bottom of their card so they don't forget the basics.</p>
                <div className="space-y-2 mb-4">
                  {editingKid.routines.map((routine, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-gray-900 p-3 rounded-lg border border-gray-700">
                      <span className="text-gray-200">{routine}</span>
                      <button onClick={() => handleRemoveItem('routines', idx)} className="text-red-400 hover:text-red-300 p-1"><X size={18} /></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" placeholder="e.g. Pack Lunchbox" value={newItemText.routine}
                    onChange={e => setNewItemText({...newItemText, routine: e.target.value})}
                    onKeyDown={e => e.key === 'Enter' && handleAddItem('routines')}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-500"
                  />
                  <button onClick={() => handleAddItem('routines')} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold flex items-center"><Plus size={20}/></button>
                </div>
              </div>

              {/* Reminders Editor */}
              <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                <h3 className="font-bold text-white mb-3 flex items-center gap-2">Dashboard Reminders</h3>
                <p className="text-gray-400 text-sm mb-4">These will show up on the main Dashboard for the whole family to see.</p>
                <div className="space-y-2 mb-4">
                  {editingKid.reminders.map((reminder, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-gray-900 p-3 rounded-lg border border-gray-700">
                      <span className="text-gray-200">{reminder}</span>
                      <button onClick={() => handleRemoveItem('reminders', idx)} className="text-red-400 hover:text-red-300 p-1"><X size={18} /></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" placeholder="e.g. Tuesday: Bring Cello" value={newItemText.reminder}
                    onChange={e => setNewItemText({...newItemText, reminder: e.target.value})}
                    onKeyDown={e => e.key === 'Enter' && handleAddItem('reminders')}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-500"
                  />
                  <button onClick={() => handleAddItem('reminders')} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold flex items-center"><Plus size={20}/></button>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-800 bg-gray-900 rounded-b-3xl flex justify-end gap-3">
              <button onClick={() => setEditingKid(null)} className="px-6 py-3 rounded-xl font-bold text-gray-300 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSaveKid} className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl font-bold text-white flex items-center gap-2 transition-colors"><Save size={20}/> Save</button>
            </div>

          </div>
        </div>
      )}

      {/* PIN MODAL */}
      {pinModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-3xl p-8 shadow-2xl max-w-sm w-full mx-4">
            <div className="text-center mb-6"><Lock className="mx-auto text-blue-400 mb-2" size={32} /><h2 className="text-2xl font-bold text-white">Enter PIN</h2><p className="text-gray-400 mt-1">{kids.find(k => k.id === pinModal.kidId)?.name}'s chore</p></div>
            <div className={`flex justify-center gap-4 mb-8 ${pinError ? 'animate-bounce' : ''}`}>
              {[0, 1, 2, 3].map(i => (<div key={i} className={`w-4 h-4 rounded-full transition-all ${i < enteredPin.length ? 'bg-blue-500 scale-110' : 'bg-gray-700'} ${pinError ? 'bg-red-500' : ''}`} />))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (<button key={num} onClick={() => handlePinPadClick(num.toString())} className="bg-gray-800 hover:bg-gray-700 text-2xl font-bold text-white py-4 rounded-2xl transition-colors active:scale-95">{num}</button>))}
              <div className="col-span-1"></div>
              <button onClick={() => handlePinPadClick('0')} className="bg-gray-800 hover:bg-gray-700 text-2xl font-bold text-white py-4 rounded-2xl transition-colors active:scale-95">0</button>
              <button onClick={() => setPinModal({ isOpen: false, kidId: null, choreId: null })} className="text-gray-400 hover:text-white font-semibold py-4 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
