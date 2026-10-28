import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle, ListTodo, ChevronLeft, Lock, Star, AlertCircle, Settings, Users, RotateCcw, X, Plus, Edit3, Save, CheckSquare, CloudSun, ArrowUp, ArrowDown, LayoutDashboard, ChevronUp, ChevronDown } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const SHARED_DOC_PATH = 'commandCenter/familyData';

// --- HELPER ---
const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const DAYS_OF_WEEK = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'];

const WIDGET_TITLES: Record<string, string> = {
  'calendar': 'Weekly Calendar',
  'reminders': 'Today (Weather & Reminders)',
  'chores': 'Individual Chore Progress'
};

// --- TYPES ---
type ChoreType = 'daily' | 'weekly';

type Chore = {
  id: string;
  text: string;
  type: ChoreType;
  assigneeIds: number[]; 
  completedBy: number[]; 
};

type Reminder = {
  id: string;
  text: string;
  days: number[]; 
  showAM: boolean;
  showPM: boolean;
};

type Kid = {
  id: number;
  name: string;
  color: string;
  headerColor: string;
  pin: string;
  routines: string[];
  reminders: Reminder[]; 
};

type AppSettings = {
  autoResetDailies: boolean;
  lastResetDate: string;
  zipCode: string; 
  dashboardLayout: string[];
  icalUrl?: string;
};

type CalendarEvent = {
  day: string;
  time: string;
  title: string;
};

// --- DEFAULT DATA ---
const initialKids: Kid[] = [
  { id: 1, name: 'Alex', color: 'border-blue-500', headerColor: 'text-blue-400', pin: '1234', routines: ['Brush Teeth', 'Pack Backpack'], reminders: [{ id: 'r1', text: 'Library Books', days: [2], showAM: true, showPM: true }] },
  { id: 2, name: 'Jordan', color: 'border-green-500', headerColor: 'text-green-400', pin: '1234', routines: ['Brush Teeth', 'Practice Piano'], reminders: [{ id: 'r2', text: 'Soccer Cleats for Practice', days: [2, 4], showAM: false, showPM: true }] },
  { id: 3, name: 'Taylor', color: 'border-purple-500', headerColor: 'text-purple-400', pin: '1234', routines: ['Brush Teeth', 'Lay out clothes'], reminders: [] },
  { id: 4, name: 'Casey', color: 'border-orange-500', headerColor: 'text-orange-400', pin: '1234', routines: ['Brush Teeth', 'Put shoes away'], reminders: [] }
];

const initialChores: Chore[] = [
  { id: 'c1', text: 'Load Dishwasher', type: 'daily', assigneeIds: [1], completedBy: [] },
  { id: 'c2', text: 'Wipe Counters', type: 'daily', assigneeIds: [1], completedBy: [] },
  { id: 'c3', text: 'Feed the Dog', type: 'daily', assigneeIds: [2, 3], completedBy: [] }, 
  { id: 'c4', text: 'Clear Dinner Table', type: 'daily', assigneeIds: [2], completedBy: [] },
  { id: 'c5', text: 'Take out Trash', type: 'weekly', assigneeIds: [1], completedBy: [] },
  { id: 'c6', text: 'Clean Downstairs Bath', type: 'weekly', assigneeIds: [2], completedBy: [] }
];

const mockCalendar = [
  { day: 'Mon', time: '3:30 PM', title: 'Dentist - Alex' },
  { day: 'Tue', time: '4:00 PM', title: 'Soccer Practice' },
  { day: 'Wed', time: '5:00 PM', title: 'Piano Lessons' },
  { day: 'Fri', time: '6:30 PM', title: 'Family Movie Night' },
];

const initialGlobalReminders: Reminder[] = [
  { id: 'gr1', text: 'Take out Trash Bins', days: [3], showAM: true, showPM: true } 
];

// --- ICAL PARSER HELPER ---
const fetchIcalData = async (url: string) => {
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];

  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy);
      if (res.ok) {
        const text = await res.text();
        if (text.includes('BEGIN:VCALENDAR')) {
          return text;
        }
      }
    } catch (e) {
      console.warn(`Proxy fetch failed for ${proxy}`);
    }
  }
  throw new Error("Failed to fetch calendar data via all proxies.");
};

const parseIcsDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10) - 1;
  const day = parseInt(dateStr.substring(6, 8), 10);
  if (dateStr.length > 8) {
    const hour = parseInt(dateStr.substring(9, 11), 10);
    const min = parseInt(dateStr.substring(11, 13), 10);
    const sec = parseInt(dateStr.substring(13, 15), 10);
    if (dateStr.endsWith('Z')) return new Date(Date.UTC(year, month, day, hour, min, sec));
    return new Date(year, month, day, hour, min, sec);
  }
  return new Date(year, month, day);
};

const parseICS = (icsString: string) => {
  const lines = icsString.split(/\r?\n/);
  const events: any[] = [];
  let event: any = null;

  const unfoldedLines = [];
  for(let i=0; i<lines.length; i++) {
    if(lines[i].startsWith(' ') || lines[i].startsWith('\t')) {
       if(unfoldedLines.length > 0) unfoldedLines[unfoldedLines.length-1] += lines[i].substring(1);
    } else {
       unfoldedLines.push(lines[i]);
    }
  }

  for (const line of unfoldedLines) {
    if (line.startsWith('BEGIN:VEVENT')) { event = {}; } 
    else if (line.startsWith('END:VEVENT')) {
      if (event && event.start) events.push(event);
      event = null;
    } else if (event) {
      if (line.startsWith('SUMMARY:')) event.title = line.substring(8);
      else if (line.startsWith('DTSTART')) {
         const dateStr = line.substring(line.indexOf(':') + 1);
         event.start = parseIcsDate(dateStr);
         event.isAllDay = dateStr.length <= 8;
      }
      else if (line.startsWith('DTEND')) {
         const dateStr = line.substring(line.indexOf(':') + 1);
         event.end = parseIcsDate(dateStr);
      }
      else if (line.startsWith('RRULE:')) event.rrule = line.substring(6);
    }
  }

  const realNow = new Date();
  const nextWeek = new Date(realNow.getTime() + 7 * 24 * 60 * 60 * 1000);
  const expandedEvents: any[] = [];
  const dayMap: Record<string, number> = { 'SU': 0, 'MO': 1, 'TU': 2, 'WE': 3, 'TH': 4, 'FR': 5, 'SA': 6 };

  events.forEach(ev => {
     const duration = ev.end ? ev.end.getTime() - ev.start.getTime() : (ev.isAllDay ? 24*60*60*1000 : 60*60*1000);

     if (!ev.rrule) {
        const evEnd = new Date(ev.start.getTime() + duration);
        if (evEnd > realNow && ev.start <= nextWeek) expandedEvents.push(ev);
        return;
     }

     if (ev.rrule.includes('FREQ=DAILY')) {
        let d = new Date(ev.start);
        if (d < realNow) {
           const daysDiff = Math.floor((realNow.getTime() - d.getTime()) / (24*60*60*1000));
           d.setDate(d.getDate() + daysDiff);
        }
        while (d <= nextWeek) {
            const recEnd = new Date(d.getTime() + duration);
            if (recEnd > realNow) expandedEvents.push({ ...ev, start: new Date(d) });
            d.setDate(d.getDate() + 1);
        }
     } else if (ev.rrule.includes('FREQ=WEEKLY')) {
        if (ev.rrule.includes('BYDAY=')) {
           const match = ev.rrule.match(/BYDAY=([^;]+)/);
           if (match) {
             const days = match[1].split(',').map((d: string) => dayMap[d.replace(/[^A-Z]/g, '')]);
             let d = new Date(ev.start);
             if (d < realNow) {
                 const daysDiff = Math.floor((realNow.getTime() - d.getTime()) / (24*60*60*1000));
                 d.setDate(d.getDate() + Math.max(0, daysDiff - 7));
             }
             while (d <= nextWeek) {
                if (days.includes(d.getDay())) {
                   const recEnd = new Date(d.getTime() + duration);
                   if (recEnd > realNow) expandedEvents.push({ ...ev, start: new Date(d) });
                }
                d.setDate(d.getDate() + 1);
             }
           }
        } else {
           let d = new Date(ev.start);
           while (d <= nextWeek) {
              const recEnd = new Date(d.getTime() + duration);
              if (recEnd > realNow && d >= new Date(realNow.getTime() - 7*24*60*60*1000)) expandedEvents.push({ ...ev, start: new Date(d) });
              d.setDate(d.getDate() + 7);
           }
        }
     } else if (ev.rrule.includes('FREQ=MONTHLY')) {
        let d = new Date(ev.start);
        while (d <= nextWeek) {
           const recEnd = new Date(d.getTime() + duration);
           if (recEnd > realNow && d >= new Date(realNow.getTime() - 31*24*60*60*1000)) expandedEvents.push({ ...ev, start: new Date(d) });
           d.setMonth(d.getMonth() + 1);
        }
     }
  });

  const finalEvents = expandedEvents.filter(ev => {
     const evEnd = new Date(ev.start.getTime() + (ev.end ? ev.end.getTime() - ev.start.getTime() : (ev.isAllDay ? 24*60*60*1000 : 60*60*1000)));
     return evEnd > realNow && ev.start <= nextWeek;
  });

  finalEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
  
  return finalEvents.slice(0, 8).map(ev => {
     let day = DAYS_OF_WEEK[ev.start.getDay()];
     if (ev.start.toDateString() === realNow.toDateString()) {
        day = 'Today';
     } else if (ev.start.toDateString() === new Date(realNow.getTime() + 24*60*60*1000).toDateString()) {
        day = 'Tmw';
     }
     const time = ev.isAllDay ? 'All Day' : ev.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
     return { day, time, title: ev.title };
  });
};

// --- COMPONENTS ---
const SmallProgressRing = ({ progress, kidName, colorClass, onClick }: { progress: number, kidName: string, colorClass: string, onClick: (e: React.MouseEvent) => void }) => {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center cursor-pointer hover:scale-105 transition-transform" onClick={onClick}>
      <div className="relative flex items-center justify-center w-20 h-20 mb-2">
        <svg className="transform -rotate-90 w-20 h-20">
          <circle cx="40" cy="40" r={radius} stroke="currentColor" strokeWidth="6" fill="transparent" className="text-gray-700" />
          <circle cx="40" cy="40" r={radius} stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className={`transition-all duration-1000 ease-out ${colorClass}`} strokeLinecap="round" />
        </svg>
        <div className="absolute text-base font-bold text-white">{progress}%</div>
      </div>
      <span className={`text-xs font-bold uppercase tracking-wider ${colorClass}`}>{kidName}</span>
    </div>
  );
};

const WeatherRing = ({ weather }: { weather: {current: number, high: number, low: number} | null }) => {
  if (!weather) return (
    <div className="flex items-center justify-center bg-gray-800 rounded-2xl p-4 h-[82px]">
      <CloudSun className="text-gray-500 animate-pulse" />
      <span className="text-gray-500 text-sm ml-3 font-semibold">Loading Weather...</span>
    </div>
  );

  const progress = Math.max(0, Math.min(100, weather.current)); 
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex items-center justify-between bg-gray-800 rounded-2xl px-6 py-3">
       <div className="flex items-center gap-5">
           <div className="relative flex items-center justify-center w-14 h-14">
              <svg className="transform -rotate-90 w-14 h-14">
                <circle cx="28" cy="28" r={radius} stroke="currentColor" strokeWidth="4" fill="transparent" className="text-gray-700" />
                <circle cx="28" cy="28" r={radius} stroke="#fbbf24" strokeWidth="4" fill="transparent"
                  strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round" className="transition-all duration-1000" />
              </svg>
              <div className="absolute text-sm font-bold text-white">{weather.current}°</div>
           </div>
           <div className="flex flex-col">
              <span className="font-bold text-white tracking-wide">Outside</span>
              <div className="flex gap-3 mt-1">
                  <div className="text-xs font-bold text-red-400 flex items-center"><ArrowUp size={12}/> {weather.high}°</div>
                  <div className="text-xs font-bold text-blue-400 flex items-center"><ArrowDown size={12}/> {weather.low}°</div>
              </div>
           </div>
       </div>
       <CloudSun className="text-gray-600" size={28}/>
    </div>
  );
};

export default function App() {
  const [view, setView] = useState<'dashboard' | 'kid' | 'admin-login' | 'admin'>('dashboard');
  const [activeKidId, setActiveKidId] = useState<number | null>(null);
  const [adminTab, setAdminTab] = useState<'settings' | 'kids' | 'chores' | 'layout'>('settings');
  
  // App State
  const [kids, setKids] = useState<Kid[]>(initialKids);
  const [chores, setChores] = useState<Chore[]>(initialChores);
  const [globalReminders, setGlobalReminders] = useState<Reminder[]>(initialGlobalReminders);
  const [appSettings, setAppSettings] = useState<AppSettings>({ 
    autoResetDailies: true, lastResetDate: getTodayStr(), zipCode: '', dashboardLayout: ['calendar', 'reminders', 'chores'] 
  });
  const [user, setUser] = useState<User | null>(null);
  const [weather, setWeather] = useState<{current: number, high: number, low: number} | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(mockCalendar);
  
  // Input States
  const [weatherInput, setWeatherInput] = useState<string>('');
  const [weatherStatus, setWeatherStatus] = useState<string>('');
  const [icalInput, setIcalInput] = useState<string>('');
  const [calendarStatus, setCalendarStatus] = useState<string>('');

  // Modals & Forms
  const [pinModal, setPinModal] = useState<{ isOpen: boolean; kidId: number | null; }>({ isOpen: false, kidId: null });
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [pinError, setPinError] = useState<boolean>(false);

  const [enteredAdminPin, setEnteredAdminPin] = useState<string>('');
  const [adminPinError, setAdminPinError] = useState<boolean>(false);
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const [editingKid, setEditingKid] = useState<Kid | null>(null);
  const [newItemText, setNewItemText] = useState({ routine: '', reminder: '' });
  const [newAdminChore, setNewAdminChore] = useState({ text: '', type: 'daily' as ChoreType });
  const [newGlobalReminder, setNewGlobalReminder] = useState<string>('');
  const [editingChoreId, setEditingChoreId] = useState<string | null>(null);

  // --- DATABASE SYNC ---
  useEffect(() => {
    const initAuth = async () => {
      try { await signInAnonymously(auth); } 
      catch (error: any) { setUser({ uid: 'local-test-user' } as User); }
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
        let currentKids = data.kids as Kid[]; 
        let currentChores = data.chores as Chore[];
        let currentGlobalReminders = data.globalReminders as Reminder[] || [];
        let currentSettings = data.settings as AppSettings || { autoResetDailies: true, lastResetDate: getTodayStr(), zipCode: '', dashboardLayout: ['calendar', 'reminders', 'chores'] };
        let needsSave = false;

        if (!currentSettings.dashboardLayout) { currentSettings.dashboardLayout = ['calendar', 'reminders', 'chores']; needsSave = true; }
        if (currentSettings.zipCode === undefined) { currentSettings.zipCode = ''; needsSave = true; }

        // Migration: Ensure all reminders have AM/PM toggles set to true if undefined
        currentKids = currentKids.map(k => {
          let updated = { ...k };
          if (updated.reminders) {
             updated.reminders = updated.reminders.map((r: any) => {
                let updatedRem = { ...r };
                if (updatedRem.showAM === undefined) { updatedRem.showAM = true; needsSave = true; }
                if (updatedRem.showPM === undefined) { updatedRem.showPM = true; needsSave = true; }
                return updatedRem;
             });
          }
          return updated;
        });

        currentGlobalReminders = currentGlobalReminders.map((r: any) => {
           let updatedRem = { ...r };
           if (updatedRem.showAM === undefined) { updatedRem.showAM = true; needsSave = true; }
           if (updatedRem.showPM === undefined) { updatedRem.showPM = true; needsSave = true; }
           return updatedRem;
        });

        const today = getTodayStr();
        if (currentSettings.autoResetDailies && currentSettings.lastResetDate !== today) {
          currentChores = currentChores.map(c => c.type === 'daily' ? { ...c, completedBy: [] } : c);
          currentSettings.lastResetDate = today;
          needsSave = true;
        }

        setKids(currentKids);
        setChores(currentChores);
        setGlobalReminders(currentGlobalReminders);
        setAppSettings(currentSettings);
        setWeatherInput(currentSettings.zipCode); 
        if (currentSettings.icalUrl) setIcalInput(currentSettings.icalUrl);

        if (needsSave) { setDoc(sharedDocRef, { kids: currentKids, chores: currentChores, globalReminders: currentGlobalReminders, settings: currentSettings }, { merge: true }); }
      } else {
        setDoc(sharedDocRef, { kids: initialKids, chores: initialChores, globalReminders: initialGlobalReminders, settings: { autoResetDailies: true, lastResetDate: getTodayStr(), zipCode: '', dashboardLayout: ['calendar', 'reminders', 'chores'] } });
      }
    });
    return () => unsubscribe();
  }, [user]);

  // --- WEATHER FETCH ---
  useEffect(() => {
    if(!appSettings.zipCode) {
      setWeather(null);
      return;
    }
    const fetchWeather = async () => {
       try {
          const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(appSettings.zipCode)}&count=1`);
          const geoData = await geoRes.json();
          if(geoData.results && geoData.results.length > 0) {
             const { latitude, longitude } = geoData.results[0];
             const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min&current_weather=true&temperature_unit=fahrenheit&timezone=auto`);
             const wData = await wRes.json();
             setWeather({
                current: Math.round(wData.current_weather.temperature),
                high: Math.round(wData.daily.temperature_2m_max[0]),
                low: Math.round(wData.daily.temperature_2m_min[0])
             });
          }
       } catch(e) { console.error("Weather fetch failed:", e); }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [appSettings.zipCode]);

  // --- CALENDAR FETCH ---
  useEffect(() => {
    if (!appSettings.icalUrl) {
      setCalendarEvents(mockCalendar);
      return;
    }
    const fetchCal = async () => {
      try {
        let safeUrl = appSettings.icalUrl!;
        if (safeUrl.startsWith('webcal://')) safeUrl = safeUrl.replace('webcal://', 'https://');
        
        const contents = await fetchIcalData(safeUrl);
        const events = parseICS(contents);
        setCalendarEvents(events);
      } catch (e) {
        console.error("Calendar fetch error:", e);
      }
    };
    fetchCal();
    const interval = setInterval(fetchCal, 15 * 60 * 1000); 
    return () => clearInterval(interval);
  }, [appSettings.icalUrl]);

  // --- CALCULATIONS ---
  const calculateKidProgress = (kidId: number, type: ChoreType) => {
    const assigned = chores.filter(c => c.assigneeIds.includes(kidId) && c.type === type);
    if (assigned.length === 0) return 0;
    const done = assigned.filter(c => c.completedBy.includes(kidId)).length;
    return Math.round((done / assigned.length) * 100);
  };

  const calculateOverallProgress = (type: ChoreType) => {
    let totalAssignments = 0;
    let totalDone = 0;
    chores.filter(c => c.type === type).forEach(c => {
      totalAssignments += c.assigneeIds.length;
      totalDone += c.completedBy.length;
    });
    return totalAssignments === 0 ? 0 : Math.round((totalDone / totalAssignments) * 100);
  };

  const todayDayIndex = new Date().getDay(); 
  const isCurrentlyAM = new Date().getHours() < 12;
  
  const activeKidReminders = kids.flatMap(kid => 
    kid.reminders
      .filter(rem => rem.days.includes(todayDayIndex))
      .filter(rem => (isCurrentlyAM && rem.showAM) || (!isCurrentlyAM && rem.showPM))
      .map(rem => ({ 
        kidName: kid.name, color: kid.color.replace('border-', 'bg-').replace('-500', '-500'), text: rem.text 
      }))
  );
  
  const activeGlobalReminders = globalReminders
    .filter(rem => rem.days.includes(todayDayIndex))
    .filter(rem => (isCurrentlyAM && rem.showAM) || (!isCurrentlyAM && rem.showPM))
    .map(rem => ({
      kidName: 'Family', color: 'bg-indigo-500', text: rem.text
    }));
    
  const activeReminders = [...activeGlobalReminders, ...activeKidReminders];

  // --- KID DASHBOARD HANDLERS ---
  const toggleKidChore = async (choreId: string, kidId: number) => {
    const updatedChores = chores.map(c => {
      if (c.id === choreId) {
        const isDone = c.completedBy.includes(kidId);
        const newCompleted = isDone ? c.completedBy.filter(id => id !== kidId) : [...c.completedBy, kidId];
        return { ...c, completedBy: newCompleted };
      }
      return c;
    });
    setChores(updatedChores);
    if (user) await setDoc(doc(db, SHARED_DOC_PATH), { chores: updatedChores }, { merge: true });
  };

  // --- ADMIN SETTINGS HANDLERS ---
  const handleResetDailies = async () => {
    if (!user) return;
    const resetChores = chores.map(c => c.type === 'daily' ? { ...c, completedBy: [] } : c);
    setChores(resetChores);
    await setDoc(doc(db, SHARED_DOC_PATH), { chores: resetChores, settings: { ...appSettings, lastResetDate: getTodayStr() } }, { merge: true });
  };

  const toggleAutoReset = async () => {
    const newSettings = { ...appSettings, autoResetDailies: !appSettings.autoResetDailies };
    setAppSettings(newSettings);
    await setDoc(doc(db, SHARED_DOC_PATH), { settings: newSettings }, { merge: true });
  };

  const handleSaveWeatherSetting = async () => {
    if (!user) return;
    setWeatherStatus('Checking city...');
    try {
       if (!weatherInput.trim()) {
         const newSettings = { ...appSettings, zipCode: '' };
         setAppSettings(newSettings);
         await setDoc(doc(db, SHARED_DOC_PATH), { settings: newSettings }, { merge: true });
         setWeatherStatus('Weather disabled.');
         setTimeout(() => setWeatherStatus(''), 3000);
         return;
       }

       const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(weatherInput)}&count=1`);
       const geoData = await geoRes.json();
       
       if(geoData.results && geoData.results.length > 0) {
         const foundCity = `${geoData.results[0].name}, ${geoData.results[0].admin1 || geoData.results[0].country}`;
         setWeatherStatus(`✅ Found: ${foundCity}`);
         const newSettings = { ...appSettings, zipCode: weatherInput.trim() };
         setAppSettings(newSettings);
         await setDoc(doc(db, SHARED_DOC_PATH), { settings: newSettings }, { merge: true });
         setTimeout(() => setWeatherStatus(''), 4000);
       } else {
         setWeatherStatus('❌ City not found. Please try again.');
       }
    } catch(e) {
       setWeatherStatus('❌ Error reaching weather service.');
    }
  };

  const handleSaveCalendarSettings = async () => {
    if (!user) return;
    setCalendarStatus('Syncing...');
    
    let cleanUrl = icalInput.trim();
    
    if (!cleanUrl) {
       const newSettings = { ...appSettings, icalUrl: '' };
       setAppSettings(newSettings);
       await setDoc(doc(db, SHARED_DOC_PATH), { settings: newSettings }, { merge: true });
       setCalendarStatus('Calendar disconnected. Showing sample data.');
       setTimeout(() => setCalendarStatus(''), 3000);
       return;
    }
    
    if (cleanUrl.startsWith('webcal://')) {
       cleanUrl = cleanUrl.replace('webcal://', 'https://');
       setIcalInput(cleanUrl); 
    }

    try {
       const contents = await fetchIcalData(cleanUrl);
       
       if (contents && contents.includes('BEGIN:VCALENDAR')) {
           setCalendarStatus('✅ Connected Successfully!');
           const newSettings = { ...appSettings, icalUrl: cleanUrl };
           setAppSettings(newSettings);
           await setDoc(doc(db, SHARED_DOC_PATH), { settings: newSettings }, { merge: true });
           setTimeout(() => setCalendarStatus(''), 4000);
       } else {
           setCalendarStatus('❌ Invalid link. Make sure it is public and ends in .ics');
       }
    } catch (e) {
       console.error("Calendar Sync Error: ", e);
       setCalendarStatus('❌ Network error. Check link or disable adblockers.');
    }
  };

  const moveWidget = async (idx: number, direction: number) => {
    const newLayout = [...appSettings.dashboardLayout];
    if (idx + direction < 0 || idx + direction >= newLayout.length) return;
    const temp = newLayout[idx];
    newLayout[idx] = newLayout[idx + direction];
    newLayout[idx + direction] = temp;
    setAppSettings({ ...appSettings, dashboardLayout: newLayout });
    await setDoc(doc(db, SHARED_DOC_PATH), { settings: { ...appSettings, dashboardLayout: newLayout } }, { merge: true });
  };

  // --- KID EDITOR HANDLERS ---
  const handleSaveKid = async () => {
    if (!editingKid || !user) return;
    const updatedKids = kids.map(k => k.id === editingKid.id ? editingKid : k);
    setKids(updatedKids); 
    setEditingKid(null);
    await setDoc(doc(db, SHARED_DOC_PATH), { kids: updatedKids }, { merge: true });
  };

  const handleAddRoutine = () => {
    if (!newItemText.routine.trim() || !editingKid) return;
    setEditingKid({ ...editingKid, routines: [...editingKid.routines, newItemText.routine.trim()] });
    setNewItemText(prev => ({ ...prev, routine: '' }));
  };

  const handleAddReminder = () => {
    if (!newItemText.reminder.trim() || !editingKid) return;
    const newReminder: Reminder = { id: `rem-${Date.now()}`, text: newItemText.reminder.trim(), days: [1,2,3,4,5], showAM: true, showPM: true }; 
    setEditingKid({ ...editingKid, reminders: [...editingKid.reminders, newReminder] });
    setNewItemText(prev => ({ ...prev, reminder: '' }));
  };

  const handleRemoveReminder = (id: string) => {
    if (!editingKid) return;
    setEditingKid({ ...editingKid, reminders: editingKid.reminders.filter(r => r.id !== id) });
  };

  const handleRemoveItem = (field: 'routines', idx: number) => {
    if (!editingKid) return;
    const newArr = [...editingKid[field]];
    newArr.splice(idx, 1);
    setEditingKid({ ...editingKid, [field]: newArr });
  };

  const toggleReminderDay = (reminderId: string, dayIndex: number) => {
    if (!editingKid) return;
    setEditingKid({
      ...editingKid,
      reminders: editingKid.reminders.map(r => {
        if (r.id === reminderId) {
          const days = r.days.includes(dayIndex) ? r.days.filter(d => d !== dayIndex) : [...r.days, dayIndex].sort();
          return { ...r, days };
        }
        return r;
      })
    });
  };

  const toggleReminderAMPM = (reminderId: string, type: 'AM' | 'PM') => {
    if (!editingKid) return;
    setEditingKid({
      ...editingKid,
      reminders: editingKid.reminders.map(r => {
        if (r.id === reminderId) {
          if (type === 'AM') return { ...r, showAM: !r.showAM };
          if (type === 'PM') return { ...r, showPM: !r.showPM };
        }
        return r;
      })
    });
  };

  // --- MASTER CHORE HANDLERS ---
  const handleAdminAddChore = async () => {
    if (!newAdminChore.text.trim() || !user) return;
    const chore: Chore = { id: `c-${Date.now()}`, text: newAdminChore.text.trim(), type: newAdminChore.type, assigneeIds: [], completedBy: [] };
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

  const handleChoreTextChange = (id: string, newText: string) => {
    setChores(chores.map(c => c.id === id ? { ...c, text: newText } : c));
  };

  const handleChoreTextBlur = async () => { if (user) await setDoc(doc(db, SHARED_DOC_PATH), { chores }, { merge: true }); };

  const toggleChoreAssignee = async (choreId: string, kidId: number) => {
    const updatedChores = chores.map(c => {
      if (c.id === choreId) {
        const newAssignees = c.assigneeIds.includes(kidId) ? c.assigneeIds.filter(id => id !== kidId) : [...c.assigneeIds, kidId];
        const newCompleted = c.completedBy.filter(id => newAssignees.includes(id));
        return { ...c, assigneeIds: newAssignees, completedBy: newCompleted };
      }
      return c;
    });
    setChores(updatedChores);
    if (user) await setDoc(doc(db, SHARED_DOC_PATH), { chores: updatedChores }, { merge: true });
  };

  const handleAddGlobalReminder = async () => {
    if (!newGlobalReminder.trim() || !user) return;
    const rem: Reminder = { id: `grem-${Date.now()}`, text: newGlobalReminder.trim(), days: [1,2,3,4,5], showAM: true, showPM: true };
    const updated = [...globalReminders, rem];
    setGlobalReminders(updated);
    await setDoc(doc(db, SHARED_DOC_PATH), { globalReminders: updated }, { merge: true });
    setNewGlobalReminder('');
  };

  const handleRemoveGlobalReminder = async (id: string) => {
    if (!user) return;
    const updated = globalReminders.filter(r => r.id !== id);
    setGlobalReminders(updated);
    await setDoc(doc(db, SHARED_DOC_PATH), { globalReminders: updated }, { merge: true });
  };

  const toggleGlobalReminderDay = async (id: string, dayIndex: number) => {
    if (!user) return;
    const updated = globalReminders.map(r => {
      if (r.id === id) {
        const days = r.days.includes(dayIndex) ? r.days.filter(d => d !== dayIndex) : [...r.days, dayIndex].sort();
        return { ...r, days };
      }
      return r;
    });
    setGlobalReminders(updated);
    await setDoc(doc(db, SHARED_DOC_PATH), { globalReminders: updated }, { merge: true });
  };

  const toggleGlobalReminderAMPM = async (id: string, type: 'AM' | 'PM') => {
    if (!user) return;
    const updated = globalReminders.map(r => {
      if (r.id === id) {
        if (type === 'AM') return { ...r, showAM: !r.showAM };
        if (type === 'PM') return { ...r, showPM: !r.showPM };
      }
      return r;
    });
    setGlobalReminders(updated);
    await setDoc(doc(db, SHARED_DOC_PATH), { globalReminders: updated }, { merge: true });
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
        if (newPin === '112358') { setView('admin'); setEnteredAdminPin(''); setAdminTab('chores'); } 
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
        
        if (kid.pin === newPin || newPin === '2358') {
          setActiveKidId(kid.id);
          setView('kid');
          setTimeout(() => setPinModal({ isOpen: false, kidId: null }), 300);
        } else {
          setPinError(true); setTimeout(() => setEnteredPin(''), 500);
        }
      }
    }
  };

  useEffect(() => {
    if (!pinModal.isOpen && view !== 'admin-login') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        if (pinModal.isOpen) handlePinPadClick(e.key);
        else handleAdminPinPadClick(e.key);
      } else if (e.key === 'Escape') {
        if (pinModal.isOpen) setPinModal({ isOpen: false, kidId: null });
        else { setView('dashboard'); setActiveKidId(null); }
      } else if (e.key === 'Backspace') {
        if (pinModal.isOpen) { setEnteredPin(prev => prev.slice(0, -1)); setPinError(false); }
        else { setEnteredAdminPin(prev => prev.slice(0, -1)); setAdminPinError(false); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pinModal.isOpen, view, enteredPin, enteredAdminPin]);

  // --- RENDER HELPERS ---
  const renderAdminChoreList = (type: ChoreType) => {
    const typeChores = chores.filter(c => c.type === type);
    return (
      <div className="space-y-2">
        <div className="flex px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider items-center gap-4">
          <div className="w-2 h-2" />
          <div className="flex-1">Chore Name</div>
          <div className="flex gap-4">
            {kids.map(kid => (
              <div key={kid.id} className="w-16 sm:w-24 text-center font-bold" title={kid.name}>{kid.name}</div>
            ))}
          </div>
          <div className="w-8" />
        </div>
        
        {typeChores.length === 0 && <div className="text-center text-gray-600 py-4 italic">No {type} chores.</div>}
        
        {typeChores.map(chore => {
          const isUnassigned = chore.assigneeIds.length === 0;
          return (
            <div key={chore.id} className={`flex items-center gap-4 p-3 rounded-xl border transition-colors ${isUnassigned ? 'bg-red-900/20 border-red-500/50 hover:bg-red-900/30' : 'bg-gray-900 border-gray-700 hover:bg-gray-800'}`}>
              <div className={`w-2 h-2 rounded-full ${chore.type === 'daily' ? 'bg-green-500' : 'bg-purple-500'} flex-shrink-0`} title={chore.type}></div>
              
              {editingChoreId === chore.id ? (
                <input 
                  autoFocus
                  value={chore.text}
                  onChange={e => handleChoreTextChange(chore.id, e.target.value)}
                  onBlur={() => { handleChoreTextBlur(); setEditingChoreId(null); }}
                  onKeyDown={e => e.key === 'Enter' && setEditingChoreId(null)}
                  className="flex-1 bg-gray-800 text-white font-semibold focus:outline-none border border-blue-500 rounded px-2 py-1 min-w-[100px]"
                />
              ) : (
                <span className="flex-1 text-white font-semibold px-1 py-1 truncate">{chore.text}</span>
              )}
              
              <div className="flex gap-4">
                {kids.map(kid => (
                  <div key={kid.id} className="flex flex-col items-center justify-center w-16 sm:w-24">
                    <input 
                      type="checkbox" checked={chore.assigneeIds.includes(kid.id)} onChange={() => toggleChoreAssignee(chore.id, kid.id)}
                      className="w-5 h-5 rounded border-gray-600 cursor-pointer accent-blue-500"
                    />
                  </div>
                ))}
              </div>
              
              <div className="flex gap-1 flex-shrink-0">
                {editingChoreId === chore.id ? (
                  <button onMouseDown={(e) => e.preventDefault()} onClick={() => setEditingChoreId(null)} className="text-green-400 hover:text-green-300 p-2 hover:bg-green-900/30 rounded-lg transition-colors">
                    <Save size={18} />
                  </button>
                ) : (
                  <button onClick={() => setEditingChoreId(chore.id)} className="text-blue-400 hover:text-blue-300 p-2 hover:bg-blue-900/30 rounded-lg transition-colors">
                    <Edit3 size={18} />
                  </button>
                )}
                <button onClick={() => handleAdminDeleteChore(chore.id)} className="text-red-400 hover:text-red-300 p-2 hover:bg-red-900/30 rounded-lg transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCalendarWidget = () => (
    <div key="calendar" className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col h-full">
      <h2 className="text-xl font-semibold text-blue-400 flex items-center gap-2 mb-6">
        <Calendar /> This Week
      </h2>
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {calendarEvents.length === 0 ? (
          <div className="text-center text-gray-500 italic py-4">No upcoming events found.</div>
        ) : (
          calendarEvents.map((event, i) => (
            <div key={i} className="bg-gray-800 p-4 rounded-xl border border-gray-700">
              <div className="text-sm text-blue-300 font-bold mb-1">{event.day} • {event.time}</div>
              <div className="text-lg">{event.title}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderRemindersWidget = () => (
    <div key="reminders" className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-orange-400 flex items-center gap-2">
          <AlertCircle /> Today
        </h2>
        <span className="text-sm font-bold text-gray-500 uppercase tracking-widest">{DAYS_OF_WEEK[todayDayIndex]}</span>
      </div>
      
      {appSettings.zipCode && <div className="mb-6"><WeatherRing weather={weather} /></div>}
      
      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
        {activeReminders.length === 0 ? (
          <div className="text-gray-500 italic p-4 text-center">No reminders scheduled for today.</div>
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
  );

  const renderChoresWidget = () => {
    const dailyOverall = calculateOverallProgress('daily');
    const weeklyOverall = calculateOverallProgress('weekly');
    
    return (
      <div key="chores" className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col h-full overflow-hidden relative">
        <div className="absolute top-6 right-6 text-xs font-bold text-gray-500 uppercase bg-gray-800 px-3 py-1 rounded-lg">
          Tap Ring to View
        </div>
        <h2 className="text-xl font-semibold text-green-400 flex items-center gap-2 mb-6 border-b border-gray-800 pb-4 shrink-0">
          <CheckCircle /> Chore Progress
        </h2>
        
        <div className="flex-1 overflow-y-auto pr-2 pb-4">
           {/* DAILY SECTION */}
           <div className="mb-4 border-b border-gray-800 pb-4">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3 text-center">Daily Tasks</h3>
              <div className="grid grid-cols-2 gap-y-3 gap-x-2 place-content-center mb-4">
                {kids.map(kid => (
                   <SmallProgressRing 
                     key={`d-${kid.id}`} 
                     progress={calculateKidProgress(kid.id, 'daily')} 
                     kidName={kid.name} 
                     colorClass={kid.headerColor}
                     onClick={(e) => { e.stopPropagation(); setPinModal({ isOpen: true, kidId: kid.id }); setEnteredPin(''); setPinError(false); }}
                   />
                ))}
              </div>
              <div className="px-2">
                <div className="flex justify-between text-xs mb-2">
                  <span className="font-bold text-gray-400 uppercase tracking-wide">Family Daily</span>
                  <span className="font-bold text-white">{dailyOverall}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2.5 border border-gray-700 overflow-hidden">
                  <div className="bg-green-500 h-full transition-all duration-1000 ease-out" style={{ width: `${dailyOverall}%` }}></div>
                </div>
              </div>
           </div>

           {/* WEEKLY SECTION */}
           <div>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3 text-center">Weekly Tasks</h3>
              <div className="grid grid-cols-2 gap-y-3 gap-x-2 place-content-center mb-4">
                {kids.map(kid => (
                   <SmallProgressRing 
                     key={`w-${kid.id}`} 
                     progress={calculateKidProgress(kid.id, 'weekly')} 
                     kidName={kid.name} 
                     colorClass={kid.headerColor}
                     onClick={(e) => { e.stopPropagation(); setPinModal({ isOpen: true, kidId: kid.id }); setEnteredPin(''); setPinError(false); }}
                   />
                ))}
              </div>
              <div className="px-2">
                <div className="flex justify-between text-xs mb-2">
                  <span className="font-bold text-gray-400 uppercase tracking-wide">Family Weekly</span>
                  <span className="font-bold text-white">{weeklyOverall}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2.5 border border-gray-700 overflow-hidden">
                  <div className="bg-purple-500 h-full transition-all duration-1000 ease-out" style={{ width: `${weeklyOverall}%` }}></div>
                </div>
              </div>
           </div>
        </div>
      </div>
    );
  };

  const layoutMap: Record<string, () => React.ReactNode> = {
    'calendar': renderCalendarWidget,
    'reminders': renderRemindersWidget,
    'chores': renderChoresWidget
  };

  const gridColsClass = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }[appSettings.dashboardLayout.length] || 'md:grid-cols-3';

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
        
        <div className="flex items-center gap-4">
          {(view === 'kid' || view === 'admin') && (
            <button onClick={() => { setView('dashboard'); setActiveKidId(null); }} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-4 rounded-xl transition-colors font-semibold h-[74px]">
              <ChevronLeft size={20} /> Back to Dashboard
            </button>
          )}
        </div>
      </div>

      {/* VIEW: DASHBOARD */}
      {view === 'dashboard' && (
        <div className={`grid grid-cols-1 ${gridColsClass} gap-6 h-[80vh]`}>
          {appSettings.dashboardLayout.map(widgetId => layoutMap[widgetId] && layoutMap[widgetId]())}
        </div>
      )}

      {/* VIEW: SINGLE KID DASHBOARD */}
      {view === 'kid' && activeKidId && (() => {
        const kid = kids.find(k => k.id === activeKidId);
        if (!kid) return null;
        
        const kidDaily = chores.filter(c => c.assigneeIds.includes(kid.id) && c.type === 'daily');
        const kidWeekly = chores.filter(c => c.assigneeIds.includes(kid.id) && c.type === 'weekly');
        const kidTodayReminders = kid.reminders
          .filter(r => r.days.includes(todayDayIndex))
          .filter(r => (isCurrentlyAM && r.showAM) || (!isCurrentlyAM && r.showPM));

        return (
          <div className={`bg-gray-900 border-t-8 ${kid.color} rounded-3xl p-6 shadow-xl min-h-[80vh] flex flex-col`}>
            <h2 className={`text-3xl font-bold ${kid.headerColor} mb-6 border-b border-gray-800 pb-4`}>
              Welcome, {kid.name}!
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1">
              
              {/* LEFT COLUMN: CHORES */}
              <div className="space-y-6 border-r border-gray-800 pr-6">
                {/* Daily Chores */}
                <div>
                  <h3 className="text-lg font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <ListTodo className="text-green-500"/> Daily To-Do
                  </h3>
                  <div className="space-y-3">
                    {kidDaily.length === 0 && <div className="text-gray-600 italic text-base">No daily chores assigned.</div>}
                    {kidDaily.map(chore => {
                      const isDone = chore.completedBy.includes(kid.id);
                      return (
                        <div key={chore.id} onClick={() => toggleKidChore(chore.id, kid.id)}
                          className={`p-4 rounded-2xl flex items-center justify-between transition-all cursor-pointer border-2 ${isDone ? 'bg-gray-800 opacity-60 border-gray-700' : 'bg-gray-800 hover:bg-gray-750 border-gray-600 hover:border-gray-500'}`}
                        >
                          <span className={`text-xl font-semibold ${isDone ? 'line-through text-gray-500' : 'text-gray-100'}`}>{chore.text}</span>
                          <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${isDone ? 'border-green-500 bg-green-500 text-gray-900' : 'border-gray-500'}`}>
                            {isDone && <CheckCircle size={18} strokeWidth={2.5} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Weekly Chores */}
                <div>
                  <h3 className="text-lg font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <ListTodo className="text-purple-500" /> Weekly Deep Clean
                  </h3>
                  <div className="space-y-3">
                    {kidWeekly.length === 0 && <div className="text-gray-600 italic text-base">No weekly chores assigned.</div>}
                    {kidWeekly.map(chore => {
                      const isDone = chore.completedBy.includes(kid.id);
                      
                      const coAssigneeIds = chore.assigneeIds.filter(id => id !== kid.id);
                      const coAssigneeNames = coAssigneeIds.map(id => kids.find(k => k.id === id)?.name).filter(Boolean);
                      
                      let withText = "";
                      if (coAssigneeNames.length === 1) {
                        withText = `with ${coAssigneeNames[0]}`;
                      } else if (coAssigneeNames.length === 2) {
                        withText = `with ${coAssigneeNames[0]} & ${coAssigneeNames[1]}`;
                      } else if (coAssigneeNames.length > 2) {
                        const last = coAssigneeNames.pop();
                        withText = `with ${coAssigneeNames.join(', ')}, & ${last}`;
                      }

                      return (
                        <div key={chore.id} onClick={() => toggleKidChore(chore.id, kid.id)}
                          className={`p-4 rounded-2xl flex items-center justify-between transition-all cursor-pointer border-2 ${isDone ? 'bg-gray-800 opacity-60 border-gray-700' : 'bg-gray-800 hover:bg-gray-750 border-gray-600 hover:border-gray-500'}`}
                        >
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className={`text-xl font-semibold ${isDone ? 'line-through text-gray-500' : 'text-gray-100'}`}>{chore.text}</span>
                            {withText && (
                              <span className={`text-base font-medium italic ${isDone ? 'text-gray-600' : 'text-gray-400'}`}>
                                ({withText})
                              </span>
                            )}
                          </div>
                          <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0 ${isDone ? 'border-purple-500 bg-purple-500 text-gray-900' : 'border-gray-500'}`}>
                            {isDone && <CheckCircle size={18} strokeWidth={2.5} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: ROUTINES & REMINDERS */}
              <div className="space-y-6">
                {/* Reminders */}
                <div className="bg-gray-800/40 p-6 rounded-2xl border border-gray-800">
                  <h3 className="text-lg font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <AlertCircle className="text-orange-500" /> Today's Focus
                  </h3>
                  {kidTodayReminders.length === 0 ? (
                    <span className="text-gray-600 italic text-base">No special reminders for right now.</span>
                  ) : (
                    <div className="space-y-3">
                      {kidTodayReminders.map(rem => (
                        <div key={rem.id} className="flex items-start gap-4 bg-gray-800 p-4 rounded-xl">
                           <div className={`w-2.5 h-2.5 rounded-full mt-2 flex-shrink-0 ${kid.color.replace('border-', 'bg-').replace('-500', '-500')}`}></div>
                           <span className="text-lg text-gray-200">{rem.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Routines */}
                <div className="bg-gray-800/40 p-6 rounded-2xl border border-gray-800">
                  <h3 className="text-lg font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <RotateCcw className="text-blue-500"/> Core Routines
                  </h3>
                  {kid.routines.length === 0 ? (
                    <span className="text-gray-600 italic text-base">No routines set.</span>
                  ) : (
                    <ul className="list-none space-y-3">
                      {kid.routines.map((routine, idx) => (
                        <li key={idx} className="text-lg text-gray-300 flex items-center gap-3">
                          <div className="w-1.5 h-1.5 bg-gray-600 rounded-full"></div>
                          {routine}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

            </div>
          </div>
        );
      })()}

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
            <button onClick={() => setAdminTab('chores')} className={`font-bold transition-colors ${adminTab === 'chores' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}>Master Chore List</button>
            <button onClick={() => setAdminTab('kids')} className={`font-bold transition-colors ${adminTab === 'kids' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}>Kids & Routines</button>
            <button onClick={() => setAdminTab('layout')} className={`font-bold transition-colors ${adminTab === 'layout' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}>Layout & Design</button>
            <button onClick={() => setAdminTab('settings')} className={`font-bold transition-colors ${adminTab === 'settings' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}>System Settings</button>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            
            {/* TAB: CHORES MASTER LIST */}
            {adminTab === 'chores' && (
              <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 flex flex-col h-full">
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-1"><CheckSquare className="text-purple-400" /> Master Chore List</h3>
                    <p className="text-gray-400 text-sm">Add chores and check the boxes to assign them to one or more kids.</p>
                  </div>
                </div>
                
                {/* Add New Chore Bar */}
                <div className="flex flex-col md:flex-row gap-3 bg-gray-900 p-4 rounded-xl border border-gray-700 mb-8">
                  <input 
                    type="text" placeholder="e.g. Empty Dishwasher" value={newAdminChore.text}
                    onChange={e => setNewAdminChore({...newAdminChore, text: e.target.value})}
                    onKeyDown={e => e.key === 'Enter' && handleAdminAddChore()}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
                  />
                  <select 
                    value={newAdminChore.type} 
                    onChange={e => setNewAdminChore({...newAdminChore, type: e.target.value as ChoreType})}
                    className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-white font-bold focus:outline-none"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                  <button onClick={handleAdminAddChore} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors">
                    <Plus size={20}/> Add Chore
                  </button>
                </div>

                {/* Daily Chores Group */}
                <div className="mb-8">
                  <h4 className="text-lg font-bold text-green-400 mb-3 border-b border-gray-700 pb-2 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div> Daily Tasks
                  </h4>
                  {renderAdminChoreList('daily')}
                </div>

                {/* Weekly Chores Group */}
                <div>
                  <h4 className="text-lg font-bold text-purple-400 mb-3 border-b border-gray-700 pb-2 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500"></div> Weekly Tasks
                  </h4>
                  {renderAdminChoreList('weekly')}
                </div>
                
                {/* Global Scheduled Reminders Group */}
                <div className="mt-12 pt-8 border-t border-gray-800">
                  <div className="flex justify-between items-end mb-6">
                    <div>
                      <h3 className="text-xl font-bold text-indigo-400 flex items-center gap-2 mb-1">
                        <AlertCircle size={24} /> Family Scheduled Reminders
                      </h3>
                      <p className="text-gray-400 text-sm">Global reminders that appear on the main dashboard for everyone.</p>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    {globalReminders.length === 0 && <div className="text-center text-gray-600 py-4 italic">No family reminders set.</div>}
                    {globalReminders.map((reminder) => (
                      <div key={reminder.id} className="bg-gray-900 p-4 rounded-xl border border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full bg-indigo-500 flex-shrink-0"></div>
                          <span className="text-gray-200 font-semibold text-lg">{reminder.text}</span>
                        </div>
                        <div className="flex items-center gap-4 ml-6 md:ml-0 flex-wrap">
                          <div className="flex gap-1.5 items-center">
                            {DAYS_OF_WEEK.map((day, idx) => (
                              <button 
                                key={idx}
                                onClick={() => toggleGlobalReminderDay(reminder.id, idx)}
                                className={`w-8 h-8 rounded-full text-xs font-bold transition-colors ${reminder.days.includes(idx) ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                              >
                                {day}
                              </button>
                            ))}
                            <div className="w-px h-6 bg-gray-700 mx-2"></div>
                            <button onClick={() => toggleGlobalReminderAMPM(reminder.id, 'AM')} className={`px-2 py-1 rounded text-xs font-bold transition-colors ${reminder.showAM ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}>AM</button>
                            <button onClick={() => toggleGlobalReminderAMPM(reminder.id, 'PM')} className={`px-2 py-1 rounded text-xs font-bold transition-colors ${reminder.showPM ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}>PM</button>
                          </div>
                          <button onClick={() => handleRemoveGlobalReminder(reminder.id)} className="text-red-400 hover:text-red-300 p-2 bg-gray-800 hover:bg-red-900/30 rounded-lg transition-colors flex-shrink-0">
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col md:flex-row gap-3 bg-gray-900 p-4 rounded-xl border border-gray-700">
                    <input 
                      type="text" placeholder="e.g. Put out the recycling bins" value={newGlobalReminder}
                      onChange={e => setNewGlobalReminder(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddGlobalReminder()}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
                    />
                    <button onClick={handleAddGlobalReminder} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors">
                      <Plus size={20}/> Add Reminder
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* TAB: KIDS */}
            {adminTab === 'kids' && (
              <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Users className="text-green-400" /> Profiles & Routines</h3>
                <p className="text-gray-400 text-sm mb-6">Manage names, PIN codes, personal daily routines, and scheduled reminders.</p>
                <div className="grid grid-cols-1 gap-4">
                  {kids.map(kid => (
                    <div key={kid.id} className="bg-gray-900 p-4 rounded-xl border border-gray-700 flex justify-between items-center">
                      <div>
                        <span className={`font-bold ${kid.headerColor} text-lg`}>{kid.name}</span>
                        <span className="text-gray-500 text-sm ml-3 border-l border-gray-700 pl-3">PIN: {kid.pin}</span>
                        <div className="text-sm text-gray-500 mt-1">{kid.routines.length} Routines | {kid.reminders.length} Scheduled Reminders</div>
                      </div>
                      <button onClick={() => setEditingKid(kid)} className="bg-gray-800 hover:bg-gray-700 text-blue-400 p-3 rounded-lg transition-colors flex items-center gap-2">
                        <Edit3 size={18} /> Edit Setup
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: LAYOUT */}
            {adminTab === 'layout' && (
              <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                 <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><LayoutDashboard className="text-blue-400" /> Dashboard Layout</h3>
                 <p className="text-gray-400 text-sm mb-6">Change the order in which widgets appear on the main dashboard screen.</p>
                 <div className="space-y-3 max-w-lg">
                    {appSettings.dashboardLayout.map((widgetId, idx) => (
                      <div key={widgetId} className="flex items-center justify-between bg-gray-900 p-4 rounded-xl border border-gray-700">
                        <span className="text-lg font-bold text-gray-200">{WIDGET_TITLES[widgetId] || widgetId}</span>
                        <div className="flex gap-2">
                          <button 
                             onClick={() => moveWidget(idx, -1)} 
                             disabled={idx === 0}
                             className="p-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
                          >
                             <ChevronUp size={20}/>
                          </button>
                          <button 
                             onClick={() => moveWidget(idx, 1)} 
                             disabled={idx === appSettings.dashboardLayout.length - 1}
                             className="p-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
                          >
                             <ChevronDown size={20}/>
                          </button>
                        </div>
                      </div>
                    ))}
                 </div>
              </div>
            )}

            {/* TAB: SETTINGS */}
            {adminTab === 'settings' && (
              <div className="space-y-6">
                <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><RotateCcw className="text-orange-400" /> System Resets</h3>
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
                      <RotateCcw size={20} /> Force Reset Dailies Now
                    </button>
                  </div>
                </div>

                <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><CloudSun className="text-blue-400" /> Weather Settings</h3>
                  <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                     <div className="w-full md:w-2/3">
                        <label className="block text-sm font-bold text-gray-400 mb-2">Location (City Name)</label>
                        <div className="flex gap-3">
                          <input 
                             type="text" 
                             placeholder="e.g. Seattle or London" 
                             value={weatherInput}
                             onChange={(e) => setWeatherInput(e.target.value)}
                             onKeyDown={(e) => e.key === 'Enter' && handleSaveWeatherSetting()}
                             className="flex-1 bg-gray-900 border border-gray-700 rounded-xl p-4 text-white focus:outline-none focus:border-blue-500"
                          />
                          <button onClick={handleSaveWeatherSetting} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-4 rounded-xl font-bold transition-colors">
                            Save
                          </button>
                        </div>
                        {weatherStatus && <p className={`text-sm mt-3 font-bold ${weatherStatus.includes('Found') ? 'text-green-400' : 'text-orange-400'}`}>{weatherStatus}</p>}
                        {!weatherStatus && <p className="text-gray-500 text-sm mt-2">Open-Meteo's free API requires a city name for best results. Clear and save to disable.</p>}
                     </div>
                  </div>
                </div>

                <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Calendar className="text-purple-400" /> Google Calendar Sync</h3>
                  <p className="text-gray-400 text-sm mb-4">In Google Calendar Settings, scroll down to "Integrate calendar" and copy the <strong>Public address in iCal format</strong>.</p>
                  <div className="space-y-4 max-w-2xl">
                     <div>
                        <input 
                           type="text" 
                           placeholder="https://calendar.google.com/calendar/ical/.../public/basic.ics"
                           value={icalInput}
                           onChange={(e) => setIcalInput(e.target.value)}
                           onBlur={handleSaveCalendarSettings}
                           onKeyDown={(e) => e.key === 'Enter' && handleSaveCalendarSettings()}
                           className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500"
                        />
                     </div>
                     <div className="flex items-center gap-4 pt-2">
                       <button onClick={handleSaveCalendarSettings} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-colors">
                         Sync Calendar
                       </button>
                       {calendarStatus && <span className={`text-sm font-bold ${calendarStatus.includes('✅') ? 'text-green-400' : calendarStatus.includes('❌') ? 'text-red-400' : 'text-gray-400'}`}>{calendarStatus}</span>}
                     </div>
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>
      )}

      {/* MODAL: EDIT KID */}
      {editingKid && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-3xl shadow-2xl max-w-3xl w-full flex flex-col max-h-[90vh]">
            
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
                <h3 className="font-bold text-white mb-1 flex items-center gap-2">Personal Routines</h3>
                <p className="text-gray-400 text-sm mb-4">Static items that appear at the bottom of their card.</p>
                <div className="space-y-2 mb-4">
                  {editingKid.routines.length === 0 && <span className="text-gray-500 italic text-sm">No routines set.</span>}
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
                    onKeyDown={e => e.key === 'Enter' && handleAddRoutine()}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-500"
                  />
                  <button onClick={handleAddRoutine} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold flex items-center"><Plus size={20}/></button>
                </div>
              </div>

              {/* Reminders Editor */}
              <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                <h3 className="font-bold text-white mb-1 flex items-center gap-2">Scheduled Reminders</h3>
                <p className="text-gray-400 text-sm mb-4">Select the days and times these should appear on the main Dashboard.</p>
                <div className="space-y-3 mb-4">
                  {editingKid.reminders.length === 0 && <span className="text-gray-500 italic text-sm">No reminders set.</span>}
                  {editingKid.reminders.map((reminder) => (
                    <div key={reminder.id} className="bg-gray-900 p-3 rounded-lg border border-gray-700 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                      <span className="text-gray-200 font-semibold">{reminder.text}</span>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex gap-1">
                          {DAYS_OF_WEEK.map((day, idx) => (
                            <button 
                              key={idx}
                              onClick={() => toggleReminderDay(reminder.id, idx)}
                              className={`w-8 h-8 rounded-full text-xs font-bold transition-colors ${reminder.days.includes(idx) ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                            >
                              {day}
                            </button>
                          ))}
                        </div>
                        <div className="w-px h-6 bg-gray-700 mx-1"></div>
                        <div className="flex gap-1.5">
                          <button onClick={() => toggleReminderAMPM(reminder.id, 'AM')} className={`px-2.5 py-1.5 rounded text-xs font-bold transition-colors ${reminder.showAM ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}>AM</button>
                          <button onClick={() => toggleReminderAMPM(reminder.id, 'PM')} className={`px-2.5 py-1.5 rounded text-xs font-bold transition-colors ${reminder.showPM ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}>PM</button>
                        </div>
                        <button onClick={() => handleRemoveReminder(reminder.id)} className="text-red-400 hover:text-red-300 p-1.5 ml-2"><X size={18} /></button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" placeholder="e.g. Bring Cello" value={newItemText.reminder}
                    onChange={e => setNewItemText({...newItemText, reminder: e.target.value})}
                    onKeyDown={e => e.key === 'Enter' && handleAddReminder()}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-500"
                  />
                  <button onClick={handleAddReminder} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold flex items-center"><Plus size={20}/></button>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-800 bg-gray-900 rounded-b-3xl flex justify-end gap-3">
              <button onClick={() => setEditingKid(null)} className="px-6 py-3 rounded-xl font-bold text-gray-300 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSaveKid} className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl font-bold text-white flex items-center gap-2 transition-colors"><Save size={20}/> Save Changes</button>
            </div>

          </div>
        </div>
      )}

      {/* PIN MODAL (Now dedicated to authenticating into the Kid Dashboard) */}
      {pinModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-3xl p-8 shadow-2xl max-w-sm w-full mx-4">
            <div className="text-center mb-6"><Lock className="mx-auto text-blue-400 mb-2" size={32} /><h2 className="text-2xl font-bold text-white">Enter PIN</h2><p className="text-gray-400 mt-1">{kids.find(k => k.id === pinModal.kidId)?.name}'s Profile</p></div>
            <div className={`flex justify-center gap-4 mb-8 ${pinError ? 'animate-bounce' : ''}`}>
              {[0, 1, 2, 3].map(i => (<div key={i} className={`w-4 h-4 rounded-full transition-all ${i < enteredPin.length ? 'bg-blue-500 scale-110' : 'bg-gray-700'} ${pinError ? 'bg-red-500' : ''}`} />))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (<button key={num} onClick={() => handlePinPadClick(num.toString())} className="bg-gray-800 hover:bg-gray-700 text-2xl font-bold text-white py-4 rounded-2xl transition-colors active:scale-95">{num}</button>))}
              <div className="col-span-1"></div>
              <button onClick={() => handlePinPadClick('0')} className="bg-gray-800 hover:bg-gray-700 text-2xl font-bold text-white py-4 rounded-2xl transition-colors active:scale-95">0</button>
              <button onClick={() => setPinModal({ isOpen: false, kidId: null })} className="text-gray-400 hover:text-white font-semibold py-4 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
