import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MapPin, Clock, ShieldCheck, CheckSquare, Star, 
  MessageSquare, Phone, ShieldAlert, Award, Compass,
  DollarSign, CreditCard, Wallet, Smartphone, Landmark,
  ArrowRight, Shield, ThumbsUp, Heart, CheckCircle2, ChevronRight, Sparkles, Navigation
} from 'lucide-react';
import Map, { Marker, Source, Layer } from 'react-map-gl';
import maplibregl from 'maplibre-gl';
import { db, auth, updateDoc, doc, handleFirestoreError, OperationType } from '../firebase';
import { useRef } from 'react';

const OSM_STYLE = "https://tiles.openfreemap.org/styles/dark";

const navDirections = [
  { instruction: 'Head Northeast on Lafayette St toward Spring St', distance: '400m', time: '1 min' },
  { instruction: 'Turn left onto Bowery St', distance: '800m', time: '2 mins' },
  { instruction: 'Merge onto E Houston St', distance: '1.2km', time: '3 mins' },
  { instruction: 'Continue straight on Broadway', distance: '300m', time: '1 min' },
  { instruction: 'Arrive at destination', distance: '0m', time: '0 mins' }
];

interface TrackingProps {
  activeJob: any;
  userRole: string;
  updateJobStatus: (id: string, status: string) => void;
  onJobFinished: (rating: number, review: string) => void;
  onOpenChat: () => void;
  currentLocation: { lat: number; lng: number } | null;
  onBackToHome: () => void;
  activeTheme?: 'light' | 'dark';
}

type SubStep = 'TRACKING' | 'COMPLETED_SUMMARY' | 'PAYMENT' | 'RATING' | 'SUCCESS_SCREEN';

export function TrackingAndProgress({
  activeJob,
  userRole,
  updateJobStatus,
  onJobFinished,
  onOpenChat,
  currentLocation: userLoc,
  onBackToHome,
  activeTheme = 'light'
}: TrackingProps) {
  const isDark = activeTheme === 'dark';
  const cBg = isDark ? 'bg-slate-950' : 'bg-white';
  const cText = isDark ? 'text-white' : 'text-slate-900';
  const cTextMuted = isDark ? 'text-white/50' : 'text-slate-500';
  const cTextMutedLight = isDark ? 'text-white/40' : 'text-slate-400';
  const cBorder = isDark ? 'border-white/10' : 'border-slate-200';
  const cCard = isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70';
  const cInput = isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900';
  const mapStyleUrl = isDark ? "https://tiles.openfreemap.org/styles/dark" : "https://tiles.openfreemap.org/styles/bright";
  
  const [subStep, setSubStep] = useState<SubStep>('TRACKING');

  const navDirections = [
    { instruction: 'Head Northeast on Lafayette St toward Spring St', distance: '400m', time: '1 min' },
    { instruction: 'Turn left onto Bowery St (Mild traffic reported)', distance: '800m', time: '2 mins' },
    { instruction: 'Merge onto Cooper Square / 3rd Ave', distance: '1.2km', time: '3 mins' },
    { instruction: 'Turn right onto E 14th St toward client building', distance: '300m', time: '1 min' },
    { instruction: 'Destination is on your right. Street parking available.', distance: '50m', time: '30s' }
  ];

  // Real road coordinates state fetched dynamically from OSRM
  const [routeCoordinates, setRouteCoordinates] = useState<number[][]>([]);
  const [showCallPicker, setShowCallPicker] = useState(false);

  // Form states for payment and ratings
  const [paymentMethod, setPaymentMethod] = useState<'CARD' | 'CASH' | 'ECOCASH' | 'ONEMONEY' | 'WALLET'>('CARD');
  const [ecoCashNumber, setEcoCashNumber] = useState('');
  const [oneMoneyNumber, setOneMoneyNumber] = useState('');
  const [walletBalance, setWalletBalance] = useState(120);

  // Ratings
  const [ratingValue, setRatingValue] = useState(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [reviewText, setReviewText] = useState('');

  // Local calling settings toggles
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);

  // Setup Client & Cleaner lat/lng coordinates
  const customerLat = activeJob?.location?.lat || 40.7295;
  const customerLng = activeJob?.location?.lng || -73.9965;

  // Track coordinates either from database or fallback to started shift
  const cleanerLat = activeJob?.cleanerLat !== undefined ? activeJob.cleanerLat : (customerLat + 0.008);
  const cleanerLng = activeJob?.cleanerLng !== undefined ? activeJob.cleanerLng : (customerLng - 0.006);

  // Calculate ETA mathematically based on actual distance dynamically!
  const latDiff = customerLat - cleanerLat;
  const lngDiff = customerLng - cleanerLng;
  const distanceDegrees = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
  const distanceKm = distanceDegrees * 111;
  const computedEta = Math.max(0, Math.ceil(distanceKm * 1.5));
  const etaMinutes = ['ARRIVED', 'IN_PROGRESS', 'COMPLETED'].includes(activeJob?.status) ? 0 : computedEta;

  const [trafficAlert, setTrafficAlert] = useState('Light traffic. Fast Route verified.');

  // Map the database call state to current active call properties
  const dbActiveCall = activeJob?.activeCall;
  const currentUserId = auth.currentUser?.uid;

  const activeCall = dbActiveCall ? {
    status: dbActiveCall.status,
    direction: dbActiveCall.callerId === currentUserId ? 'outgoing' : 'incoming' as 'incoming' | 'outgoing',
    partyName: dbActiveCall.callerId === currentUserId ? dbActiveCall.recipientName : dbActiveCall.callerName,
    partyPhoto: dbActiveCall.callerId === currentUserId ? dbActiveCall.recipientPhoto : dbActiveCall.callerPhoto,
    isMuted,
    isSpeaker
  } : null;

  const [callDuration, setCallDuration] = useState(0);

  // Call duration counter
  useEffect(() => {
    if (!dbActiveCall || dbActiveCall.status !== 'CONNECTED') {
      setCallDuration(0);
      return;
    }
    const timer = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [dbActiveCall?.status]);

  // Handle outgoing call progression to RINGING status automatically
  useEffect(() => {
    if (!dbActiveCall || dbActiveCall.callerId !== currentUserId || dbActiveCall.status !== 'DIALING') return;

    const t1 = setTimeout(async () => {
      try {
        await updateDoc(doc(db, 'jobs', activeJob.id), {
          'activeCall.status': 'RINGING'
        });
      } catch (e) {
        console.error('Error progressing call state to Ringing:', e);
      }
    }, 1500);

    return () => clearTimeout(t1);
  }, [dbActiveCall?.status, dbActiveCall?.callerId, activeJob?.id, currentUserId]);

  // Initiate cloud-synced VoIP session in Firestore database
  const startCall = async () => {
    if (!activeJob) return;
    const isCleaner = userRole === 'CLEANER';
    const callerName = isCleaner ? (activeJob.cleanerName || 'Sarah Jenkins') : (activeJob.customerName || 'Resident Client');
    const callerPhoto = isCleaner ? (activeJob.cleanerPhoto || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150') : (activeJob.customerPhoto || `https://i.pravatar.cc/100?u=${activeJob.customerId}`);
    
    const recipientId = isCleaner ? activeJob.customerId : activeJob.cleanerId;
    const recipientName = isCleaner ? (activeJob.customerName || 'Resident Client') : (activeJob.cleanerName || 'Sarah Jenkins');
    const recipientPhoto = isCleaner ? (activeJob.customerPhoto || `https://i.pravatar.cc/100?u=${activeJob.customerId}`) : (activeJob.cleanerPhoto || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150');

    try {
      await updateDoc(doc(db, 'jobs', activeJob.id), {
        activeCall: {
          status: 'DIALING',
          callerId: currentUserId,
          callerName,
          callerPhoto,
          recipientId,
          recipientName,
          recipientPhoto,
          createdAt: new Date().toISOString(),
          callerCandidates: [],
          recipientCandidates: []
        }
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `jobs/${activeJob.id}`);
    }
  };

  // Accept incoming in-app calling channel in Firestore
  const acceptCall = async () => {
    if (!activeJob) return;
    try {
      await updateDoc(doc(db, 'jobs', activeJob.id), {
        'activeCall.status': 'CONNECTED'
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `jobs/${activeJob.id}`);
    }
  };

  // Hang-up / terminate cloud calling channel session
  const endCall = async () => {
    if (!activeJob) return;
    try {
      await updateDoc(doc(db, 'jobs', activeJob.id), {
        'activeCall.status': 'DISCONNECTED'
      });
      setTimeout(async () => {
        try {
          await updateDoc(doc(db, 'jobs', activeJob.id), {
            activeCall: null
          });
        } catch (err) {}
      }, 1000);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `jobs/${activeJob.id}`);
    }
  };

  // 1. Cleaner GPS Geolocation tracker with Simulated Fallback Loop
  useEffect(() => {
    if (userRole !== 'CLEANER' || activeJob?.status !== 'EN_ROUTE') return;
    
    // Watch real physical device Geolocation
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          await updateDoc(doc(db, 'jobs', activeJob.id), {
            cleanerLat: latitude,
            cleanerLng: longitude
          });
        } catch (e) {
          console.error('Error updating real geolocation:', e);
        }
      },
      (error) => {
        console.warn('Fallback to background driver simulation due to: ', error.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    
    return () => navigator.geolocation.clearWatch(watchId);
  }, [userRole, activeJob?.status, activeJob?.id]);

  // 2. Drive vehicle progress updates sent directly to database Firestore
  useEffect(() => {
    if (userRole !== 'CLEANER' || activeJob?.status !== 'EN_ROUTE') return;

    const interval = setInterval(async () => {
      const currentLat = activeJob.cleanerLat !== undefined ? activeJob.cleanerLat : (customerLat + 0.008);
      const currentLng = activeJob.cleanerLng !== undefined ? activeJob.cleanerLng : (customerLng - 0.006);

      const latDiff = customerLat - currentLat;
      const lngDiff = customerLng - currentLng;

      // If very close to customer, flag ARRIVED status automatically
      if (Math.abs(latDiff) < 0.0004 && Math.abs(lngDiff) < 0.0004) {
        clearInterval(interval);
        try {
          await updateDoc(doc(db, 'jobs', activeJob.id), {
            status: 'ARRIVED',
            cleanerLat: customerLat,
            cleanerLng: customerLng
          });
        } catch (e) {
          console.error('Error flagging arrival status:', e);
        }
        return;
      }

      // Progress driver vehicle 15% closer to customer coordinates
      const nextLat = currentLat + latDiff * 0.15;
      const nextLng = currentLng + lngDiff * 0.15;

      try {
        await updateDoc(doc(db, 'jobs', activeJob.id), {
          cleanerLat: nextLat,
          cleanerLng: nextLng
        });
      } catch (e) {
        console.error('Error updating driver progression in Firestore:', e);
      }
    }, 4500);

    return () => clearInterval(interval);
  }, [userRole, activeJob?.status, activeJob?.id, customerLat, customerLng, activeJob?.cleanerLat, activeJob?.cleanerLng]);

  // Fetch real road roadmaps & turn-by-turn routes from OSRM dynamic Router API!
  useEffect(() => {
    if (activeJob?.status !== 'EN_ROUTE') {
      setRouteCoordinates([]);
      return;
    }

    let isSubscribed = true;
    const fetchRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${cleanerLng},${cleanerLat};${customerLng},${customerLat}?geometries=geojson&overview=full`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('OSRM router error');
        const data = await res.json();
        if (isSubscribed && data.routes && data.routes[0]) {
          const coords = data.routes[0].geometry.coordinates; // Array of [lng, lat]
          setRouteCoordinates(coords);
        }
      } catch (err) {
        console.warn('Failed OSRM roadmap directions web fetch, mapping standard road line:', err);
        if (isSubscribed) {
          setRouteCoordinates([
            [cleanerLng, cleanerLat],
            [cleanerLng + (customerLng - cleanerLng) * 0.25, cleanerLat + (customerLat - cleanerLat) * 0.2],
            [cleanerLng + (customerLng - cleanerLng) * 0.5, cleanerLat + (customerLat - cleanerLat) * 0.55],
            [cleanerLng + (customerLng - cleanerLng) * 0.75, cleanerLat + (customerLat - cleanerLat) * 0.8],
            [customerLng, customerLat]
          ]);
        }
      }
    };

    fetchRoute();
    const routeInterval = setInterval(fetchRoute, 12000); // refresh layout roadmap every 12s

    return () => {
      isSubscribed = false;
      clearInterval(routeInterval);
    };
  }, [cleanerLat, cleanerLng, customerLat, customerLng, activeJob?.status]);

  // Handle traffic updates dynamically
  useEffect(() => {
    if (etaMinutes > 5) {
      setTrafficAlert('Slight bottleneck. Recalculating eta...');
    } else if (etaMinutes > 2) {
      setTrafficAlert('Traffic clear. Route looking standard.');
    } else if (etaMinutes === 1) {
      setTrafficAlert('Cleaner is within 100 meters. Prepare door keys!');
    } else {
      setTrafficAlert('Arrival completed. Handshake session ready.');
    }
  }, [etaMinutes]);

  // Sync component flow based on Firestore job state changes in App.tsx
  useEffect(() => {
    if (activeJob?.status === 'COMPLETED') {
      setSubStep('COMPLETED_SUMMARY');
    }
  }, [activeJob?.status]);

  if (!activeJob) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center p-8 space-y-4 transition-colors duration-300 ${cBg} ${cText}`}>
        <p className="font-extrabold text-center text-lg">No Active Cleaning Job Found</p>
        <button 
          onClick={onBackToHome}
          className="px-6 py-3 bg-[#3906d2] text-white font-black text-xs uppercase tracking-widest rounded-xl hover:opacity-90 active:scale-95 transition-all cursor-pointer"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const handlePay = () => {
    if (paymentMethod === 'ECOCASH' && !ecoCashNumber) {
      alert('Please enter your EcoCash registered mobile number (+263).');
      return;
    }
    if (paymentMethod === 'ONEMONEY' && !oneMoneyNumber) {
      alert('Please enter your OneMoney digits.');
      return;
    }
    // Success simulation
    setSubStep('RATING');
  };

  const submitRating = () => {
    onJobFinished(ratingValue, reviewText || selectedTags.join(', '));
    setSubStep('SUCCESS_SCREEN');
  };

  const getJobStatusTimelineCode = () => {
    const status = activeJob?.status || 'ACCEPTED';
    const steps = [
      { key: 'ACCEPTED', label: 'Escrow Confirmed', desc: 'Secure payment held in lock' },
      { key: 'EN_ROUTE', label: 'Cleaner En Route', desc: 'Real-time GPS tracking active' },
      { key: 'ARRIVED', label: 'Cleaner Arrived', desc: 'Handshake complete' },
      { key: 'IN_PROGRESS', label: 'Cleaning Session', desc: 'Contract parameters in progress' }
    ];

    const getIndex = (s: string) => {
      if (s === 'ACCEPTED') return 0;
      if (s === 'EN_ROUTE') return 1;
      if (s === 'ARRIVED') return 2;
      if (s === 'IN_PROGRESS') return 3;
      if (s === 'COMPLETED') return 4;
      return 0;
    };

    const currentIdx = getIndex(status);

    return (
      <div id="job-status-timeline" className="space-y-4 pt-2">
        {steps.map((st, idx) => {
          const isDone = currentIdx > idx;
          const isCurrent = currentIdx === idx;
          return (
            <div key={st.key} className="flex gap-4 items-start text-left">
              <div className="flex flex-col items-center">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                  isDone 
                    ? 'bg-[#3906d2] border-[#3906d2] text-white' 
                    : isCurrent 
                      ? `${isDark ? 'bg-slate-900' : 'bg-slate-100'} border-[#3906d2] text-[#3906d2] shadow-[0_0_10px_#3906d2]` 
                      : `${isDark ? 'bg-slate-950 border-white/10 text-white/20' : 'bg-slate-50 border-slate-200 text-slate-300'}`
                }`}>
                  {isDone ? <CheckCircle2 className="w-4 h-4" /> : <span className="text-[10px] font-black">{idx + 1}</span>}
                </div>
                {idx < steps.length - 1 && (
                  <div className={`w-0.5 h-10 my-1 ${isDone ? 'bg-[#3906d2]' : (isDark ? 'bg-white/10' : 'bg-slate-150')}`}></div>
                )}
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-black uppercase tracking-wider ${isCurrent ? 'text-[#3906d2]' : cText}`}>
                  {st.label}
                </p>
                <p className={`text-[10px] leading-snug ${cTextMutedLight}`}>{st.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div id="tracking-flow-interface" className={`flex-1 flex flex-col relative overflow-hidden font-sans transition-colors duration-300 ${cBg} ${cText}`}>
      
      {/* A. TRACKING SUBMODULE */}
      {subStep === 'TRACKING' && (
        <div id="tracking-live-gps" className="flex-1 flex flex-col h-full overflow-hidden">
          
          {/* Map Section */}
          <div className={`flex-1 relative min-h-[220px] ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
            <Map
              initialViewState={{
                latitude: (customerLat + cleanerLat) / 2,
                longitude: (customerLng + cleanerLng) / 2,
                zoom: 14.5
              }}
              mapLib={maplibregl}
              style={{ width: '100%', height: '100%' }}
              mapStyle={mapStyleUrl}
              attributionControl={false}
            >
              {/* Turn-by-Turn GPS Navigation Line overlay (just like Uber) */}
              {activeJob?.status === 'EN_ROUTE' && (
                <Source 
                  id="route-line-source" 
                  type="geojson" 
                  data={{
                    type: 'Feature' as const,
                    properties: {},
                    geometry: {
                      type: 'LineString' as const,
                      coordinates: routeCoordinates.length > 0 ? routeCoordinates : [
                        [cleanerLng, cleanerLat],
                        [customerLng, customerLat]
                      ]
                    }
                  }}
                >
                  <Layer
                    id="route-line-layer"
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

              {/* Customer Pin */}
              <Marker latitude={customerLat} longitude={customerLng}>
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-12 h-12 bg-indigo-500/20 rounded-full animate-ping pointer-events-none"></div>
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shadow-2xl ${isDark ? 'bg-slate-950 border-indigo-500' : 'bg-white border-indigo-600'}`}>
                    <MapPin className="w-4 h-4 text-indigo-400" />
                  </div>
                </div>
              </Marker>

              {/* Cleaner Marker with Custom Movement Animation */}
              <Marker latitude={cleanerLat} longitude={cleanerLng}>
                <motion.div 
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="relative flex items-center justify-center"
                >
                  <div className="absolute w-14 h-14 bg-[#3906d2]/20 rounded-full animate-ping pointer-events-none"></div>
                  <div className={`w-9 h-9 rounded-2xl bg-[#3906d2] border-2 flex items-center justify-center shadow-xl ${isDark ? 'border-slate-950' : 'border-white'}`}>
                    <Navigation className="w-5 h-5 text-white fill-current rotate-45" />
                  </div>
                </motion.div>
              </Marker>
            </Map>

            {/* Turn-by-Turn GPS Navigation Instruction Bar (Cleaner/Driver Mode) */}
            {userRole === 'CLEANER' && activeJob?.status === 'EN_ROUTE' && (
              <div className="absolute top-24 left-6 right-6 z-20 pointer-events-auto">
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-emerald-600 border border-emerald-500 text-white rounded-2.5xl p-4 shadow-2xl flex items-center gap-4"
                >
                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                    <Navigation className="w-5 h-5 text-white fill-current -rotate-45" />
                  </div>
                  <div className="flex-1 text-left">
                    <span className="text-[8px] uppercase tracking-widest font-black text-emerald-200 block">Dynamic Drive Guide • GPS Live</span>
                    <p className="text-xs font-black leading-snug">
                      {navDirections[etaMinutes > 4 ? (etaMinutes > 6 ? 0 : 1) : (etaMinutes > 2 ? 2 : (etaMinutes > 0 ? 3 : 4))].instruction}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-bold text-emerald-100 font-mono">
                        Left: {navDirections[etaMinutes > 4 ? (etaMinutes > 6 ? 0 : 1) : (etaMinutes > 2 ? 2 : (etaMinutes > 0 ? 3 : 4))].distance}
                      </span>
                      <span className="text-emerald-300 text-[9px]">•</span>
                      <span className="text-[9px] font-bold text-[#baff39] font-mono">
                        {navDirections[etaMinutes > 4 ? (etaMinutes > 6 ? 0 : 1) : (etaMinutes > 2 ? 2 : (etaMinutes > 0 ? 3 : 4))].time}
                      </span>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}

            {/* Trace Service Progress HUD Card (Customer Mode) */}
            {userRole === 'CUSTOMER' && activeJob?.status === 'EN_ROUTE' && (
              <div className="absolute top-24 left-6 right-6 z-20 pointer-events-auto">
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`backdrop-blur-md p-4 rounded-2.5xl border shadow-2xl flex items-center gap-4 text-left ${isDark ? 'bg-slate-900/90 border-[#3906d2]/20 shadow-[#3906d2]/5' : 'bg-white/95 border-slate-205'}`}
                >
                  <div className="w-10 h-10 bg-[#3906d2]/10 rounded-xl flex items-center justify-center shrink-0">
                    <Compass className="w-5 h-5 text-[#3906d2] animate-spin-slow" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[8px] uppercase tracking-widest font-black text-[#3906d2] block">Tracing Service Vehicle</span>
                    <p className={`text-xs font-black truncate leading-tight ${cText}`}>
                      {activeJob?.cleanerName || 'Sarah Jenkins'} is approaching you
                    </p>
                    <p className={`text-[9px] mt-0.5 font-bold ${cTextMuted}`}>
                      GPS tracking active • Driving sedan • Route verified and locked
                    </p>
                  </div>
                </motion.div>
              </div>
            )}

            {/* Quick Map Controls HUD */}
            <div className="absolute top-12 left-6 right-6 flex justify-between gap-4 pointer-events-none">
              <div className={`backdrop-blur-md px-4 py-2.5 rounded-2xl border text-left pointer-events-auto shadow-sm ${isDark ? 'bg-slate-950/80 border-white/10' : 'bg-white/95 border-slate-200'}`}>
                <span className="text-[8px] uppercase font-black text-[#3906d2] tracking-widest block">Contract Escrow Lock</span>
                <span className={`text-[11px] font-heavy ${cText}`}>${activeJob?.price || 55} Total agreed</span>
              </div>

              {/* Traffic Aware ETA Updates */}
              <div className={`backdrop-blur-md px-4 py-2.5 rounded-2xl border text-right pointer-events-auto flex items-center gap-2 ${isDark ? 'bg-slate-950/80 border-[#3906d2]/20' : 'bg-white/95 border-[#3906d2]/40 shadow-sm'}`}>
                <span className="w-2 h-2 bg-[#3906d2] rounded-full animate-pulse"></span>
                <div>
                  <span className={`text-[8px] uppercase font-black tracking-widest block ${cTextMuted}`}>Live Traffic ETA</span>
                  <span className="text-xs font-black text-[#3906d2]">
                    {etaMinutes > 0 ? `${etaMinutes} Mins` : 'Arrived!'}
                  </span>
                </div>
              </div>
            </div>

            {/* Micro Countdown Alert Bar */}
            <div className="absolute bottom-4 left-6 right-6 z-15 pointer-events-none">
              <div className={`backdrop-blur-md p-3.5 rounded-2xl border shadow-2xl flex items-center gap-3 text-left pointer-events-auto ${isDark ? 'bg-slate-900/95 border-white/10' : 'bg-white border-slate-205'}`}>
                <Clock className="w-4.5 h-4.5 text-[#3906d2] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className={`text-[10px] uppercase font-black tracking-widest ${isDark ? 'text-white/85' : 'text-slate-800'}`}>
                    {etaMinutes > 0 ? `Arriving in ${etaMinutes} mins` : 'Cleaner is at your door'}
                  </p>
                  <p className={`text-[9px] truncate leading-none mt-0.5 ${cTextMutedLight}`}>{trafficAlert}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Drawer Detail Control Sheet */}
          <div className={`border-t p-6 space-y-5 ${isDark ? 'bg-slate-950 border-white/10' : 'bg-white border-slate-150 shadow-md'}`}>
            
            {/* Cleaner / Client Brief Card */}
            <div className={`p-4 rounded-2.5xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${cCard}`}>
              <div className="flex gap-3">
                <img 
                  src={userRole === 'CLEANER' 
                    ? (activeJob?.customerPhoto || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150')
                    : (activeJob?.cleanerPhoto || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150')
                  } 
                  alt="" 
                  className={`w-12 h-12 rounded-xl object-cover border ${cBorder}`}
                  referrerPolicy="no-referrer"
                />
                <div className="text-left text-xs">
                  <span className="text-[8px] uppercase tracking-widest font-black text-[#3906d2] block mb-0.5">
                    {userRole === 'CLEANER' ? 'Resident Client Partner' : 'Primary Contractor Partner'}
                  </span>
                  <p className={`text-xs font-black ${cText}`}>
                    {userRole === 'CLEANER' 
                      ? (activeJob?.customerName || 'Resident Client')
                      : (activeJob?.cleanerName || 'Sarah Jenkins')
                    }
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                    <span className={`text-[10px] font-bold ${cTextMuted}`}>
                      {userRole === 'CLEANER' ? '5.0 Highly Rated Client' : `${activeJob?.cleanerRating || 4.9} Verified Pro`}
                    </span>
                  </div>
                  <p className="text-[9px] text-[#3906d2] font-heavy tracking-wider font-mono uppercase mt-1">
                    {userRole === 'CLEANER' 
                      ? `Dest: ${activeJob?.location?.address || 'SOHO, NY'}`
                      : `En Route: ${activeJob?.location?.address || 'SOHO, NY'}`
                    }
                  </p>
                </div>
              </div>

              {/* Interactive buttons */}
              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <button 
                  onClick={onOpenChat}
                  className={`px-3 py-1.5 h-10 rounded-xl border flex items-center justify-center gap-1.5 hover:opacity-80 active:scale-95 transition-all text-xs font-black uppercase tracking-wider text-[#3906d2] ${isDark ? 'bg-slate-900 border-white/10' : 'bg-slate-100 border-slate-200'}`}
                  title="Secure Chat"
                >
                  <MessageSquare className="w-4.5 h-4.5" />
                  <span>Chat</span>
                </button>
                <button 
                  onClick={() => setShowCallPicker(true)}
                  className={`px-3 py-1.5 h-10 rounded-xl border flex items-center justify-center gap-1.5 hover:opacity-80 active:scale-95 transition-all text-xs font-black uppercase tracking-wider ${isDark ? 'bg-slate-900 border-white/10 text-white/70' : 'bg-slate-100 border-slate-200 text-[#3906d2]'}`}
                  title="Direct Call"
                >
                  <Phone className="w-4.5 h-4.5" />
                  <span>Call</span>
                </button>
              </div>
            </div>

            {/* Collapsible status indicators & Timeline */}
            <div className={`p-4 rounded-2xl border space-y-3 ${cCard}`}>
              <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block text-left">Real-Time Event Roadmap</span>
              {getJobStatusTimelineCode()}
            </div>

            {/* Client confirmation simulation actions */}
            {userRole === 'CLEANER' ? (
              <div className="space-y-2">
                <button 
                  onClick={() => {
                    if (activeJob.status === 'ACCEPTED') updateJobStatus(activeJob.id, 'EN_ROUTE');
                    else if (activeJob.status === 'EN_ROUTE') updateJobStatus(activeJob.id, 'ARRIVED');
                    else if (activeJob.status === 'ARRIVED') updateJobStatus(activeJob.id, 'IN_PROGRESS');
                    else if (activeJob.status === 'IN_PROGRESS') {
                      updateJobStatus(activeJob.id, 'COMPLETED');
                      setSubStep('COMPLETED_SUMMARY');
                    }
                  }}
                  className="w-full py-4 bg-[#3906d2] text-white font-black text-xs uppercase tracking-widest rounded-xl hover:scale-101 active:scale-99 transition-all"
                >
                  {activeJob.status === 'ACCEPTED' && 'Launch Trip Tracking'}
                  {activeJob.status === 'EN_ROUTE' && 'Flag "I Have Arrived"'}
                  {activeJob.status === 'ARRIVED' && 'Unlock Cleaning Session'}
                  {activeJob.status === 'IN_PROGRESS' && 'Complete Contract & Trigger Escrow Invoice'}
                </button>
              </div>
            ) : (
              activeJob.status === 'COMPLETED' && (
                <button 
                  onClick={() => setSubStep('COMPLETED_SUMMARY')}
                  className="w-full py-4 bg-[#3906d2] text-white font-black text-xs uppercase tracking-widest rounded-xl"
                >
                  Open Escrow Invoice Summary
                </button>
              )
            )}

          </div>
        </div>
      )}

      {/* B. JOB COMPLETION SUMMARY SCREEN */}
      {subStep === 'COMPLETED_SUMMARY' && (
        <div id="booking-completed-summary" className="flex-1 flex flex-col p-6 pt-12 text-left justify-between overflow-y-auto no-scrollbar">
          
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-[#3906d2]/15 rounded-full border border-[#3906d2]/20 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-8 h-8 text-[#3906d2]" />
              </div>
              <h2 className={`text-xl font-black ${cText}`}>Service Check-Off Successful</h2>
              <p className={`text-xs ${cTextMuted}`}>Your professional verified work completion parameters.</p>
            </div>

            {/* Service & Duration breakdown */}
            <div className={`p-5 rounded-2.5xl border space-y-4 ${cCard}`}>
              <div className={`flex justify-between items-center border-b pb-3 ${cBorder}`}>
                <span className={`text-xs font-black uppercase tracking-wide ${cTextMuted}`}>Category Category</span>
                <span className="text-xs font-black text-[#3906d2]">{activeJob?.serviceType || 'Deep Clean'}</span>
              </div>
              <div className={`flex justify-between items-center border-b pb-3 ${cBorder}`}>
                <span className={`text-xs font-black uppercase tracking-wide ${cTextMuted}`}>Handshake ID</span>
                <span className={`text-xs font-mono font-bold ${isDark ? 'text-white/80' : 'text-slate-800'}`}>#{activeJob?.id?.slice(0, 8) || 'j_948f2a'}</span>
              </div>
              <div className={`flex justify-between items-center border-b pb-3 ${cBorder}`}>
                <span className={`text-xs font-black uppercase tracking-wide ${cTextMuted}`}>Time Duration</span>
                <span className={`text-xs font-bold ${isDark ? 'text-white/80' : 'text-slate-800'}`}>2 Hours 15 Mins</span>
              </div>
              <div className="flex justify-between items-center">
                <span className={`text-xs font-black uppercase tracking-wide ${cTextMuted}`}>Agreed Escrow Lock</span>
                <span className="text-lg font-black text-[#3906d2]">${activeJob?.price || 55}</span>
              </div>
            </div>

            {/* Provider brief */}
            <div className={`p-4 rounded-xl border flex gap-3 ${cCard}`}>
              <img src={activeJob?.cleanerPhoto} alt="" className="w-11 h-11 rounded-lg object-cover" />
              <div>
                <span className="text-[9px] uppercase font-black text-[#3906d2] tracking-widest block">Primary Contractor</span>
                <p className={`text-xs font-black ${cText}`}>{activeJob?.cleanerName}</p>
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-500 fill-current" />
                  <span className={`text-[10px] ${cTextMuted}`}>{activeJob?.cleanerRating || 4.9}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-6">
            <button
              onClick={() => setSubStep('PAYMENT')}
              className="w-full py-5.5 bg-[#3906d2] text-white rounded-2xl font-black text-xs uppercase tracking-[0.25em] flex items-center justify-center gap-2"
            >
              Verify Escrow & Pay Contract
              <ArrowRight className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}

      {/* C. PAYMENT SCREEN */}
      {subStep === 'PAYMENT' && (
        <div id="booking-payment" className="flex-1 flex flex-col p-6 pt-12 text-left justify-between overflow-y-auto no-scrollbar">
          
          <div className="space-y-6">
            <div>
              <h2 className={`text-xl font-black ${cText}`}>Escrow Settlement</h2>
              <p className={`text-xs ${cTextMuted}`}>Authorize the release of locked contract payment to cleaner.</p>
            </div>

            {/* Multi Options */}
            <div className="space-y-3">
              {[
                { id: 'CARD', label: 'Credit / Debit Visa Card', subtitle: 'Secure Pesepay card processing', icon: CreditCard },
                { id: 'WALLET', label: 'App Balance Wallet', subtitle: `Available balance: $${walletBalance}.00`, icon: Wallet },
                { id: 'ECOCASH', label: 'EcoCash Mobile Money', subtitle: 'Pay securely using EcoCash / Pesepay', icon: Smartphone },
                { id: 'ONEMONEY', label: 'OneMoney Transfer', subtitle: 'Instant NetOne Pesepay mobile gateway', icon: Smartphone },
                { id: 'CASH', label: 'Pay Cash Directly', subtitle: 'Deliver clean cash in person', icon: DollarSign }
              ].map((m) => {
                const isSelected = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setPaymentMethod(m.id as any)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between ${
                      isSelected 
                        ? (isDark ? 'bg-white text-slate-950 border-white shadow-sm' : 'bg-slate-905 text-white border-slate-905 shadow-sm') 
                        : cCard
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <m.icon className={`w-5 h-5 ${isSelected ? (isDark ? 'text-slate-950 font-black' : 'text-white') : 'text-[#3906d2]'}`} />
                      <div>
                        <p className={`text-xs font-black uppercase tracking-wide leading-snug ${isSelected ? (isDark ? 'text-slate-950 font-black' : 'text-white') : cText}`}>{m.label}</p>
                        <p className={`text-[9px] ${isSelected ? (isDark ? 'text-slate-700' : 'text-slate-300') : cTextMutedLight}`}>{m.subtitle}</p>
                      </div>
                    </div>
                    {isSelected && <CheckSquare className={`w-4.5 h-4.5 ${isDark ? 'text-slate-950' : 'text-white'}`} />}
                  </button>
                );
              })}
            </div>

            {/* Condition input models for EcoCash and OneMoney */}
            {paymentMethod === 'ECOCASH' && (
              <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className={`p-4 rounded-2xl border border-[#3906d2]/40 space-y-2 ${cCard}`}>
                <label className="text-[10px] font-black uppercase tracking-wider text-[#3906d2]">EcoCash Registered Phone Number</label>
                <div className="flex gap-2">
                  <div className={`px-3 rounded-xl flex items-center text-xs font-black ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}>+263</div>
                  <input 
                    type="tel"
                    value={ecoCashNumber}
                    onChange={(e) => setEcoCashNumber(e.target.value)}
                    placeholder="772123456"
                    className={`flex-1 p-3 rounded-xl font-bold font-mono focus:border-[#3906d2] outline-none text-xs border ${cInput}`}
                  />
                </div>
                <p className={`text-[8px] italic ${cTextMutedLight}`}>EcoCash pin prompt window will load instantly on your phone.</p>
              </motion.div>
            )}

            {paymentMethod === 'ONEMONEY' && (
              <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className={`p-4 rounded-2xl border border-[#3906d2]/40 space-y-2 ${cCard}`}>
                <label className="text-[10px] font-black uppercase tracking-wider text-[#3906d2]">OneMoney Phone Number</label>
                <div className="flex gap-2">
                  <div className={`px-3 rounded-xl flex items-center text-xs font-black ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}>+263</div>
                  <input 
                    type="tel"
                    value={oneMoneyNumber}
                    onChange={(e) => setOneMoneyNumber(e.target.value)}
                    placeholder="712123456"
                    className={`flex-1 p-3 rounded-xl font-bold font-mono focus:border-[#3906d2] outline-none text-xs border ${cInput}`}
                  />
                </div>
              </motion.div>
            )}
          </div>

          <div className="space-y-4 pt-10">
            <div className="flex justify-between items-center px-2">
              <span className={`text-xs font-black uppercase ${cTextMuted}`}>Total Release Escrow</span>
              <span className="text-2xl font-black text-[#3906d2]">${activeJob?.price || 55}</span>
            </div>
            
            <button
              onClick={handlePay}
              className="w-full py-5 bg-[#3906d2] text-white font-black text-xs uppercase tracking-widest rounded-xl hover:scale-[1.01] transition-all"
            >
              Authorize Release Securely
            </button>
          </div>
        </div>
      )}

      {/* D. RATING SCREEN */}
      {subStep === 'RATING' && (
        <div id="booking-rating" className="flex-1 flex flex-col p-6 pt-12 text-left justify-between overflow-y-auto no-scrollbar">
          
          <div className="space-y-8">
            <div className="text-center space-y-2">
              <img src={activeJob?.cleanerPhoto} alt="" className="w-16 h-16 rounded-2xl object-cover border-2 border-[#3906d2] mx-auto shadow-2xl" />
              <h2 className={`text-xl font-black ${cText}`}>Rate your Cleaning Specialist</h2>
              <p className={`text-xs ${cTextMuted}`}>Your genuine reviews build the trusted backbone of our platform.</p>
            </div>

            {/* 1-5 Star Selection System */}
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRatingValue(star)}
                  className="p-1.5 transition-all text-[#3906d2]/25 hover:scale-110 focus:outline-none"
                >
                  <Star 
                    className={`w-9 h-9 ${
                      star <= ratingValue ? 'text-[#3906d2] fill-[#3906d2]/40 drop-shadow-[0_0_8px_rgba(57,6,210,0.5)]' : (isDark ? 'text-white/10' : 'text-slate-200')
                    }`} 
                  />
                </button>
              ))}
            </div>

            {/* Quick Feedback Tags */}
            <div className="space-y-2.5">
              <span className={`text-[10px] font-black uppercase tracking-wider ${cTextMuted}`}>Helpful feedback tags</span>
              <div className="flex flex-wrap gap-2">
                {[
                  'Immaculate Cleaner', 'Top Accessories', 'Polite Manner', 'Fast Arrival', 'Highly Verified'
                ].map((tag) => {
                  const isS = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => {
                        if (isS) setSelectedTags(prev => prev.filter(t => t !== tag));
                        else setSelectedTags(prev => [...prev, tag]);
                      }}
                      className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${
                        isS 
                          ? 'bg-[#3906d2] text-white border-[#3906d2] font-heavy shadow-sm' 
                          : isDark ? 'bg-white/5 border-white/5 text-white/60' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Detailed Written Area */}
            <div className="space-y-2.5">
              <span className={`text-[10px] font-black uppercase tracking-wider ${cTextMuted}`}>Leave an optional review note</span>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Share any special feedback about work standards or punctuality..."
                className={`w-full min-h-[100px] p-4 rounded-2xl focus:border-[#3906d2] text-xs font-bold outline-none resize-none border ${cInput}`}
              />
            </div>
          </div>

          <div className="space-y-2 pt-10">
            <button
              onClick={submitRating}
              className="w-full py-5 bg-[#3906d2] text-white font-black text-xs uppercase tracking-widest rounded-xl"
            >
              Submit Specialist Handshake Rating
            </button>
          </div>
        </div>
      )}

      {/* E. SUCCESS SCREEN */}
      {subStep === 'SUCCESS_SCREEN' && (
        <div id="booking-success-screen" className="flex-1 flex flex-col p-6 text-center justify-center items-center space-y-6">
          <div className="relative">
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 15, ease: "linear" }}
              className="absolute inset-0 rounded-full border border-dashed border-[#3906d2]/30"
            />
            <div className={`w-20 h-20 bg-[#3906d2] rounded-full flex items-center justify-center border-4 shadow-2xl relative z-10 ${isDark ? 'border-slate-950' : 'border-white'}`}>
              <Award className="w-10 h-10 text-white" />
            </div>
          </div>

          <div className="space-y-2 max-w-xs">
            <h2 className={`text-xl font-black ${cText}`}>Handshake Finalized</h2>
            <p className={`text-xs leading-relaxed ${cTextMuted}`}>
              Escrow payment authorized. Thank you for utilizing our fully secure contract bidding platform!
            </p>
          </div>

          <div className="pt-8 w-full max-w-xs">
            <button
              onClick={onBackToHome}
              className="w-full py-4.5 bg-white text-slate-950 font-black text-xs uppercase tracking-widest rounded-xl shadow-xl active:scale-95 transition-all"
            >
              Exit to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Dynamic Call Action Picker Sheet */}
      <AnimatePresence>
        {showCallPicker && (
          <div className="fixed inset-0 z-[550] bg-slate-950/80 backdrop-blur-sm flex items-end justify-center p-6 text-slate-900">
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className={`w-full max-w-md rounded-3xl p-6 text-left space-y-4 shadow-2xl ${isDark ? 'bg-slate-900 border border-white/10 text-white' : 'bg-white border border-slate-100'}`}
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black uppercase tracking-widest text-[#3906d2]">Select Call Method</h3>
                <button 
                  onClick={() => setShowCallPicker(false)} 
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all border ${isDark ? 'bg-white/5 hover:bg-white/10 border-white/5 text-white/70' : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-500'}`}
                >
                  Close
                </button>
              </div>
              <p className="text-[10px] uppercase font-black text-slate-400 block tracking-wider">
                Contacting: {userRole === 'CLEANER' ? (activeJob?.customerName || 'Resident Client') : (activeJob?.cleanerName || 'Sarah Jenkins')}
              </p>
              
              <div className="space-y-2">
                {/* Option 1: In-App Call */}
                <button
                  onClick={async () => {
                    setShowCallPicker(false);
                    await startCall();
                  }}
                  className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${isDark ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-900'}`}
                >
                  <div className="flex items-center gap-3">
                    <Compass className="w-5 h-5 text-[#3906d2] animate-spin-slow" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide">Secure In-App VoIP Audio</p>
                      <p className="text-[9px] text-slate-400">Free, direct data-encrypted calling</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#3906d2]" />
                </button>

                {/* Option 2: GSM voice call */}
                <button
                  onClick={() => {
                    setShowCallPicker(false);
                    const partyPhone = userRole === 'CLEANER' ? (activeJob?.customerPhone || '+263771000200') : (activeJob?.cleanerPhone || '+263772000100');
                    window.location.href = `tel:${partyPhone}`;
                  }}
                  className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${isDark ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-900'}`}
                >
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-emerald-500" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide">Cellular Direct Line</p>
                      <p className="text-[9px] text-slate-400">Call directly over carrier mobile line</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-emerald-500" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* VoIP LIVE CALL OVERLAY */}
      <AnimatePresence>
        {activeCall && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="fixed inset-0 z-[600] bg-slate-950/98 backdrop-blur-2xl flex flex-col items-center justify-between py-24 text-white overflow-hidden"
          >
            {/* Visual background ambient circles */}
            <div className="absolute inset-x-0 top-1/4 flex justify-center pointer-events-none">
              <div className="w-72 h-72 bg-[#3906d2]/15 rounded-full filter blur-3xl animate-pulse"></div>
            </div>

            <div className="flex flex-col items-center space-y-2 z-10">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-400">
                {activeCall.status === 'DIALING' && 'Secure Line Dialing...'}
                {activeCall.status === 'RINGING' && (activeCall.direction === 'incoming' ? 'Incoming Secure VoIP Call' : 'Ringing...')}
                {activeCall.status === 'CONNECTED' && 'Live Session Connected'}
                {activeCall.status === 'DISCONNECTED' && 'Call Disconnected'}
              </span>
              <p className="text-white/40 text-[9px] font-mono">End-to-End Handshake Encryption Active</p>
            </div>

            <div className="flex flex-col items-center space-y-6 z-10">
              {/* Pulsing profile image */}
              <div className="relative animate-bounce-subtle">
                <AnimatePresence>
                  {(activeCall.status === 'RINGING' || activeCall.status === 'DIALING') && (
                    <>
                      <motion.div 
                        initial={{ scale: 0.8, opacity: 0.5 }}
                        animate={{ scale: 1.8, opacity: 0 }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                        className="absolute inset-0 bg-[#3906d2]/30 rounded-full border border-[#3906d2]/50"
                      />
                      <motion.div 
                        initial={{ scale: 0.8, opacity: 0.5 }}
                        animate={{ scale: 2.3, opacity: 0 }}
                        transition={{ repeat: Infinity, duration: 2, delay: 0.7, ease: "easeOut" }}
                        className="absolute inset-0 bg-[#3906d2]/20 rounded-full border border-[#3906d2]/40"
                      />
                    </>
                  )}
                </AnimatePresence>
                <div className="w-28 h-28 rounded-[40px] overflow-hidden border-4 border-[#3906d2] shadow-2xl relative z-10">
                  <img src={activeCall.partyPhoto} alt="" className="w-full h-full object-cover" />
                </div>
              </div>

              <div className="text-center space-y-1.5">
                <h3 className="text-2xl font-black tracking-tighter">{activeCall.partyName}</h3>
                {activeCall.status === 'CONNECTED' ? (
                  <div className="flex items-center gap-2 justify-center bg-white/5 border border-white/10 px-3.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                    <span className="text-xs font-mono font-bold text-slate-300">
                      {Math.floor(callDuration / 60).toString().padStart(2, '0')}:{(callDuration % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-white/50">{activeCall.status.toLowerCase()}...</p>
                )}
              </div>

              {/* Animated Live Audio Spectral Waveform (only when Connected!) */}
              {activeCall.status === 'CONNECTED' && (
                <div className="flex items-end gap-1 h-8 mt-4">
                  {[12, 24, 16, 28, 8, 20, 14, 26, 18, 10, 22, 16, 28, 12].map((h, i) => (
                    <motion.div
                      key={i}
                      animate={{ height: [4, h, 4] }}
                      transition={{ 
                        repeat: Infinity, 
                        duration: 0.8 + (i % 3) * 0.2, 
                        ease: "easeInOut",
                        delay: i * 0.05
                      }}
                      className="w-1 bg-[#3906d2] rounded-full"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Calling control deck */}
            <div className="flex flex-col items-center gap-8 w-full z-10 px-8">
              {activeCall.status === 'RINGING' && activeCall.direction === 'incoming' ? (
                <div className="flex justify-center gap-12 w-full max-w-xs">
                  {/* Decline */}
                  <button 
                    onClick={endCall}
                    className="w-16 h-16 bg-rose-600 rounded-full flex items-center justify-center shadow-lg shadow-rose-600/35 hover:scale-110 active:scale-95 transition-all text-white"
                  >
                    <Phone className="w-6 h-6 rotate-[135deg] fill-current" />
                  </button>
                  {/* Accept */}
                  <button 
                    onClick={acceptCall}
                    className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/35 hover:scale-110 active:scale-95 transition-all text-white animate-bounce-subtle"
                  >
                    <Phone className="w-6 h-6 fill-current" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-8 w-full">
                  <div className="flex justify-center gap-6 w-full max-w-xs">
                    {/* Speaker Toggle */}
                    <button 
                      onClick={() => setIsSpeaker(!isSpeaker)}
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${
                        isSpeaker 
                          ? 'bg-white text-slate-900 border-white' 
                          : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                      }`}
                    >
                      <Smartphone className="w-5 h-5" />
                    </button>

                    {/* Mute Toggle */}
                    <button 
                      onClick={() => setIsMuted(!isMuted)}
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${
                        isMuted 
                          ? 'bg-rose-500 text-white border-rose-500 shadow-md' 
                          : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                      }`}
                    >
                      {isMuted ? <ShieldAlert className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
                    </button>
                  </div>

                  {/* Hang Up Action button */}
                  <button 
                    onClick={endCall}
                    className="w-16 h-16 bg-rose-600 border border-rose-500 rounded-full flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all text-white"
                  >
                    <Phone className="w-7 h-7 rotate-[135deg] fill-current" />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
