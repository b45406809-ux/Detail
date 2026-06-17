import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, Users, DollarSign, ShieldAlert, Search, CheckCircle, 
  XCircle, Ban, Play, Lock, Settings, MessageSquare, Plus, RefreshCw, 
  ArrowUpRight, Check, Trash2, ArrowDownLeft, Sliders, ShieldCheck, Award, Eye
} from 'lucide-react';
import { 
  db, handleFirestoreError, OperationType 
} from '../firebase';
import { 
  collection, query, getDocs, updateDoc, doc, addDoc, serverTimestamp, getDoc, onSnapshot
} from 'firebase/firestore';

interface AdminScreenProps {
  currentUser: any;
  setCurrentScreen: (scr: any) => void;
}

// --- CORE ADMIN LAYOUT WRAPPER ---
export const AdminPanel = ({ 
  currentScreen, 
  setCurrentScreen 
}: { 
  currentScreen: string; 
  setCurrentScreen: (scr: any) => void; 
}) => {
  const [feeRate, setFeeRate] = useState(15);
  const [loading, setLoading] = useState(false);

  // Load / listen to all admin datasets
  const [users, setUsers] = useState<any[]>([]);
  const [cleaners, setCleaners] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);

  useEffect(() => {
    // Listen to users to get immediate reactivity for customer & cleaner vetting, ban/suspensions
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const all: any[] = [];
      snap.docs.forEach(doc => {
        all.push({ id: doc.id, ...doc.data() });
      });
      setUsers(all.filter(u => u.role !== 'CLEANER'));
      setCleaners(all.filter(u => u.role === 'CLEANER'));
    });

    const unsubJobs = onSnapshot(collection(db, 'jobs'), (snap) => {
      const allJobs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setJobs(allJobs);
      // Map ongoing disputes where job status is CANCELLED but has outstanding disputes, or custom disputed status
      setDisputes(allJobs.filter((j: any) => j.disputed || j.status === 'CANCELLED' && j.price > 40));
    });

    return () => {
      unsubUsers();
      unsubJobs();
    };
  }, []);

  // Update specific cleaner or user properties
  const handleToggleSuspend = async (userId: string, isSuspended: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        isSuspended: !isSuspended,
        suspensionDate: !isSuspended ? serverTimestamp() : null
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleBan = async (userId: string, isBanned: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        isBanned: !isBanned,
        banDate: !isBanned ? serverTimestamp() : null
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleVettingStatus = async (cleanerId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'users', cleanerId), {
        vettingStatus: status, // Approved, Pending, Rejected
        isApproved: status === 'Approved'
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0A090D]">
      {/* Top Admin Header bar */}
      <div className="bg-[#121118]/80 border-b border-white/5 px-6 pt-12 pb-4 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#3906d2]/15 border border-[#3906d2]/30 rounded-xl flex items-center justify-center text-[#3906d2] shadow-[0_0_12px_rgba(57,6,210,0.1)]">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-display font-black text-white tracking-wide">Command Center</h1>
            <p className="text-[9px] font-black uppercase text-white/30 tracking-widest leading-none">Global Control Deck</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Quick Stats Banner indicator */}
          <span className="text-[10px] font-black uppercase px-2.5 py-1 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
            Live Panel
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6 no-scrollbar pb-32">
        {currentScreen === 'ADMIN_OVERVIEW' && (
          <AdminOverview 
            usersCount={users.length} 
            cleanersCount={cleaners.length} 
            jobs={jobs} 
            disputesCount={disputes.length}
            feeRate={feeRate}
            setFeeRate={setFeeRate}
          />
        )}
        {currentScreen === 'ADMIN_USERS' && (
          <AdminUsers 
            users={users} 
            onToggleSuspend={handleToggleSuspend} 
            onToggleBan={handleToggleBan}
          />
        )}
        {currentScreen === 'ADMIN_CLEANERS' && (
          <AdminCleaners 
            cleaners={cleaners} 
            onToggleSuspend={handleToggleSuspend} 
            onToggleBan={handleToggleBan}
            onUpdateVetting={handleVettingStatus}
          />
        )}
        {currentScreen === 'ADMIN_PAYMENTS' && (
          <AdminPayments 
            jobs={jobs} 
            feeRate={feeRate}
          />
        )}
        {currentScreen === 'ADMIN_DISPUTES' && (
          <AdminDisputes 
            disputes={disputes}
          />
        )}
      </div>
    </div>
  );
};

// ==================== OVERVIEW SUBVIEW ====================
const AdminOverview = ({ 
  usersCount, 
  cleanersCount, 
  jobs, 
  disputesCount,
  feeRate,
  setFeeRate
}: { 
  usersCount: number; 
  cleanersCount: number; 
  jobs: any[]; 
  disputesCount: number;
  feeRate: number;
  setFeeRate: (rate: number) => void;
}) => {
  const [timeWindow, setTimeWindow] = useState<'7' | '30' | '365'>('30');
  
  // Computations
  const totalVolume = jobs.reduce((sum, j) => sum + (parseFloat(j.price) || 0), 0);
  const platformRevenue = totalVolume * (feeRate / 100);
  const activeJobsCount = jobs.filter(j => ['REQUESTED', 'BIDDING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(j.status)).length;

  return (
    <div className="space-y-6 text-left">
      {/* KPI Bento Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Earnings Card */}
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl relative overflow-hidden">
          <div className="absolute top-4 right-4 text-[#3906d2]">
            <TrendingUp className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-black uppercase text-white/30 tracking-widest leading-none block mb-1">Total volume</span>
          <p className="text-2xl font-display font-black text-white">${totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <span className="text-[10px] text-emerald-400 font-bold mt-1.5 block">+{feeRate}% Commission Net</span>
        </div>

        {/* Platform Revenue Card */}
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl relative overflow-hidden">
          <div className="absolute top-4 right-4 text-[#3906d2]">
            <DollarSign className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-black uppercase text-white/30 tracking-widest leading-none block mb-1">Platform Cuts</span>
          <p className="text-2xl font-display font-black text-[#3906d2]">${platformRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <span className="text-[10px] text-white/50 font-medium mt-1.5 block">Vesting Fee Vault</span>
        </div>

        {/* Active Cleaners Card */}
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl">
          <span className="text-[10px] font-black uppercase text-white/30 tracking-widest leading-none block mb-1">Cleaners</span>
          <p className="text-2xl font-display font-black text-white">{cleanersCount}</p>
          <span className="text-[10px] text-[#3906d2] font-bold mt-1.5 block">Verified Specialists</span>
        </div>

        {/* Disputes rate card */}
        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl">
          <span className="text-[10px] font-black uppercase text-white/30 tracking-widest leading-none block mb-1">Conflict Cases</span>
          <p className="text-2xl font-display font-black text-white">{disputesCount}</p>
          <span className="text-[10px] text-red-400 font-bold mt-1.5 block">{disputesCount > 0 ? `${(disputesCount / Math.max(jobs.length, 1) * 100).toFixed(1)}% dispute rate` : 'Clear status'}</span>
        </div>
      </div>

      {/* Adjust Platform Fee structural controls */}
      <div className="bg-white/5 border border-white/10 p-5 rounded-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-white block">Platform Fee Broker</h3>
            <p className="text-[10px] text-white/40 mt-1 leading-normal">Commission charged on successfully finalized cleaner contracts.</p>
          </div>
          <span className="text-xl font-display font-black text-[#3906d2] px-3 py-1.5 bg-[#3906d2]/15 border border-[#3906d2]/30 rounded-xl">{feeRate}%</span>
        </div>

        <input 
          type="range" 
          min="5" 
          max="35" 
          value={feeRate} 
          onChange={(e) => setFeeRate(parseInt(e.target.value))}
          className="w-full accent-[#3906d2] bg-white/15 h-1.5 rounded-lg cursor-pointer"
        />
        <div className="flex justify-between text-[9px] font-bold text-white/35 uppercase tracking-widest">
          <span>Min 5%</span>
          <span>Recommended 15%</span>
          <span>Max 35%</span>
        </div>
      </div>

      {/* Beautiful activity vector graph */}
      <div className="bg-white/5 border border-white/10 p-5 rounded-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-white">Daily Traffic Ledger</h3>
          <div className="flex bg-black/40 rounded-xl p-1 border border-white/5">
            {['7', '30', '365'].map(win => (
              <button 
                key={win}
                onClick={() => setTimeWindow(win as any)}
                className={`px-3 py-1 text-[9px] font-black uppercase rounded-lg transition-all ${timeWindow === win ? 'bg-[#3906d2] text-white font-black' : 'text-white/40'}`}
              >
                {win === '7' ? '7D' : win === '30' ? '30D' : '1Y'}
              </button>
            ))}
          </div>
        </div>

        {/* SVG Activity Graph curve */}
        <div className="relative h-44 w-full bg-slate-950/40 border border-white/5 rounded-2xl flex items-center justify-center p-4">
          <svg viewBox="0 0 400 150" className="w-full h-full">
            <defs>
              <linearGradient id="glowGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3906d2" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#3906d2" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid markings */}
            <line x1="0" y1="30" x2="400" y2="30" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
            <line x1="0" y1="75" x2="400" y2="75" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
            <line x1="0" y1="120" x2="400" y2="120" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />

            {/* Area under curve fill */}
            <path 
              d="M0 130 C 50 110, 100 70, 150 90 C 200 115, 250 40, 300 50 C 350 60, 400 20, 420 20 L 420 150 L 0 150 Z" 
              fill="url(#glowGrad)" 
            />

            {/* Main graph path line */}
            <path 
              d="M0 130 C 50 110, 100 70, 150 90 C 200 115, 250 40, 300 50 C 350 60, 400 20, 420 20" 
              fill="none" 
              stroke="#3906d2" 
              strokeWidth="3.5" 
              strokeLinecap="round"
            />

            {/* High points sparkles */}
            <circle cx="150" cy="90" r="4" fill="#3906d2" stroke="#0F0E16" strokeWidth="1.5" />
            <circle cx="250" cy="40" r="5" fill="#3906d2" className="animate-ping" style={{ transformOrigin: '250px 40px' }} />
            <circle cx="250" cy="40" r="4" fill="#3906d2" stroke="#0F0E16" strokeWidth="1.5" />
            <circle cx="350" cy="60" r="4" fill="#3906d2" stroke="#0F0E16" strokeWidth="1.5" />

            {/* Indicator bars */}
            <line x1="250" y1="40" x2="250" y2="150" stroke="#3906d2" strokeDasharray="3,3" strokeWidth="1" />
          </svg>
          {/* Legend absolute badges */}
          <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 border border-white/5 rounded-lg text-[9px] font-black text-[#3906d2] uppercase tracking-widest border-[#3906d2]/20">
            Peak activity detected
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== USERS DATABASE SUBVIEW ====================
const AdminUsers = ({ 
  users, 
  onToggleSuspend, 
  onToggleBan 
}: { 
  users: any[]; 
  onToggleSuspend: (uid: string, susp: boolean) => void;
  onToggleBan: (uid: string, ban: boolean) => void;
}) => {
  const [queryText, setQueryText] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const filtered = users.filter(u => 
    (u.displayName || '').toLowerCase().includes(queryText.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(queryText.toLowerCase())
  );

  return (
    <div className="space-y-4 text-left">
      {/* Search Input */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
        <Search className="w-5 h-5 text-white/30" />
        <input 
          type="text" 
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="Lookup standard accounts..." 
          className="bg-transparent border-none outline-none text-[#3906d2] font-bold text-sm placeholder:text-white/20 w-full"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((u) => (
          <div key={u.id} className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4 hover:border-white/15 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-white/10 rounded-2xl overflow-hidden border border-white/10">
                  {u.photoURL ? (
                    <img src={u.photoURL} alt={u.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-white text-sm">
                      {u.displayName?.[0] || 'U'}
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-black text-white">{u.displayName || 'No Name'}</h4>
                  <p className="text-[10px] text-white/40 font-medium">{u.email || 'No email attached'}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-black text-white/30 tracking-widest leading-none block mb-1">Savings</span>
                <span className="text-xs font-black text-white block">${(u.balance || 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Quick action utility labels */}
            <div className="flex gap-2">
              <button 
                onClick={() => onToggleSuspend(u.id, u.isSuspended || false)}
                className={`flex-1 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${u.isSuspended ? 'bg-amber-500 text-slate-900 shadow-md' : 'bg-white/5 hover:bg-white/10 text-white/75 border border-white/5'}`}
              >
                {u.isSuspended ? 'Suspended' : 'Suspend'}
              </button>
              <button 
                onClick={() => onToggleBan(u.id, u.isBanned || false)}
                className={`flex-1 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${u.isBanned ? 'bg-red-600 text-white shadow-md' : 'bg-white/5 hover:bg-white/10 text-white/75 border border-white/5'}`}
              >
                {u.isBanned ? 'Banned' : 'Ban Account'}
              </button>
              <button 
                onClick={() => setSelectedUser(u)}
                className="px-3 py-2.5 bg-black/40 text-white/50 border border-white/5 hover:bg-black rounded-xl"
              >
                <Eye className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-12 text-center text-white/20 font-bold">
            No matching customer profiles.
          </div>
        )}
      </div>

      {/* Side Detail Modal */}
      <AnimatePresence>
        {selectedUser && (
          <div className="absolute inset-0 bg-black/80 z-[200] flex items-end p-5">
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="w-full bg-[#1A1926] border border-white/10 rounded-[36px] p-6 space-y-6 relative text-white"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-display font-black">Client Sheet</h3>
                <button 
                  onClick={() => setSelectedUser(null)}
                  className="p-2 bg-white/5 hover:bg-white/10 rounded-full"
                >
                  <XCircle className="w-5 h-5 text-white/50" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-2">
                  <p className="text-xs text-white/45">Registry Token ID:</p>
                  <p className="text-[10px] font-mono whitespace-normal overflow-hidden select-all text-white/75">{selectedUser.uid}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="text-[9px] font-black text-white/30 uppercase tracking-widest block mb-1">Balance</span>
                    <span className="text-lg font-black text-[#3906d2]">${(selectedUser.balance || 0).toFixed(2)}</span>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="text-[9px] font-black text-white/30 uppercase tracking-widest block mb-1">Jobs Booked</span>
                    <span className="text-lg font-black text-white">{selectedUser.jobsCompleted || 0}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ==================== CLEANERS DIRECTORY SUBVIEW ====================
const AdminCleaners = ({ 
  cleaners, 
  onToggleSuspend, 
  onToggleBan,
  onUpdateVetting
}: { 
  cleaners: any[]; 
  onToggleSuspend: (uid: string, susp: boolean) => void;
  onToggleBan: (uid: string, ban: boolean) => void;
  onUpdateVetting: (uid: string, status: string) => void;
}) => {
  const [queryText, setQueryText] = useState('');

  const filtered = cleaners.filter(c => 
    (c.displayName || '').toLowerCase().includes(queryText.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(queryText.toLowerCase())
  );

  return (
    <div className="space-y-4 text-left">
      {/* Lookup Bar */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
        <Search className="w-5 h-5 text-white/30" />
        <input 
          type="text" 
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="Lookup specialist cleaners..." 
          className="bg-transparent border-none outline-none text-[#3906d2] font-bold text-sm placeholder:text-white/20 w-full"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((c) => {
          const isVetted = c.isApproved || c.vettingStatus === 'Approved';
          
          return (
            <div key={c.id} className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4 hover:border-white/15 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl overflow-hidden border border-white/10 relative">
                    {c.photoURL ? (
                      <img src={c.photoURL} alt={c.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-white text-sm">
                        {c.displayName?.[0] || 'C'}
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white flex items-center gap-1.5">
                      {c.displayName || 'No Name'}
                      {isVetted && (
                        <ShieldCheck className="w-4 h-4 text-[#3906d2] fill-[#3906d2]/15" />
                      )}
                    </h4>
                    <p className="text-[10px] text-white/40 font-medium">{c.email}</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[9px] uppercase font-black text-white/30 tracking-widest leading-none block mb-1">Debt Com</span>
                  <span className="text-xs font-black text-red-400 block">${(c.commissionOwed || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Approval status check */}
              <div className="flex items-center justify-between bg-black/40 border border-white/5 p-3 rounded-xl">
                <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Enrollment vetting</span>
                <div className="flex gap-1">
                  {['Pending', 'Approved', 'Rejected'].map(st => (
                    <button 
                      key={st}
                      onClick={() => onUpdateVetting(c.id, st)}
                      className={`px-2 py-1 text-[9px] font-black rounded ${c.vettingStatus === st || (!c.vettingStatus && st === 'Pending' && !c.isApproved) || (c.isApproved && st === 'Approved') ? 'bg-[#3906d2] text-white font-extrabold shadow shadow-[#3906d2]/15' : 'bg-white/5 text-white/40'}`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Suspend or Ban block utility */}
              <div className="flex gap-2">
                <button 
                  onClick={() => onToggleSuspend(c.id, c.isSuspended || false)}
                  className={`flex-1 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${c.isSuspended ? 'bg-amber-500 text-slate-900 font-black shadow-md shadow-amber-500/20' : 'bg-white/5 hover:bg-white/10 text-white/75 border border-white/5'}`}
                >
                  {c.isSuspended ? 'Suspended' : 'Suspend'}
                </button>
                <button 
                  onClick={() => onToggleBan(c.id, c.isBanned || false)}
                  className={`flex-1 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${c.isBanned ? 'bg-red-600 text-white shadow-md shadow-red-500/20' : 'bg-white/5 hover:bg-white/10 text-white/75 border border-white/5'}`}
                >
                  {c.isBanned ? 'Banned' : 'Ban Account'}
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="p-12 text-center text-white/20 font-bold">
            No matching cleaner sheets found.
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== PAYMENTS & TRANSACTIONS ====================
const AdminPayments = ({ 
  jobs, 
  feeRate 
}: { 
  jobs: any[]; 
  feeRate: number;
}) => {
  // Extract transactions or mock platform payments log from completed jobs
  const completedJobs = jobs.filter(j => j.status === 'COMPLETED');

  return (
    <div className="space-y-6 text-left">
      {/* adjustment metrics */}
      <div className="bg-[#3906d2]/15 border border-[#3906d2]/30 p-5 rounded-3xl flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-white">Disbursement Portal</h3>
          <p className="text-[10px] text-white/60 leading-normal mt-1">Pending cleaner deposits cleared globally every Sunday at 00:00 UTC.</p>
        </div>
        <button className="px-4 py-2 bg-[#3906d2] text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-95 transition-all">
          Trigger Payouts
        </button>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-black text-white/40 uppercase tracking-widest ml-1">Historical ledger logs</h3>
        
        {completedJobs.map((j) => {
          const comAmount = (parseFloat(j.price) || 0) * (feeRate / 100);
          const earnAmount = (parseFloat(j.price) || 0) - comAmount;

          return (
            <div key={j.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between items-center hover:border-white/15 transition-all">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs text-white font-black block">{j.serviceType || 'Service Completed'}</span>
                  <span className="text-[9px] text-white/35 font-mono block mt-0.5">Job: #{j.id.slice(0,8)}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black text-white block">${parseFloat(j.price || 0).toFixed(2)}</div>
                <div className="text-[9px] text-[#3906d2] font-bold block mt-0.5">-{feeRate}% Com charged (${comAmount.toFixed(2)})</div>
              </div>
            </div>
          );
        })}

        {completedJobs.length === 0 && (
          <div className="p-12 text-center text-white/20 font-bold bg-white/5 border border-white/10 rounded-3xl">
            No completed transaction volumes currently stored.
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== DISPUTES SUBVIEW ====================
const AdminDisputes = ({ 
  disputes 
}: { 
  disputes: any[];
}) => {
  const [activeDispute, setActiveDispute] = useState<any>(null);

  const handleArbitration = async (disputeId: string, decision: 'REFUND' | 'RELEASE' | 'WARNING') => {
    try {
      // update job status & log resolution in firestore doc
      await updateDoc(doc(db, 'jobs', disputeId), {
        disputed: false,
        arbitrationDecision: decision,
        arbitrationTimestamp: serverTimestamp(),
        status: decision === 'REFUND' ? 'CANCELLED' : 'COMPLETED'
      });
      alert(`Decision recorded successfully!\nStatus: Payout ${decision === 'REFUND' ? 'Refunded' : decision === 'RELEASE' ? 'Cleared' : 'Warning Issued'}`);
      setActiveDispute(null);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-4 text-left">
      <div className="space-y-3">
        {disputes.map((d) => (
          <div key={d.id} className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4 hover:border-white/15 transition-all">
            <div className="flex items-start justify-between">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center text-red-400">
                  <ShieldAlert className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <span className="text-xs text-white uppercase font-black tracking-wider leading-none block mb-1">Disputed Job Contract</span>
                  <h4 className="text-sm font-black text-white">{d.serviceType || 'Professional Clean'}</h4>
                </div>
              </div>
              <span className="text-sm font-black text-red-400 bg-red-500/10 px-3 py-1.5 rounded-xl border border-red-500/20">${(d.price || 0)}</span>
            </div>

            <p className="text-xs text-white/50 leading-relaxed font-bold">
              Reason/Conflict: <span className="text-white">"{d.details || 'User requested cancel after payment lock'}"</span>
            </p>

            <div className="bg-black/40 border border-white/5 p-3 rounded-xl flex items-center justify-between">
              <span className="text-[10px] text-white/40 block">Involved Specialist: <span className="text-white font-bold">{d.cleanerName || 'Selected Specialist'}</span></span>
              <span className="text-[10px] text-white/40 block">Customer ID: <span className="text-white font-mono font-bold">#{d.customerId?.slice(0, 5)}</span></span>
            </div>

            {/* arbitration direct actions */}
            <div className="flex gap-2">
              <button 
                onClick={() => handleArbitration(d.id, 'REFUND')}
                className="flex-1 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/15 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
              >
                Refund Client
              </button>
              <button 
                onClick={() => handleArbitration(d.id, 'RELEASE')}
                className="flex-1 py-2.5 bg-[#3906d2]/15 hover:bg-[#3906d2]/25 text-[#3906d2] border border-[#3906d2]/15 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
              >
                Disburse Earnings
              </button>
              <button 
                onClick={() => handleArbitration(d.id, 'WARNING')}
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 border border-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
              >
                Warn
              </button>
            </div>
          </div>
        ))}

        {disputes.length === 0 && (
          <div className="p-12 text-center text-white/20 font-bold bg-white/5 border border-white/10 rounded-3xl">
            Clean slate! No disputed contracts in pipeline.
          </div>
        )}
      </div>
    </div>
  );
};
