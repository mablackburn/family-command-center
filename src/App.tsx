import { useState, useEffect } from 'react';
import { Calendar, CheckCircle, ListTodo, ChevronLeft, Lock, Star, AlertCircle } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- GLOBALS FOR CANVAS COMPATIBILITY ---
declare global {
  var __firebase_config: string | undefined;
  var __app_id: string | undefined;
  var __initial_auth_token: string | undefined;
}

// --- FIREBASE INITIALIZATION ---
// This uses your custom keys when hosted on Vercel
const userFirebaseConfig = {
  apiKey: "AIzaSyC_8F-_ya3cVuvUjDA3vFN7yEuPSBOmkxI",
  authDomain: "family-command-center-549d2.firebaseapp.com",
  projectId: "family-command-center-549d2",
  storageBucket: "family-command-center-549d2.firebasestorage.app",
  messagingSenderId: "412577698703",
  appId: "1:412577698703:web:76544d2967f6bd540fb1fa"
};

const firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config 
  ? JSON.parse(__firebase_config) 
  : userFirebaseConfig;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const currentAppId = typeof __app_id !== 'undefined' && __app_id ? __app_id : 'family-command-center';

// --- TYPES ---
type Chore = {
  id: string;
  text: string;
  done: boolean;
};

type ChoreType = 'daily' | 'weekly';

type Kid = {
  id: number;
  name: string;
  color: string;
  headerColor: string;
  pin: string;
  daily: Chore[];
  weekly: Chore[];
  routines: string[];
};

// --- DEFAULT DATA (Loaded if database is empty) ---
const initialKids: Kid[] = [
  {
    id: 1, name: 'Alex', color: 'border-blue-500', headerColor: 'text-blue-400', pin: '1234',
    daily: [
      { id: 'd1', text: 'Load Dishwasher', done: false },
      { id: 'd2', text: 'Wipe Counters', done: false },
    ],
    weekly: [{ id: 'w1', text: 'Take out Trash', done: false }],
    routines: ['Brush Teeth', 'Pack Backpack', 'Read 20 mins']
  },
  {
    id: 2, name: 'Jordan', color: 'border-green-500', headerColor: 'text-green-400', pin: '1234',
    daily: [
      { id: 'd3', text: 'Feed the Dog', done: false },
      { id: 'd4', text: 'Clear Dinner Table', done: false },
    ],
    weekly: [{ id: 'w2', text: 'Clean Downstairs Bath', done: false }],
    routines: ['Brush Teeth', 'Pack Backpack', 'Practice Piano']
  },
  {
    id: 3, name: 'Taylor', color: 'border-purple-500', headerColor: 'text-purple-400', pin: '1234',
    daily: [
      { id: 'd5', text: 'Empty Trash Cans', done: false },
      { id: 'd6', text: 'Sweep Kitchen', done: false },
    ],
    weekly: [{ id: 'w3', text: 'Vacuum Stairs', done: false }],
    routines: ['Brush Teeth', 'Pack Backpack', 'Lay out clothes']
  },
  {
    id: 4, name: 'Casey', color: 'border-orange-500', headerColor: 'text-orange-400', pin: '1234',
    daily: [
      { id: 'd7', text: 'Pick up Living Room', done: false },
      { id: 'd8', text: 'Water Plants', done: false },
    ],
    weekly: [{ id: 'w4', text: 'Dust Bookshelves', done: false }],
    routines: ['Brush Teeth', 'Pack Backpack', 'Put shoes away']
  }
];

const mockReminders: string[] = [
  "🎸 Taylor: Bring Cello",
  "⚽ Jordan: Wear Soccer Cleats",
  "📚 Library Books due tomorrow!",
  "🍕 Pizza night tonight!"
];

type CalendarEvent = { day: string; time: string; title: string; };

const mockCalendar: CalendarEvent[] = [
  { day: 'Mon', time: '3:30 PM', title: 'Dentist - Alex' },
  { day: 'Tue', time: '4:00 PM', title: 'Soccer Practice' },
  { day: 'Wed', time: '5:00 PM', title: 'Piano Lessons' },
  { day: 'Fri', time: '6:30 PM', title: 'Family Movie Night' },
];

export default function App() {
  const [view, setView] = useState<'dashboard' | 'kids'>('dashboard');
  const [kids, setKids] = useState<Kid[]>(initialKids);
  const [user, setUser] = useState<User | null>(null);
  
  // PIN Modal State
  const [pinModal, setPinModal] = useState<{
    isOpen: boolean; kidId: number | null; choreId: string | null; choreType: ChoreType | null;
  }>({ isOpen: false, kidId: null, choreId: null, choreType: null });
  
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [pinError, setPinError] = useState<boolean>(false);

  // --- DATABASE SYNC LOGIC ---
  useEffect(() => {
    // 1. Authenticate silently in the background
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Firebase auth error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // 2. Fetch the data once authenticated
    if (!user) return;

    // Use a shared data path so all family devices see the same document
    const sharedDocRef = doc(db, 'artifacts', currentAppId, 'public', 'data', 'sharedKidsData');
    
    const unsubscribe = onSnapshot(sharedDocRef, (snapshot) => {
      if (snapshot.exists() && snapshot.data().kids) {
        // Data exists! Load it onto the screen
        setKids(snapshot.data().kids as Kid[]);
      } else {
        // First time opening the app! Save our defaults to the database
        setDoc(sharedDocRef, { kids: initialKids });
      }
    }, (error) => {
      console.error("Firestore snapshot error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // --- CALCULATIONS ---
  const calculateProgress = (type: ChoreType) => {
    let total = 0;
    let done = 0;
    kids.forEach(kid => {
      kid[type].forEach(chore => {
        total++;
        if (chore.done) done++;
      });
    });
    return total === 0 ? 0 : Math.round((done / total) * 100);
  };

  const dailyProgress = calculateProgress('daily');
  const weeklyProgress = calculateProgress('weekly');

  // --- HANDLERS ---
  const handleChoreClick = (kidId: number, choreId: string, choreType: ChoreType, isDone: boolean) => {
    if (isDone) return; // Already done, ignore
    setPinModal({ isOpen: true, kidId, choreId, choreType });
    setEnteredPin('');
    setPinError(false);
  };

  const handlePinPadClick = (num: string) => {
    if (enteredPin.length < 4) {
      const newPin = enteredPin + num;
      setEnteredPin(newPin);
      setPinError(false);
      
      // Auto-submit when 4 digits are reached
      if (newPin.length === 4) {
        verifyPin(newPin);
      }
    }
  };

  const verifyPin = async (pinToTest: string) => {
    const kid = kids.find(k => k.id === pinModal.kidId);
    if (!kid || !pinModal.choreType) return; 
    
    if (kid.pin === pinToTest) {
      // Success! Mark it as done locally
      const updatedKids = kids.map(k => {
        if (k.id === kid.id) {
          const type = pinModal.choreType as ChoreType;
          const updatedChores = k[type].map(c => 
            c.id === pinModal.choreId ? { ...c, done: true } : c
          );
          
          if (type === 'daily') {
             return { ...k, daily: updatedChores };
          } else {
             return { ...k, weekly: updatedChores };
          }
        }
        return k;
      });
      
      // Update screen instantly
      setKids(updatedKids);
      
      // Save the change to Google's servers securely
      if (user) {
        const sharedDocRef = doc(db, 'artifacts', currentAppId, 'public', 'data', 'sharedKidsData');
        await setDoc(sharedDocRef, { kids: updatedKids }, { merge: true });
      }
      
      // Close modal
      setTimeout(() => setPinModal({ isOpen: false, kidId: null, choreId: null, choreType: null }), 300);
    } else {
      // Fail!
      setPinError(true);
      setTimeout(() => setEnteredPin(''), 500);
    }
  };

  // --- COMPONENTS ---
  type ProgressRingProps = {
    progress: number;
    label: string;
    colorClass: string;
    strokeColor: string;
  };

  const ProgressRing = ({ progress, label, colorClass, strokeColor }: ProgressRingProps) => {
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
      <div 
        className="flex flex-col items-center justify-center bg-gray-800 p-6 rounded-2xl cursor-pointer hover:bg-gray-750 transition-colors"
        onClick={() => setView('kids')}
      >
        <div className="relative flex items-center justify-center w-40 h-40">
          <svg className="transform -rotate-90 w-40 h-40">
            {/* Background ring */}
            <circle cx="80" cy="80" r={radius} stroke="currentColor" strokeWidth="12" fill="transparent" className="text-gray-700" />
            {/* Progress ring */}
            <circle
              cx="80" cy="80" r={radius} stroke={strokeColor} strokeWidth="12" fill="transparent"
              strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
              className={`transition-all duration-1000 ease-out`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute text-3xl font-bold text-white">{progress}%</div>
        </div>
        <h3 className={`mt-4 text-xl font-semibold ${colorClass}`}>{label}</h3>
        <p className="text-gray-400 text-sm mt-1">Tap to view cards</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 font-sans">
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-100 tracking-wide flex items-center gap-3">
          <Star className="text-yellow-500" /> Family Command Center
        </h1>
        {view === 'kids' && (
          <button 
            onClick={() => setView('dashboard')}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors font-semibold"
          >
            <ChevronLeft size={20} /> Back to Dashboard
          </button>
        )}
      </div>

      {/* VIEW: DASHBOARD */}
      {view === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[80vh]">
          
          {/* Column 1: Calendar */}
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

          {/* Column 2: Reminders */}
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col">
            <h2 className="text-xl font-semibold text-orange-400 flex items-center gap-2 mb-6">
              <AlertCircle /> Don't Forget
            </h2>
            <div className="flex-1 overflow-y-auto space-y-3">
              {mockReminders.map((reminder, i) => (
                <div key={i} className="flex items-start gap-3 bg-gray-800 p-4 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-orange-500 mt-2 flex-shrink-0"></div>
                  <span className="text-lg leading-snug">{reminder}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Column 3: Progress Rings */}
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-xl flex flex-col">
            <h2 className="text-xl font-semibold text-green-400 flex items-center gap-2 mb-6">
              <CheckCircle /> Chore Progress
            </h2>
            <div className="flex-1 flex flex-col justify-center gap-8">
              <ProgressRing progress={dailyProgress} label="Daily Chores" colorClass="text-green-400" strokeColor="#4ade80" />
              <ProgressRing progress={weeklyProgress} label="Weekly Chores" colorClass="text-purple-400" strokeColor="#c084fc" />
            </div>
          </div>

        </div>
      )}

      {/* VIEW: KID CARDS */}
      {view === 'kids' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 h-[80vh]">
          {kids.map(kid => (
            <div key={kid.id} className={`bg-gray-900 border-t-8 ${kid.color} rounded-3xl p-6 shadow-xl flex flex-col h-full`}>
              <h2 className={`text-2xl font-bold ${kid.headerColor} mb-6 border-b border-gray-800 pb-4`}>
                {kid.name}
              </h2>
              
              <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                
                {/* Daily Chores */}
                <div>
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <ListTodo size={16} /> Daily To-Do
                  </h3>
                  <div className="space-y-2">
                    {kid.daily.map(chore => (
                      <div 
                        key={chore.id} 
                        onClick={() => handleChoreClick(kid.id, chore.id, 'daily', chore.done)}
                        className={`p-4 rounded-xl flex items-center justify-between transition-all ${
                          chore.done 
                            ? 'bg-gray-800 opacity-50 cursor-default' 
                            : 'bg-gray-800 hover:bg-gray-700 cursor-pointer border border-gray-700 hover:border-gray-500'
                        }`}
                      >
                        <span className={`text-lg ${chore.done ? 'line-through text-gray-500' : 'text-gray-100'}`}>
                          {chore.text}
                        </span>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${chore.done ? 'border-green-500 bg-green-500 text-gray-900' : 'border-gray-500'}`}>
                          {chore.done && <CheckCircle size={16} />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Weekly Chores */}
                <div>
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <ListTodo size={16} /> Weekly Deep Clean
                  </h3>
                  <div className="space-y-2">
                    {kid.weekly.map(chore => (
                      <div 
                        key={chore.id} 
                        onClick={() => handleChoreClick(kid.id, chore.id, 'weekly', chore.done)}
                        className={`p-4 rounded-xl flex items-center justify-between transition-all ${
                          chore.done 
                            ? 'bg-gray-800 opacity-50 cursor-default' 
                            : 'bg-gray-800 hover:bg-gray-700 cursor-pointer border border-gray-700 hover:border-gray-500'
                        }`}
                      >
                        <span className={`text-lg ${chore.done ? 'line-through text-gray-500' : 'text-gray-100'}`}>
                          {chore.text}
                        </span>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${chore.done ? 'border-purple-500 bg-purple-500 text-gray-900' : 'border-gray-500'}`}>
                          {chore.done && <CheckCircle size={16} />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Routines (Informational) */}
                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-800/50">
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Routines (Don't Forget)
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-400">
                    {kid.routines.map((routine, idx) => (
                      <li key={idx}>{routine}</li>
                    ))}
                  </ul>
                </div>

              </div>
            </div>
          ))}
        </div>
      )}

      {/* PIN MODAL */}
      {pinModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-3xl p-8 shadow-2xl max-w-sm w-full mx-4">
            
            <div className="text-center mb-6">
              <Lock className="mx-auto text-blue-400 mb-2" size={32} />
              <h2 className="text-2xl font-bold text-white">Enter PIN</h2>
              <p className="text-gray-400 mt-1">
                {kids.find(k => k.id === pinModal.kidId)?.name}'s chore
              </p>
            </div>

            {/* PIN Dots */}
            <div className={`flex justify-center gap-4 mb-8 ${pinError ? 'animate-bounce' : ''}`}>
              {[0, 1, 2, 3].map(i => (
                <div 
                  key={i} 
                  className={`w-4 h-4 rounded-full transition-all ${
                    i < enteredPin.length ? 'bg-blue-500 scale-110' : 'bg-gray-700'
                  } ${pinError ? 'bg-red-500' : ''}`}
                />
              ))}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button
                  key={num}
                  onClick={() => handlePinPadClick(num.toString())}
                  className="bg-gray-800 hover:bg-gray-700 text-2xl font-bold text-white py-4 rounded-2xl transition-colors active:scale-95"
                >
                  {num}
                </button>
              ))}
              <div className="col-span-1"></div> {/* Empty space */}
              <button
                onClick={() => handlePinPadClick('0')}
                className="bg-gray-800 hover:bg-gray-700 text-2xl font-bold text-white py-4 rounded-2xl transition-colors active:scale-95"
              >
                0
              </button>
              <button
                onClick={() => setPinModal({ isOpen: false, kidId: null, choreId: null, choreType: null })}
                className="text-gray-400 hover:text-white font-semibold py-4 transition-colors"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
