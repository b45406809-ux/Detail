import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldAlert, ToggleLeft, ToggleRight, DollarSign, Clock, CheckCircle2,
  MapPin, Navigation, MessageSquare, Phone, RefreshCw, X, Check,
  ChevronRight, AlertOctagon, TrendingUp, Sparkles, Award, Wallet,
  CreditCard, ArrowUpRight, HelpCircle, UserCheck, Calendar
} from 'lucide-react';
import Map, { Marker, Source, Layer } from 'react-map-gl';
import maplibregl from 'maplibre-gl';

interface CleanerDashboardProps {
  user: any;
  profile: any;
  currentLocation: { lat: number; lng: number } | null;
  activeJob: any;
  availableJobs: any[];
  updateJobStatus: (id: string, status: string) => void;
  onSendCounterOffer: (jobId: string, counterAmount: number) => void;
  onAcceptJob: (job: any) => void;
  onPayCommission: (amount: number) => void;
  onOpenChat: (job: any) => void;
  walletBalance: number;
  userRole?: string;
  toggleRole?: (role?: any) => void;
  activeTheme?: 'light' | 'dark';
  onDeclineJob: (job: any) => void;
  myBids?: any[];
  sandboxBypass?: boolean;
}

export function CleanerDashboard({
  user,
  profile,
  currentLocation,
  activeJob,
  availableJobs,
  updateJobStatus,
  onSendCounterOffer,
  onAcceptJob,
  onPayCommission,
  onOpenChat,
  walletBalance: initialWalletBalance,
  userRole = 'CLEANER',
  toggleRole,
  activeTheme = 'light',
  onDeclineJob,
  myBids = [],
  sandboxBypass = true
}: CleanerDashboardProps) {
  
  // 1. Cleaner status and restriction simulation
  const [isOnline, setIsOnline] = useState(false);
  const [walletBalance, setWalletBalance] = useState(initialWalletBalance !== undefined ? initialWalletBalance : (profile?.balance || 0));
  const [dailyEarnings, setDailyEarnings] = useState(240);
  const [totalEarnings, setTotalEarnings] = useState(1850);
  const [commissionOwed, setCommissionOwed] = useState(profile?.commissionOwed !== undefined ? profile.commissionOwed : 0); // unpaid commission
  const [unpaidDays, setUnpaidDays] = useState(profile?.isSuspended ? 3 : 0); // >2 days => restricted account

  // Sync state with real-time profile props
  useEffect(() => {
    if (profile) {
      setWalletBalance(initialWalletBalance !== undefined ? initialWalletBalance : (profile.balance || 0));
      setCommissionOwed(profile.commissionOwed !== undefined ? profile.commissionOwed : 0);
      setUnpaidDays(profile.isSuspended ? 3 : 0);
    }
  }, [profile, initialWalletBalance]);

  // Navigation tabs inside cleaner dashboard
  const [activeTab, setActiveTab ] = useState<'DASHBOARD' | 'EARNINGS' | 'INBOX'>('DASHBOARD');

  // GPS Coordinates and OSRM turn-by-turn routing state (Symmetrical high fidelity map tracking)
  const activeJobCustLat = activeJob?.location?.lat || 40.7295;
  const activeJobCustLng = activeJob?.location?.lng || -73.9965;
  const activeJobCleanLat = activeJob?.cleanerLat !== undefined ? activeJob.cleanerLat : (activeJobCustLat + 0.008);
  const activeJobCleanLng = activeJob?.cleanerLng !== undefined ? activeJob.cleanerLng : (activeJobCustLng - 0.006);
  const [routeCoordinates, setRouteCoordinates] = useState<number[][]>([]);

  useEffect(() => {
    if (!activeJob || activeJob.status !== 'EN_ROUTE') {
      setRouteCoordinates([]);
      return;
    }

    let isSubscribed = true;
    const fetchRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${activeJobCleanLng},${activeJobCleanLat};${activeJobCustLng},${activeJobCustLat}?geometries=geojson&overview=full`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('OSRM router error');
        const data = await res.json();
        if (isSubscribed && data.routes && data.routes[0]) {
          const coords = data.routes[0].geometry.coordinates; // Array of [lng, lat]
          setRouteCoordinates(coords);
        }
      } catch (err) {
        console.warn('Failed OSRM roadmap directions fetch inside cleaner panel:', err);
        if (isSubscribed) {
          setRouteCoordinates([
            [activeJobCleanLng, activeJobCleanLat],
            [activeJobCleanLng + (activeJobCustLng - activeJobCleanLng) * 0.25, activeJobCleanLat + (activeJobCustLat - activeJobCleanLat) * 0.2],
            [activeJobCleanLng + (activeJobCustLng - activeJobCleanLng) * 0.5, activeJobCleanLat + (activeJobCustLat - activeJobCleanLat) * 0.55],
            [activeJobCleanLng + (activeJobCustLng - activeJobCleanLng) * 0.75, activeJobCleanLat + (activeJobCustLat - activeJobCleanLat) * 0.8],
            [activeJobCustLng, activeJobCustLat]
          ]);
        }
      }
    };

    fetchRoute();
    const routeInterval = setInterval(fetchRoute, 12000); // refresh every 12s
    return () => {
      isSubscribed = false;
      clearInterval(routeInterval);
    };
  }, [activeJobCleanLat, activeJobCleanLng, activeJobCustLat, activeJobCustLng, activeJob?.status]);

  // Negotiate Screen State
  const [negotiatingJob, setNegotiatingJob] = useState<any | null>(null);
  const [counterValue, setCounterValue] = useState<number>(0);
  const [localNegotiationHistory, setLocalNegotiationHistory] = useState<any[]>([]);

  // Find live bid for active negotiating job
  const liveBid = myBids?.find(b => b.jobId === negotiatingJob?.id) || null;

  // Derive history from live bid or fall back to local simulation history
  const negotiationHistory = liveBid?.negotiationHistory || localNegotiationHistory;

  // Sync range slider if live bid has a new counter proposed by customer
  useEffect(() => {
    if (liveBid && liveBid.bidPrice && liveBid.lastActionBy === 'customer') {
      setCounterValue(liveBid.bidPrice);
    }
  }, [liveBid?.bidPrice, liveBid?.lastActionBy]);

  // Simulation controls for warning or restriction demonstrations
  const isRestricted = commissionOwed > 0 && unpaidDays >= 2;

  // Sync isOnline with restriction
  useEffect(() => {
    if (isRestricted) {
      setIsOnline(false);
    }
  }, [isRestricted]);

  const handlePayCommission = () => {
    if (walletBalance >= commissionOwed) {
      setWalletBalance(prev => prev - commissionOwed);
      onPayCommission(commissionOwed);
      setCommissionOwed(0);
      setUnpaidDays(0);
      alert('⚡ Success! Outstanding commission paid in full. Your account has been automatically unlocked!');
    } else {
      alert(`⚠️ Insufficient Wallet Balance. Current: $${walletBalance.toFixed(2)}. Owed: $${commissionOwed.toFixed(2)}. Please add funds First!`);
    }
  };

  const startNegotiate = (job: any) => {
    setNegotiatingJob(job);
    // Use the latest bid price if there is an existing bid doc already!
    const existingBid = myBids?.find(b => b.jobId === job.id);
    setCounterValue(existingBid ? existingBid.bidPrice : (job.price + 10));
    setLocalNegotiationHistory([
      { sender: 'CUSTOMER', amount: job.price, text: 'Original user bid offer', time: '1m ago' }
    ]);
  };

  const submitCounterOffer = () => {
    if (negotiatingJob?.id) {
      onSendCounterOffer(negotiatingJob.id, counterValue);
    }
    
    setLocalNegotiationHistory(prev => [
      ...prev,
      { sender: 'CLEANER', amount: counterValue, text: 'Your Counter-Offer submitted', time: 'Just now' }
    ]);

    if (sandboxBypass) {
      alert(`⚡ Counter-proposal of $${counterValue} submitted to customer. Waiting for customer response...`);
      return;
    }

    // Solo sandbox automatic fallback response if bypass is disabled
    setTimeout(() => {
      const accepted = Math.random() > 0.3;
      if (accepted) {
        alert(`🎉 Customer accepted your Counter-Offer of $${counterValue}! The active job is now allocated to you.`);
        const updatedJob = { ...negotiatingJob, price: counterValue, cleanerId: user?.uid, cleanerName: profile?.displayName || 'Expert Pro' };
        onAcceptJob(updatedJob);
        setNegotiatingJob(null);
      } else {
        const counterOfCounter = Math.round(counterValue - 5);
        alert(`💬 Customer counters back with $${counterOfCounter}. Update negotiation or accept.`);
        setLocalNegotiationHistory(prev => [
          ...prev,
          { sender: 'CUSTOMER', amount: counterOfCounter, text: 'Customer countered back', time: 'Just now' }
        ]);
        setCounterValue(counterOfCounter);
      }
    }, 2000);
  };

  const customerLat = negotiatingJob?.location?.lat || -31.9505;
  const customerLng = negotiatingJob?.location?.lng || 115.8605;
  const distanceKm = 2.4; // auto calculated distance parameter
  const isDark = activeTheme === 'dark';
  const cBg = isDark ? 'bg-slate-950' : 'bg-slate-50';
  const cText = isDark ? 'text-white' : 'text-slate-900';
  const cTextMuted = isDark ? 'text-white/50' : 'text-slate-500';
  const cTextMutedLight = isDark ? 'text-white/40' : 'text-slate-400';
  const cBorder = isDark ? 'border-white/10' : 'border-slate-200';
  const cBorderMuted = isDark ? 'border-white/5' : 'border-slate-200/60';
  const cCard = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200/80 shadow-sm';
  const cJobCard = isDark ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-200/80 shadow-md shadow-slate-100';
  const cActiveJobCard = isDark ? 'bg-slate-900 border-[#3906d2]/20' : 'bg-white border-[#3906d2]/30 shadow-md shadow-slate-200/30';
  const cMiniInput = isDark ? 'bg-slate-950 border-white/5' : 'bg-slate-100 border-slate-200/40 text-slate-900';
  const cModalBg = isDark ? 'bg-slate-950/95' : 'bg-slate-50/98';

  return (
    <div id="cleaner-dashboard-flow" className={`flex-1 flex flex-col relative font-sans overflow-y-auto no-scrollbar pb-10 transition-colors duration-300 ${cBg} ${cText}`}>
      
      {/* 1. RESTRICTED ACCOUNT BLOCK SCREEN */}
      {isRestricted ? (
        <div id="account-restricted-screen" className="flex-1 flex flex-col justify-between p-6 pt-16 text-left shrink-0">
          <div className="space-y-6">
            <div className="p-4 bg-red-500/10 rounded-2.5xl border border-red-500/20 text-center space-y-3">
              <div className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center mx-auto shadow-[0_0_15px_rgba(239,68,68,0.4)]">
                <AlertOctagon className="w-7 h-7 text-white animate-pulse" />
              </div>
              <h1 className={`text-lg font-black tracking-tight uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>Account Temporarily Restricted</h1>
              <p className={`text-[10px] leading-relaxed uppercase tracking-widest font-mono ${isDark ? 'text-red-100/60' : 'text-slate-500'}`}>
                Triggered due to outstanding commission overdue for {unpaidDays} days
              </p>
            </div>

            <div className={`p-5 rounded-3xl border space-y-4 ${cCard}`}>
              <span className="text-[8px] font-black text-[#3906d2] uppercase tracking-widest block font-mono">Restricted Access Rule violation</span>
              <p className={`text-xs leading-relaxed font-bold ${cTextMuted}`}>
                As per provider guidelines, account goes offline when commission invoicing is due for more than 2 days. 
                <span className="text-red-400"> You cannot transition online or receive customer requests</span> until paid.
              </p>
              
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className={`p-3 rounded-xl text-left ${cMiniInput}`}>
                  <span className={`text-[8px] uppercase block font-heavy ${cTextMuted}`}>Outstanding Owed</span>
                  <span className="text-base font-black text-red-400">${commissionOwed.toFixed(2)}</span>
                </div>
                <div className={`p-3 rounded-xl text-left ${cMiniInput}`}>
                  <span className={`text-[8px] uppercase block font-heavy ${cTextMuted}`}>My Wallet Balance</span>
                  <span className="text-base font-black text-[#3906d2]">${walletBalance.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <p className={`text-[10px] italic text-center leading-normal ${cTextMuted}`}>
              Need more funds? Simply switch to Customer mode, select Wallet to top up with your credit card, and load credit instantly.
            </p>
          </div>

          <div className="space-y-3 pt-6">
            <button
              onClick={handlePayCommission}
              className="w-full py-4 bg-red-500 hover:bg-red-600 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg cursor-pointer"
            >
              Pay Commission Now & Auto-Unlock
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Main Cleaner Interface */}
          
          {/* A. Top Navigation Ribbon */}
          <div className={`px-6 pt-12 pb-4 border-b ${cBorderMuted} ${isDark ? 'bg-slate-900/40' : 'bg-white shadow-xs'} flex items-center justify-between`}>
            <div className="flex gap-3 items-center">
              <img 
                src={profile?.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150'} 
                alt="" 
                className="w-10 h-10 rounded-xl object-cover" 
              />
              <div className="text-left font-sans">
                <span className={`text-[8px] font-black uppercase tracking-widest block leading-none ${cTextMuted}`}>Specialist</span>
                <p className={`text-xs font-black leading-normal mt-0.5 ${cText}`}>{profile?.displayName?.split(' ')[0] || 'Sarah'}</p>
              </div>
            </div>

            {/* COMMISSION WARNING HUD HEADER */}
            {commissionOwed > 0 && unpaidDays === 1 && (
              <div className="px-3.5 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-xl max-w-[140px] text-right">
                <p className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider animate-pulse">Commission Overdue Grace 1d</p>
                <button onClick={() => alert(`Warning: You owe $${commissionOwed} commission. Pay tomorrow to prevent auto-suspension.`)} className={`text-[7px] underline ${isDark ? 'text-white/60' : 'text-slate-600'}`}>details</button>
              </div>
            )}



            {/* Interactive Live Status Toggle Widget */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsOnline(!isOnline)}
                className={`p-1.5 rounded-2xl border transition-all flex items-center gap-2 cursor-pointer ${
                  isOnline 
                    ? 'bg-[#3906d2]/15 border-[#3906d2] text-[#3906d2]' 
                    : isDark 
                      ? 'bg-slate-950 border-white/10 text-white/40' 
                      : 'bg-[#000]/10 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#3906d2] animate-pulse' : isDark ? 'bg-white/20' : 'bg-slate-400'}`} />
                <span className="text-[9px] font-black uppercase tracking-widest">{isOnline ? 'Online' : 'Offline'}</span>
              </button>
            </div>
          </div>

          {/* B. Tab Layout */}
          <div className={`px-6 pt-4 flex gap-3 border-b ${cBorderMuted}`}>
            {['DASHBOARD', 'EARNINGS'].map((tab) => {
              const isSel = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`pb-3 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                    isSel ? 'text-[#3906d2] border-b-2 border-[#3906d2] font-heavy' : cTextMuted
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* C. PAGE CONTENT SELECTOR */}
          {activeTab === 'DASHBOARD' && (
            <div className="p-6 space-y-6 text-left animate-fade-in">
              
              {/* Daily Statistics Banner */}
              <div className="grid grid-cols-3 gap-3">
                <div className={`p-4 rounded-2xl border ${cCard}`}>
                  <span className={`text-[8px] uppercase font-black block ${cTextMuted}`}>Today Earnings</span>
                  <span className={`text-sm font-black ${cText}`}>${dailyEarnings}</span>
                </div>
                <div className={`p-4 rounded-2xl border ${cCard}`}>
                  <span className={`text-[8px] uppercase font-black block ${cTextMuted}`}>Commissions</span>
                  <span className="text-sm font-black text-rose-500">${commissionOwed}</span>
                </div>
                <div className={`p-4 rounded-2xl border ${cCard}`}>
                  <span className={`text-[8px] uppercase font-black block ${cTextMuted}`}>My Wallet</span>
                  <span className="text-sm font-black text-emerald-500 font-mono">${walletBalance}</span>
                </div>
              </div>

              {/* ACTIVE JOB SCREEN (CLEANER SIDE) */}
              {activeJob ? (
                <div id="active-job-cleaner-interface" className={`p-5 rounded-3xl border space-y-4 ${cActiveJobCard}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="px-3 py-1 bg-[#3906d2]/15 text-[#3906d2] rounded-full text-[8px] font-black uppercase tracking-widest">
                        Active Cleaning In Progress
                      </span>
                      <h3 className={`text-sm font-black mt-2 uppercase tracking-wide ${cText}`}>#{activeJob.serviceType || 'Residential Clean'}</h3>
                      <p className={`text-[10px] leading-relaxed mt-1 ${cTextMuted}`}>{activeJob.location?.address || 'Designated Soho Location'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-[#3906d2]">${activeJob.price || 55}</p>
                      <p className={`text-[8px] uppercase ${cTextMutedLight}`}>Fee Locked</p>
                    </div>
                  </div>

                  {/* Real-time Interactive Map HUD (Cleaner Side) */}
                  <div className={`relative h-[220px] w-full rounded-2xl overflow-hidden border ${isDark ? 'bg-slate-900 border-white/10' : 'bg-slate-100 border-slate-200'}`}>
                    <Map
                      initialViewState={{
                        latitude: (activeJobCustLat + activeJobCleanLat) / 2,
                        longitude: (activeJobCustLng + activeJobCleanLng) / 2,
                        zoom: 13.5
                      }}
                      mapLib={maplibregl}
                      style={{ width: '100%', height: '100%' }}
                      mapStyle={activeTheme === 'dark' ? "https://tiles.openfreemap.org/styles/dark" : "https://tiles.openfreemap.org/styles/bright"}
                      attributionControl={false}
                    >
                      {/* En-Route turn-by-turn Navigation line (just like Customer view) */}
                      {activeJob?.status === 'EN_ROUTE' && (
                        <Source 
                          id="route-line-source-cleaner" 
                          type="geojson" 
                          data={{
                            type: 'Feature' as const,
                            properties: {},
                            geometry: {
                              type: 'LineString' as const,
                              coordinates: routeCoordinates.length > 0 ? routeCoordinates : [
                                [activeJobCleanLng, activeJobCleanLat],
                                [activeJobCustLng, activeJobCustLat]
                              ]
                            }
                          }}
                        >
                          <Layer
                            id="route-line-layer-cleaner"
                            type="line"
                            layout={{
                              'line-cap': 'round',
                              'line-join': 'round'
                            }}
                            paint={{
                              'line-color': '#3906d2',
                              'line-width': 5,
                              'line-opacity': 0.85
                            }}
                          />
                        </Source>
                      )}

                      {/* Customer Job Location Pin */}
                      <Marker latitude={activeJobCustLat} longitude={activeJobCustLng}>
                        <div className="relative flex items-center justify-center">
                          <div className="absolute w-12 h-12 bg-indigo-500/20 rounded-full animate-ping pointer-events-none"></div>
                          <div className={`w-8 h-8 rounded-full border border-indigo-500 flex items-center justify-center shadow-2xl ${isDark ? 'bg-slate-950 text-white' : 'bg-white text-slate-800'}`}>
                            <MapPin className="w-4 h-4 text-indigo-400" />
                          </div>
                        </div>
                      </Marker>

                      {/* Cleaner Custom En-Route Navigation Marker */}
                      <Marker latitude={activeJobCleanLat} longitude={activeJobCleanLng}>
                        <motion.div 
                          animate={{ scale: [1, 1.05, 1] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="relative flex items-center justify-center"
                        >
                          <div className="absolute w-14 h-14 bg-[#3906d2]/20 rounded-full animate-ping pointer-events-none"></div>
                          <div className={`w-9 h-9 rounded-2xl bg-[#3906d2] border flex items-center justify-center shadow-xl ${isDark ? 'border-slate-950' : 'border-white'}`}>
                            <Navigation className="w-5 h-5 text-white fill-current rotate-45" />
                          </div>
                        </motion.div>
                      </Marker>
                    </Map>

                    {/* Compact floating navigation directions strip */}
                    {activeJob?.status === 'EN_ROUTE' && (
                      <div className="absolute bottom-2 left-2 right-2 bg-slate-950/90 text-white p-2.5 rounded-xl flex items-center gap-2.5 backdrop-blur-md border border-white/10 shadow-lg text-left">
                        <Navigation className="w-4 h-4 text-[#3906d2] fill-current animate-pulse shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase text-[#3906d2] tracking-wider leading-none">Directions</p>
                          <p className="text-[9px] font-medium truncate mt-1 text-slate-200">Head Northeast on Lafayette St toward Spring St • 400m</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Steps for Active Job */}
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      onClick={() => {
                        onOpenChat(activeJob);
                      }}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-wider border flex items-center justify-center gap-1.5 cursor-pointer ${
                        isDark 
                          ? 'bg-white/5 border-white/5 hover:bg-white/10 text-white/80' 
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#3906d2]" />
                      Message Client
                    </button>
                    <button
                      onClick={() => {
                        const nextStatusMap: Record<string, string> = {
                          'ACCEPTED': 'EN_ROUTE',
                          'EN_ROUTE': 'ARRIVED',
                          'ARRIVED': 'IN_PROGRESS',
                          'IN_PROGRESS': 'COMPLETED'
                        };
                        const next = nextStatusMap[activeJob.status] || 'COMPLETED';
                        updateJobStatus(activeJob.id, next);
                      }}
                      className="py-3 bg-[#3906d2] hover:opacity-90 text-white rounded-xl text-[10px] font-display font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all"
                    >
                      {activeJob.status === 'ACCEPTED' && 'Start Trip'}
                      {activeJob.status === 'EN_ROUTE' && 'Signal Arrival'}
                      {activeJob.status === 'ARRIVED' && 'Start Cleaning'}
                      {activeJob.status === 'IN_PROGRESS' && 'Deliver Finished Service'}
                    </button>
                  </div>
                </div>
              ) : null}

              {/* INCOMING REQUEST SCREEN (CLEANER) */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-[10px] uppercase font-black tracking-widest text-[#3906d2]">Incoming Bidding Proposals</h3>
                  <div className="flex gap-1.5">
                    <button className={`p-1 px-2.5 rounded-full border text-[9px] font-mono font-bold ${cMiniInput}`}>
                      Nearby radius: 5km
                    </button>
                  </div>
                </div>

                {!isOnline ? (
                  <div className={`py-12 rounded-3xl border border-dashed text-center space-y-3 ${isDark ? 'bg-white/2 border-white/10' : 'bg-white border-slate-200/80 shadow-xs'}`}>
                    <p className={`text-[10px] uppercase font-black tracking-widest ${cTextMuted}`}>You are currently offline</p>
                    <button
                      onClick={() => setIsOnline(true)}
                      className="px-6 py-2 bg-[#3906d2] hover:opacity-90 text-white rounded-full font-black text-[10px] uppercase tracking-wider cursor-pointer active:scale-95 transition-all"
                    >
                      Toggle Online Go Live
                    </button>
                  </div>
                ) : availableJobs.length === 0 ? (
                  <div className={`py-12 rounded-3xl border border-dashed text-center space-y-2 ${isDark ? 'bg-white/2 border-white/10 text-white/35' : 'bg-white border-slate-200 shadow-xs text-slate-400'}`}>
                    <p className={`text-[10px] uppercase font-black tracking-widest ${cTextMuted}`}>Waiting for active signals...</p>
                    <p className={`text-[8px] leading-normal ${cTextMutedLight}`}>Smart match routing is continuously scanning the local area</p>
                  </div>
                ) : (
                  <div className="space-y-4 font-sans text-left">
                    {availableJobs.map((job) => {
                      return (
                        <div key={job.id} className={`p-5 rounded-2.5xl border text-left space-y-3 ${cJobCard}`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[8px] font-black uppercase text-[#3906d2] tracking-widest block font-mono">
                                Inbound Request • New Bid
                              </span>
                              <h4 className={`text-xs font-black uppercase mt-1 ${cText}`}>#{job.serviceType || 'Bespoke Clean'}</h4>
                              <p className={`text-[9px] truncate max-w-[200px] mt-0.5 ${cTextMuted}`}>{job.location?.address}</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-xs font-mono font-black ${cText}`}>${job.price}</p>
                              <span className={`text-[7px] uppercase tracking-tight block ${cTextMuted}`}>User Initial Bid</span>
                            </div>
                          </div>

                          {/* Distance & vehicle type */}
                          <div className={`flex gap-4 items-center py-2 border-y text-[9px] uppercase font-bold tracking-wider ${cBorderMuted} ${cTextMuted}`}>
                            <div className="flex items-center gap-1 font-mono">
                              <MapPin className="w-3 h-3 text-[#3906d2]" />
                              Distance: {distanceKm}km away
                            </div>
                            <div className="flex items-center gap-1 font-mono">
                              <Navigation className="w-3 h-3 text-[#3906d2]" />
                              Transit: Eco/Sedan Vehicle Mode
                            </div>
                          </div>

                          {/* Quick decision group */}
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              onClick={() => {
                                onDeclineJob(job);
                              }}
                              className={`py-2.5 border rounded-xl text-[9px] font-black uppercase text-red-500 cursor-pointer hover:bg-red-500/5 ${
                                isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              Decline
                            </button>
                            <button
                              onClick={() => startNegotiate(job)}
                              className={`py-2.5 border rounded-xl text-[9px] font-black uppercase text-[#3906d2] cursor-pointer hover:opacity-90 ${
                                isDark ? 'bg-[#3906d2]/15 border-[#3906d2]/20' : 'bg-[#3906d2]/10 border-[#3906d2]/40'
                              }`}
                            >
                              Negotiate
                            </button>
                            <button
                              onClick={() => {
                                const accJob = { ...job, cleanerId: user?.uid, cleanerName: profile?.displayName || 'Sarah Jenkins' };
                                onAcceptJob(accJob);
                              }}
                              className="py-2.5 bg-[#3906d2] hover:opacity-90 rounded-xl text-[9px] font-black uppercase text-white cursor-pointer active:scale-95 transition-all"
                            >
                              Accept Now
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* D. EARNINGS TAB */}
          {activeTab === 'EARNINGS' && (
            <div className="p-6 space-y-6 text-left animate-fade-in font-sans">
              <div className={`p-6 rounded-3xl border space-y-4 ${cJobCard}`}>
                <div>
                  <span className={`text-[8px] uppercase font-black block ${cTextMuted}`}>Specialist Total Cleaned Earnings</span>
                  <span className="text-3xl font-black text-[#3906d2]">${totalEarnings.toFixed(2)}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                    <span className={`text-[7px] uppercase font-black block leading-none ${cTextMuted}`}>Completed handshakes</span>
                    <span className={`text-sm font-black ${cText}`}>44 Jobs completed</span>
                  </div>
                  <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                    <span className={`text-[7px] uppercase font-black block leading-none ${cTextMuted}`}>Platform rating average</span>
                    <span className={`text-sm font-black ${cText}`}>4.95 ⭐</span>
                  </div>
                </div>
              </div>

              {/* Commission Warnings and alert boxes in Earnings Screen */}
              {commissionOwed > 0 && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex gap-3">
                  <ShieldAlert className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-[10px] font-black text-yellow-500 uppercase tracking-wide">Outstanding Platform Commission</h5>
                    <p className={`text-[9px] leading-relaxed mt-1 ${cTextMuted}`}>
                      You owe a pending commission balance of <span className="text-rose-500 font-black">${commissionOwed.toFixed(2)}</span>. 
                      Grace period countdown: <span className="font-mono text-[#3906d2] font-heavy font-black">22 hours remaining</span> to avoid automatic service lock down.
                    </p>
                    <button 
                      onClick={handlePayCommission}
                      className="mt-2 text-[8px] font-black text-yellow-500 uppercase underline block cursor-pointer"
                    >
                      Instant Settlement
                    </button>
                  </div>
                </div>
              )}

              {/* Transaction History */}
              <div className="space-y-4">
                <span className={`text-[9px] uppercase font-black tracking-widest block ${cTextMuted}`}>Contract Clearance History</span>
                <div className="space-y-3 font-sans">
                  {[
                    { id: 't1', service: 'Deep Studio Clean', date: 'May 23, 2026', amount: 95.00, status: 'Released' },
                    { id: 't2', service: 'Residential Clean 3bhk', date: 'May 22, 2026', amount: 120.00, status: 'Released' },
                    { id: 't3', service: 'Regular Maintenance Sweep', date: 'May 20, 2026', amount: 55.00, status: 'Released' },
                  ].map((hist, i) => (
                    <div key={hist.id} className={`p-4 rounded-xl border flex justify-between items-center text-xs ${cCard}`}>
                      <div>
                        <p className={`font-black text-xs uppercase ${cText}`}>{hist.service}</p>
                        <p className={`text-[8px] ${cTextMuted}`}>{hist.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-emerald-500 font-mono">+${hist.amount.toFixed(2)}</p>
                        <span className={`text-[7px] uppercase ${cTextMuted}`}>{hist.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* E. NEGOTIATION SCREEN MODAL */}
          <AnimatePresence>
            {negotiatingJob && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`fixed inset-0 backdrop-blur-md z-[550] flex flex-col justify-between p-6 pt-16 ${cModalBg}`}
              >
                <div className="space-y-6">
                  <div className={`flex justify-between items-center pb-2 border-b ${cBorder}`}>
                    <div>
                      <span className="text-[8px] uppercase font-black text-[#3906d2] tracking-widest">Active Negotiations</span>
                      <h2 className={`text-base font-black uppercase ${cText}`}>#{negotiatingJob.serviceType}</h2>
                    </div>
                    <button 
                      onClick={() => setNegotiatingJob(null)} 
                      className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer ${
                        isDark ? 'bg-white/5 text-white/60 hover:text-white' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                      }`}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Bidding timeline display */}
                  <div className="space-y-3 text-left">
                    <span className={`text-[8px] uppercase font-black tracking-widest block ${cTextMuted}`}>Negotiation Bid Timeline</span>
                    <div className={`space-y-2 p-4 rounded-2xl border text-left ${cCard}`}>
                      {negotiationHistory.map((h, index) => (
                        <div key={index} className={`flex justify-between items-center text-[10px] pb-2 border-b last:border-b-0 last:pb-0 font-bold ${cBorder}`}>
                          <span className={h.sender === 'CUSTOMER' || h.sender === 'customer' ? 'text-indigo-500 font-heavy' : 'text-[#3906d2] font-heavy'}>
                            {h.sender === 'CUSTOMER' || h.sender === 'customer' ? 'Customer Offer' : 'Cleaner Proposal'}
                          </span>
                          <span className={`font-mono ${cText}`}>${h.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Range Slider for Counter offer */}
                  <div className={`p-5 rounded-3xl border space-y-4 text-left ${cCard}`}>
                    <div className="flex justify-between items-center">
                      <span className={`text-[10px] uppercase font-black ${cTextMuted}`}>Counter offer value</span>
                      <span className="text-2xl font-black text-[#3906d2] font-mono">${counterValue}</span>
                    </div>

                    <input 
                      type="range"
                      min={negotiatingJob.price - 10}
                      max={negotiatingJob.price + 50}
                      step={1}
                      value={counterValue}
                      onChange={(e) => setCounterValue(Number(e.target.value))}
                      className="w-full accent-[#3906d2] cursor-pointer"
                    />

                    <div className={`flex justify-between text-[8px] uppercase font-black ${cTextMuted}`}>
                      <span>Min: ${negotiatingJob.price - 10}</span>
                      <span>Original: ${negotiatingJob.price}</span>
                      <span>Max: ${negotiatingJob.price + 50}</span>
                    </div>
                  </div>

                  <p className={`text-[9px] italic leading-snug text-left ${cTextMuted}`}>
                    Our automated escrow structure prevents price exploitation. Counter proposals keep client budget parameters safe within algorithmic corridors.
                  </p>
                </div>

                <div className="space-y-3 pt-6 flex flex-col gap-2">
                  {liveBid && liveBid.lastActionBy === 'customer' && (
                    <button
                      onClick={() => {
                        const accJob = { ...negotiatingJob, price: liveBid.bidPrice, cleanerId: user?.uid, cleanerName: profile?.displayName || 'Expert Pro' };
                        onAcceptJob(accJob);
                        setNegotiatingJob(null);
                        alert(`🎉 You accepted the customer's proposal at $${liveBid.bidPrice}!`);
                      }}
                      className="w-full py-4 bg-emerald-600 font-sans text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-emerald-500 active:scale-95 transition-all cursor-pointer"
                    >
                      Accept Customer's Counter (${liveBid.bidPrice})
                    </button>
                  )}
                  <button
                    onClick={submitCounterOffer}
                    className="w-full py-4.5 bg-[#3906d2] text-white font-black text-xs uppercase tracking-widest rounded-xl hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                  >
                    Submit Counter Proposal
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </>
      )}

    </div>
  );
}
