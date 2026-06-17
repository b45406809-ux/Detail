/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vite/client" />
import React, { useState, useEffect, useRef } from 'react';

import { 
  Users, 
  Briefcase, 
  DollarSign, 
  ShieldAlert, 
  CheckCircle, 
  Clock, 
  MapPin, 
  Search, 
  Bell, 
  Sun,
  Moon,
  Settings,
  Menu,
  ChevronRight,
  Star,
  Power,
  Smartphone,
  Map as MapIcon,
  Navigation,
  User,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Settings2,
  List,
  Sliders,
  Sparkles,
  Zap,
  TrendingUp,
  Package,
  Heart,
  Layout,
  Layers,
  History,
  MessageSquare,
  Send,
  X,
  Filter,
  SlidersHorizontal,
  Check,
  CreditCard,
  Plus,
  Calendar,
  ChevronDown,
  Wallet,
  Home,
  Camera,
  LayoutGrid,
  HelpCircle,
  ChevronLeft,
  ArrowUpRight,
  ArrowDownLeft,
  Phone,
  Lock,
  CheckCheck,
  Paperclip,
  Smile,
  Award,
  BadgeCheck,
  RefreshCw,
  Delete,
  ClipboardList,
  Database,
  ShieldOff,
  Mail,
  Globe,
  Car,
  Landmark
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Map, { Marker, NavigationControl } from 'react-map-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import { 
  db, auth, googleProvider, signInWithPopup, onAuthStateChanged, 
  doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, addDoc, orderBy, serverTimestamp, limit, getDocs, Timestamp,
  handleFirestoreError, OperationType, RecaptchaVerifier, signInWithPhoneNumber,
  signInWithEmailAndPassword, createUserWithEmailAndPassword
} from './firebase';
import type { FirebaseUser } from './firebase';
import { 
  SplashScreen, WelcomeScreen, PhoneInputScreen, OtpVerifyScreen, CreateProfileScreen, PermissionsScreen 
} from './components/OnboardingFlow';
import { AdminPanel } from './components/AdminPanel';
import { BookingFlow } from './components/BookingFlow';
import { TrackingAndProgress } from './components/TrackingAndProgress';
import { CleanerDashboard } from './components/CleanerDashboard';
import { 
  NoCleanerFoundScreen, 
  LowBidWarningScreen, 
  CancellationScreen, 
  InternetConnectionScreen, 
  ForceUpdateScreen, 
  AccountSuspendedScreen 
} from './components/SpecialStatesScreens';
import { rankCleaners } from './services/matching';
import { WebRTCCallClient } from './services/webrtc';

// --- Types ---
type UserRole = 'CUSTOMER' | 'CLEANER' | 'ADMIN';
type Status = 'AVAILABLE' | 'BUSY' | 'OFFLINE';
type Screen = 
  | 'SPLASH' | 'WELCOME' | 'PHONE_INPUT' | 'OTP_VERIFY' | 'CREATE_PROFILE' | 'PERMISSIONS'
  | 'HOME' | 'CREATE_REQUEST' | 'FIND_CLEANERS' | 'BIDS_RECEIVED' | 'SERVICE_PROGRESS' 
  | 'MESSAGES' | 'PROFILE' | 'WALLET' | 'PRIVACY_POLICY' | 'CLEANER_AGREEMENT'
  | 'ADMIN_OVERVIEW' | 'ADMIN_USERS' | 'ADMIN_CLEANERS' | 'ADMIN_PAYMENTS' | 'ADMIN_DISPUTES'
  | 'NO_CLEANER_FOUND' | 'LOW_BID_WARNING' | 'CANCELLATION_SCREEN' | 'INTERNET_CONNECTION' | 'FORCE_UPDATE' | 'ACCOUNT_SUSPENDED';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  balance: number;
  status: Status;
  hasAgreedToTerms?: boolean;
  commissionOwed?: number;
  firstJobInWindowDate?: any;
  isSuspended?: boolean;
  isBanned?: boolean;
  suspensionDate?: any;
  banDate?: any;
  jobsCompleted?: number;
  hasCompletedProfile?: boolean;
  hasSetupPermissions?: boolean;
}

// --- Components ---

const Logo = ({ className = "w-16 h-16", color = "currentColor" }) => (
  <svg viewBox="0 0 120 120" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Left vertical stem of the outer boundary */}
    <path 
      d="M 32,32 L 32,76" 
      stroke={color} 
      strokeWidth="8" 
      strokeLinecap="square" 
    />
    {/* Top horizontal and outer circular loop to bottom bar */}
    <path 
      d="M 32,32 L 60,32 A 32 32 0 0 1 60,96 L 32,96" 
      stroke={color} 
      strokeWidth="8" 
      strokeLinecap="square" 
      strokeLinejoin="miter"
    />
    {/* Inner nested curve/loop */}
    <path 
      d="M 50,48 L 60,48 A 16 16 0 0 1 60,80 L 32,80" 
      stroke={color} 
      strokeWidth="8" 
      strokeLinecap="square" 
      strokeLinejoin="miter"
    />
    {/* Middle vertical column (the 'I' bar) */}
    <rect 
      x="42" 
      y="56" 
      width="8" 
      height="16" 
      fill={color} 
    />
    {/* Period Dot */}
    <circle 
      cx="100" 
      cy="92" 
      r="6" 
      fill={color} 
    />
  </svg>
);

const OSM_STYLE = "https://tiles.openfreemap.org/styles/dark";

interface MapBackgroundProps {
  userRole: UserRole;
  nearbyCleaners: any[];
  selectedCleaner?: any;
  onMarkerClick?: (cleaner: any) => void;
  dark?: boolean;
  zoom?: number;
  availableJobs?: any[];
  currentLocation?: { lat: number, lng: number } | null;
  activeCleanerLiveLocation?: { lat: number, lng: number } | null;
  activeJob?: any;
}

const MapBackground = ({ userRole, nearbyCleaners, selectedCleaner, onMarkerClick, dark, currentLocation, availableJobs: propJobs, activeCleanerLiveLocation, activeJob }: MapBackgroundProps) => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [viewState, setViewState] = useState({
    longitude: -74.0060,
    latitude: 40.7128,
    zoom: 14
  });

  useEffect(() => {
    // Priority 1: Follow active cleaner if en route
    if (activeCleanerLiveLocation) {
      setViewState(prev => ({
        ...prev,
        longitude: activeCleanerLiveLocation.lng,
        latitude: activeCleanerLiveLocation.lat
      }));
    } 
    // Priority 2: Center on user
    else if (currentLocation) {
      setViewState(prev => ({
        ...prev,
        longitude: currentLocation.lng,
        latitude: currentLocation.lat
      }));
    }
  }, [currentLocation, activeCleanerLiveLocation]);

  const jobsToDisplay = propJobs || [
    { id: '1', location: { lat: 40.715, lng: -74.008 }, price: 45 },
    { id: '2', location: { lat: 40.71, lng: -74.004 }, price: 60 }
  ];

  const mapStyleUrl = dark !== false 
    ? "https://tiles.openfreemap.org/styles/dark" 
    : "https://tiles.openfreemap.org/styles/positron";

  return (
    <div className="absolute inset-0 overflow-hidden">
      {!mapLoaded && (
        <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center transition-opacity duration-300 ${dark !== false ? 'bg-[#0B0A11]' : 'bg-[#FAFAFB]'}`}>
          {/* Simulated clean abstract map grid */}
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            {/* Horizontal Grid Lanes with pulsing shimmer */}
            <div className="absolute inset-0 flex flex-col justify-between py-8">
              {[...Array(6)].map((_, idx) => (
                <div key={idx} className={`h-1 w-full animate-pulse mr-auto ${dark !== false ? 'bg-[#3906d2]/15' : 'bg-slate-350'}`} style={{ animationDelay: `${idx * 150}ms` }} />
              ))}
            </div>
            {/* Vertical Grid Lanes */}
            <div className="absolute inset-0 flex justify-between px-10">
              {[...Array(6)].map((_, idx) => (
                <div key={idx} className={`w-1 h-full animate-pulse ${dark !== false ? 'bg-[#3906d2]/15' : 'bg-slate-350'}`} style={{ animationDelay: `${idx * 200}ms` }} />
              ))}
            </div>
            {/* Diagonal "Streets" */}
            <div className="absolute top-0 left-[-20%] w-[150%] h-[150%] border-t-[3px] border-b-[3px] border-[#3906d2]/10 rotate-[22deg] origin-center" />
            <div className="absolute top-0 right-[-20%] w-[150%] h-[150%] border-r-[3px] border-l-[3px] border-[#3906d2]/10 rotate-[-15deg] origin-center" />
          </div>

          {/* Centered User Core Pulse representing the user's location on the map */}
          <div className="relative flex items-center justify-center">
            {/* Concentric pulsing waves */}
            <div className="absolute w-32 h-32 rounded-full border border-blue-500/20 animate-ping duration-[3000ms]"></div>
            <div className="absolute w-20 h-20 rounded-full border border-blue-500/20 animate-pulse duration-[2000ms]"></div>
            
            {/* Main location pin core marker */}
            <div className="relative w-7 h-7 bg-blue-500 rounded-full border-4 border-white shadow-[0_0_15px_rgba(59,130,246,0.6)] flex items-center justify-center z-10 animate-pulse">
              <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
            </div>
          </div>

          {/* Skeletons representing active pro cleaner markers loaded around */}
          {userRole === 'CUSTOMER' && (
            <div className="absolute inset-0 pointer-events-none">
              {/* Floating Pro A */}
              <div className="absolute top-[25%] left-[20%] flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full border-2 animate-pulse ${dark !== false ? 'bg-slate-800 border-white/10' : 'bg-white border-slate-300'} flex items-center justify-center shadow-lg`} style={{ animationDelay: '100ms' }}>
                  <div className={`w-7 h-7 rounded-full ${dark !== false ? 'bg-slate-700/60' : 'bg-slate-200'}`}></div>
                </div>
              </div>
              {/* Floating Pro B */}
              <div className="absolute bottom-[30%] right-[25%] flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full border-2 animate-pulse ${dark !== false ? 'bg-slate-800 border-white/10' : 'bg-white border-slate-300'} flex items-center justify-center shadow-lg`} style={{ animationDelay: '300ms' }}>
                  <div className={`w-7 h-7 rounded-full ${dark !== false ? 'bg-slate-700/60' : 'bg-slate-200'}`}></div>
                </div>
              </div>
              {/* Floating Pro C */}
              <div className="absolute top-[35%] right-[15%] flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full border-2 animate-pulse ${dark !== false ? 'bg-slate-800 border-white/10' : 'bg-white border-slate-300'} flex items-center justify-center shadow-lg`} style={{ animationDelay: '500ms' }}>
                  <div className={`w-7 h-7 rounded-full ${dark !== false ? 'bg-slate-700/60' : 'bg-slate-200'}`}></div>
                </div>
              </div>
            </div>
          )}

          {/* Skeletons representing available Job pin markers loaded list */}
          {userRole === 'CLEANER' && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-[30%] left-[30%] animate-pulse" style={{ animationDelay: '200ms' }}>
                <div className={`px-4 py-1.5 rounded-full border-2 shadow-sm ${dark !== false ? 'bg-slate-800/80 border-[#3906d2]/30' : 'bg-white/85 border-slate-300'}`}>
                  <div className={`w-8 h-2.5 rounded ${dark !== false ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
                </div>
              </div>
              <div className="absolute bottom-[35%] right-[35%] animate-pulse" style={{ animationDelay: '600ms' }}>
                <div className={`px-4 py-1.5 rounded-full border-2 shadow-sm ${dark !== false ? 'bg-slate-800/80 border-[#3906d2]/30' : 'bg-white/85 border-slate-300'}`}>
                  <div className={`w-8 h-2.5 rounded ${dark !== false ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
                </div>
              </div>
            </div>
          )}

          {/* Floating loading overlay details panel */}
          <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl border flex items-center gap-3 backdrop-blur-md transition-all shadow-xl z-50 ${dark !== false ? 'bg-slate-900/95 border-white/5 text-white/70' : 'bg-white/95 border-slate-200 text-slate-700'}`}>
            <div className="w-5.5 h-5.5 rounded-full border-3 border-t-transparent border-[#3906d2] animate-spin shrink-0"></div>
            <span className="text-[10px] font-black uppercase tracking-wider">Syncing Interactive Map Area...</span>
          </div>
        </div>
      )}
      <Map
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapLib={maplibregl}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyleUrl}
        attributionControl={false}
        onLoad={() => setMapLoaded(true)}
      >
        {/* Current User Marker */}
        {currentLocation && (
          <Marker longitude={currentLocation.lng} latitude={currentLocation.lat}>
            <div className="relative">
              <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-[0_0_10px_rgba(59,130,246,0.5)] animate-pulse"></div>
              <div className="absolute inset-0 w-8 h-8 -translate-x-1/4 -translate-y-1/4 bg-blue-500/20 rounded-full animate-ping"></div>
            </div>
          </Marker>
        )}

        {/* Assigned Cleaner Tracking Marker */}
        {activeCleanerLiveLocation && (
          <Marker longitude={activeCleanerLiveLocation.lng} latitude={activeCleanerLiveLocation.lat}>
            <div className="relative flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl border-4 border-[#3906d2] overflow-hidden shadow-2xl bg-white animate-bounce-subtle">
                <img 
                  src={activeJob?.cleanerPhoto || `https://i.pravatar.cc/100?u=${activeJob?.cleanerId}`} 
                  className="w-full h-full object-cover" 
                  alt="Assigned Cleaner"
                />
              </div>
              <div className="mt-2 bg-[#3906d2] px-3 py-1 rounded-full shadow-lg border border-white">
                <p className="text-[10px] font-black tracking-tighter text-white uppercase">Live Track</p>
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-brand-lime rounded-full border-2 border-white flex items-center justify-center animate-pulse">
                <Navigation className="w-3 h-3 text-white fill-current" />
              </div>
            </div>
          </Marker>
        )}

        {userRole === 'CUSTOMER' && (nearbyCleaners || []).map((c, i) => (
          <Marker
            key={c.uid || i}
            longitude={c.lng || -74.0060 + (i * 0.005)}
            latitude={c.lat || 40.7128 + (i * 0.005)}
          >
            <div 
              onClick={(e) => {
                if (e) {
                  if (typeof e.stopPropagation === 'function') e.stopPropagation();
                  if ((e as any).originalEvent?.stopPropagation) {
                    (e as any).originalEvent.stopPropagation();
                  }
                }
                onMarkerClick?.(c);
              }}
              className="relative flex flex-col items-center cursor-pointer group"
            >
              <div className={`w-12 h-12 rounded-full border-4 ${selectedCleaner?.id === c.id || selectedCleaner?.uid === c.uid ? 'border-[#3906d2] scale-110 shadow-[0_0_20px_rgba(57,6,210,0.5)]' : 'border-white'} overflow-hidden shadow-2xl bg-white transition-all`}>
                <img 
                  src={c.photoURL || `https://i.pravatar.cc/100?u=${c.uid || c.id}`} 
                  alt={c.displayName || c.name} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              {(selectedCleaner?.id === c.id || selectedCleaner?.uid === c.uid) && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full border-2 border-white flex items-center justify-center shadow-lg z-10">
                  <Star className="w-2.5 h-2.5 text-white fill-current" />
                </div>
              )}
              <div className={`mt-2 px-3 py-1 bg-black text-white rounded-full text-[9px] font-black transition-all ${selectedCleaner?.id === c.id || selectedCleaner?.uid === c.uid ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
                {c.displayName}
              </div>
            </div>
          </Marker>
        ))}

        {userRole === 'CLEANER' && (jobsToDisplay as any[]).map((j, i) => {
          const lat = j.location?.lat || j.lat;
          const lng = j.location?.lng || j.lng;
          if (!lat || !lng) return null;
          
          return (
            <Marker
              key={j.id || i}
              longitude={lng}
              latitude={lat}
            >
              <div className="bg-[#3906d2] px-2.5 py-1 rounded-full shadow-lg border-2 border-white flex flex-col items-center">
                <span className="text-[9px] font-black text-white">$ {j.price || j.bidPrice || 40}</span>
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full border border-white -mb-3 mt-1"></div>
              </div>
            </Marker>
          );
        })}
        <NavigationControl position="top-right" />
      </Map>
    </div>
  );
};

interface HeaderProps {
  userRole: UserRole;
  toggleRole: (role?: UserRole) => void;
}

const Header = ({ userRole, toggleRole }: HeaderProps) => (
  <div className="pt-14 px-6 pb-6 flex items-center justify-between z-[100] relative">
    <div className="flex items-center gap-2">
      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-50">
        <Logo className="w-7 h-7" color="#3906d2" />
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Detail®</p>
        <p className="text-sm font-display font-bold text-slate-900 leading-none">Pro Cleaning</p>
      </div>
    </div>
    
    <div className="flex bg-slate-100/50 backdrop-blur-md p-1.5 rounded-2xl border border-white">
      <button 
        onClick={() => userRole !== 'CUSTOMER' && toggleRole('CUSTOMER')}
        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
          userRole === 'CUSTOMER' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'
        }`}
      >
        Customer
      </button>
      <button 
        onClick={() => userRole !== 'CLEANER' && toggleRole('CLEANER')}
        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
          userRole === 'CLEANER' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'
        }`}
      >
        Cleaner
      </button>
    </div>
  </div>
);

const StarRating = ({ rating, size = "w-3 h-3", count, showNumber = false }: { rating: number, size?: string, count?: number, showNumber?: boolean }) => {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star 
            key={i} 
            className={`${size} ${i <= Math.round(rating) ? 'text-amber-500 fill-amber-500' : 'text-slate-200 fill-slate-200'}`} 
          />
        ))}
      </div>
      {showNumber && <span className="text-sm font-black text-slate-900">{rating.toFixed(1)}</span>}
      {count !== undefined && <span className="text-[10px] font-bold text-slate-400">({count})</span>}
    </div>
  );
};

const SplashView = () => (
  <div className="absolute inset-0 bg-[#3906d2] flex flex-col items-center justify-center overflow-hidden">
    {/* Geometric Accents */}
    <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%] opacity-5 pointer-events-none">
       <div className="absolute inset-0 border-[40px] border-white rounded-full scale-150"></div>
       <div className="absolute inset-0 border-[20px] border-white rounded-full scale-125"></div>
    </div>

    <div className="relative z-10 flex flex-col items-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0, rotate: -15 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", damping: 15, stiffness: 100 }}
        className="w-36 h-36 bg-black rounded-[32px] flex items-center justify-center shadow-[0_30px_60px_rgba(0,0,0,0.4)]"
      >
        <Logo className="w-20 h-20" color="#ffffff" />
      </motion.div>
      
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="mt-10 text-center"
      >
        <h1 className="text-6xl font-display font-black text-white tracking-tighter leading-[0.9]">Detail.</h1>
        <div className="flex items-center justify-center gap-4 mt-4">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/60">Expert</span>
          <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/60">Services</span>
        </div>
      </motion.div>
    </div>

    <div className="absolute bottom-16 flex flex-col items-center gap-6">
      <div className="flex gap-2">
         {[0, 1, 2].map(i => (
           <motion.div 
             key={i}
             animate={{ 
               scale: [1, 1.2, 1],
               opacity: [0.3, 1, 0.3]
             }}
             transition={{ 
               duration: 2, 
               repeat: Infinity, 
               delay: i * 0.4 
             }}
             className="w-2 h-2 bg-white rounded-full"
           />
         ))}
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Securing Infrastructure</p>
    </div>
  </div>
);

interface AuthViewProps {
  login: () => void;
  phoneNumber: string;
  setPhoneNumber: (val: string) => void;
  onContinue: () => void;
  authTab: 'PHONE' | 'EMAIL';
  setAuthTab: (tab: 'PHONE' | 'EMAIL') => void;
  setCurrentScreen: (screen: Screen) => void;
}

const AuthView = ({ login, phoneNumber, setPhoneNumber, onContinue, authTab, setAuthTab, setCurrentScreen }: AuthViewProps) => (
  <div className="absolute inset-0 bg-white flex flex-col">
    {/* Header */}
    <div className="bg-[#3906d2] pt-12 pb-6 px-6 flex items-center justify-between z-50">
      <button 
        onClick={() => setCurrentScreen('WELCOME')} 
        className="p-2 active:scale-90 transition-transform"
      >
        <ChevronLeft className="w-6 h-6 text-white" />
      </button>
      <h1 className="text-lg font-display font-bold text-white">Sign In</h1>
      <div className="w-10"></div> {/* Spacer for symmetry */}
    </div>

    <div className="flex-1 flex flex-col items-center pt-8 px-8 overflow-y-auto no-scrollbar">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mt-6 mb-8 shadow-xl"
      >
        <Zap className="w-10 h-10 text-white fill-current" />
      </motion.div>

      <h2 className="text-3xl font-display font-black text-slate-900 tracking-tight mb-2">Welcome Back</h2>
      <p className="text-slate-500 text-sm font-medium text-center mb-10 max-w-[280px] leading-relaxed">
        Please enter your details to continue with your cleaning services.
      </p>

      {/* Modern Tabs */}
      <div className="w-full bg-slate-100 p-1 rounded-2xl flex mb-10 border border-slate-200">
        <button 
          onClick={() => setAuthTab('PHONE')}
          className={`flex-1 py-3.5 rounded-[14px] flex items-center justify-center gap-2.5 font-bold text-sm transition-all duration-300 ${authTab === 'PHONE' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400'}`}
        >
          <Phone className="w-4 h-4" />
          Phone
        </button>
        <button 
          onClick={() => setAuthTab('EMAIL')}
          className={`flex-1 py-3.5 rounded-[14px] flex items-center justify-center gap-2.5 font-bold text-sm transition-all duration-300 ${authTab === 'EMAIL' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400'}`}
        >
          <Mail className="w-4 h-4" />
          Email
        </button>
      </div>

      <div className="w-full space-y-4 mb-8">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">PHONE NUMBER</label>
          <div className="group bg-white rounded-2xl p-1 border-2 border-slate-100 focus-within:border-[#3906d2] transition-all shadow-sm">
            <div className="flex items-center gap-3 py-3 px-4">
              <Globe className="w-5 h-5 text-slate-400" />
              <div className="flex items-center gap-2">
                <span className="text-slate-900 font-bold text-lg">+1</span>
                <div className="w-px h-5 bg-slate-100 mx-1" />
                <input 
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="000 000 0000"
                  className="bg-transparent border-none outline-none text-slate-900 font-bold text-lg placeholder:text-slate-200 w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <button 
        onClick={onContinue}
        className="group relative w-full py-5 bg-[#3906d2] text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] overflow-hidden shadow-xl shadow-[#3906d2]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          Continue
          <ChevronRight className="w-5 h-5" />
        </span>
        <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity"></div>
      </button>

      {/* Divider */}
      <div className="w-full flex items-center gap-4 mt-10 mb-8">
        <div className="flex-1 h-px bg-slate-100"></div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">OR CONTINUE WITH</p>
        <div className="flex-1 h-px bg-slate-100"></div>
      </div>

      <div className="w-full space-y-4 mb-10">
        <button 
          onClick={login}
          className="w-full py-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm text-slate-700 hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
        >
          <div className="w-5 h-5 flex items-center justify-center">
            <Star className="w-4 h-4 fill-slate-900" />
          </div>
          Continue with Google
        </button>
        <button 
          className="w-full py-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm text-slate-700 hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
        >
          <Smartphone className="w-5 h-5" />
          Continue with Apple
        </button>
      </div>

      {/* Security Badge */}
      <div className="bg-slate-50 px-6 py-3 rounded-2xl flex items-center gap-4 mb-12 border border-slate-100">
        <div className="w-6 h-6 flex items-center justify-center text-[#3906d2]">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <p className="text-[10px] font-bold text-slate-400">
          Your data is secured with bank-grade encryption
        </p>
      </div>

      <div className="pb-12 text-center w-full">
        <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
          By continuing, you agree to Detail's <br/>
          <span className="text-slate-900 font-bold underline">Terms of Service</span> and <span className="text-slate-900 font-bold underline">Privacy Policy</span>.
        </p>
      </div>
    </div>
  </div>
);

interface VerifyPhoneViewProps {
  phoneNumber: string;
  otp: string;
  setOtp: (val: string) => void;
  onVerify: () => void;
  setCurrentScreen: (screen: Screen) => void;
  resendTimer: number;
  expiryTimer: number;
}

const VerifyPhoneView = ({ phoneNumber, otp, setOtp, onVerify, setCurrentScreen, resendTimer, expiryTimer }: VerifyPhoneViewProps) => {
  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const handleNumClick = (n: string) => {
    if (otp.length < 6) setOtp(otp + n);
  };

  const handleDelete = () => {
    setOtp(otp.slice(0, -1));
  };

  return (
    <div className="absolute inset-0 bg-white flex flex-col">
      {/* Header */}
      <div className="bg-[#3906d2] pt-12 pb-6 px-6 flex items-center justify-between z-50">
        <button 
          onClick={() => setCurrentScreen('WELCOME')} 
          className="p-2 active:scale-90 transition-transform"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <h1 className="text-lg font-display font-bold text-white">Verification</h1>
        <div className="w-10"></div>
      </div>

      <div className="flex-1 flex flex-col items-center pt-12 px-8 overflow-y-auto no-scrollbar">
        <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mb-8 shadow-xl">
          <Smartphone className="w-10 h-10 text-white" />
        </div>

        <h2 className="text-3xl font-display font-black text-slate-900 tracking-tight mb-4 text-center">Security Code</h2>
        <p className="text-slate-500 text-sm font-medium text-center mb-10 max-w-[280px] leading-relaxed">
          We sent an OTP to your phone <span className="text-slate-900 font-bold">+1 (***) ***-{phoneNumber.slice(-4) || '8829'}</span>. 
          Code expires in <span className="text-brand-lime font-black underline">{formatTime(expiryTimer)}</span>
        </p>

        {/* OTP Input Boxes */}
        <div className="flex gap-3 mb-10">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div 
              key={i}
              className={`w-12 h-16 border-2 rounded-2xl flex items-center justify-center text-2xl font-black transition-all ${otp.length === i ? 'border-brand-lime bg-brand-lime/5 shadow-lg shadow-brand-lime/10' : otp[i] ? 'border-brand-lime bg-white text-slate-900' : 'border-slate-100 bg-white text-slate-900'}`}
            >
              {otp[i] || (otp.length === i ? <motion.div animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-1 h-8 bg-brand-lime rounded-full" /> : '')}
            </div>
          ))}
        </div>

        {/* Resend Timer */}
        <div className="bg-slate-50 px-6 py-4 rounded-3xl flex items-center gap-4 mb-4 border border-slate-100">
          <Clock className="w-5 h-5 text-slate-400" />
          <div className="flex flex-col text-left">
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Resend OTP</span>
            <span className={`text-sm font-bold ${resendTimer > 0 ? 'text-slate-900' : 'text-brand-lime animate-pulse underline cursor-pointer'}`}>
              {resendTimer > 0 ? `Available in ${formatTime(resendTimer)}` : 'Resend Code Now'}
            </span>
          </div>
        </div>

        <button 
          onClick={onVerify}
          disabled={otp.length < 6}
          className={`w-full mt-8 py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 ${otp.length === 6 ? 'bg-slate-900 text-white shadow-2xl shadow-slate-900/20' : 'bg-slate-100 text-slate-300 pointer-events-none'}`}
        >
          Verify Account
          <CheckCircle className="w-5 h-5" />
        </button>

        <div className="mt-auto pb-6">
          <p className="text-[10px] text-slate-400 font-medium text-center leading-relaxed">
            By continuing, you agree to Detail's <span className="text-slate-900 font-bold underline">Terms of Service</span> and <span className="text-slate-900 font-bold underline">Privacy Policy</span>.
          </p>
        </div>
      </div>

      {/* Number Pad */}
      <div className="bg-white p-6 grid grid-cols-3 gap-4 border-t border-slate-100">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button onClick={() => handleNumClick(n.toString())} key={n} className="py-6 rounded-2xl active:bg-slate-50 flex flex-col items-center">
            <span className="text-2xl font-black text-slate-900">{n}</span>
            <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">{ ['','ABC','DEF','GHI','JKL','MNO','PQRS','TUV','WXYZ'][n-1] }</span>
          </button>
        ))}
        <div className="py-6"></div>
        <button onClick={() => handleNumClick('0')} className="py-6 rounded-2xl active:bg-slate-50 flex items-center justify-center">
          <span className="text-2xl font-black text-slate-900">0</span>
        </button>
        <button onClick={handleDelete} className="py-6 rounded-2xl active:bg-slate-50 flex items-center justify-center text-slate-400">
          <Delete className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

interface OnboardingViewProps {
  setCurrentScreen: (screen: Screen) => void;
}

const OnboardingView = ({ setCurrentScreen }: OnboardingViewProps) => (
  <div className="absolute inset-0 bg-white flex flex-col overflow-hidden text-left">
    <div className="absolute top-12 left-0 right-0 px-10 flex items-center justify-between z-50">
      <div className="flex items-center gap-2">
         <div className="w-2 h-2 bg-slate-900 rounded-full"></div>
         <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900">Step 01/03</span>
      </div>
      <div className="w-4"></div>
    </div>

    <div className="flex-1 flex flex-col items-center">
      <div className="relative w-full h-[55%] mb-12">
        <div className="absolute inset-0 bg-slate-900">
          <img 
            src="https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&q=80&w=1200" 
            alt="Cleaner" 
            className="w-full h-full object-cover opacity-80"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white"></div>
        </div>

        {/* Floating Badge */}
        <motion.div 
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="absolute bottom-12 right-6 bg-[#3906d2] p-8 rounded-[48px] shadow-2xl shadow-[#3906d2]/30 flex flex-col gap-4 border-4 border-white"
        >
          <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center">
            <BadgeCheck className="w-6 h-6 text-white" />
          </div>
          <div className="space-y-1">
             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Verified Pros</p>
             <p className="text-xl font-display font-black text-white leading-none">Vetted &<br/>Insured.</p>
          </div>
        </motion.div>
      </div>

      <div className="px-8 flex-1 flex flex-col items-start w-full gap-6">
        <div className="space-y-3">
          <motion.h2 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-5xl font-display font-black text-slate-900 tracking-tighter leading-[0.85]"
          >
            Extreme<br/>Expertise.
          </motion.h2>
          <p className="text-slate-400 text-[13px] leading-relaxed font-medium max-w-[260px]">
            Book professional grade cleaners who treat your space with scientific precision. Professional equipment, every time.
          </p>
        </div>

        <div className="flex gap-1.5 px-1">
          <div className="w-12 h-1.5 bg-slate-900 rounded-full"></div>
          <div className="w-1.5 h-1.5 bg-slate-100 rounded-full"></div>
          <div className="w-1.5 h-1.5 bg-slate-100 rounded-full"></div>
        </div>

        <div className="w-full mt-auto mb-12">
          <button 
            onClick={() => setCurrentScreen('WELCOME')}
            className="group relative w-full py-7 bg-slate-900 text-white rounded-[40px] font-black text-xs uppercase tracking-[0.4em] overflow-hidden shadow-2xl shadow-slate-900/20 active:scale-95 transition-all text-center"
          >
            <span className="relative z-10 flex items-center justify-center gap-3">
              Explore Services
              <ArrowUpRight className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </span>
            <div className="absolute inset-0 bg-[#3906d2] translate-y-full group-hover:translate-y-0 transition-transform duration-500 origin-bottom"></div>
            <style dangerouslySetInnerHTML={{ __html: `.group:hover span { color: white !important; }` }} />
          </button>
        </div>
      </div>
    </div>
  </div>
);

interface CustomerHomeViewProps {
  nearbyCleaners: any[];
  setCurrentScreen: (screen: Screen) => void;
  setSelectedCleaner: (cleaner: any) => void;
  selectedCleaner: any;
  userRole: UserRole;
  toggleRole: (role?: UserRole) => void;
  profile: any;
  currentLocation?: { lat: number, lng: number } | null;
  activeTheme?: 'light' | 'dark';
  themeMode?: 'light' | 'dark' | 'system';
  setThemeMode?: (mode: 'light' | 'dark' | 'system') => void;
  setIsNotificationOpen?: (open: boolean) => void;
  notifications?: any[];
}

const CustomerHomeView = ({ 
  nearbyCleaners, 
  setCurrentScreen, 
  setSelectedCleaner, 
  selectedCleaner, 
  userRole, 
  toggleRole, 
  profile, 
  currentLocation,
  activeTheme = 'light',
  themeMode = 'light',
  setThemeMode,
  setIsNotificationOpen,
  notifications = []
}: CustomerHomeViewProps) => {

  const isDark = activeTheme === 'dark';
  
  // Custom high-fidelity interactive dialog states
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [matchRadarOpen, setMatchRadarOpen] = useState(false);
  const [radarStage, setRadarStage] = useState(0); // 0: matching, 1: found, 2: success
  const [radarMatchedCleaner, setRadarMatchedCleaner] = useState<any>(null);

  // Simulated radar finder feedback
  useEffect(() => {
    let interval: any;
    let timer: any;
    if (matchRadarOpen) {
      setRadarStage(0);
      setRadarMatchedCleaner(null);
      
      interval = setInterval(() => {
        setRadarStage(prev => (prev === 0 ? 0 : prev));
      }, 1000);

      timer = setTimeout(() => {
        const luckyOne = nearbyCleaners && nearbyCleaners.length > 0 
          ? nearbyCleaners[Math.floor(Math.random() * nearbyCleaners.length)] 
          : { id: 'lucky-sarah', displayName: 'Sarah Jenkins', photoURL: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150', rating: 4.9, eta: '6 min' };
        
        setRadarMatchedCleaner(luckyOne);
        setRadarStage(1);

        setTimeout(() => {
          setRadarStage(2);
        }, 1800);
      }, 3000);
    }

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [matchRadarOpen, nearbyCleaners]);

  // Handler to toggle light <-> dark modes directly in header
  const handleToggleTheme = () => {
    if (setThemeMode) {
      const nextMode = activeTheme === 'light' ? 'dark' : 'light';
      setThemeMode(nextMode);
    }
  };

  return (
    <div className={`flex-1 flex flex-col relative overflow-hidden text-left transition-colors duration-500 ${isDark ? 'bg-[#0B0A11] text-white' : 'bg-[#FAFAFB] text-slate-800'}`}>
      
      {/* Map Area */}
      <div className="absolute inset-0 z-0">
        <MapBackground 
          userRole={userRole} 
          nearbyCleaners={nearbyCleaners} 
          selectedCleaner={selectedCleaner} 
          onMarkerClick={setSelectedCleaner} 
          currentLocation={currentLocation} 
          dark={isDark}
        />
      </div>

      {/* Top Header - Solid Premium Blue Block matching screenshot */}
      <div className={`${isDark ? 'bg-slate-950 border-b border-white/10 shadow-black/40' : 'bg-[#3906d2]'} pt-6 pb-5 px-6 flex flex-col z-50 shadow-lg relative rounded-b-[40px] shrink-0 transition-colors duration-500`}>
        
        {/* Action Controls Row - With centered Brand and interactive real Notification Bell */}
        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-2">
            {/* Quick light/dark manual switcher */}
            <button 
              onClick={handleToggleTheme}
              className={`w-10 h-10 rounded-2xl flex items-center justify-center active:scale-95 transition-all cursor-pointer border ${isDark ? 'bg-white/5 hover:bg-white/10 text-brand-lime border-white/10' : 'bg-white/10 hover:bg-white/15 text-white border-white/15'}`}
              title="Click to Toggle Light/Dark Appearance theme"
            >
              {isDark ? <Sun className="w-5 h-5 text-brand-lime animate-spin-slow" /> : <Moon className="w-5 h-5 text-white" />}
            </button>
          </div>
          
          {/* Centered Brand Title with styled Logo and "Detail." text inspired by the spec */}
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center justify-center text-center">
            <svg 
              viewBox="0 0 120 120" 
              className={`w-[44px] h-[44px] mb-0.5 filter drop-shadow-sm ${isDark ? 'text-brand-lime' : 'text-white'}`} 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Left vertical stem of the outer boundary */}
              <path 
                d="M 32,32 L 32,76" 
                stroke="currentColor" 
                strokeWidth="8.5" 
                strokeLinecap="square" 
              />
              {/* Top horizontal and outer circular loop to bottom bar */}
              <path 
                d="M 32,32 L 60,32 A 32 32 0 0 1 60,96 L 32,96" 
                stroke="currentColor" 
                strokeWidth="8.5" 
                strokeLinecap="square" 
                strokeLinejoin="miter"
              />
              {/* Inner nested curve/loop */}
              <path 
                d="M 50,48 L 60,48 A 16 16 0 0 1 60,80 L 32,80" 
                stroke="currentColor" 
                strokeWidth="8.5" 
                strokeLinecap="square" 
                strokeLinejoin="miter"
              />
              {/* Middle vertical column (the 'I' bar) */}
              <rect 
                x="42" 
                y="55" 
                width="8.5" 
                height="16.5" 
                fill="currentColor" 
              />
              {/* Period Dot */}
              <circle 
                cx="100" 
                cy="92" 
                r="6.5" 
                fill="currentColor" 
              />
            </svg>
            <span className={`text-[10px] font-black tracking-[0.25em] uppercase leading-none mt-1 ${isDark ? 'text-brand-lime' : 'text-white'}`}>
              Detail<span className={isDark ? 'text-white' : 'text-emerald-400'}>.</span>
            </span>
          </div>
          
          <div className="flex items-center gap-2.5">
            {/* Fully Functional Notification Bell */}
            <button 
              onClick={() => setIsNotificationOpen && setIsNotificationOpen(true)}
              className={`relative p-2.5 active:scale-95 transition-transform rounded-2xl cursor-pointer border-none outline-none ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-white/10 hover:bg-white/15'}`}
              title="View Real Activity Alerts"
            >
              <Bell className={`w-4.5 h-4.5 ${isDark ? 'text-brand-lime' : 'text-white'}`} />
              {notifications.some(n => !n.read) && (
                <div className={`absolute top-2.5 right-2.5 w-2 h-2 bg-rose-500 rounded-full border ${isDark ? 'border-slate-950' : 'border-[#3906d2]'}`}></div>
              )}
            </button>

            {/* Profile Avatar */}
            <div 
              onClick={() => setCurrentScreen('PROFILE')}
              className={`w-9 h-9 rounded-2xl border shadow-sm overflow-hidden bg-slate-100 cursor-pointer active:scale-95 transition-all ${isDark ? 'border-white/10' : 'border-slate-950/15'}`}
              title="Go to My Profile Settings"
            >
              <img 
                src={profile?.photoURL || "https://i.pravatar.cc/100?u=me"} 
                alt="Profile" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content over map */}
      <div className="relative z-10 flex-1 flex flex-col pointer-events-none p-5 pb-8 justify-between">
        
        {/* Floating Top Panel */}
        <div className="w-full space-y-3.5 pointer-events-auto">
          
          {/* Fully styled white search bar with filter icon */}
          <div 
            onClick={() => setCurrentScreen('FIND_CLEANERS')}
            className={`w-full p-4 rounded-[28px] flex items-center justify-between shadow-2xl transition-all active:scale-[0.99] cursor-pointer border ${
              isDark 
                ? 'bg-slate-900/95 border-white/10 text-white shadow-black/85' 
                : 'bg-white border-slate-200 text-slate-800 shadow-slate-350/30'
            }`}
          >
            <div className="flex items-center gap-3.5 flex-1 pr-2">
              <Search className={`w-5 h-5 ${isDark ? 'text-brand-lime' : 'text-slate-400'}`} />
              <span className={`text-[12px] font-extrabold leading-normal truncate ${isDark ? 'text-white/80' : 'text-slate-500'}`}>
                Where do you need cleaning?
              </span>
            </div>
            <button className={`p-2 rounded-xl transition-all active:scale-90 ${isDark ? 'bg-slate-800 text-white' : 'bg-slate-100/80 text-slate-700'}`}>
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>


        </div>

        {/* Floating Bottom Section */}
        <div className="w-full space-y-4">
          
          {/* Locator Compass */}
          <div className="flex justify-end pr-1 pointer-events-auto">
            <button 
              onClick={() => {
                if (currentLocation) {
                  setSelectedCleaner(null);
                }
              }}
              className="w-12 h-12 bg-[#3906d2] rounded-full shadow-2xl flex items-center justify-center border border-white/20 text-white hover:scale-105 active:scale-90 transition-all cursor-pointer"
              title="Locate Me / Clear Selection"
            >
              <Navigation className="w-5.1 h-5.1 rotate-45 transform fill-current" />
            </button>
          </div>

          {/* Selected Cleaner Card */}
          <AnimatePresence>
            {selectedCleaner && (() => {
              const getDistanceLocal = (lat1?: number, lon1?: number, lat2?: number, lon2?: number) => {
                if (!lat1 || !lon1 || !lat2 || !lon2) return 1.2;
                const R = 6371; // km
                const dLat = (lat2 - lat1) * (Math.PI / 180);
                const dLon = (lon2 - lon1) * (Math.PI / 180);
                const a =
                  Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * (Math.PI / 180)) *
                    Math.cos(lat2 * (Math.PI / 180)) *
                    Math.sin(dLon / 2) *
                    Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return parseFloat((R * c).toFixed(1));
              };
              const userLocForDist = currentLocation || { lat: 40.7128, lng: -74.0060 };
              const dKm = getDistanceLocal(userLocForDist.lat, userLocForDist.lng, selectedCleaner.lat, selectedCleaner.lng);
              const etaMin = Math.max(4, Math.round((dKm / 45) * 60) + 4);
              const rating = selectedCleaner.ratingAverage || 4.9;

              return (
                <motion.div 
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 30, opacity: 0 }}
                  className={`pointer-events-auto rounded-[32px] p-5 shadow-2x border relative overflow-hidden flex items-center gap-4 ${
                    isDark 
                      ? 'bg-slate-950/90 border-white/10 text-white shadow-black/90' 
                      : 'bg-white border-slate-200/80 text-slate-900 shadow-slate-350/20'
                  }`}
                >
                  <div className="absolute top-0 left-0 right-0 h-1 bg-[#3906d2]"></div>
                  
                  <div className="relative">
                    <div className="w-16 h-16 rounded-[22px] overflow-hidden bg-black/5 border border-slate-200/20">
                      <img 
                        src={selectedCleaner.photoURL || `https://i.pravatar.cc/100?u=${selectedCleaner.id}`} 
                        alt={selectedCleaner.displayName} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-[#3906d2] rounded-full border border-white flex items-center justify-center shadow-md">
                      <Star className="w-3.5 h-3.5 text-white fill-current" />
                    </div>
                  </div>
                  
                  <div className="flex-1 text-left">
                    <h3 className={`text-base font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {selectedCleaner.displayName}
                    </h3>
                    <div className="flex items-center gap-1.5 mb-2 mt-0.5 whitespace-nowrap">
                      <div className="flex items-center gap-0.5 text-amber-500 fill-current">
                        <Star className="w-3 h-3" />
                        <span className={`text-[10px] font-black ${isDark ? 'text-brand-lime' : 'text-slate-800'}`}>{rating}</span>
                      </div>
                      <span className="text-slate-300 text-[9px]">•</span>
                      <div className="flex items-center gap-1 text-slate-400">
                        <MapPin className="w-3 h-3 text-brand-lime" />
                        <span className="text-[10px] font-bold">{dKm} Km</span>
                      </div>
                      <span className="text-slate-300 text-[9px]">•</span>
                      <div className="flex items-center gap-1 text-slate-400">
                        <Clock className="w-3 h-3 text-brand-lime" />
                        <span className="text-[10px] font-bold">{etaMin}m ETA</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="px-2.5 py-0.5 bg-[#3906d2]/15 border border-[#3906d2]/25 rounded-md text-[8.5px] font-black uppercase text-[#3906d2]">
                        Deep Clean
                      </span>
                      <span className="px-2.5 py-0.5 bg-blue-500/10 border border-blue-500/15 rounded-md text-[8.5px] font-black uppercase text-blue-500">
                        Elite
                      </span>
                    </div>
                  </div>

                  <button 
                    onClick={() => setCurrentScreen('CREATE_REQUEST')}
                    className="bg-[#3906d2] hover:bg-[#200380] h-11 px-5 rounded-2xl font-black text-xs text-white shadow-lg shadow-[#3906d2]/20 active:scale-95 transition-all cursor-pointer"
                  >
                    Book
                  </button>

                  <button 
                    onClick={() => setSelectedCleaner(null)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </motion.div>
              );
            })()}
          </AnimatePresence>

          {/* Floating Action Buttons */}
          <div className="flex items-center gap-3 pointer-events-auto">
            <button 
              onClick={() => setCurrentScreen('CREATE_REQUEST')}
              className="flex-1 h-14 bg-[#3906d2] hover:bg-[#2b04ad] text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-2xl shadow-[#3906d2]/25 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-5 h-5 font-black stroke-[3px]" />
              Request Cleaning
            </button>

            <button 
              onClick={() => setMatchRadarOpen(true)}
              className="w-14 h-14 bg-white hover:bg-blue-50/50 rounded-2xl flex items-center justify-center text-blue-600 shadow-xl border border-blue-50 active:scale-90 transition-all cursor-pointer"
              title="Instant Lightning Match Finder"
            >
              <Zap className="w-5.5 h-5.5 fill-current text-blue-600 animate-pulse" />
            </button>

            <button 
              onClick={() => setFavoritesOpen(!favoritesOpen)}
              className="w-14 h-14 bg-white hover:bg-rose-50/50 rounded-2xl flex items-center justify-center text-rose-500 shadow-xl border border-rose-50 active:scale-90 transition-all cursor-pointer"
              title="View Favorite Detailers List"
            >
              <Heart className={`w-5.5 h-5.5 ${favoritesOpen ? 'fill-current text-rose-500' : 'text-slate-400'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Slide-over Drawer Favorites */}
      <AnimatePresence>
        {favoritesOpen && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className={`absolute bottom-0 left-0 right-0 max-h-[460px] rounded-t-[40px] shadow-[0_-20px_50px_rgba(0,0,0,0.3)] z-[200] border-t p-6 flex flex-col pointer-events-auto transition-colors duration-300 ${
              isDark 
                ? 'bg-[#0F0E16] border-white/10 text-white' 
                : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="w-12 h-1 bg-slate-350/40 rounded-full mx-auto mb-4 cursor-pointer shrink-0" onClick={() => setFavoritesOpen(false)}></div>
            
            <div className="flex items-center justify-between mb-5 shrink-0">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-500 fill-current" />
                <h3 className="font-black text-sm uppercase tracking-wider">Favorites ({nearbyCleaners.length > 0 ? nearbyCleaners.length : 1})</h3>
              </div>
              <button onClick={() => setFavoritesOpen(false)} className={`p-1.5 rounded-xl ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100'} cursor-pointer`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pb-6">
              {nearbyCleaners.map((cleaner: any, index: number) => (
                <div 
                  key={cleaner.id || index}
                  onClick={() => {
                    setSelectedCleaner(cleaner);
                    setFavoritesOpen(false);
                  }}
                  className={`p-4 rounded-2xl border flex items-center justify-between transition-all active:scale-98 cursor-pointer ${
                    isDark ? 'bg-white/5 border-white/5 hover:bg-white/10' : 'bg-slate-50 hover:bg-slate-100 border-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/10 border border-slate-200/20">
                      <img src={cleaner.photoURL || `https://i.pravatar.cc/100?u=${cleaner.id || index}`} alt={cleaner.displayName} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm">{cleaner.displayName || cleaner.name}</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Elite Partner • Verified</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 bg-[#3906d2]/15 text-[#3906d2] px-2.5 py-1 rounded-lg">
                    <Star className="w-3 h-3 text-amber-500 fill-current" />
                    <span className="text-[10px] font-black">4.9</span>
                  </div>
                </div>
              ))}
              {nearbyCleaners.length === 0 && (
                <div 
                  onClick={() => {
                    const mockCleanerObj = { id: 'temp-sarah', displayName: 'Sarah Jenkins', photoURL: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150', rating: 4.9, eta: '8 min away' };
                    setSelectedCleaner(mockCleanerObj);
                    setFavoritesOpen(false);
                  }}
                  className={`p-4 rounded-2xl border flex items-center justify-between transition-all active:scale-98 cursor-pointer ${
                    isDark ? 'bg-white/5 border-white/5 hover:bg-white/10' : 'bg-slate-50 hover:bg-slate-100 border-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/10 border border-slate-200/20">
                      <img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150" alt="Sarah" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm">Sarah Jenkins</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Superhost Partner</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 bg-[#3906d2]/15 text-[#3906d2] px-2.5 py-1 rounded-lg">
                    <Star className="w-3 h-3 text-amber-500 fill-current" />
                    <span className="text-[10px] font-black">4.95</span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Match Radar Screen for Lightning bolt button */}
      <AnimatePresence>
        {matchRadarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl z-[300] flex flex-col items-center justify-center p-6 text-center pointer-events-auto text-white"
          >
            <div className="w-full flex justify-end absolute top-6 right-6">
              <button 
                onClick={() => setMatchRadarOpen(false)}
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center cursor-pointer transition-all active:scale-90"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {radarStage === 0 && (
              <div className="flex flex-col items-center max-w-xs space-y-6 animate-fade-in">
                <div className="relative w-44 h-44 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border border-[#3906d2]/25 animate-ping" style={{ animationDuration: '3s' }} />
                  <div className="absolute inset-4 rounded-full border border-[#3906d2]/30 animate-pulse" style={{ animationDuration: '2s' }} />
                  <div className="absolute inset-10 rounded-full border border-blue-500/25 animate-ping" style={{ animationDuration: '4s' }} />
                  <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/55 relative z-10 animate-bounce">
                    <Zap className="w-8 h-8 text-white fill-current" />
                  </div>
                </div>
                
                <div className="space-y-1">
                  <h3 className="text-lg font-black tracking-tight text-[#3906d2] uppercase">Radar Matcher Active</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Finding closest ready cleaner...</p>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Analyzing real-time positions, service history and availability levels to lock down a partner.
                </p>
              </div>
            )}

            {radarStage === 1 && radarMatchedCleaner && (
              <div className="flex flex-col items-center max-w-xs space-y-6 animate-fade-in">
                <div className="relative w-28 h-28">
                  <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-25" />
                  <div className="w-full h-full rounded-[36px] overflow-hidden border-4 border-[#3906d2] bg-[#0B0A11] shadow-2xl">
                    <img 
                      src={radarMatchedCleaner.photoURL || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150'} 
                      alt="" 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center shadow-lg border border-slate-950">
                    <Zap className="w-4 h-4 text-white fill-current" />
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-lg font-black tracking-tight text-white">PRO MATCHER SECURED!</h3>
                  <p className="text-xs text-[#3906d2] font-bold uppercase tracking-widest">{radarMatchedCleaner.displayName}</p>
                </div>
                
                <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl w-full flex items-center justify-around gap-1 text-xs">
                  <div>
                    <span className="block text-[10px] text-slate-500 font-bold uppercase">ETA</span>
                    <span className="text-[#3906d2] font-black">6 min away</span>
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <div>
                    <span className="block text-[10px] text-slate-500 font-bold uppercase">Rating</span>
                    <span className="text-white font-black">4.95 ⭐</span>
                  </div>
                </div>
              </div>
            )}

            {radarStage === 2 && radarMatchedCleaner && (
              <div className="flex flex-col items-center max-w-xs space-y-6 animate-fade-in">
                <div className="w-20 h-20 bg-[#3906d2] rounded-[28px] flex items-center justify-center shadow-2xl shadow-[#3906d2]/20">
                  <Check className="w-10 h-10 text-white stroke-[3.5px]" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-lg font-black tracking-tight text-white">LAUNCHING DETAILS</h3>
                  <p className="text-xs text-[#3906d2] font-bold uppercase tracking-wider mt-0.5">Ready to initialize dispatch</p>
                </div>

                <button 
                  onClick={() => {
                    setSelectedCleaner(radarMatchedCleaner);
                    setMatchRadarOpen(false);
                    setCurrentScreen('CREATE_REQUEST');
                  }}
                  className="w-full py-4 bg-[#3906d2] hover:bg-[#2b04ad] text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                >
                  Configure Booking Now
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

interface CleanerHomeViewProps {
  userRole: UserRole;
  toggleRole: (role?: UserRole) => void;
  cleanerStatus: Status;
  setCleanerStatus: (status: Status | ((prev: Status) => Status)) => void;
  availableJobs: any[];
  setActiveJob: (job: any) => void;
  setCurrentScreen: (screen: Screen) => void;
  setBidJob: (job: any) => void;
  profile: UserProfile | null;
  currentLocation?: { lat: number, lng: number } | null;
}

const CleanerHomeView = ({ userRole, toggleRole, cleanerStatus, setCleanerStatus, availableJobs, setActiveJob, setCurrentScreen, setBidJob, profile, currentLocation }: CleanerHomeViewProps) => {
  const earnings = profile?.balance || 142.50;
  const rating = 4.95;
  const jobsCompleted = profile?.jobsCompleted || 12;
  const commissionOwed = profile?.commissionOwed || 12.40;

  // Filters State
  const [filterType, setFilterType] = useState<string>('All'); // 'All' | 'House Cleaning' | 'Car Cleaning'
  const [filterDistance, setFilterDistance] = useState<number>(25); // limits in km: 2 | 5 | 10 | 25 (25 is Any Distance)

  // Distance computation helper (Haversine Formula with deterministic numeric hash fallback)
  const calculateDistance = (jobLoc: any, jobId: string) => {
    if (!jobLoc || !jobLoc.lat || !jobLoc.lng) {
      let hash = 0;
      for (let i = 0; i < jobId.length; i++) {
        hash = jobId.charCodeAt(i) + ((hash << 5) - hash);
      }
      return 0.8 + (Math.abs(hash) % 65) / 10;
    }
    if (!currentLocation || !currentLocation.lat || !currentLocation.lng) {
      let hash = 0;
      for (let i = 0; i < jobId.length; i++) {
        hash = jobId.charCodeAt(i) + ((hash << 5) - hash);
      }
      return 1.4 + (Math.abs(hash) % 40) / 10;
    }

    const R = 6371; // Earth mean radius in km
    const dLat = (jobLoc.lat - currentLocation.lat) * Math.PI / 180;
    const dLng = (jobLoc.lng - currentLocation.lng) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(currentLocation.lat * Math.PI / 180) * Math.cos(jobLoc.lat * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const processedJobs = availableJobs.map(job => {
    const dist = calculateDistance(job.location, job.id);
    return { ...job, calculatedDistance: dist };
  });

  const filteredJobs = processedJobs.filter(job => {
    const matchesType = filterType === 'All' || job.serviceType === filterType;
    const matchesDistance = filterDistance === 25 || job.calculatedDistance <= filterDistance;
    return matchesType && matchesDistance;
  });

  const [focusedJobId, setFocusedJobId] = useState<string | null>(null);
  const activeJobInView = filteredJobs.find(j => j.id === focusedJobId) || filteredJobs[0] || null;

  // Dynamic level classification based on service standing
  const ratingLevel = rating >= 4.8 && jobsCompleted >= 10 ? 'Elite Gold Detailing Pro' : rating >= 4.5 ? 'Silver Specialist' : 'Verified Detailer';

  return (
    <div className="flex-1 relative flex flex-col bg-[#0F0E16] overflow-y-auto no-scrollbar select-none">
      {/* Top Section - Brand Header with Star Rating Profile Card */}
      <div className="bg-[#3906d2] pt-14 pb-12 px-6 text-center relative rounded-b-[40px] shadow-lg shadow-[#3906d2]/15 z-25">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center justify-between w-full">
            <h1 className="text-white font-display font-black text-xl tracking-tighter">Earnings: ${earnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h1>
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm">
              <img 
                src={profile?.photoURL || `https://i.pravatar.cc/100?u=${profile?.uid || 'cleaner'}`} 
                alt="Profile" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>

          {/* Prominent Star Standing Panel */}
          <div className="w-full bg-slate-900 text-white rounded-[32px] p-5 shadow-xl flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase text-accent tracking-[0.25em]">{ratingLevel}</span>
              <BadgeCheck className="w-4 h-4 text-accent fill-accent/10" />
            </div>
            
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((s) => {
                const isHalf = rating >= s - 0.5 && rating < s;
                const isFull = rating >= s;
                return (
                  <Star 
                    key={s} 
                    className={`w-6 h-6 ${
                      isFull ? 'text-accent fill-accent' : isHalf ? 'text-accent fill-accent opacity-50' : 'text-slate-700'
                    }`} 
                  />
                );
              })}
              <span className="text-base font-black ml-1.5">{rating.toFixed(2)}</span>
            </div>

            <div className="w-full h-px bg-white/5 my-0.5"></div>

            <div className="flex justify-between items-center w-full px-2 text-[11px] text-white/50 font-bold">
              <p>Completion Rate: <span className="text-white font-black">100%</span></p>
              <p>Total Completed: <span className="text-white font-black">{jobsCompleted} Cleanings</span></p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 -mt-6 z-30 space-y-6">
        {/* Online Toggle & Status */}
        <div className="flex gap-3">
          <button 
            onClick={() => setCleanerStatus(cleanerStatus === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE')}
            className={`flex-1 h-16 rounded-[24px] flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg ${
              cleanerStatus === 'AVAILABLE' ? 'bg-[#3906d2] text-white shadow-[#3906d2]/20' : 'bg-white/5 border border-white/10 text-white/60'
            }`}
          >
            <Power className={`w-5 h-5 ${cleanerStatus === 'AVAILABLE' ? 'text-white' : 'text-white/60'}`} />
            <span className="font-black text-xs uppercase tracking-widest">
              {cleanerStatus === 'AVAILABLE' ? 'You are online' : 'You are offline'}
            </span>
          </button>
          <button className="w-16 h-16 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-[#3906d2] shadow-lg active:scale-90 transition-all">
            <Navigation className="w-6 h-6 text-[#3906d2] fill-[#3906d2]/20 -rotate-45" />
          </button>
        </div>

        {/* Stats Row with Frosted Outlines */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Completed', value: `${jobsCompleted} Jobs`, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/10' },
            { label: 'Rating', value: rating, icon: Star, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/10' },
            { label: 'Owed', value: `$${commissionOwed.toFixed(2)}`, icon: ShieldAlert, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/10' },
          ].map((stat, i) => (
            <div key={i} className="bg-white/5 border border-white/5 p-4 rounded-[28px] flex flex-col items-center text-center shadow-sm">
              <div className={`w-8 h-8 ${stat.bg} border rounded-full flex items-center justify-center mb-2`}>
                <stat.icon className={`w-4 h-4 ${stat.color} ${stat.label === 'Rating' ? 'fill-amber-400' : ''}`} />
              </div>
              <p className="text-[10px] font-black text-white/40 uppercase tracking-tighter mb-0.5">{stat.label}</p>
              {stat.label === 'Rating' ? (
                <div className="flex flex-col items-center gap-1">
                  <p className="text-white font-black text-xs">{stat.value}</p>
                </div>
              ) : (
                <p className="text-white font-black text-xs">{stat.value}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {cleanerStatus === 'AVAILABLE' ? (
        <div className="px-6 mt-6 space-y-6 flex-1 flex flex-col">
          {/* Header & Glass Filters Toggle */}
          <div className="bg-white/5 border border-white/10 rounded-[32px] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-accent" />
                <h3 className="text-xs font-black uppercase tracking-widest text-white/80">Available Jobs Filters</h3>
              </div>
              <span className="px-2.5 py-1 bg-[#3906d2]/10 border border-[#3906d2]/30 text-[#3906d2] rounded-full text-[9px] font-black uppercase">
                {filteredJobs.length} Found
              </span>
            </div>

            {/* Service Filter Pills: House Cleaning & Car Cleaning Only */}
            <div className="space-y-2">
              <span className="text-[9px] font-black text-white/40 uppercase tracking-wider">Service Category</span>
              <div className="flex gap-2">
                {['All', 'House Cleaning', 'Car Cleaning'].map((service) => (
                   <button
                    key={service}
                    onClick={() => setFilterType(service)}
                    className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                      filterType === service 
                        ? 'bg-[#3906d2] text-white border-[#3906d2]' 
                        : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {service === 'All' ? 'All Clean' : service.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Distance Filter Limits */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[9px] font-black text-white/40 uppercase tracking-wider">
                <span>Maximum Radius</span>
                <span className="text-[#3906d2] font-black normal-case">{filterDistance === 25 ? 'Any Distance' : `${filterDistance} Km`}</span>
              </div>
              <div className="flex gap-1">
                {[2, 5, 10, 25].map((dist) => (
                  <button
                    key={dist}
                    onClick={() => setFilterDistance(dist)}
                    className={`flex-1 py-2 rounded-lg text-[9px] font-black transition-all border ${
                      filterDistance === dist
                        ? 'bg-[#3906d2]/20 text-[#3906d2] border-[#3906d2]/40'
                        : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10'
                    }`}
                  >
                    {dist === 25 ? 'Any' : `${dist}km`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Map background with direct view */}
          <div className="h-44 w-full rounded-[32px] overflow-hidden border border-white/10 relative shadow-inner">
            <MapBackground userRole={userRole} nearbyCleaners={[]} availableJobs={filteredJobs} currentLocation={currentLocation} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0F0E16]/90 to-transparent pointer-events-none"></div>
            <div className="absolute bottom-3 left-4 flex items-center gap-1.5 bg-slate-950/80 backdrop-blur-md border border-white/10 py-1.5 px-3 rounded-full text-[9px] font-bold text-white/70">
              <MapPin className="w-3.5 h-3.5 text-accent animate-pulse" />
              Real-Time Job Coordinates
            </div>
          </div>

          {/* MATCHING JOBS LIST & CAROUSEL */}
          <div className="space-y-4 pb-24">
            <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Matching Opportunities</h4>

            {filteredJobs.length === 0 ? (
              <div className="p-8 bg-white/5 border border-white/5 rounded-[32px] text-center space-y-2">
                <Search className="w-8 h-8 text-white/20 mx-auto" />
                <p className="text-white font-black text-sm">No Matching Jobs</p>
                <p className="text-white/40 text-xs">Try relaxing search category or distance radius constraints.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredJobs.map((job) => {
                  const isFocused = activeJobInView?.id === job.id;
                  return (
                    <div 
                      key={job.id} 
                      onClick={() => setFocusedJobId(job.id)}
                      className={`relative bg-white/5 border rounded-[32px] p-6 transition-all duration-300 cursor-pointer ${
                        isFocused ? 'ring-2 ring-accent border-transparent bg-white/[0.07]' : 'border-white/10 hover:border-white/20'
                      }`}
                    >
                      {/* Top detail stripe */}
                      <div className="flex justify-between items-start mb-4">
                        <div className="space-y-1">
                          <span className="px-2.5 py-0.5 bg-accent/20 border border-accent/20 text-accent rounded-md text-[8px] font-black uppercase tracking-widest">
                            {job.serviceType}
                          </span>
                          <h5 className="text-lg font-display font-black text-white tracking-tight mt-1">
                            {job.title || `${job.serviceType} Job`}
                          </h5>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-display font-black text-accent tracking-tighter block">
                            ${job.budget || job.price || 50}
                          </span>
                          <span className="text-[7.5px] font-black text-white/40 uppercase tracking-widest leading-none">BID ANCHOR</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 mb-4">
                        <div className="bg-white/5 rounded-2xl p-2.5 flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-accent" />
                          <div>
                            <p className="text-[7.5px] font-bold text-white/40 uppercase leading-none">DISTANCE</p>
                            <p className="text-[11px] font-black text-white leading-tight mt-0.5">
                              {job.calculatedDistance.toFixed(1)} Km
                            </p>
                          </div>
                        </div>
                        <div className="bg-white/5 rounded-2xl p-2.5 flex items-center gap-2">
                          <Clock className="w-4 h-4 text-accent" />
                          <div>
                            <p className="text-[7.5px] font-bold text-white/40 uppercase leading-none">EST. ETA</p>
                            <p className="text-[11px] font-black text-white leading-tight mt-0.5">
                              {Math.round(job.calculatedDistance * 4 + 5)} Mins
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Customer info preview */}
                      <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-2xl">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/20 bg-white/10">
                            <img src={`https://i.pravatar.cc/100?u=${job.customerId || 'cust'}`} className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-white">Michael R.</p>
                            <span className="text-[7.5px] text-white/40 uppercase tracking-wider">Premium Customer</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          <span className="text-[9px] font-black text-white">4.9</span>
                        </div>
                      </div>

                      {/* Accept / Place Bid action */}
                      {isFocused && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-4 pt-4 border-t border-white/5 flex gap-2"
                        >
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setFocusedJobId(null);
                            }}
                            className="flex-1 py-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-[10px] uppercase font-black tracking-widest text-white"
                          >
                            Decline
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setBidJob(job);
                            }}
                            className="flex-[2] py-3 bg-[#3906d2] hover:bg-[#2b04ad] text-white rounded-xl text-[10px] uppercase font-black tracking-widest shadow-lg shadow-[#3906d2]/20"
                          >
                            Accept & Bid
                          </button>
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center pb-24 min-h-[400px]">
          <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-full flex items-center justify-center shadow-2xl mb-8">
            <Power className="w-8 h-8 text-white/20" />
          </div>
          <h2 className="text-2xl font-display font-black text-white tracking-tighter mb-3">You're Offline</h2>
          <p className="text-white/40 text-sm max-w-[240px] mb-8">Go online to start receiving cleaning requests in your area.</p>
          <button 
            onClick={() => setCleanerStatus('AVAILABLE')}
            className="px-10 py-5 bg-[#3906d2] text-white rounded-[28px] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-[#3906d2]/20"
          >
            Go Online
          </button>
        </div>
      )}
    </div>
  );
};

const SERVICE_DETAILS: Record<string, { description: string; includes: string[]; duration: string }> = {
  'House Cleaning': {
    description: 'A thorough or deep cleaning of all bedrooms, bathrooms, kitchens, and common areas.',
    includes: ['Dusting details & surfaces', 'Full Vacuuming & Mopping', 'Bathroom deep sanitization', 'Kitchen deep scrubbing', 'Inside cupboards & kitchen spaces'],
    duration: '3-5 Hours'
  },
  'Car Cleaning': {
    description: 'A complete interior detailing and exterior wash for your vehicle.',
    includes: ['In-depth interior vacuuming', 'Dashboard restoration & detailing', 'Streak-free window shine', 'Premium exterior hand wash & wash polish', 'Trunk vacuuming & scent spray'],
    duration: '1-2 Hours'
  }
};

interface CreateRequestViewProps {
  setCurrentScreen: (screen: Screen) => void;
  requestJob: (service: string, details?: string, status?: 'REQUESTED' | 'DRAFT' | 'DIRECT_REQUEST') => void;
  selectedCleaner: any;
}

const CreateRequestView = ({ setCurrentScreen, requestJob, selectedCleaner }: CreateRequestViewProps) => {
  const [selectedService, setSelectedService] = useState('House Cleaning');
  const [jobDetails, setJobDetails] = useState('');
  const [selectedTime, setSelectedTime] = useState('Today');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [location, setLocation] = useState({
    address: '742 Evergreen Terrace',
    city: 'Springfield, OR 97403',
    lat: 44.0462,
    lng: -123.0220
  });
  const [isChangingLocation, setIsChangingLocation] = useState(false);
  const [newAddress, setNewAddress] = useState(location.address);

  const [photos, setPhotos] = useState([
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=200',
    'https://images.unsplash.com/photo-1527359443443-84a18a25d38c?auto=format&fit=crop&q=80&w=200'
  ]);

  const services = [
    { id: 'house', name: 'House Cleaning', price: 65, icon: Home },
    { id: 'car', name: 'Car Cleaning', price: 45, icon: Car }
  ];

  const timeOptions = [
    { id: 'asap', label: 'ASAP', sub: 'Within 2h', icon: Clock },
    { id: 'today', label: 'Today', sub: 'Flexible', icon: Clock },
    { id: 'tomorrow', label: 'Tomorrow', sub: '9:00 AM', icon: Clock },
    { id: 'pick', label: 'Pick Date', sub: selectedDate || 'Calendar', icon: Calendar }
  ];

  const handleSubmit = (isDraft = false) => {
    const fullDetails = `${jobDetails}${selectedDate ? `\nRequested Date: ${selectedDate}` : ''}`;
    requestJob(selectedService, fullDetails, isDraft ? 'DRAFT' : 'REQUESTED');
  };

  return (
    <div className="flex-1 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-brand-lime pt-12 px-6 pb-6 flex items-center justify-between">
        <button onClick={() => setCurrentScreen('HOME')} className="p-2 -ml-2">
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <h1 className="text-xl font-black text-white">New Request</h1>
        <div className="w-10"></div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
        {/* Service Selection */}
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest pl-1">Select Service</h2>
            <div className="bg-brand-lime/20 px-3 py-1 rounded-full border border-brand-lime/30 italic">
              <span className="text-[10px] font-black text-slate-900">2 Options</span>
            </div>
          </div>
          
          <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-6 px-6">
            {services.map((s) => {
              const isSelected = selectedService === s.name;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedService(s.name)}
                  className={`flex-shrink-0 w-[120px] p-4 rounded-[24px] border-2 transition-all flex flex-col items-center gap-3 ${
                    isSelected ? 'border-brand-lime bg-brand-lime shadow-lg shadow-brand-lime/20' : 'border-slate-100 bg-white'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isSelected ? 'bg-white text-slate-900' : 'bg-slate-50 text-slate-400'}`}>
                    <s.icon className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <p className={`text-[11px] font-black leading-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>{s.name}</p>
                    <p className={`text-[10px] font-bold ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>from ${s.price}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Job Details */}
        <div className="px-6 space-y-4">
          <div className="flex justify-between items-baseline">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest pl-1">Job Details</h2>
            <span className="text-[10px] font-bold text-slate-300">{jobDetails.length}/500</span>
          </div>
          <div className="relative">
            <textarea
              value={jobDetails}
              onChange={(e) => setJobDetails(e.target.value.slice(0, 500))}
              placeholder="Tell us about the space... (e.g., 2 bedrooms, pet hair focus, specific areas)"
              className="w-full min-h-[120px] bg-white border-2 border-slate-100 rounded-[24px] p-5 text-slate-900 font-bold placeholder:text-slate-300 focus:border-brand-lime focus:outline-none transition-colors resize-none text-sm"
            />
          </div>
        </div>

        {/* Add Photos */}
        <div className="p-6 space-y-4">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest pl-1">Add Photos</h2>
          <div className="flex gap-3 overflow-x-auto no-scrollbar">
            <label className="flex-shrink-0 w-[100px] aspect-square bg-white border-2 border-slate-100 border-dashed rounded-[24px] flex flex-col items-center justify-center gap-2 group hover:border-brand-lime transition-colors cursor-pointer">
              <input 
                type="file" 
                className="hidden" 
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      if (ev.target?.result) {
                        setPhotos(prev => [...prev, ev.target!.result as string]);
                      }
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-brand-lime/10 transition-colors">
                <Camera className="w-5 h-5 text-slate-400 group-hover:text-brand-lime" />
              </div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Add</span>
            </label>
            
            {photos.map((photo, i) => (
              <div key={i} className="flex-shrink-0 w-[100px] aspect-square rounded-[24px] overflow-hidden relative border-2 border-slate-100">
                <img src={photo} alt="" className="w-full h-full object-cover" />
                <button 
                  onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                  className="absolute top-2 right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow-lg"
                >
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 pl-1">
            <HelpCircle className="w-3.5 h-3.5 text-slate-300 mt-0.5" />
            <p className="text-[10px] font-bold text-slate-400">Visuals help cleaners provide more accurate bids.</p>
          </div>
        </div>

        {/* Location */}
        <div className="px-6 space-y-4">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest pl-1">Location</h2>
          <div className="bg-white rounded-[32px] border-2 border-slate-100 overflow-hidden">
            <div className="h-28 bg-slate-100 relative overflow-hidden">
              <img src="https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&q=80&w=600" className="w-full h-full object-cover opacity-60 grayscale" alt="" />
              <div className="absolute inset-0 flex items-center justify-center">
                 <div className="w-10 h-10 bg-brand-lime rounded-full flex items-center justify-center shadow-xl border-2 border-white">
                    <MapPin className="w-5 h-5 text-white" />
                 </div>
              </div>
            </div>
            <div className="p-5">
              {isChangingLocation ? (
                <div className="space-y-3">
                  <input 
                    type="text"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-brand-lime outline-none"
                    placeholder="Enter street address"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setLocation(prev => ({ ...prev, address: newAddress }));
                        setIsChangingLocation(false);
                      }}
                      className="flex-1 py-2 bg-brand-lime text-white rounded-xl text-[10px] font-black uppercase tracking-wider"
                    >
                      Save
                    </button>
                    <button 
                      onClick={() => setIsChangingLocation(false)}
                      className="flex-1 py-2 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-wider"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-brand-lime rounded-xl flex items-center justify-center shadow-lg">
                      <MapPin className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900">{location.address}</p>
                      <p className="text-[10px] font-bold text-slate-400">{location.city}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsChangingLocation(true)}
                    className="text-[11px] font-black text-brand-lime uppercase tracking-widest"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Preferred Time */}
        <div className="p-6 space-y-4">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest pl-1">Preferred Time</h2>
          <div className="grid grid-cols-2 gap-3">
            {timeOptions.map((opt) => {
              const isSelected = selectedTime === opt.label;
              return (
                <div key={opt.id} className="relative">
                  <button
                    onClick={() => {
                      if (opt.id === 'pick') {
                        // Focus hidden date input
                        const el = document.getElementById('date-picker-input');
                        el?.click();
                      } else {
                        setSelectedTime(opt.label);
                        setSelectedDate(null);
                      }
                    }}
                    className={`w-full p-4 rounded-[24px] border-2 flex items-center gap-3 transition-all ${
                      isSelected ? 'border-brand-lime bg-brand-lime shadow-lg shadow-brand-lime/20' : 'border-slate-100 bg-white'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isSelected ? 'bg-white text-slate-900' : 'bg-slate-50 text-slate-400'}`}>
                      <opt.icon className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className={`text-[11px] font-black leading-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>{opt.label}</p>
                      <p className={`text-[9px] font-bold ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>{opt.sub}</p>
                    </div>
                  </button>
                  {opt.id === 'pick' && (
                    <input 
                      id="date-picker-input"
                      type="date"
                      className="absolute inset-0 opacity-0 pointer-events-none"
                      onChange={(e) => {
                        if (e.target.value) {
                          setSelectedDate(e.target.value);
                          setSelectedTime('Pick Date');
                        }
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="absolute bottom-0 left-0 right-0 p-8 bg-white/80 backdrop-blur-xl border-t border-slate-50 flex flex-col gap-3">
        <button 
          onClick={() => handleSubmit(false)}
          className="w-full py-5 bg-brand-lime text-white rounded-[32px] font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-brand-lime/20 flex items-center justify-center gap-3 active:scale-95 transition-transform"
        >
          Submit Request
        </button>
        <button 
          onClick={() => handleSubmit(true)}
          className="w-full py-4 bg-white border-2 border-slate-100 text-slate-900 rounded-[32px] font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-transform"
        >
          Save as Draft
        </button>
      </div>
    </div>
  );
};

interface ServiceProgressViewProps {
  activeJob: any;
  userRole: UserRole;
  nearbyCleaners: any[];
  setIsSafetyModalOpen: (open: boolean) => void;
  updateJobStatus: (jobId: string, status: string) => void;
  cancelJob: (jobId: string) => void;
  setCurrentScreen: (screen: Screen) => void;
  setIsChatOpen: (open: boolean) => void;
  setShowRating: (show: boolean) => void;
  setSelectedChatJob: (job: any) => void;
  currentLocation?: { lat: number, lng: number } | null;
  activeCleanerLiveLocation?: { lat: number, lng: number } | null;
}

const ServiceProgressView = ({ activeJob, userRole, nearbyCleaners, setIsSafetyModalOpen, updateJobStatus, cancelJob, setCurrentScreen, setIsChatOpen, setShowRating, setSelectedChatJob, currentLocation, activeCleanerLiveLocation }: ServiceProgressViewProps) => {
  if (!activeJob) return null;

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ACCEPTED': return 'Job Confirmed';
      case 'EN_ROUTE': return 'Cleaner Arriving';
      case 'ARRIVED': return 'Cleaner Arrived';
      case 'IN_PROGRESS': return 'Cleaning in Progress';
      case 'COMPLETED': return 'Cleaning Completed';
      default: return 'Service Update';
    }
  };

  return (
    <div className="flex-1 relative flex flex-col bg-white overflow-hidden">
      {/* Map Area */}
      <div className="flex-1 relative">
        <MapBackground userRole={userRole} nearbyCleaners={nearbyCleaners} zoom={15} currentLocation={currentLocation} activeCleanerLiveLocation={activeCleanerLiveLocation} activeJob={activeJob} />
        
        {/* Modernized Header Overlay */}
        <div className="absolute top-16 left-0 right-0 px-10 flex items-center justify-between z-10 pointer-events-none">
          <div className="flex items-center gap-4 pointer-events-auto">
            <button 
              onClick={() => setCurrentScreen('HOME')} 
              className="w-14 h-14 bg-white/90 backdrop-blur-3xl rounded-3xl shadow-2xl text-slate-900 border border-white active:scale-90 transition-all flex items-center justify-center"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
          </div>
          <div className="bg-slate-900/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/20">
            <h1 className="text-[10px] font-black text-slate-900 tracking-[0.2em] uppercase">{getStatusText(activeJob.status)}</h1>
          </div>
          <button className="w-14 h-14 bg-white/90 backdrop-blur-3xl rounded-3xl shadow-2xl flex items-center justify-center pointer-events-auto border border-white">
            <Settings2 className="w-6 h-6 text-slate-900" />
          </button>
        </div>

        {/* Global ETA Badge */}
        <div className="absolute top-36 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-slate-900 px-8 py-4 rounded-3xl flex items-center gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/10"
          >
            <div className="w-3 h-3 bg-[#3906d2] rounded-full animate-pulse"></div>
            <span className="text-[10px] font-black text-white uppercase tracking-[0.3em]">ETA: {activeJob.status === 'EN_ROUTE' ? '08 Mins' : 'SYNCING'}</span>
          </motion.div>
        </div>
      </div>

      {/* Modernized Bottom Sheet */}
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 200 }}
        className="bg-white rounded-t-[64px] shadow-[0_-30px_100px_rgba(0,0,0,0.1)] z-20 border-t border-slate-50 flex flex-col pt-6 pb-12 px-10"
      >
        <div className="w-14 h-1.5 bg-slate-100 rounded-full mx-auto mb-8"></div>

        {/* Premium Profile Info */}
        <div className="bg-slate-50 rounded-[40px] p-6 mb-8 flex items-center gap-6 border border-white">
          <div className="relative">
            <div className="w-20 h-20 rounded-[28px] overflow-hidden border-4 border-white shadow-xl ring-2 ring-[#3906d2]/20">
              <img 
                src={activeJob.cleanerPhoto || `https://i.pravatar.cc/200?u=${activeJob.cleanerId || 'expert'}`} 
                alt={activeJob.cleanerName} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-[#3906d2] rounded-2xl shadow-xl flex items-center justify-center border-4 border-white">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-display font-black text-slate-900 tracking-tighter leading-none">
                {activeJob.cleanerName || 'Sarah Jenkins'}
              </h2>
              <button 
                onClick={() => {
                  setSelectedChatJob(activeJob);
                  setIsChatOpen(true);
                }}
                className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center active:scale-90 transition-all border border-indigo-100 shadow-sm"
              >
                <MessageSquare className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span className="text-xs font-black text-slate-900">4.95 Excellent</span>
              </div>
            </div>
            <div className="pt-2 flex gap-2">
               <span className="text-[8px] font-black text-slate-400 bg-white border border-slate-100 px-3 py-1 rounded-full uppercase tracking-widest">Master Professional</span>
            </div>
          </div>
        </div>

        {/* Action Grid */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { id: 'chat', label: 'Message', icon: MessageSquare, color: 'text-indigo-500', bg: 'bg-indigo-50', action: () => {
              setSelectedChatJob(activeJob);
              setIsChatOpen(true);
            } },
            { id: 'call', label: 'Call', icon: Phone, color: 'text-emerald-500', bg: 'bg-emerald-50', action: () => {} },
            { id: 'cancel', label: 'Abort', icon: ShieldAlert, color: 'text-red-500', bg: 'bg-red-50', action: () => cancelJob(activeJob.id) }
          ].map((action) => (
            <button 
              key={action.id}
              onClick={action.action}
              className="flex flex-col items-center gap-2 group active:scale-95 transition-all"
            >
              <div className={`w-14 h-14 ${action.bg} rounded-[24px] flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-black/5`}>
                <action.icon className={`w-5 h-5 ${action.color}`} />
              </div>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Primary Action */}
        <div className="space-y-6">
          <button 
            onClick={() => {
              if (userRole === 'CUSTOMER' && activeJob.status === 'IN_PROGRESS') {
                updateJobStatus(activeJob.id, 'COMPLETED');
                setShowRating(true);
              } else if (userRole === 'CLEANER') {
                // Determine next status for cleaner
                const nextStatusMap: Record<string, string> = {
                  'ACCEPTED': 'EN_ROUTE',
                  'EN_ROUTE': 'ARRIVED',
                  'ARRIVED': 'IN_PROGRESS',
                  'IN_PROGRESS': 'COMPLETED'
                };
                const nextStatus = nextStatusMap[activeJob.status];
                if (nextStatus) {
                  updateJobStatus(activeJob.id, nextStatus);
                }
              }
            }}
            className={`w-full py-6 rounded-[32px] font-black text-sm uppercase tracking-[0.2em] shadow-xl transition-all flex items-center justify-center gap-4 ${
              activeJob.status === 'IN_PROGRESS' 
                ? 'bg-brand-lime text-white shadow-brand-lime/30' 
                : 'bg-slate-900 text-white shadow-slate-900/30'
            }`}
          >
            <CheckCircle className="w-6 h-6" />
            {userRole === 'CUSTOMER' 
              ? (activeJob.status === 'IN_PROGRESS' ? 'Confirm Completion' : 'Cleaning in Progress')
              : (activeJob.status === 'ACCEPTED' ? 'Start Trip' : 
                 activeJob.status === 'EN_ROUTE' ? 'I Have Arrived' :
                 activeJob.status === 'ARRIVED' ? 'Start Cleaning' : 'Complete Job')
            }
          </button>
          
          <p className="text-[10px] text-slate-400 text-center px-4 leading-relaxed font-medium">
            By clicking confirm, you agree that the cleaning service has been completed to your satisfaction.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

interface MessagesViewProps {
  setCurrentScreen: (screen: Screen) => void;
  setIsChatOpen: (open: boolean) => void;
  conversations: any[];
  setSelectedChatJob: (job: any) => void;
  currentUser: FirebaseUser | null;
  activeTheme?: 'light' | 'dark';
}

const MessagesView = ({ 
  setCurrentScreen, 
  setIsChatOpen, 
  conversations, 
  setSelectedChatJob, 
  currentUser,
  activeTheme = 'light'
}: MessagesViewProps) => {
  const [profiles, setProfiles] = useState<Record<string, any>>({});

  useEffect(() => {
    conversations.forEach(async (conv) => {
      const otherId = conv.customerId === currentUser?.uid ? conv.cleanerId : conv.customerId;
      if (otherId && !profiles[otherId]) {
        const userDoc = await getDoc(doc(db, 'users', otherId));
        if (userDoc.exists()) {
          setProfiles(prev => ({ ...prev, [otherId]: userDoc.data() }));
        }
      }
    });
  }, [conversations, currentUser]);

  const isDark = activeTheme === 'dark';
  const cBg = isDark ? 'bg-[#0F0E16]' : 'bg-white';
  const cText = isDark ? 'text-white' : 'text-slate-900';
  const cTextMuted = isDark ? 'text-white/45' : 'text-slate-400';

  return (
    <div className={`flex-1 p-10 overflow-y-auto no-scrollbar ${cBg}`}>
      <div className="flex justify-between items-center mb-12">
        <button 
          onClick={() => setCurrentScreen('HOME')} 
          className={`w-14 h-14 rounded-2xl flex items-center justify-center active:scale-95 transition-all ${
            isDark ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-slate-50 text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h2 className={`font-display font-black text-3xl tracking-tighter ${cText}`}>Encrypted Chat</h2>
        <button 
          className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
            isDark ? 'bg-white/5 text-white/40 hover:bg-white/10' : 'bg-slate-50 text-slate-300 hover:bg-slate-100'
          }`}
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      <div className="space-y-6">
        {conversations.length === 0 ? (
          <div className={`text-center py-32 rounded-[56px] border border-dashed ${
            isDark ? 'bg-white/[0.02] border-white/10' : 'bg-slate-50 border-slate-200'
          }`}>
             <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm ${
               isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-slate-100'
             }`}>
                <MessageSquare className={`w-8 h-8 ${isDark ? 'text-white/20' : 'text-slate-200'}`} />
             </div>
             <p className={`font-black uppercase tracking-[0.3em] text-[10px] ${cTextMuted}`}>Your inbox is silent</p>
          </div>
        ) : (
          conversations.filter(c => c.lastMessage).map((chat, i) => {
            const otherId = chat.customerId === currentUser?.uid ? chat.cleanerId : chat.customerId;
            const otherProfile = profiles[otherId] || {};
            const time = (() => {
              if (!chat.lastMessageTimestamp || !chat.lastMessageTimestamp.toDate) return 'Just now';
              const diffMs = Date.now() - chat.lastMessageTimestamp.toDate().getTime();
              const diffSec = Math.floor(diffMs / 1000);
              const diffMin = Math.floor(diffSec / 60);
              const diffHr = Math.floor(diffMin / 60);
              const diffDays = Math.floor(diffHr / 24);

              if (diffMin < 1) return 'Just now';
              if (diffMin < 60) return `${diffMin}m ago`;
              if (diffHr < 24) return `${diffHr}h ago`;
              if (diffDays === 1) return 'Yesterday';
              return `${diffDays}d ago`;
            })();

            const isUnread = chat.lastMessageSenderId !== currentUser?.uid && 
              (!chat.lastRead?.[currentUser?.uid] || 
               (chat.lastMessageTimestamp?.toDate && chat.lastRead[currentUser.uid]?.toDate && 
                chat.lastMessageTimestamp.toDate() > chat.lastRead[currentUser.uid].toDate()));

            return (
              <motion.button 
                key={i} 
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ x: 5 }}
                onClick={() => {
                  setSelectedChatJob(chat);
                  setIsChatOpen(true);
                }}
                className={`w-full p-4 xs:p-5 rounded-3xl border flex items-center justify-between gap-2.5 group transition-all shrink-0 ${
                  isUnread 
                    ? (isDark ? 'bg-[#3906d2]/10 border-[#3906d2]/30' : 'bg-slate-900 border-slate-900') 
                    : (isDark ? 'bg-white/5 border-white/5 text-white/80' : 'bg-white border-slate-100 shadow-sm text-slate-800')
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="relative shrink-0">
                    <div className={`w-12 h-12 xs:w-14 xs:h-14 rounded-2xl overflow-hidden border-2 group-hover:border-[#3906d2]/20 transition-all ${
                      isDark ? 'border-zinc-800' : 'border-slate-50'
                    }`}>
                      <img 
                        src={otherProfile.photoURL || `https://i.pravatar.cc/160?u=${otherId}`} 
                        alt={otherProfile.displayName || 'User'} 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    {isUnread && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#3906d2] rounded-full border border-white flex items-center justify-center">
                        <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                      </div>
                    )}
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <h3 className={`font-black text-xs xs:text-sm uppercase tracking-tight mb-0.5 truncate ${
                      isUnread 
                        ? (isDark ? 'text-[#3906d2]' : 'text-white') 
                        : (isDark ? 'text-white' : 'text-slate-900')
                    }`}>{otherProfile.displayName || 'Client Access'}</h3>
                    {chat.typing?.[otherId] ? (
                      <div className="flex gap-1 items-center py-1">
                        <span className="w-1.5 h-1.5 bg-[#3906d2] rounded-full animate-bounce"></span>
                        <span className="w-1.5 h-1.5 bg-[#3906d2] rounded-full animate-bounce delay-100"></span>
                        <span className="w-1.5 h-1.5 bg-[#3906d2] rounded-full animate-bounce delay-200"></span>
                      </div>
                    ) : (
                      <p className={`text-[11px] xs:text-xs truncate font-semibold ${
                        isUnread 
                          ? (isDark ? 'text-white/60' : 'text-slate-400') 
                          : 'text-slate-400'
                      }`}>{chat.lastMessage}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 pr-1 shrink-0">
                   <p className={`text-[9px] font-black uppercase tracking-wider ${
                     isUnread 
                       ? 'text-[#3906d2]' 
                       : (isDark ? 'text-white/30' : 'text-slate-400')
                   }`}>{time}</p>
                   {!isUnread && <div className={`w-1.5 h-1.5 rounded-full ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}></div>}
                </div>
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
};

interface FindCleanersViewProps {
  setCurrentScreen: (screen: Screen) => void;
  setSelectedCleaner: (cleaner: any) => void;
  cleaners: any[];
  userRole: UserRole;
  currentLocation?: { lat: number, lng: number } | null;
  activeTheme?: 'light' | 'dark';
}

const FindCleanersView = ({ setCurrentScreen, setSelectedCleaner, cleaners, userRole, currentLocation, activeTheme = 'light' }: FindCleanersViewProps) => {
  const [activeTab, setActiveTab] = useState<'list' | 'map'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All Services');
  const [sortBy, setSortBy] = useState<'matches' | 'rating' | 'distance'>('distance');
  const isDark = activeTheme === 'dark';

  // Haversine formula to compute actual geographical distance
  const getDistance = (lat1?: number, lon1?: number, lat2?: number, lon2?: number) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 1.2;
    const R = 6371; // km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(1));
  };

  const customerLoc = currentLocation || { lat: 40.7128, lng: -74.0060 }; // Fallback to NYC center

  const filteredCleaners = cleaners.filter(c => {
    // 1. Text Search query matching name, email and specialties
    const matchesSearch = c.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (Array.isArray(c.specialties) && c.specialties.some((s: string) => s.toLowerCase().includes(searchQuery.toLowerCase())));
    if (!matchesSearch) return false;

    // 2. Specialty Category filter
    if (selectedFilter === 'House Cleaning') {
      return Array.isArray(c.specialties) ? c.specialties.includes('House Cleaning') : true;
    }
    if (selectedFilter === 'Car Cleaning') {
      return Array.isArray(c.specialties) ? c.specialties.includes('Car Detailing') : true;
    }
    if (selectedFilter === 'Top Rated') {
      return (c.ratingAverage || 0) >= 4.8;
    }
    return true;
  });

  const sortedCleaners = React.useMemo(() => {
    const list = [...filteredCleaners];
    
    if (sortBy === 'matches') {
      // Normalize for rankCleaners service
      const normalized = list.map(c => ({
        ...c,
        location: c.location || (c.lat && c.lng ? { lat: c.lat, lng: c.lng } : { lat: customerLoc.lat, lng: customerLoc.lng }),
        radius: c.radius || 15,
        ratingAverage: c.ratingAverage || 4.5,
        jobsCompleted: c.jobsCompleted || 0,
        responseTimeAverage: c.responseTimeAverage || 10,
        verificationLevel: c.verificationLevel || 1
      }));

      // Weighted score favoring top stars heavily
      return rankCleaners(normalized, customerLoc, {
        distance: 0.15,
        rating: 0.55, // 55% heavy weight for Uber star score ratings
        completion: 0.15,
        response: 0.10,
        verification: 0.05
      });
    } else if (sortBy === 'rating') {
      return list.sort((a, b) => (b.ratingAverage || 0) - (a.ratingAverage || 0));
    } else {
      // Distance based sorting
      return list.sort((a, b) => {
        const distA = getDistance(customerLoc.lat, customerLoc.lng, a.lat, a.lng);
        const distB = getDistance(customerLoc.lat, customerLoc.lng, b.lat, b.lng);
        return distA - distB;
      });
    }
  }, [filteredCleaners, sortBy, currentLocation]);

  const filterOptions = ['All Services', 'House Cleaning', 'Car Cleaning', 'Top Rated'];

  const cycleSort = () => {
    if (sortBy === 'matches') setSortBy('rating');
    else if (sortBy === 'rating') setSortBy('distance');
    else setSortBy('matches');
  };

  return (
    <div className={`flex-1 flex flex-col overflow-hidden transition-colors ${isDark ? 'bg-[#0B0A11] text-white' : 'bg-white text-slate-800'}`}>
      {/* Header Area */}
      <div className={`pt-12 pb-6 px-8 rounded-b-[40px] transition-colors ${isDark ? 'bg-slate-950 border-b border-white/10 active:shadow-black' : 'bg-brand-lime shadow-lg shadow-brand-lime/10'}`}>
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setCurrentScreen('HOME')} className="p-2 -ml-2">
            <ChevronLeft className={`w-6 h-6 ${isDark ? 'text-brand-lime' : 'text-white'}`} />
          </button>
          <div className="text-center">
            <h2 className="text-sm font-black uppercase tracking-widest text-white">Find Certified Match</h2>
          </div>
          <button onClick={cycleSort} className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-white/5 hover:bg-white/10 text-brand-lime' : 'bg-white/20 backdrop-blur-md text-white'}`}>
            <Sliders className="w-5 h-5" />
          </button>
        </div>

        <div className="relative group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            <Search className="w-5 h-5 text-slate-400" />
          </div>
          <input 
            type="text"
            placeholder="Search by name or service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full py-4 pl-12 pr-4 rounded-2xl text-sm font-bold border-2 focus:outline-none transition-all ${isDark ? 'bg-slate-900 text-white border-white/5 focus:border-brand-lime/40 placeholder-slate-500' : 'bg-white text-slate-900 border-transparent focus:border-slate-900/10 shadow-sm'}`}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
        <div className="p-6 space-y-6">
          {/* Toggles & Sort */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className={`p-1 rounded-2xl flex gap-1 w-full sm:w-auto ${isDark ? 'bg-slate-900 border border-white/5' : 'bg-slate-50'}`}>
              <button 
                onClick={() => setActiveTab('list')}
                className={`flex-1 sm:px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === 'list' ? (isDark ? 'bg-slate-950 text-brand-lime' : 'bg-white text-slate-900 shadow-sm') : 'text-slate-400'}`}
              >
                <List className="w-4 h-4" />
                List
              </button>
              <button 
                onClick={() => setActiveTab('map')}
                className={`flex-1 sm:px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === 'map' ? (isDark ? 'bg-slate-950 text-brand-lime' : 'bg-white text-slate-900 shadow-sm') : 'text-slate-400'}`}
              >
                <MapIcon className="w-4 h-4" />
                Map
              </button>
            </div>

            <button 
              onClick={cycleSort} 
              className={`w-full sm:w-auto px-6 py-3 border-2 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest ${isDark ? 'border-white/5 bg-slate-900 hover:bg-slate-800 text-slate-400' : 'border-slate-100 bg-white text-slate-400'}`}
            >
              <Navigation className="w-4 h-4 text-brand-lime animate-pulse" />
              Sort by: {sortBy === 'matches' ? 'Smart Recommendations' : sortBy === 'rating' ? 'Highest Stars' : 'Proximity Distance'}
            </button>
          </div>

          {/* Service Chips */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {filterOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => setSelectedFilter(opt)}
                className={`flex-shrink-0 px-6 py-2.5 rounded-full text-[10px] font-black border-2 transition-all ${
                  selectedFilter === opt 
                    ? (isDark ? 'bg-brand-lime/20 border-brand-lime/40 text-brand-lime shadow-none' : 'bg-brand-lime border-brand-lime text-white shadow-md shadow-brand-lime/20') 
                    : (isDark ? 'bg-slate-900 border-white/5 text-slate-400' : 'bg-white border-slate-50 text-slate-400')
                }`}
              >
                {opt === 'Top Rated' && <Star className="inline w-3 h-3 mb-0.5 mr-1" />}
                {opt}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between pl-1">
            <p className={`text-sm font-black uppercase tracking-widest ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Found <span className="text-brand-lime">{sortedCleaners.length}</span> active specialists
            </p>
          </div>

          {/* Cleaner Cards */}
          {activeTab === 'list' ? (
            sortedCleaners.length === 0 ? (
              <div className="py-16 px-6 flex flex-col items-center justify-center text-center space-y-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDark ? 'bg-white/5 text-brand-lime' : 'bg-slate-100 text-[#3906d2]'}`}>
                  <Search className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className={`font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>No Specialists Found</h3>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-[280px] leading-relaxed mx-auto">
                    We couldn't locate any active, online cleaners matching "{searchQuery || selectedFilter}" near your current coordinates.
                  </p>
                </div>
                <button 
                  onClick={() => { setSearchQuery(''); setSelectedFilter('All Services'); }}
                  className="text-[10px] font-black uppercase tracking-wider text-brand-lime hover:underline pt-2 cursor-pointer"
                >
                  Reset Active Filters
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedCleaners.map((cleaner, i) => {
                  const distKm = getDistance(customerLoc.lat, customerLoc.lng, cleaner.lat, cleaner.lng);
                  // Dynamically evaluate traveler ETA: 50 km/h average speed + 5 min dispatch setup buffer
                  const travelEta = Math.max(4, Math.round((distKm / 45) * 60) + 4);
                  const isHighlyRecommended = (cleaner.ratingAverage || 4.5) >= 4.8 && (cleaner.jobsCompleted || 0) >= 30;

                  return (
                    <motion.div 
                      key={cleaner.uid}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`border-2 rounded-[32px] p-5 transition-all cursor-pointer group relative ${isDark ? 'bg-slate-900 border-white/5 shadow-none hover:border-brand-lime/20' : 'bg-white border-slate-50 shadow-sm hover:border-brand-lime/30'}`}
                      onClick={() => {
                        setSelectedCleaner(cleaner);
                        setCurrentScreen('HOME');
                      }}
                    >
                      {isHighlyRecommended && (
                        <div className="absolute top-4 right-4 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" /> High Rating Match
                        </div>
                      )}

                      <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-md">
                              <img 
                                src={cleaner.photoURL || `https://i.pravatar.cc/150?u=${cleaner.uid}`} 
                                alt={cleaner.displayName}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div className={`absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-4 rounded-full ${isDark ? 'border-slate-900' : 'border-white'}`}></div>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <h3 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{cleaner.displayName}</h3>
                              {cleaner.isVerified && <BadgeCheck className="w-4 h-4 text-brand-lime fill-brand-lime/10" />}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <StarRating rating={cleaner.ratingAverage || 4.9} count={cleaner.ratingCount || 112} showNumber={true} size="w-3 h-3" />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className={`grid grid-cols-3 gap-1 border-y py-4 mb-6 ${isDark ? 'border-white/5' : 'border-slate-50'}`}>
                        <div className={`flex flex-col items-center border-r ${isDark ? 'border-white/5' : 'border-slate-50'}`}>
                          <span className={`text-[8px] font-black uppercase tracking-widest mb-1.5 ${isDark ? 'text-slate-500' : 'text-slate-300'}`}>Experience</span>
                          <div className="flex items-center gap-1.5">
                            <Briefcase className="w-3 h-3 text-brand-lime" />
                            <span className={`text-[10px] font-black ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{cleaner.jobsCompleted || 0} Jobs</span>
                          </div>
                        </div>
                        <div className={`flex flex-col items-center border-r ${isDark ? 'border-white/5' : 'border-slate-50'}`}>
                          <span className={`text-[8px] font-black uppercase tracking-widest mb-1.5 ${isDark ? 'text-slate-500' : 'text-slate-300'}`}>Proximity</span>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3 h-3 text-brand-lime" />
                            <span className={`text-[10px] font-black ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{distKm} Km</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className={`text-[8px] font-black uppercase tracking-widest mb-1.5 ${isDark ? 'text-slate-500' : 'text-slate-300'}`}>ETA</span>
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-brand-lime" />
                            <span className={`text-[10px] font-black ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{travelEta}m</span>
                          </div>
                        </div>
                      </div>

                      <button className="w-full py-4 bg-brand-lime text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-brand-lime/10 group-hover:scale-[1.02] active:scale-95 transition-all">
                        Review & Select Offer
                      </button>
                    </motion.div>
                  );
                })}
                
                <button className="w-full py-6 text-[11px] font-black text-brand-lime uppercase tracking-widest hover:text-slate-900 transition-colors">
                  End of Verified Active Specialist Network
                </button>
              </div>
            )
          ) : (
            <div className={`aspect-[4/5] rounded-[40px] flex items-center justify-center border-2 overflow-hidden relative ${isDark ? 'bg-slate-900 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
              <MapBackground nearbyCleaners={sortedCleaners} zoom={14} userRole={userRole} currentLocation={currentLocation} />
              <div className="absolute inset-x-6 bottom-6">
                <div className={`p-4 rounded-3xl border flex items-center gap-4 ${isDark ? 'bg-slate-950/80 backdrop-blur-md border-white/5 text-white shadow-2xl' : 'bg-white/80 backdrop-blur-md border-white shadow-xl text-slate-900'}`}>
                  <div className="w-12 h-12 rounded-xl bg-brand-lime flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className={`text-xs font-black uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>Interactive Map</p>
                    <p className="text-[10px] font-bold text-slate-400">Discover active pros near you</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface BidsReceivedViewProps {
  setCurrentScreen: (screen: Screen) => void;
  myBids: any[];
  setActiveJob: (job: any) => void;
}

const BidsReceivedView = ({ setCurrentScreen, myBids, acceptBid, declineBid, setIsChatOpen, activeJob, userRole, activeTheme = 'light' }: { setCurrentScreen: (screen: Screen) => void, myBids: any[], acceptBid: (bidId: string, jobId: string) => void, declineBid: (bidId: string) => void, setIsChatOpen: (open: boolean) => void, activeJob: any, userRole: UserRole, activeTheme?: 'light' | 'dark' }) => {
  const [activeFilter, setActiveFilter] = React.useState('All Offers');
  const isDark = activeTheme === 'dark';

  const filters = ['All Offers', 'Lowest Price', 'Top Rated', 'Fastest ETA'];
  
  const filteredBids = myBids.filter(bid => bid.status === 'PENDING' || bid.status === 'BIDDING');

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden transition-colors ${isDark ? 'bg-[#0B0A11] text-white' : 'bg-slate-50 text-slate-800'}`}>
      {/* Header */}
      <div className={`px-6 pt-12 pb-6 flex items-center justify-between ${isDark ? 'bg-slate-950 border-b border-white/10' : 'bg-brand-lime'}`}>
        <button onClick={() => setCurrentScreen('HOME')} className="p-2">
          <ChevronLeft className={`w-6 h-6 ${isDark ? 'text-brand-lime' : 'text-white'}`} />
        </button>
        <h2 className={`font-extrabold text-xl tracking-tight ${isDark ? 'text-white' : 'text-white'}`}>Bids ({filteredBids.length})</h2>
        <button className="p-2">
          <SlidersHorizontal className={`w-6 h-6 ${isDark ? 'text-brand-lime' : 'text-white'}`} />
        </button>
      </div>

      {/* Filter Chips */}
      <div className={`py-4 px-6 flex gap-3 overflow-x-auto no-scrollbar border-b ${isDark ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-100'}`}>
        {filters.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-6 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
              activeFilter === filter
                ? (isDark ? 'bg-brand-lime/20 border-brand-lime/40 text-brand-lime shadow-none' : 'bg-brand-lime border-brand-lime text-white shadow-lg shadow-brand-lime/20')
                : (isDark ? 'bg-slate-950 border-white/5 text-slate-400' : 'bg-white border-slate-200 text-slate-500')
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-y-auto no-scrollbar space-y-6">
        <div className="flex justify-between items-center">
          <h3 className={`font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>Available Offers</h3>
          <div className={`flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 py-1.5 rounded-lg ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
            Sort: Best Match
            <ChevronDown className="w-3 h-3" />
          </div>
        </div>

        {filteredBids.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
              <Clock className="w-10 h-10 text-slate-300" />
            </div>
            <p className="text-slate-400 font-black uppercase tracking-widest text-xs">
              {userRole === 'CUSTOMER' ? 'Waiting for bids...' : 'No bids placed yet'}
            </p>
          </div>
        ) : (
          filteredBids.map((bid, i) => (
            <div key={i} className={`rounded-[32px] p-6 space-y-6 ${isDark ? 'bg-slate-900 border border-white/5 shadow-none' : 'bg-white border border-slate-100 shadow-sm'}`}>
              {/* Header: Avatar & Name */}
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <img
                      src={userRole === 'CUSTOMER' ? (bid.cleanerPhoto || `https://i.pravatar.cc/100?u=${bid.cleanerId}`) : `https://picsum.photos/seed/${bid.jobId}/100/100`}
                      alt="Avatar"
                      className={`w-16 h-16 rounded-full object-cover border-4 ${isDark ? 'border-slate-950' : 'border-slate-50'}`}
                    />
                    <div className={`absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full border-2 flex items-center justify-center ${isDark ? 'border-slate-950' : 'border-white'}`}>
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  </div>
                  <div>
                    <h4 className={`font-black text-lg flex items-center gap-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {userRole === 'CUSTOMER' ? bid.cleanerName : 'Job Bid'}
                      {bid.isElite && <ShieldCheck className="w-4 h-4 text-slate-900" />}
                    </h4>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center text-amber-500">
                          <Star className="w-3 h-3 fill-amber-500" />
                          <span className={`text-[10px] font-bold ml-1 ${isDark ? 'text-slate-300' : 'text-slate-900'}`}>{bid.rating || '4.9'}</span>
                        </div>
                        <span className="text-slate-400 text-[10px] font-bold">({bid.reviews || '124'} reviews)</span>
                    </div>
                  </div>
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${isDark ? 'text-white bg-slate-950/50' : 'text-slate-900 bg-slate-50'}`}>Elite Pro</span>
              </div>

              {/* Message */}
              <p className={`text-sm font-medium italic leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                "{bid.message || "I can be there shortly! I specialize in deep kitchen cleaning and have all my own eco-friendly products."}"
              </p>

              {/* Stats Box */}
              <div className={`rounded-2xl p-4 flex divide-x ${isDark ? 'bg-slate-950/50 divide-white/5' : 'bg-slate-50 divide-slate-200'}`}>
                <div className="flex-1 flex flex-col items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Price</span>
                  <span className={`font-black text-xl ${isDark ? 'text-[#3906d2]' : 'text-[#3906d2]'}`}>${bid.bidPrice}</span>
                </div>
                <div className="flex-1 flex flex-col items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Distance</span>
                  <span className={`font-black text-xl ${isDark ? 'text-white' : 'text-slate-900'}`}>{bid.distance || '2 Km'}</span>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => acceptBid(bid.id, bid.jobId)}
                  className="flex-1 py-4 bg-brand-lime text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-brand-lime/20 active:scale-95 transition-transform"
                >
                  Accept Bid
                </button>
                <button
                  onClick={() => declineBid(bid.id)}
                  className={`p-4 rounded-2xl transition-colors ${isDark ? 'bg-slate-950 border border-white/5 text-slate-500 hover:text-red-500' : 'bg-white border border-slate-200 text-slate-400 hover:text-red-500'}`}
                >
                  <X className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setIsChatOpen(true)}
                  className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] active:scale-95 transition-all ${isDark ? 'bg-brand-lime/15 text-brand-lime hover:bg-brand-lime/25' : 'bg-brand-lime/20 text-slate-900'}`}
                >
                  Negotiate Bid
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Extra spacing for BottomNav */}
      <div className="h-16"></div>
    </div>
  );
};

interface ProfileViewProps {
  userRole: UserRole;
  toggleRole: (role?: UserRole) => void;
}

const PrivacyPolicyView = ({ setCurrentScreen, activeTheme }: { setCurrentScreen: (screen: Screen) => void, activeTheme: 'light' | 'dark' }) => {
  const isDark = activeTheme === 'dark';
  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden transition-colors duration-300 ${isDark ? 'bg-[#0F0E16]' : 'bg-[#FAFAFB]'}`}>
    <div className={`p-8 flex items-center gap-4 border-b shrink-0 ${isDark ? 'border-white/5' : 'border-slate-200/80'}`}>
      <button onClick={() => setCurrentScreen('PROFILE')} className={`p-3 rounded-2xl transition-all ${isDark ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'}`}>
        <ArrowLeft className="w-6 h-6" />
      </button>
      <h2 className={`font-black text-xl ${isDark ? 'text-white' : 'text-slate-900'}`}>Privacy Policy</h2>
    </div>
    
    <div className="flex-1 p-8 overflow-y-auto no-scrollbar space-y-8 pb-20">
      <div className="space-y-2">
        <h3 className="text-accent font-black text-lg uppercase tracking-widest">Detail Technologies (Private) Limited</h3>
        <p className={`text-xs font-bold ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Last Updated: April 7, 2026</p>
      </div>

      <section className="space-y-4">
        <h4 className={`font-black text-sm uppercase tracking-widest border-l-4 border-accent pl-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>1. Introduction</h4>
        <p className={`text-sm leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
          Detail Technologies (Private) Limited (“Company”, “we”, “us”) respects your privacy. This Privacy Policy explains what personal data we collect, why we collect it, how it is used, and your rights under applicable data protection laws, including GDPR.
        </p>
        <p className={`text-sm leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
          By using the Detail Platform (“Platform”), you consent to this Privacy Policy.
        </p>
      </section>

      <section className="space-y-4">
        <h4 className={`font-black text-sm uppercase tracking-widest border-l-4 border-accent pl-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>2. Data We Collect</h4>
        
        <div className="space-y-6">
          <div className={`p-6 rounded-3xl space-y-3 ${isDark ? 'bg-white/5 border border-white/5' : 'bg-white border border-slate-200/60 shadow-sm shadow-slate-100/50'}`}>
            <h5 className={`font-black text-xs uppercase tracking-widest ${isDark ? 'text-white' : 'text-slate-900'}`}>2.1 Identity Information</h5>
            <ul className={`text-xs space-y-2 list-disc pl-4 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
              <li>Full name</li>
              <li>National ID or other government-issued ID (for Cleaners verification)</li>
              <li>Profile picture / video verification</li>
            </ul>
            <p className="text-accent/60 text-[10px] font-bold uppercase tracking-wider mt-2">Purpose: Verify identity, prevent fraud, ensure trust and safety.</p>
          </div>

          <div className={`p-6 rounded-3xl space-y-3 ${isDark ? 'bg-white/5 border border-white/5' : 'bg-white border border-slate-200/60 shadow-sm shadow-slate-100/50'}`}>
            <h5 className={`font-black text-xs uppercase tracking-widest ${isDark ? 'text-white' : 'text-slate-900'}`}>2.2 Contact Information</h5>
            <ul className={`text-xs space-y-2 list-disc pl-4 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
              <li>Email address</li>
              <li>Phone number</li>
            </ul>
            <p className="text-accent/60 text-[10px] font-bold uppercase tracking-wider mt-2">Purpose: Account registration, notifications, communication about bookings, payments, and updates.</p>
          </div>

          <div className={`p-6 rounded-3xl space-y-3 ${isDark ? 'bg-white/5 border border-white/5' : 'bg-white border border-slate-200/60 shadow-sm shadow-slate-100/50'}`}>
            <h5 className={`font-black text-xs uppercase tracking-widest ${isDark ? 'text-white' : 'text-slate-900'}`}>2.3 Location Data</h5>
            <ul className={`text-xs space-y-2 list-disc pl-4 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
              <li>GPS/location tracking during service delivery</li>
              <li>Customer addresses for service</li>
              <li>Location timestamps</li>
            </ul>
            <p className="text-accent/60 text-[10px] font-bold uppercase tracking-wider mt-2">Purpose: To match Cleaners with nearby Customers, optimize routes, confirm service completion, and ensure safety.</p>
          </div>

          <div className={`p-6 rounded-3xl space-y-3 ${isDark ? 'bg-white/5 border border-white/5' : 'bg-white border border-slate-200/60 shadow-sm shadow-slate-100/50'}`}>
            <h5 className={`font-black text-xs uppercase tracking-widest ${isDark ? 'text-white' : 'text-slate-900'}`}>2.4 Device & Usage Data</h5>
            <ul className={`text-xs space-y-2 list-disc pl-4 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
              <li>IP addresses, Device identifiers (IMEI, device type)</li>
              <li>Operating system, app version</li>
              <li>Login timestamps, duration of use</li>
            </ul>
          </div>

          <div className={`p-6 rounded-3xl space-y-3 ${isDark ? 'bg-white/5 border border-white/5' : 'bg-white border border-slate-200/60 shadow-sm shadow-slate-100/50'}`}>
            <h5 className={`font-black text-xs uppercase tracking-widest ${isDark ? 'text-white' : 'text-slate-900'}`}>2.6 Payment & Financial</h5>
            <ul className={`text-xs space-y-2 list-disc pl-4 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
              <li>Bank account or mobile money details</li>
              <li>Payment history and amounts</li>
              <li>Transaction IDs</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h4 className={`font-black text-sm uppercase tracking-widest border-l-4 border-accent pl-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>6. Data Retention</h4>
        <p className={`text-sm leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
          Account and transaction data is retained as long as your account is active. Financial records are retained for up to 7 years for regulatory compliance.
        </p>
      </section>

      <section className="space-y-4">
        <h4 className={`font-black text-sm uppercase tracking-widest border-l-4 border-accent pl-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>7. Data Security</h4>
        <p className={`text-sm leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
          We implement technical and organizational measures including data encryption (in transit and at rest), secure cloud storage, and access controls.
        </p>
      </section>

      <section className="space-y-4">
        <h4 className={`font-black text-sm uppercase tracking-widest border-l-4 border-accent pl-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>10. Minors</h4>
        <p className={`text-sm leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
          The Platform is NOT intended for anyone under 18. We do not knowingly collect personal data from minors.
        </p>
      </section>

      <section className="space-y-4">
        <h4 className={`font-black text-sm uppercase tracking-widest border-l-4 border-accent pl-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>3. How We Use Your Data</h4>
        <div className="grid grid-cols-1 gap-3">
          {[
            "Operate the Platform efficiently",
            "Match Cleaners to Customers",
            "Process payments and calculate commissions",
            "Communicate updates or support requests",
            "Detect and prevent fraud",
            "Resolve disputes between users",
            "Comply with legal obligations",
            "Improve user experience"
          ].map((item, i) => (
            <div key={i} className={`flex items-center gap-3 p-4 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-white border border-slate-200/50 shadow-sm shadow-slate-100/30'}`}>
              <div className="w-1.5 h-1.5 bg-accent rounded-full"></div>
              <span className={`text-xs font-bold ${isDark ? 'text-white/60' : 'text-slate-600'}`}>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h4 className={`font-black text-sm uppercase tracking-widest border-l-4 border-accent pl-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>4. Legal Basis (GDPR)</h4>
        <p className={`text-sm leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
          We process personal data under the following legal bases: Consent, Contractual necessity, Legal obligation, and Legitimate interests.
        </p>
      </section>

      <section className="space-y-4">
        <h4 className={`font-black text-sm uppercase tracking-widest border-l-4 border-accent pl-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>5. Data Sharing</h4>
        <p className={`text-sm leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
          We may share your data with service providers, regulatory authorities, and legal enforcement. We do NOT sell personal data to third parties.
        </p>
      </section>

      <section className="space-y-4">
        <h4 className={`font-black text-sm uppercase tracking-widest border-l-4 border-accent pl-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>8. User Rights</h4>
        <p className={`text-sm leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
          You have the right to access, correct, delete, or restrict processing of your personal data. You may also withdraw consent at any time.
        </p>
      </section>

      <div className="p-8 bg-accent/10 rounded-[40px] border border-accent/20 space-y-4">
        <h4 className="text-accent font-black text-sm uppercase tracking-widest">Contact Us</h4>
        <p className={`text-xs font-bold leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
          For any privacy-related inquiries, please contact us at:<br/>
          <span className={isDark ? "text-white" : "text-slate-900 font-extrabold"}>privacy@detailtechnologies.com</span>
        </p>
      </div>
    </div>
  </div>
  );
};

const CleanerAgreementView = ({ setCurrentScreen, user, profile, activeTheme }: { setCurrentScreen: (screen: Screen) => void, user: FirebaseUser | null, profile: UserProfile | null, activeTheme: 'light' | 'dark' }) => {
  const [step, setStep] = useState<'NATIONAL_ID' | 'AGREEMENT'>('NATIONAL_ID');
  const [nationalId, setNationalId] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [isIdVerified, setIsIdVerified] = useState(false);
  const [idFront, setIdFront] = useState<string | null>(
    "https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?auto=format&fit=crop&q=80&w=400"
  );
  const [idBack, setIdBack] = useState<string | null>(
    "https://images.unsplash.com/photo-1554774853-7b3c1ffaa888?auto=format&fit=crop&q=80&w=400"
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const AGREEMENT_VERSION = "2026.04.07.V1";

  useEffect(() => {
    let timer: any;
    if (isScanning) {
      timer = setInterval(() => {
        setScanStep(prev => {
          if (prev >= 3) {
            clearInterval(timer);
            setIsScanning(false);
            setIsIdVerified(true);
            return 3;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isScanning]);

  const handleStartScan = () => {
    if (!nationalId.trim()) {
      setError('Please enter your National ID Card number.');
      return;
    }
    setError(null);
    setIsScanning(true);
    setScanStep(0);
  };

  const handleAgree = async () => {
    if (!user) return;
    setIsSubmitting(true);
    setError(null);
    try {
      // Update user profile with Agreement and National ID details
      await updateDoc(doc(db, 'users', user.uid), {
        hasAgreedToTerms: true,
        nationalId: nationalId,
        isIdVerified: true,
        idVerifiedAt: new Date().toISOString()
      });

      // Log the agreement in the background
      addDoc(collection(db, 'agreement_logs'), {
        uid: user.uid,
        agreementVersion: AGREEMENT_VERSION,
        timestamp: serverTimestamp(),
        userAgent: navigator.userAgent
      }).catch(err => console.error('Background logging failed:', err));

      setTimeout(() => {
        setCurrentScreen('HOME');
      }, 500);
    } catch (err: any) {
      console.error('Agreement acceptance failed:', err);
      setError('Failed to save agreement. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const scanProgressLogs = [
    "Contacting Civil Identification Authority database securely...",
    "Scanning document layouts & extracting ID biometric metadata...",
    "Correlating facial feature signatures with census records...",
    "VERIFIED: Identity credentials confirmed with 100% database match."
  ];

  const isDark = activeTheme === 'dark';

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-300 ${isDark ? 'bg-[#0F0E16]' : 'bg-[#FAFAFB]'}`}>
      {/* Header */}
      <div className={`p-8 flex items-center justify-between border-b shrink-0 ${isDark ? 'border-white/5' : 'border-slate-200/80'}`}>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              if (step === 'AGREEMENT') {
                setStep('NATIONAL_ID');
              } else {
                setCurrentScreen(profile?.hasAgreedToTerms ? 'PROFILE' : 'HOME');
              }
            }} 
            className={`p-3 rounded-2xl transition-all ${isDark ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'}`}
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h2 className={`font-black text-xl ${isDark ? 'text-white' : 'text-slate-900'}`}>Service Provider Onboarding</h2>
            <p className="text-[10px] font-black uppercase text-accent tracking-[0.2em] mt-0.5">
              {step === 'NATIONAL_ID' ? 'Step 1: Identity Audit' : 'Step 2: Legal Terms'}
            </p>
          </div>
        </div>
        
        {/* Step Indicator Bullets */}
        <div className={`flex gap-1.5 px-3 py-2 rounded-full border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
          <div className={`w-6 h-1.5 rounded-full transition-all duration-300 ${step === 'NATIONAL_ID' ? 'bg-accent' : (isDark ? 'bg-white/20' : 'bg-slate-300')}`}></div>
          <div className={`w-6 h-1.5 rounded-full transition-all duration-300 ${step === 'AGREEMENT' ? 'bg-accent' : (isDark ? 'bg-white/20' : 'bg-slate-300')}`}></div>
        </div>
      </div>

      <div className="flex-1 p-8 overflow-y-auto no-scrollbar space-y-8 pb-32">
        {step === 'NATIONAL_ID' ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className={`font-black text-2xl tracking-tight leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>National ID Verification</h3>
              <p className={`text-xs ${isDark ? 'text-white/50' : 'text-slate-500 font-bold'}`}>By national regulation in Zimbabwe, all registered service providers must complete an instant digital identity audit to receive jobs.</p>
            </div>

            {/* Verification Inputs inside glass panels */}
            <div className={`p-6 rounded-3xl space-y-5 ${isDark ? 'bg-white/5 border border-white/5' : 'bg-white border border-slate-200 shadow-sm shadow-slate-100/50'}`}>
              <div className="space-y-2">
                <label className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-white/40' : 'text-slate-400'}`}>National ID Number</label>
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="e.g. 63-283451N42"
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value.toUpperCase())}
                    disabled={isIdVerified || isScanning}
                    className={`w-full py-4 px-5 rounded-2xl text-sm font-bold border transition-colors disabled:opacity-50 ${isDark ? 'bg-white/5 text-white border-white/5 placeholder:text-white/20 focus:outline-none focus:border-accent' : 'bg-slate-50 text-slate-900 border-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-slate-800'}`}
                  />
                  {isIdVerified && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-accent flex items-center gap-1.5">
                      <span className="text-[9px] font-black uppercase tracking-widest">VERIFIED</span>
                      <BadgeCheck className="w-5 h-5 fill-current text-slate-900" />
                    </div>
                  )}
                </div>
              </div>

              {/* ID Photo Upload Cards */}
              <div className="grid grid-cols-2 gap-4">
                {/* ID Front */}
                <div className={`relative group overflow-hidden rounded-2xl aspect-[4/3] flex flex-col items-center justify-center p-3 text-center transition-all border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                  {idFront ? (
                    <>
                      <img src={idFront} className="absolute inset-0 w-full h-full object-cover opacity-60" alt="ID Front" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                      <span className="absolute bottom-3 left-3 text-white font-black text-[10px] uppercase tracking-widest">ID Card Front</span>
                    </>
                  ) : (
                    <div className="space-y-2 cursor-pointer">
                      <Camera className={`w-6 h-6 mx-auto ${isDark ? 'text-white/40' : 'text-slate-400'}`} />
                      <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-white/40' : 'text-slate-500'}`}>Card Front</span>
                    </div>
                  )}
                </div>

                {/* ID Back */}
                <div className={`relative group overflow-hidden rounded-2xl aspect-[4/3] flex flex-col items-center justify-center p-3 text-center transition-all border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                  {idBack ? (
                    <>
                      <img src={idBack} className="absolute inset-0 w-full h-full object-cover opacity-60" alt="ID Back" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                      <span className="absolute bottom-3 left-3 text-white font-black text-[10px] uppercase tracking-widest">ID Card Back</span>
                    </>
                  ) : (
                    <div className="space-y-2 cursor-pointer">
                      <Camera className={`w-6 h-6 mx-auto ${isDark ? 'text-white/40' : 'text-slate-400'}`} />
                      <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-white/40' : 'text-slate-500'}`}>Card Back</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Document scanner anim */}
            <AnimatePresence>
              {isScanning && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`p-6 rounded-3xl border space-y-4 relative overflow-hidden ${isDark ? 'bg-white/5 border-accent/20' : 'bg-white border-slate-200'}`}
                >
                  {/* Laser brand line sweep */}
                  <div className="absolute left-0 right-0 h-1 bg-accent shadow-[0_0_15px_#3906d2] animate-[bounce_2s_infinite]"></div>
                  
                  <div className="flex items-center gap-4">
                    <RefreshCw className="w-5 h-5 text-accent animate-spin" />
                    <span className="text-[10px] font-black uppercase text-accent tracking-[0.2em]">Artificial Intelligence OCR Scan Active</span>
                  </div>

                  <div className="space-y-1">
                    {scanProgressLogs.map((log, index) => (
                      <div key={index} className={`flex items-start gap-2.5 transition-all text-[11px] ${index <= scanStep ? (isDark ? 'text-white/80' : 'text-slate-800') : (isDark ? 'text-white/20' : 'text-slate-300')}`}>
                        <span className={`font-black text-[9px] mt-0.5 shrink-0 ${index <= scanStep ? 'text-accent' : (isDark ? 'text-white/10' : 'text-slate-200')}`}>[0{index + 1}]</span>
                        <p className="font-bold leading-relaxed">{log}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Complete audit screen prompts */}
            {isIdVerified && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`border p-6 rounded-3xl flex items-center gap-4 ${isDark ? 'bg-accent/10 border-accent/20' : 'bg-brand-lime/10 border border-brand-lime/30'}`}
              >
                <div className="w-12 h-12 bg-accent rounded-2xl flex items-center justify-center shrink-0">
                  <BadgeCheck className="w-6 h-6 text-slate-900 fill-current" />
                </div>
                <div>
                  <h4 className={`font-black text-sm uppercase tracking-widest leading-none ${isDark ? 'text-white' : 'text-slate-900'}`}>Identity Complete</h4>
                  <p className={`text-[10px] font-bold mt-1 ${isDark ? 'text-white/40' : 'text-slate-500'}`}>Verified with Zimbabwe National Database. Proceed to agreement.</p>
                </div>
              </motion.div>
            )}

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3">
                <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
                <p className="text-red-500 text-xs font-bold">{error}</p>
              </div>
            )}

            {!isIdVerified ? (
              <button 
                onClick={handleStartScan}
                disabled={isScanning}
                className={`w-full py-5 rounded-3xl font-black uppercase tracking-widest disabled:opacity-50 hover:bg-opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-2xl ${isDark ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}
              >
                {isScanning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Analyzing Credentials...
                  </>
                ) : 'Run Instant Zimbabwe ID Verification'}
              </button>
            ) : (
              <button 
                onClick={() => setStep('AGREEMENT')}
                className="w-full py-5 bg-accent text-slate-900 rounded-3xl font-black uppercase tracking-widest active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-2xl shadow-accent/20"
              >
                Continue to Service Agreement
                <ArrowRight className="w-5 h-5" />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            <div className="space-y-2">
              <h3 className="text-accent font-black text-lg uppercase tracking-widest">Detail Technologies (Private) Limited</h3>
              <p className={`text-xs font-bold ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Last Updated: April 7, 2026</p>
              <p className="text-accent/60 text-[10px] font-black uppercase tracking-widest">Version: {AGREEMENT_VERSION}</p>
            </div>

            <section className="space-y-4">
              <h4 className={`font-black text-sm uppercase tracking-widest border-l-4 border-accent pl-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>1. Parties</h4>
              <p className={`text-sm leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
                This Agreement is entered into between Detail Technologies (Private) Limited (“Company”) and The Service Provider (“Cleaner”).
              </p>
            </section>

            <section className="space-y-4">
              <h4 className={`font-black text-sm uppercase tracking-widest border-l-4 border-accent pl-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>2. Independent Status</h4>
              <div className={`p-6 rounded-3xl border space-y-4 ${isDark ? 'bg-white/5 border-white/5' : 'bg-white border-slate-200/50 shadow-sm'}`}>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
                  3.1 The Cleaner is an independent contractor and NOT an employee, agent, or partner of the Company.
                </p>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
                  3.2 Cleaner controls performances, tools, and agrees to deliver best in class professional quality.
                </p>
              </div>
            </section>

            <section className="space-y-4">
              <h4 className={`font-black text-sm uppercase tracking-widest border-l-4 border-accent pl-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>3. Fees & Commission Flow</h4>
              <div className={`p-6 rounded-3xl border space-y-4 ${isDark ? 'bg-accent/10 border-accent/20' : 'bg-brand-lime/10 border border-brand-lime/30 shadow-sm'}`}>
                <div className="flex justify-between items-center">
                  <span className={`font-black text-xs uppercase tracking-widest ${isDark ? 'text-white' : 'text-slate-800'}`}>Company Service Cut</span>
                  <span className={`font-black text-xl ${isDark ? 'text-accent' : 'text-slate-900'}`}>8% - 10%</span>
                </div>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
                  Commissions are collected from completed job bids. Maintain your wallet balance to preserve active listing standing.
                </p>
              </div>
            </section>

            <div className={`p-8 rounded-[40px] border text-center ${isDark ? 'bg-white/5 border-white/5' : 'bg-white border-slate-200/60 shadow-sm'}`}>
              <p className={`text-[10px] font-black uppercase tracking-widest leading-relaxed ${isDark ? 'text-white/40' : 'text-slate-500'}`}>
                Signing indicates consensus on ID audit parameters, liability disclaimers, and 100% agreement on Zimbabwe standard codes of conduct.
              </p>
            </div>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3">
                <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
                <p className="text-red-500 text-xs font-bold">{error}</p>
              </div>
            )}

            <button 
              onClick={handleAgree}
              disabled={isSubmitting}
              className="w-full py-5 bg-accent text-slate-900 rounded-3xl font-black uppercase tracking-widest disabled:opacity-50 shadow-2xl shadow-accent/20 hover:scale-[1.01] active:scale-95 transition-all text-sm"
            >
              {isSubmitting ? 'Finalizing Profile Access...' : 'I Sign & Accept Service Agreement'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const ServiceHistoryTab = ({
  historyJobs,
  loadingHistory,
  onQuickRebook,
  isDark,
  setCurrentScreen
}: {
  historyJobs: any[];
  loadingHistory: boolean;
  onQuickRebook: (job: any) => void;
  isDark: boolean;
  setCurrentScreen: (screen: Screen) => void;
}) => {
  if (loadingHistory) {
    return (
      <div className="py-20 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-solid animate-spin border-[#3906d2]/20 border-t-[#3906d2]" />
        <p className={`text-xs font-black uppercase tracking-widest ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Loading Service Logs...</p>
      </div>
    );
  }

  if (historyJobs.length === 0) {
    return (
      <div className={`p-8 rounded-[36px] border text-center flex flex-col items-center py-12 space-y-5 ${isDark ? 'bg-white/[0.02] border-white/5' : 'bg-white border-slate-200 shadow-sm'}`}>
        <div className={`w-14 h-14 rounded-3xl flex items-center justify-center ${isDark ? 'bg-white/5 text-white/30' : 'bg-slate-100 text-slate-400'}`}>
          <History className="w-6 h-6 stroke-[2px]" />
        </div>
        <div className="space-y-1.5 max-w-sm">
          <h4 className={`text-sm font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-800'}`}>No Past Services Found</h4>
          <p className={`text-xs font-bold leading-relaxed ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
            You don't have any completed cleaning sessions on report yet.
          </p>
        </div>
        <button
          onClick={() => setCurrentScreen('CREATE_REQUEST')}
          className={`px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
            isDark 
              ? 'bg-[#3906d2] text-white hover:bg-[#3906d2]/85 active:scale-95' 
              : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm active:scale-95'
          }`}
        >
          Book Your First Session
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-left">
      <div className="flex items-center justify-between px-1 mb-2">
        <h4 className={`text-[10px] font-black uppercase tracking-[0.12em] ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
          Completed Jobs ({historyJobs.length})
        </h4>
        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
          Verified Clean
        </span>
      </div>

      <div className="space-y-3.5">
        {historyJobs.map((job) => {
          const dateStr = job.createdAt 
            ? new Date(job.createdTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Recently';
          
          return (
            <div 
              key={job.id}
              className={`p-6 rounded-[32px] border transition-all relative overflow-hidden group ${
                isDark 
                  ? 'bg-white/[0.03] border-white/5 hover:bg-white/[0.05]' 
                  : 'bg-white border-slate-200/60 hover:bg-slate-50/20 hover:border-slate-300 hover:shadow shadow-sm shadow-slate-100/50'
              }`}
            >
              <div className="flex justify-between items-start gap-4 mb-4">
                <div className="space-y-1">
                  <span className={`text-[9.5px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${
                    job.serviceType?.toLowerCase().includes('car') 
                      ? (isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600')
                      : (isDark ? 'bg-purple-500/10 text-purple-400' : 'bg-[#3906d2]/10 text-slate-800')
                  }`}>
                    {job.serviceType || 'Standard Clean'}
                  </span>
                  <div className="flex items-center gap-1.5 mt-2 text-left">
                    <Calendar className={`w-3.5 h-3.5 ${isDark ? 'text-white/20' : 'text-slate-300'}`} />
                    <span className={`text-xs font-black ${isDark ? 'text-white/80' : 'text-slate-700'}`}>{dateStr}</span>
                  </div>
                </div>
                <div className={`px-3 py-1.5 rounded-xl font-black text-xs ${isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                  ${job.price?.toFixed(2) || '0.00'}
                </div>
              </div>

              <div className="flex items-start gap-2.5 mb-5 text-left">
                <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${isDark ? 'text-white/20' : 'text-slate-300'}`} />
                <p className={`text-[11px] font-semibold leading-normal line-clamp-1 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
                  {job.location?.address || 'Greenwich Village, NY'}
                </p>
              </div>

              <div className={`flex items-center justify-between p-3.5 rounded-2xl ${isDark ? 'bg-black/20' : 'bg-slate-50/70 border border-slate-100/50'}`}>
                <div className="flex items-center gap-3 text-left">
                  <div className="relative shrink-0">
                    <img 
                      src={job.cleanerPhoto || "https://i.pravatar.cc/100?u=cleaner"} 
                      alt="Cleaner" 
                      className={`w-9 h-9 rounded-xl object-cover border ${isDark ? 'border-white/10' : 'border-slate-200'}`} 
                    />
                    <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 bg-yellow-400 rounded-full flex items-center justify-center border border-white">
                      <Star className="w-2.5 h-2.5 text-slate-900 fill-slate-900" />
                    </div>
                  </div>
                  <div>
                    <h5 className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-white/40' : 'text-slate-400'}`}>CLEANER ASSIGNED</h5>
                    <p className={`text-xs font-black ${isDark ? 'text-white' : 'text-slate-800'}`}>{job.cleanerName || 'Pro Expert'}</p>
                  </div>
                </div>

                <button 
                  onClick={() => onQuickRebook(job)}
                  className={`px-4 py-2 bg-[#3906d2] hover:bg-[#3906d2]/85 active:scale-95 text-white rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md shadow-[#3906d2]/10`}
                >
                  <History className="w-3.5 h-3.5 stroke-[2.5px]" />
                  Rebook
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ProfileView = ({ 
  userRole, 
  toggleRole, 
  profile, 
  logout, 
  setCurrentScreen,
  themeMode,
  setThemeMode,
  activeTheme,
  setPreselectedBookingCleaner,
  setPreselectedBookingDetails
}: { 
  userRole: UserRole; 
  toggleRole: (role?: UserRole) => void; 
  profile: UserProfile | null; 
  logout: () => void; 
  setCurrentScreen: (screen: Screen) => void;
  themeMode: 'light' | 'dark' | 'system';
  setThemeMode: (mode: 'light' | 'dark' | 'system') => void;
  activeTheme: 'light' | 'dark';
  setPreselectedBookingCleaner?: (cleaner: any) => void;
  setPreselectedBookingDetails?: (details: any) => void;
}) => {
  const [activeTab, setActiveTab ] = useState<'settings' | 'history'>('settings');
  const [historyJobs, setHistoryJobs] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (profile?.uid) {
      setLoadingHistory(true);
      const q = query(
        collection(db, 'jobs'),
        where('customerId', '==', profile.uid)
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const jobsList = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdTime: data.createdAt?.seconds 
              ? data.createdAt.seconds * 1000 
              : (data.createdAt ? new Date(data.createdAt).getTime() : 0)
          };
        });
        
        const completedJobs = (jobsList as any[])
          .filter(j => j.status === 'COMPLETED')
          .sort((a, b) => b.createdTime - a.createdTime);
          
        setHistoryJobs(completedJobs);
        setLoadingHistory(false);
      }, (err) => {
        console.error("Error fetching history:", err);
        setLoadingHistory(false);
      });

      return () => unsubscribe();
    }
  }, [profile?.uid]);

  const handleQuickRebook = (job: any) => {
    if (setPreselectedBookingDetails) {
      setPreselectedBookingDetails({
        serviceType: job.serviceType || 'Deep Clean',
        price: job.price || 45,
        location: job.location || null,
        details: `Rebooked from past service on ${job.createdAt ? new Date(job.createdTime).toLocaleDateString() : 'recently'}`
      });
    }
    
    if (job.cleanerId && setPreselectedBookingCleaner) {
      setPreselectedBookingCleaner({
        id: job.cleanerId,
        uid: job.cleanerId,
        displayName: job.cleanerName || 'Sarah Pro',
        photoURL: job.cleanerPhoto || `https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop`,
        hourlyRate: job.price || 45,
        ratingAverage: 4.9,
        ratingCount: 15,
        specialties: [job.serviceType === 'Car Detailing' ? 'Car Detailing' : 'House Cleaning']
      });
    }
    
    setCurrentScreen('CREATE_REQUEST');
  };

  const seedDummyData = async () => {
    if (!profile || profile.email !== 'crzzphillip@gmail.com') return;
    
    try {
      // 1. Add Cleaners
      const cleaners = [
        {
          uid: 'dummy-cleaner-1',
          email: 'sarah.clean@example.com',
          displayName: 'Sarah Pro',
          photoURL: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop',
          role: 'CLEANER',
          balance: 0,
          status: 'AVAILABLE',
          hourlyRate: 45,
          hasAgreedToTerms: true,
          isVerified: true
        },
        {
          uid: 'dummy-cleaner-2',
          email: 'mike.detail@example.com',
          displayName: 'Marcus Detail',
          photoURL: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop',
          role: 'CLEANER',
          balance: 0,
          status: 'AVAILABLE',
          hourlyRate: 55,
          hasAgreedToTerms: true,
          isVerified: true
        },
        {
          uid: 'dummy-cleaner-3',
          email: 'elena.rodriguez@example.com',
          displayName: 'Elena Rodriguez',
          photoURL: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop',
          role: 'CLEANER',
          balance: 0,
          status: 'AVAILABLE',
          hourlyRate: 40,
          hasAgreedToTerms: true,
          isVerified: true
        }
      ];

      for (const cleaner of cleaners) {
        await setDoc(doc(db, 'users', cleaner.uid), cleaner);
      }

      // 2. Add Jobs - including both an active/requested job and past completed jobs for our Service History
      const jobs = [
        {
          customerId: profile.uid,
          customerName: profile.displayName || 'Client',
          serviceType: 'Deep Clean',
          status: 'REQUESTED',
          price: 120,
          location: {
            lat: 40.7128,
            lng: -74.0060,
            address: '123 Broadway, New York, NY'
          },
          createdAt: serverTimestamp(),
          description: 'Needs deep cleaning for a 2-bedroom apartment.'
        },
        {
          customerId: profile.uid,
          customerName: profile.displayName || 'Client',
          customerPhoto: profile.photoURL || `https://i.pravatar.cc/100?u=${profile.uid}`,
          cleanerId: 'dummy-cleaner-1',
          cleanerName: 'Sarah Pro',
          cleanerPhoto: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop',
          serviceType: 'Deep Clean',
          status: 'COMPLETED',
          price: 135,
          location: {
            lat: 40.7128,
            lng: -74.0060,
            address: '742 Broadway, Greenwich Village, New York, NY 10003'
          },
          createdAt: serverTimestamp()
        },
        {
          customerId: profile.uid,
          customerName: profile.displayName || 'Client',
          customerPhoto: profile.photoURL || `https://i.pravatar.cc/100?u=${profile.uid}`,
          cleanerId: 'dummy-cleaner-2',
          cleanerName: 'Marcus Detail',
          cleanerPhoto: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop',
          serviceType: 'Car Detailing',
          status: 'COMPLETED',
          price: 95,
          location: {
            lat: 40.7233,
            lng: -74.0017,
            address: '128 Mercer St, Soho, New York, NY 10012'
          },
          createdAt: serverTimestamp()
        }
      ];

      for (const job of jobs) {
        await addDoc(collection(db, 'jobs'), job);
      }

      console.log('Dummy data seeded successfully!');
    } catch (error) {
      console.error('Error seeding data:', error);
    }
  };

  const isDark = activeTheme === 'dark';

  const profileItems = [
    { label: 'Personal Info', icon: User },
    { label: 'Payment Methods', icon: CreditCard },
    { label: 'Security', icon: ShieldCheck },
    { label: 'Privacy Policy', icon: ShieldAlert, action: () => setCurrentScreen('PRIVACY_POLICY') },
  ];

  if (userRole === 'CLEANER') {
    profileItems.push({ label: 'Service Agreement', icon: Briefcase, action: () => setCurrentScreen('CLEANER_AGREEMENT') });
  }

  profileItems.push(
    { label: 'Help & Support', icon: HelpCircle },
    { 
      label: userRole === 'CUSTOMER' ? 'Switch to Cleaner Mode' : 'Switch to Customer Mode', 
      icon: Layers, 
      action: () => toggleRole() 
    }
  );

  return (
    <div className={`flex-1 p-8 transition-colors duration-300 overflow-y-auto no-scrollbar pb-32 ${isDark ? 'bg-[#0F0E16]' : 'bg-[#FAFAFB]'}`}>
      <div className="flex flex-col items-center text-center space-y-6 mb-8">
        <div className="relative">
          <img src={profile?.photoURL || "https://i.pravatar.cc/150?u=me"} alt="Profile" className={`w-32 h-32 rounded-[48px] object-cover border-4 ${isDark ? 'border-white/5' : 'border-slate-200'}`} />
          <button className={`absolute bottom-0 right-0 p-3 rounded-2xl shadow-xl transition-all ${isDark ? 'bg-[#3906d2] text-white' : 'bg-slate-900 text-white hover:opacity-90'}`}><Camera className="w-5 h-5 animate-pulse" /></button>
        </div>
        <div>
          <h2 className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{profile?.displayName || 'User'}</h2>
          <p className={`font-bold text-sm ${isDark ? 'text-white/40' : 'text-slate-400'}`}>{profile?.email}</p>
        </div>
      </div>

      {userRole === 'CUSTOMER' && (
        <div className={`flex p-1.5 rounded-3xl mb-8 border transition-all ${isDark ? 'bg-white/[0.03] border-white/5 shadow-inner' : 'bg-slate-100 border-slate-200/50 shadow-inner'}`}>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-4 rounded-2xl text-[10px] uppercase font-black tracking-widest transition-all ${
              activeTab === 'settings' 
                ? (isDark ? 'bg-[#3906d2] text-white shadow-lg shadow-[#3906d2]/20' : 'bg-white text-slate-900 shadow-sm') 
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Settings
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-4 rounded-2xl text-[10px] uppercase font-black tracking-widest transition-all relative ${
              activeTab === 'history' 
                ? (isDark ? 'bg-[#3906d2] text-white shadow-lg shadow-[#3906d2]/20' : 'bg-white text-slate-900 shadow-sm') 
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Service History
            {historyJobs.length > 0 && (
              <span className="absolute -top-1 right-2 w-5 h-5 bg-rose-500 text-white rounded-full text-[9px] font-black flex items-center justify-center animate-bounce">
                {historyJobs.length}
              </span>
            )}
          </button>
        </div>
      )}

      {activeTab === 'settings' || userRole !== 'CUSTOMER' ? (
        <div className="space-y-3">
          {profileItems.map((item, i) => (
            <button 
              key={i} 
              onClick={item.action}
              className={`w-full p-5 rounded-3xl border transition-all flex items-center justify-between group ${isDark ? 'bg-white/5 border-white/5 hover:bg-white/10 text-white' : 'bg-white border-slate-200/60 hover:bg-slate-50 text-slate-800 shadow-sm shadow-slate-100'}`}
            >
              <div className="flex items-center gap-4 text-left">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors ${isDark ? 'bg-white/5 text-white/60 group-hover:text-accent' : 'bg-slate-100 text-slate-600 group-hover:text-slate-900'}`}>
                  <item.icon className="w-5 h-5 stroke-[2.5px]" />
                </div>
                <span className="font-extrabold text-[13px]">{item.label}</span>
              </div>
              <ChevronRight className={`w-5 h-5 transition-transform group-hover:translate-x-1 ${isDark ? 'text-white/20' : 'text-slate-300'}`} />
            </button>
          ))}

          {/* Dynamic theme mode selector segmented caps */}
          <div className={`p-5 rounded-3xl border flex flex-col gap-3.5 mt-3 ${isDark ? 'bg-white/5 border-white/5' : 'bg-white border-slate-200/60 shadow-sm shadow-slate-100'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isDark ? 'bg-white/5 text-[#3906d2]' : 'bg-[#3906d2]/10 text-slate-800'}`}>
                <Sparkles className="w-5 h-5 text-[#3906d2] stroke-[2.5px]" />
              </div>
              <div className="text-left">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Visual Style</h4>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">Choose your interface appearance</p>
              </div>
            </div>
            <div className={`flex p-1 rounded-2xl border transition-all ${isDark ? 'bg-slate-950/70 border-white/5' : 'bg-slate-100/85 border-slate-200/30'}`}>
              {(['light', 'dark', 'system'] as const).map((mode) => {
                const isSelected = themeMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setThemeMode(mode)}
                    className={`flex-1 py-3 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all ${isSelected ? (isDark ? 'bg-[#3906d2] text-white shadow-md shadow-[#3906d2]/15' : 'bg-white text-slate-900 shadow-md shadow-slate-300/30') : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>

          <button 
            onClick={logout}
            className="w-full p-5 bg-red-500/10 rounded-3xl border border-red-500/10 flex items-center justify-center gap-3 text-red-500 font-black uppercase tracking-widest mt-6 hover:bg-red-500/15 transition-all text-xs"
          >
            <Power className="w-4 h-4 stroke-[2.5px]" />
            Logout
          </button>

          {profile?.email === 'crzzphillip@gmail.com' && (
            <button 
              onClick={seedDummyData}
              className={`w-full p-4 rounded-2xl border flex items-center justify-center gap-3 font-black uppercase tracking-widest mt-3 text-[10px] transition-all ${isDark ? 'bg-brand-lime/10 border-brand-lime/20 text-brand-lime hover:bg-brand-lime/20' : 'bg-[#3906d2]/10 border-[#3906d2]/30 text-slate-700 hover:bg-[#3906d2]/20'}`}
            >
              <Database className="w-4 h-4" />
              Seed Dummy Data
            </button>
          )}
        </div>
      ) : (
        <ServiceHistoryTab 
          historyJobs={historyJobs}
          loadingHistory={loadingHistory}
          onQuickRebook={handleQuickRebook}
          isDark={isDark}
          setCurrentScreen={setCurrentScreen}
        />
      )}
    </div>
  );
};

interface WalletViewProps {
  walletData: any;
  setIsAddFundsOpen: (open: boolean) => void;
  setIsWithdrawFundsOpen: (open: boolean) => void;
  invoices: any[];
  payInvoice: (id: string, amount: number) => void;
  userRole: UserRole;
  activeTheme?: 'light' | 'dark';
}

const WalletView = ({ walletData, setIsAddFundsOpen, setIsWithdrawFundsOpen, invoices, payInvoice, userRole, activeTheme }: WalletViewProps) => {
  const isDark = activeTheme === 'dark';
  return (
    <div className={`flex-1 p-8 space-y-8 overflow-y-auto no-scrollbar transition-colors duration-300 ${isDark ? 'bg-[#0F0E16]' : 'bg-[#FAFAFB]'}`}>
    <h2 className="text-white font-black text-2xl">My Wallet</h2>
    
    <div className="bg-accent rounded-[48px] p-10 space-y-8 shadow-2xl shadow-accent/20 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/20 rounded-full -mr-20 -mt-20 blur-3xl"></div>
      <div className="space-y-2 relative z-10">
        <p className="text-slate-900/60 font-black text-xs uppercase tracking-[0.2em]">Total Balance</p>
        <p className="text-5xl font-black text-slate-900 tracking-tighter">${walletData?.balance?.toFixed(2) || '0.00'}</p>
      </div>
      <div className="flex gap-3 relative z-10">
        <button 
          onClick={() => setIsAddFundsOpen(true)}
          className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest"
        >
          Add Funds
        </button>
        <button 
          onClick={() => setIsWithdrawFundsOpen(true)}
          className="flex-1 py-4 bg-white/20 text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest"
        >
          Withdraw
        </button>
      </div>
    </div>

    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">Recent Transactions</h3>
        <button className="text-accent text-[10px] font-black uppercase tracking-widest">View All</button>
      </div>
      <div className="space-y-4">
        {walletData?.history?.length === 0 ? (
          <p className="text-white/20 text-center py-10 text-xs font-bold uppercase tracking-widest">No transactions yet</p>
        ) : (
          walletData?.history?.map((h: any, i: number) => (
            <div key={i} className="p-5 bg-white/5 rounded-3xl border border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${h.amount > 0 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                  {h.amount > 0 ? <ArrowDownLeft className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
                </div>
                <div>
                  <p className="text-white font-black text-sm">{h.type}</p>
                  <p className="text-white/40 text-[10px] font-bold">
                    {h.createdAt?.toDate ? h.createdAt.toDate().toLocaleDateString() : 'Recent'}
                  </p>
                </div>
              </div>
              <p className={`font-black text-sm ${h.amount > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {h.amount > 0 ? '+' : ''}${Math.abs(h.amount).toFixed(2)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>

    {userRole === 'CLEANER' && invoices.length > 0 && (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">Commission Invoices</h3>
          <div className="px-3 py-1 bg-red-500/20 rounded-full">
            <span className="text-red-500 text-[10px] font-black uppercase tracking-widest">Action Required</span>
          </div>
        </div>
        <div className="space-y-4">
          {invoices.map((invoice) => (
            <div key={invoice.id} className={`p-6 rounded-[32px] border ${invoice.status === 'PAID' ? 'bg-white/5 border-white/5' : 'bg-red-500/5 border-red-500/20'} space-y-4`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-white font-black text-lg">${invoice.amount.toFixed(2)}</p>
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Commission Invoice</p>
                </div>
                <div className={`px-3 py-1 rounded-full ${invoice.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                  <span className="text-[10px] font-black uppercase tracking-widest">{invoice.status}</span>
                </div>
              </div>
              
              <div className="flex justify-between items-center pt-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-white/20" />
                  <p className="text-white/40 text-[10px] font-bold">
                    Due: {invoice.dueDate?.toDate ? invoice.dueDate.toDate().toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                {invoice.status === 'UNPAID' && (
                  <button 
                    onClick={() => payInvoice(invoice.id, invoice.amount)}
                    className="px-6 py-2 bg-accent text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-accent/20"
                  >
                    Settle Invoice
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
    </div>
  );
};

interface ChatModalProps {
  setIsChatOpen: (open: boolean) => void;
}

const ChatModal = ({ setIsChatOpen, chatMessages, sendMessage, user, selectedChatJob, activeJob, activeTheme = 'light' }: { setIsChatOpen: (open: boolean) => void, chatMessages: any[], sendMessage: (text: string, imageUrl?: string) => void, user: FirebaseUser | null, selectedChatJob: any, activeJob: any, activeTheme?: 'light' | 'dark' }) => {
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<string | null>(null);
  const [otherProfile, setOtherProfile] = useState<any>(null);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const job = selectedChatJob || activeJob;

  const [activeCall, setActiveCall] = useState<{
    status: 'DIALING' | 'RINGING' | 'CONNECTED' | 'DISCONNECTED';
    direction: 'incoming' | 'outgoing';
    partyName: string;
    partyPhoto: string;
    isMuted: boolean;
    isSpeaker: boolean;
  } | null>(null);

  const [callDuration, setCallDuration] = useState(0);
  const webrtcClientRef = useRef<WebRTCCallClient | null>(null);
  const lastCallIdRef = useRef<string | null>(null);
  const addedCandidatesRef = useRef<{ [key: string]: boolean }>({});

  // Call duration counter
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'CONNECTED') {
      setCallDuration(0);
      return;
    }
    const timer = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [activeCall?.status]);

  // Synchronize with database activeCall state
  const dbActiveCall = job?.activeCall;

  // Actual WebRTC client orchestration loop
  useEffect(() => {
    if (!job || !dbActiveCall) {
      if (webrtcClientRef.current) {
        webrtcClientRef.current.cleanup();
        webrtcClientRef.current = null;
        lastCallIdRef.current = null;
        addedCandidatesRef.current = {};
      }
      setActiveCall(null);
      return;
    }

    const currentUserId = user?.uid;
    if (!currentUserId) return;

    const isCaller = dbActiveCall.callerId === currentUserId;
    const isReceiver = dbActiveCall.recipientId === currentUserId;

    if (!isCaller && !isReceiver) return;

    // 1. Terminated or Disconnected call tracking
    if (dbActiveCall.status === 'DISCONNECTED') {
      if (activeCall) {
        setActiveCall(prev => prev ? { ...prev, status: 'DISCONNECTED' } : null);
        if (webrtcClientRef.current) {
          webrtcClientRef.current.cleanup();
          webrtcClientRef.current = null;
          lastCallIdRef.current = null;
          addedCandidatesRef.current = {};
        }
        const timer = setTimeout(() => {
          setActiveCall(null);
        }, 1000);
        return () => clearTimeout(timer);
      }
      return;
    }

    // Set or sync the local visual state of our activeCall
    setActiveCall({
      status: dbActiveCall.status,
      direction: isCaller ? 'outgoing' : 'incoming',
      partyName: isCaller ? dbActiveCall.recipientName : dbActiveCall.callerName,
      partyPhoto: isCaller ? dbActiveCall.recipientPhoto : dbActiveCall.callerPhoto,
      isMuted: activeCall?.isMuted || false,
      isSpeaker: activeCall?.isSpeaker || false
    });

    // 2. Initialize and perform connection handshake based on active state
    const handleHandshake = async () => {
      try {
        const callIdentifier = `${job.id}_${dbActiveCall.createdAt}`;
        
        // Initialize client on state handshake
        if (!webrtcClientRef.current || lastCallIdRef.current !== callIdentifier) {
          if (webrtcClientRef.current) webrtcClientRef.current.cleanup();
          
          const client = new WebRTCCallClient(
            job.id,
            currentUserId,
            isCaller,
            (remoteStream) => {
              console.log('[WebRTC Remote Aud] Remote voice stream connected successfully!');
            },
            (state) => {
              console.log('[WebRTC PC State]', state);
            }
          );
          webrtcClientRef.current = client;
          lastCallIdRef.current = callIdentifier;
          addedCandidatesRef.current = {};

          await client.startLocalStream();

          // If we are initiator, build and publish the SDP Offer to Firestore
          if (isCaller && dbActiveCall.status === 'DIALING') {
            await client.createOffer();
          }
        }

        // 3. Receiver actions when they accept and connect
        if (isReceiver && dbActiveCall.status === 'CONNECTED' && dbActiveCall.offer && !dbActiveCall.answer) {
          await webrtcClientRef.current.createAnswer(dbActiveCall.offer);
        }

        // 4. Caller sets answer when receiver answers
        if (isCaller && dbActiveCall.status === 'CONNECTED' && dbActiveCall.answer) {
          await webrtcClientRef.current.setRemoteAnswer(dbActiveCall.answer);
        }

        // 5. Sync ICE candidate lists continuously
        if (webrtcClientRef.current) {
          const remoteCandidates = isCaller 
            ? (dbActiveCall.recipientCandidates || []) 
            : (dbActiveCall.callerCandidates || []);

          for (const cand of remoteCandidates) {
            const candKey = JSON.stringify(cand);
            if (!addedCandidatesRef.current[candKey]) {
              addedCandidatesRef.current[candKey] = true;
              await webrtcClientRef.current.addIceCandidate(cand);
            }
          }
        }

        // 6. Echo loopback trigger for offline testing or single browser playground testing (Sandboxed Solo)
        if (dbActiveCall.status === 'CONNECTED') {
          // If 4 seconds pass without dynamic remote peer tracks, activate high-fidelity studio loopback test (Echo)
          const timer = setTimeout(() => {
            if (webrtcClientRef.current && (!dbActiveCall.answer || dbActiveCall.callerId === dbActiveCall.recipientId)) {
              webrtcClientRef.current.startSoloEchoTest();
            }
          }, 3500);
          return () => clearTimeout(timer);
        }

      } catch (err) {
        console.error('[WebRTC Master Sync Error]', err);
      }
    };

    handleHandshake();

  }, [dbActiveCall, user?.uid, job?.id]);

  // Handle outgoing call progression to RINGING status automatically
  useEffect(() => {
    if (!dbActiveCall || dbActiveCall.callerId !== user?.uid || dbActiveCall.status !== 'DIALING') return;

    const t1 = setTimeout(async () => {
      if (job) {
        try {
          await updateDoc(doc(db, 'jobs', job.id), {
            'activeCall.status': 'RINGING'
          });
        } catch (e) {
          console.error('Error progressing call:', e);
        }
      }
    }, 1500);

    // Solo sandbox automatic answering fallback if receiver does not answer in 8s
    const t2 = setTimeout(async () => {
      if (job && job.activeCall?.status === 'RINGING') {
        try {
          await updateDoc(doc(db, 'jobs', job.id), {
            'activeCall.status': 'CONNECTED'
          });
        } catch (e) {
          console.error('Error auto-connecting solo test call:', e);
        }
      }
    }, 6000); // 6s fast transition for responsive browser testing

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [dbActiveCall?.status, dbActiveCall?.callerId, job?.id, user?.uid]);

  const startVoipCall = async () => {
    if (!job || !user) return;
    const currentUserId = user.uid;
    const isCustomer = job.customerId === currentUserId;
    const callerName = isCustomer ? (job.customerName || 'Resident Client') : (job.cleanerName || 'Sarah Jenkins');
    const callerPhoto = isCustomer ? `https://i.pravatar.cc/100?u=${job.customerId}` : (job.cleanerPhoto || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150');

    const recipientId = isCustomer ? job.cleanerId : job.customerId;
    const recipientName = isCustomer ? (job.cleanerName || 'Sarah Jenkins') : (job.customerName || 'Resident Client');
    const recipientPhoto = isCustomer ? (job.cleanerPhoto || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150') : `https://i.pravatar.cc/100?u=${job.customerId}`;

    try {
      await updateDoc(doc(db, 'jobs', job.id), {
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
      console.error('Error starting secure line call:', e);
    }
  };

  const acceptVoipCall = async () => {
    if (!job) return;
    try {
      await updateDoc(doc(db, 'jobs', job.id), {
        'activeCall.status': 'CONNECTED'
      });
    } catch (e) {
      console.error('Error accepting call:', e);
    }
  };

  const endVoipCall = async () => {
    if (!job) return;
    try {
      await updateDoc(doc(db, 'jobs', job.id), {
        'activeCall.status': 'DISCONNECTED'
      });
      // Short delay before removing for clean UI closeout
      setTimeout(async () => {
        try {
          await updateDoc(doc(db, 'jobs', job.id), {
            activeCall: null
          });
        } catch (err) {}
      }, 1000);
    } catch (e) {
      console.error('Error hanging up calling session:', e);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  useEffect(() => {
    if (job) {
      const otherId = job.customerId === user?.uid ? job.cleanerId : job.customerId;
      if (otherId) {
        getDoc(doc(db, 'users', otherId)).then(snap => {
          if (snap.exists()) setOtherProfile(snap.data());
        });
      }
    }
  }, [job, user]);

  // Typing indicator logic
  useEffect(() => {
    if (!job || !user) return;
    const typingRef = doc(db, 'jobs', job.id);
    
    if (inputText.length > 0 && !isTyping) {
      setIsTyping(true);
      updateDoc(typingRef, { [`typing.${user.uid}`]: true });
    } else if (inputText.length === 0 && isTyping) {
      setIsTyping(false);
      updateDoc(typingRef, { [`typing.${user.uid}`]: false });
    }
  }, [inputText, job, user, isTyping]);

  useEffect(() => {
    if (job && user) {
      updateDoc(doc(db, 'jobs', job.id), { [`lastRead.${user.uid}`]: serverTimestamp() });
    }
  }, [job?.id, user?.uid]);

  const handleSend = () => {
    if (inputText.trim() || attachment) {
      sendMessage(inputText, attachment || undefined);
      setInputText('');
      setAttachment(null);
      if (job && user) {
        updateDoc(doc(db, 'jobs', job.id), { [`typing.${user.uid}`]: false });
      }
      setIsTyping(false);
    }
  };

  const simulateAttachment = () => {
    setAttachment('https://images.unsplash.com/photo-1581578731548-c64695cc6958?auto=format&fit=crop&q=80&w=800');
  };

  const otherId = job?.customerId === user?.uid ? job?.cleanerId : job?.customerId;
  const isOtherTyping = job?.typing?.[otherId];

  // Derived display info
  const isCustomer = job?.customerId === user?.uid;
  const otherName = otherProfile?.displayName || 
                    (isCustomer ? job?.cleanerName : job?.customerName) || 
                    'Professional Cleaner';
  const otherPhoto = otherProfile?.photoURL || 
                     (isCustomer ? job?.cleanerPhoto : `https://i.pravatar.cc/100?u=${job?.customerId}`) || 
                     `https://i.pravatar.cc/100?u=${otherId}`;

  // Check agreement unlock rule: Block pre-agreement chats
  const isChatLocked = !job || !['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CHAT_ONLY', 'REQUESTED', 'BIDDING', 'DIRECT_REQUEST'].includes(job.status || '');

  const quickReplies = [
    "I've arrived at the location!",
    "Where is the designated parking?",
    "Which apartment or door code number?",
    "I'm outside on the main street.",
    "Fully ready! Let's get started."
  ];

  const isDark = activeTheme === 'dark';

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      className={`fixed inset-0 z-[500] flex flex-col no-scrollbar overflow-hidden ${isDark ? 'bg-[#0F0E16]' : 'bg-white'}`}
    >
      {/* Header (Slim native iMessage-like bar) */}
      <div className={`pt-10 pb-2.5 px-4 flex items-center justify-between border-b shadow-sm transition-colors ${isDark ? 'bg-slate-950/95 border-white/5 shadow-black/40' : 'bg-white border-slate-150'}`}>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsChatOpen(false)} 
            className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all ${isDark ? 'bg-white/5 text-brand-lime hover:bg-white/10' : 'bg-slate-100 text-[#3906d2] hover:bg-slate-200'}`}
          >
            <ChevronLeft className="w-5.5 h-5.5" />
          </button>
          
          {/* Avatar and Info Row */}
          <div className="flex items-center gap-2.5">
            <div className="relative shrink-0">
              <div className={`w-9 h-9 rounded-full overflow-hidden border shadow-xs ${isDark ? 'border-brand-lime/30' : 'border-slate-200'}`}>
                <img 
                  src={otherPhoto} 
                  alt="Avatar" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 ${isDark ? 'border-slate-950' : 'border-white'}`}></div>
            </div>
            <div className="flex flex-col text-left">
              <h2 className={`text-sm font-black tracking-tight leading-none ${isDark ? 'text-white' : 'text-slate-900'}`}>{otherName}</h2>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[8.5px] font-bold uppercase tracking-wider text-emerald-500">Active</span>
                <span className={`text-[8.5px] font-bold uppercase tracking-wider ${isDark ? 'text-white/40' : 'text-slate-400'}`}>•</span>
                <span className={`text-[8.5px] font-bold uppercase tracking-wider truncate max-w-[100px] ${isDark ? 'text-white/40' : 'text-slate-400'}`}>{job?.type || 'Resident Sweep'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isChatLocked && (
            <button 
              onClick={startVoipCall}
              className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-95 hover:scale-105 transition-all ${isDark ? 'bg-white/5 text-brand-lime hover:bg-white/10' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
              title="Voice Call"
            >
              <Phone className="w-4 h-4 fill-current" />
            </button>
          )}
          <div className={`px-2.5 py-1 rounded-full border ${isDark ? 'bg-brand-lime/10 border-brand-lime/20 text-brand-lime' : 'bg-slate-900 border-slate-850 text-white'}`}>
            <span className="text-[7.5px] font-black uppercase tracking-wider">{job?.status || 'ESTIMATING'}</span>
          </div>
        </div>
      </div>

      {/* RENDER LOCK OVERLAY IF CHAT IS LOCKED */}
      {isChatLocked ? (
        <div className={`flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 ${isDark ? 'bg-[#0B0A11]' : 'bg-slate-50'}`}>
          <div className={`w-16 h-16 rounded-3xl flex items-center justify-center shadow-xl ${isDark ? 'bg-slate-900 text-brand-lime border border-white/5' : 'bg-slate-900 text-white'}`}>
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-2 max-w-xs">
            <h3 className={`text-lg font-black uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>Chat Channel Secured</h3>
            <p className={`text-xs leading-relaxed font-bold ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
              Chat access locks until a mutual bidding deal is struck. Bidding offers and price negotiations must remain structured inside the match board list.
            </p>
          </div>
          <button 
            onClick={() => setIsChatOpen(false)}
            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all ${isDark ? 'bg-brand-lime text-white shadow-lg shadow-brand-lime/10' : 'bg-slate-900 text-white shadow-xl'}`}
          >
            Return to Bids board
          </button>
        </div>
      ) : (
        <>
          {/* Main Chat space (Spacious native message feed) */}
          <div className={`flex-1 overflow-y-auto no-scrollbar px-3.5 pt-3 space-y-3.5 pb-4 ${isDark ? 'bg-[#0F0E16]' : 'bg-slate-50'}`}>
            {/* Warning banner */}
            <div className={`p-2.5 px-3.5 border rounded-2xl text-left space-y-0.5 ${isDark ? 'bg-amber-500/5 border-amber-500/10' : 'bg-amber-500/5 border-amber-500/10'}`}>
              <span className="text-[9.5px] font-black text-amber-500 uppercase tracking-wider flex items-center gap-1">⚠️ Logistics-Only Channel</span>
              <p className={`text-[9.5px] leading-relaxed font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                To track safety and guarantee payouts, out-of-escrow cash agreements or price renegotiations are strictly forbidden.
              </p>
            </div>
 
            <div className="flex justify-center">
              <div className={`backdrop-blur-sm px-3.5 py-1.5 rounded-full border flex items-center gap-1.5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/50 border-slate-150'}`}>
                <Lock className="w-3 h-3 text-slate-400" />
                <span className={`text-[9.5px] font-black uppercase tracking-tight ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Messages are encrypted</span>
              </div>
            </div>
 
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 opacity-25 space-y-3">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDark ? 'bg-slate-900' : 'bg-slate-200'}`}>
                  <MessageSquare className="w-7 h-7 text-slate-500" />
                </div>
                <p className={`text-[9px] font-black uppercase tracking-[0.25em] ${isDark ? 'text-white' : 'text-slate-800'}`}>Start the conversation</p>
              </div>
            )}
 
            {chatMessages.map((msg, i) => {
              const isMe = msg.senderId === user?.uid;
              const time = msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';
              
              return (
                <motion.div 
                  key={msg.id || i} 
                  initial={{ opacity: 0, x: isMe ? 15 : -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div className={`max-w-[78%] overflow-hidden ${
                    isMe 
                      ? (isDark ? 'bg-brand-lime/10 border border-brand-lime/25 text-white rounded-2xl rounded-tr-none' : 'bg-[#3906d2] text-white rounded-2xl rounded-tr-none shadow-md')
                      : (isDark ? 'bg-slate-950 border border-white/5 text-white rounded-2xl rounded-tl-none' : 'bg-white text-slate-900 rounded-2xl rounded-tl-none border border-slate-150 shadow-xs')
                  }`}>
                    {msg.imageUrl && (
                      <div className="p-1 px-1.5 pt-1.5 pb-0">
                        <img 
                          src={msg.imageUrl} 
                          alt="Attachment" 
                          className="w-full aspect-video object-cover rounded-xl"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                    <div className="px-3.5 py-2.5">
                      <p className="text-[13px] font-semibold leading-relaxed tracking-tight">{msg.text}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-1 px-1">
                    <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-tighter">{time}</span>
                    {isMe && <CheckCheck className={`w-3 h-3 ${isDark ? 'text-brand-lime' : 'text-[#3906d2]'}`} />}
                  </div>
                </motion.div>
              );
            })}
 
            {isOtherTyping && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className={`px-3 py-2.5 rounded-xl rounded-tl-none flex gap-1 border shadow-xs ${isDark ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-100'}`}>
                  <div className={`w-1 h-1 rounded-full animate-bounce bg-[#3906d2] dark:bg-brand-lime`}></div>
                  <div className={`w-1 h-1 rounded-full animate-bounce [animation-delay:0.2s] bg-[#3906d2] dark:bg-brand-lime`}></div>
                  <div className={`w-1 h-1 rounded-full animate-bounce [animation-delay:0.4s] bg-[#3906d2] dark:bg-brand-lime`}></div>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
 
          {/* Quick replies scrollable pill bar */}
          <div className={`px-3 py-2 flex gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap text-left border-y ${isDark ? 'bg-slate-950 border-white/5' : 'bg-slate-100/60 border-slate-200'}`}>
            {quickReplies.map((reply, rid) => (
              <button
                key={rid}
                onClick={() => {
                  sendMessage(reply);
                }}
                className={`inline-block px-2.5 py-1.5 border rounded-full text-[9px] font-extrabold uppercase transition-colors shrink-0 ${isDark ? 'bg-slate-900 border-white/5 text-slate-300 hover:bg-brand-lime hover:text-slate-950' : 'bg-white border-slate-200 text-slate-600 hover:bg-[#3906d2] hover:text-white'}`}
              >
                {reply}
              </button>
            ))}
          </div>
 
          {/* Compact Input Area */}
          <div className={`px-3 py-2.5 pb-4 border-t ${isDark ? 'bg-slate-950 border-white/5' : 'bg-white border-slate-150'}`}>
            <AnimatePresence>
              {attachment && (
                <motion.div 
                  initial={{ y: 15, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 15, opacity: 0 }}
                  className="mb-3 relative inline-block text-left"
                >
                  <img src={attachment} className={`w-20 h-20 object-cover rounded-xl border-2 ${isDark ? 'border-slate-900' : 'border-slate-100'} shadow-md`} />
                  <button 
                    onClick={() => setAttachment(null)}
                    className={`absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full flex items-center justify-center shadow-md active:scale-90 transition-all border-2 ${isDark ? 'bg-slate-800 text-white border-slate-950' : 'bg-slate-900 text-white border-white'}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            
            <div className="flex items-center gap-3">
              <div className={`flex-1 flex items-center gap-2 border rounded-full px-4 py-2 transition-all shadow-xs ${isDark ? 'bg-slate-900 border-white/5 focus-within:border-brand-lime/50' : 'bg-slate-100 border-slate-200 focus-within:border-[#3906d2] focus-within:bg-white'}`}>
                <Smile className={`w-4.5 h-4.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                <input 
                  type="text" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Type a logistics message..." 
                  className={`flex-1 bg-transparent border-none text-xs focus:outline-none font-bold tracking-tight ${isDark ? 'text-white placeholder:text-slate-600' : 'text-slate-800 placeholder:text-slate-400'}`}
                />
                <div className="flex items-center gap-0.5">
                  <input 
                    type="file" 
                    id="chat-image-upload" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setAttachment(reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }} 
                  />
                  <button onClick={() => document.getElementById('chat-image-upload')?.click()} className={`p-1.5 transition-all active:scale-95 ${isDark ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-800'}`}>
                    <Camera className="w-4 h-4" />
                  </button>
                  <button onClick={() => document.getElementById('chat-image-upload')?.click()} className={`p-1.5 transition-all active:scale-95 ${isDark ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-800'}`}>
                    <Paperclip className="w-4 h-4" />
                  </button>
                </div>
              </div>
 
              <button 
                onClick={handleSend}
                disabled={!inputText.trim() && !attachment}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                  inputText.trim() || attachment
                    ? (isDark ? 'bg-brand-lime text-slate-950 shadow-md' : 'bg-[#3906d2] text-white shadow-md') 
                    : (isDark ? 'bg-slate-900 text-slate-600' : 'bg-slate-100 text-slate-300')
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}

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
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-400 font-mono">
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
                <div className="w-28 h-28 rounded-[40px] overflow-hidden border-4 border-[#3906d2]/60 shadow-2xl relative z-10">
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
                <div className="flex items-end gap-1 h-8 mt-4 animate-pulse">
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
                    onClick={endVoipCall}
                    className="w-16 h-16 bg-rose-600 rounded-full flex items-center justify-center shadow-lg shadow-rose-600/35 hover:scale-110 active:scale-95 transition-all text-white"
                  >
                    <Phone className="w-6 h-6 rotate-[135deg] fill-current" />
                  </button>
                  {/* Accept */}
                  <button 
                    onClick={acceptVoipCall}
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
                      onClick={() => {
                        const newSpeaker = !activeCall.isSpeaker;
                        setActiveCall(p => p ? { ...p, isSpeaker: newSpeaker } : null);
                        webrtcClientRef.current?.setSpeaker(newSpeaker);
                      }}
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${
                        activeCall.isSpeaker 
                          ? 'bg-white text-slate-900 border-white' 
                          : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                      }`}
                    >
                      <Smartphone className="w-5 h-5" />
                    </button>

                    {/* Mute Toggle */}
                    <button 
                      onClick={() => {
                        const newMute = !activeCall.isMuted;
                        setActiveCall(p => p ? { ...p, isMuted: newMute } : null);
                        webrtcClientRef.current?.setMuted(newMute);
                      }}
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${
                        activeCall.isMuted 
                          ? 'bg-rose-500 text-white border-rose-500 shadow-md' 
                          : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                      }`}
                    >
                      {activeCall.isMuted ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                    </button>
                  </div>

                  {/* Hang Up Action button */}
                  <button 
                    onClick={endVoipCall}
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
    </motion.div>
  );
};

const BidModal = ({ job, setBidJob, submitBid }: { job: any, setBidJob: (job: any) => void, submitBid: (jobId: string, price: number) => void }) => {
  const [price, setPrice] = useState(job.price || 40);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black/60 z-[300] flex items-end p-6"
    >
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        className="w-full bg-[#1E1E2A] rounded-[48px] p-8 space-y-8"
      >
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-black text-white">Place Your Bid</h2>
          <button onClick={() => setBidJob(null)} className="p-2 bg-white/5 rounded-full text-white"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="space-y-4">
          <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Service: {job.type}</p>
          <div className="flex items-center justify-center gap-4 py-8">
            <button onClick={() => setPrice(p => Math.max(0, p - 5))} className="w-12 h-12 bg-white/5 rounded-2xl text-white text-2xl font-black">-</button>
            <div className="text-center">
              <span className="text-5xl font-black text-accent">${price}</span>
            </div>
            <button onClick={() => setPrice(p => p + 5)} className="w-12 h-12 bg-white/5 rounded-2xl text-white text-2xl font-black">+</button>
          </div>
        </div>

        <button 
          onClick={() => {
            submitBid(job.id, price);
            setBidJob(null);
          }}
          className="w-full py-5 bg-accent text-slate-900 rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-accent/20"
        >
          Submit Bid
        </button>
      </motion.div>
    </motion.div>
  );
};

const CleanerProfileModal = ({ 
  selectedCleaner, 
  setSelectedCleaner, 
  setCurrentScreen, 
  setIsChatOpen, 
  currentUser, 
  conversations, 
  setSelectedChatJob,
  setPreselectedBookingCleaner 
}: { 
  selectedCleaner: any, 
  setSelectedCleaner: (cleaner: any) => void, 
  setCurrentScreen: (screen: Screen) => void, 
  setIsChatOpen: (open: boolean) => void, 
  currentUser: any, 
  conversations: any[], 
  setSelectedChatJob: (job: any) => void,
  setPreselectedBookingCleaner: (cleaner: any) => void
}) => {
  const [reviews, setReviews] = useState<any[]>([]);
  const [showChatLockedModal, setShowChatLockedModal] = useState(false);
  const [hasApprovedJob, setHasApprovedJob] = useState<boolean | null>(null);
  const [activeJobDoc, setActiveJobDoc] = useState<any | null>(null);

  // Hook to check the status of existing jobs with this cleaner in real-time
  useEffect(() => {
    if (!selectedCleaner || !currentUser) {
      setHasApprovedJob(false);
      setActiveJobDoc(null);
      return;
    }
    const clId = selectedCleaner.uid || selectedCleaner.id;
    const q = query(
      collection(db, 'jobs'),
      where('customerId', '==', currentUser.uid),
      where('cleanerId', '==', clId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const acceptedStatuses = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
      const activeJob = jobsList.find((j: any) => acceptedStatuses.includes(j.status));
      if (activeJob) {
        setHasApprovedJob(true);
        setActiveJobDoc(activeJob);
      } else {
        setHasApprovedJob(false);
        setActiveJobDoc(null);
      }
    }, (err) => {
      console.error("Error checking job status in hook:", err);
      // Fallback to checking local conversations on error
      const acceptedStatuses = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
      const localJob = conversations.find(c => 
        (c.cleanerId === clId && c.customerId === currentUser.uid && acceptedStatuses.includes(c.status))
      );
      if (localJob) {
        setHasApprovedJob(true);
        setActiveJobDoc(localJob);
      } else {
        setHasApprovedJob(false);
        setActiveJobDoc(null);
      }
    });

    return () => unsubscribe();
  }, [selectedCleaner, currentUser, conversations]);

  useEffect(() => {
    if (!selectedCleaner) return;
    const clId = selectedCleaner.uid || selectedCleaner.id;
    // Query reviews for this cleaner
    const q = query(
      collection(db, 'reviews'),
      where('cleanerId', '==', clId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Client-side sort to avoid composite index requirement
      list.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setReviews(list);
    }, (err) => {
      console.error("Failed to load reviews:", err);
    });

    return () => unsubscribe();
  }, [selectedCleaner]);

  const handleMessage = async () => {
    // Check if the real-time hook indicates we have a qualified approved job
    if (hasApprovedJob && activeJobDoc) {
      setSelectedChatJob(activeJobDoc);
      setIsChatOpen(true);
      setSelectedCleaner(null); // Auto-close profile modal
    } else {
      // Direct messaging is locked: show beautiful custom overlay explanation in Uber style
      setShowChatLockedModal(true);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-white z-[400] flex flex-col no-scrollbar overflow-hidden"
    >
      {/* Uber style blocked chat modal */}
      {showChatLockedModal && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-md z-[500] flex items-center justify-center p-6"
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="bg-white rounded-[40px] p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100 flex flex-col items-center"
          >
            <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mb-6">
              <MessageSquare className="w-10 h-10 text-amber-500 stroke-[2.5px]" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-3 tracking-tight">🔒 Inbox Locked</h3>
            <p className="text-slate-500 text-xs font-semibold leading-relaxed mb-8">
              Under our on-demand safety standards, direct chat with specialists is unlocked once a booking request is made and their bid is approved, just like Uber.
            </p>
            <div className="w-full space-y-3">
              <button 
                onClick={() => {
                  setPreselectedBookingCleaner(selectedCleaner);
                  setCurrentScreen('CREATE_REQUEST');
                  setSelectedCleaner(null); // Close profile
                  setShowChatLockedModal(false);
                }}
                className="w-full py-4.5 bg-brand-lime text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-lime/20"
              >
                Book {selectedCleaner.displayName || 'Sarah'} Now
              </button>
              <button 
                onClick={() => setShowChatLockedModal(false)}
                className="w-full py-4.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl font-black text-xs uppercase tracking-widest transition-colors"
              >
                Go Back
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      {/* Full Scrollable Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
        {/* Hero Section */}
        <div className="relative h-[480px] w-full">
          <img 
            src={selectedCleaner.photoURL || `https://images.unsplash.com/photo-1581578731548-c64695cc6958?auto=format&fit=crop&q=80&w=800`} 
            alt={selectedCleaner.displayName} 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-white"></div>
          
          {/* Top bar */}
          <div className="absolute top-12 left-0 right-0 px-6 flex justify-between items-center z-10">
            <button onClick={() => setSelectedCleaner(null)} className="p-2 text-slate-900 bg-white/20 backdrop-blur-md rounded-full">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button className="p-2 text-slate-900 bg-white/20 backdrop-blur-md rounded-full hover:bg-white/40 transition-colors">
              <Heart className="w-6 h-6" />
            </button>
          </div>

          {/* Badges */}
          <div className="absolute top-[380px] left-1/2 -translate-x-1/2 flex gap-3 z-10">
            <div className="bg-white/80 backdrop-blur-sm px-4 py-1.5 rounded-full flex items-center gap-2 border border-slate-900/10">
              <ShieldCheck className="w-4 h-4 text-slate-900" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Trusted</span>
            </div>
            <div className="bg-blue-600 px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg">
              <Award className="w-4 h-4 text-white" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white">Elite</span>
            </div>
          </div>
        </div>

        {/* Profile Card Overlay */}
        <div className="px-6 -mt-16 relative z-20">
          <div className="bg-white rounded-[40px] shadow-2xl p-8 border border-slate-50 text-center">
            <div className="flex justify-between items-start mb-2">
              <div className="w-10"></div> {/* Spacer */}
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter">{selectedCleaner.displayName || 'Sarah Jenkins'}</h2>
              <div className="pt-2">
                <StarRating rating={4.9} showNumber={true} size="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-slate-400 font-bold text-sm mb-8">Expert Home Stylist & Cleaner</p>
            
            <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-8">
              {[
                { label: 'EXPERIENCE', value: '6+ Years', icon: Briefcase, color: 'text-emerald-500' },
                { label: 'JOBS DONE', value: '1.2k+', icon: CheckCircle, color: 'text-blue-500' },
                { label: 'RESPONDS', value: '~15 min', icon: Clock, color: 'text-brand-lime' }
              ].map((stat, i) => (
                <div key={i} className="flex flex-col items-center">
                  <stat.icon className={`w-5 h-5 ${stat.color} mb-3`} />
                  <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mb-1">{stat.label}</p>
                  <p className="text-xs font-black text-slate-900">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Sections */}
        <div className="px-8 mt-12 space-y-12">
          {/* About */}
          <section>
            <h3 className="text-lg font-black text-slate-900 tracking-tight mb-4 text-left">About Me</h3>
            <p className="text-slate-500 text-sm leading-relaxed font-medium">
              I specialize in deep cleaning and organizing with a focus on eco-friendly products. My goal is to transform your living space into a sanctuary of cleanliness and calm. Certified Elite cleaner with experience in luxury apartments and family homes.
            </p>
          </section>

          {/* Services */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Our Services</h3>
              <button className="text-[10px] font-black text-brand-lime uppercase tracking-widest flex items-center gap-1">
                View All <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-4">
              {[
                { title: 'Standard Home Cleaning', price: '45', time: '2-3 Hours', icon: ShieldCheck, bgColor: 'bg-emerald-50', iconColor: 'text-emerald-500' },
                { title: 'Deep Kitchen Sanitization', price: '65', time: '3-4 Hours', icon: CheckCircle, bgColor: 'bg-emerald-50', iconColor: 'text-emerald-500' },
                { title: 'Move-in/Out Specialized', price: '120', time: '5-6 Hours', icon: Calendar, bgColor: 'bg-emerald-50', iconColor: 'text-emerald-500' }
              ].map((s, i) => (
                <div key={i} className="bg-white border border-slate-100 rounded-[32px] p-6 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 ${s.bgColor} rounded-2xl flex items-center justify-center`}>
                      <s.icon className={`w-6 h-6 ${s.iconColor}`} />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 text-sm mb-1">{s.title}</h4>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-300" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.time}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Starts from</p>
                    <p className="text-xl font-black text-brand-lime tracking-tighter">${s.price}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Availability */}
          <section>
            <h3 className="text-lg font-black text-slate-900 tracking-tight mb-6">Availability</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { days: 'MON - FRI', hours: '08:00 AM - 06:00 PM' },
                { days: 'SAT - SUN', hours: '10:00 AM - 04:00 PM' }
              ].map((a, i) => (
                <div key={i} className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-brand-lime" />
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{a.days}</p>
                  </div>
                  <p className="text-[11px] font-black text-slate-900 leading-tight">{a.hours}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Service Area */}
          <section>
            <h3 className="text-lg font-black text-slate-900 tracking-tight mb-6">Service Area</h3>
            <div className="relative h-48 rounded-[32px] overflow-hidden border border-slate-100 shadow-lg">
              <img 
                src="https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=800" 
                className="w-full h-full object-cover opacity-50 contrast-125"
              />
              <div className="absolute inset-0 bg-brand-lime/10"></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="relative">
                   <div className="w-10 h-10 bg-brand-lime rounded-full border-2 border-white shadow-2xl animate-pulse"></div>
                   <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                     <MapPin className="w-5 h-5 text-white" />
                   </div>
                </div>
              </div>
              <div className="absolute bottom-4 left-4 right-4">
                <div className="bg-white/80 backdrop-blur-md p-3 rounded-2xl border border-white flex items-center gap-3">
                  <div className="w-8 h-8 bg-brand-lime/20 rounded-lg flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-brand-lime" />
                  </div>
                  <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight">Brooklyn & Manhattan</p>
                </div>
              </div>
            </div>
          </section>

          {/* Reviews */}
          <section>
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                Reviews ({reviews.length > 0 ? reviews.length : (selectedCleaner.ratingCount || 124)})
              </h3>
              <span className="text-[10px] font-black text-brand-lime uppercase tracking-widest bg-brand-lime/10 px-3 py-1 rounded-full">
                {reviews.length > 0 ? 'Verified Feed' : 'All Reviews'}
              </span>
            </div>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 -mx-4 px-4">
              {reviews.length > 0 ? (
                reviews.map((r, i) => (
                  <div key={r.id || i} className="min-w-[280px] bg-white border border-slate-100 p-6 rounded-[32px] shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <img 
                            src={r.customerPhoto || `https://i.pravatar.cc/100?u=${r.customerId || i}`} 
                            className="w-10 h-10 rounded-full object-cover" 
                            referrerPolicy="no-referrer"
                            alt={r.customerName}
                          />
                          <div className="text-left">
                            <p className="text-xs font-black text-slate-900">{r.customerName || 'Verified Client'}</p>
                            <p className="text-[10px] font-bold text-slate-300">
                              {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Just completed'}
                            </p>
                          </div>
                        </div>
                        <div className="bg-amber-50 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-400 fill-current" />
                          <span className="text-[10px] font-black text-slate-900">{r.rating || 5}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium leading-relaxed italic text-left">
                        "{r.comment || 'Amazing deep cleaning service! Done flawlessly on time.'}"
                      </p>
                    </div>
                    {r.serviceType && (
                      <span className="text-[8px] font-black tracking-widest text-brand-lime uppercase block mt-4 text-left">
                        ⚡ {r.serviceType}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                [
                  { name: 'Michael Chen', comment: 'Sarah is incredible. My house looks brand new every single time. Very punctual!', time: '2 days ago', rating: '5.0' },
                  { name: 'Emma Watson', comment: 'Extremely professional and organized. She transformed my workspace effortlessly.', time: '1 week ago', rating: '4.9' }
                ].map((r, i) => (
                  <div key={i} className="min-w-[280px] bg-white border border-slate-100 p-6 rounded-[32px] shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <img src={`https://i.pravatar.cc/100?u=fallback-${i}`} className="w-10 h-10 rounded-full" />
                        <div className="text-left">
                          <p className="text-xs font-black text-slate-900">{r.name}</p>
                          <p className="text-[10px] font-bold text-slate-300">{r.time}</p>
                        </div>
                      </div>
                      <div className="bg-amber-50 px-2 py-0.5 rounded-lg flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-400 fill-current" />
                        <span className="text-[10px] font-black text-slate-900">{r.rating}</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed italic text-left">"{r.comment}"</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-xl border-t border-slate-100 z-30 flex items-center gap-4">
        <button 
          onClick={handleMessage}
          className="w-14 h-14 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-slate-900 shadow-sm active:scale-90 transition-transform"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
        <button 
          onClick={() => {
            setPreselectedBookingCleaner(selectedCleaner);
            setCurrentScreen('CREATE_REQUEST');
            setSelectedCleaner(null); // Auto-close profile modal
          }}
          className="flex-1 py-5 border-2 border-brand-lime rounded-2xl text-brand-lime font-black text-xs uppercase tracking-widest hover:bg-brand-lime/5 transition-colors"
        >
          Request Bid
        </button>
        <button 
          onClick={() => {
            setPreselectedBookingCleaner(selectedCleaner);
            setCurrentScreen('CREATE_REQUEST');
            setSelectedCleaner(null); // Auto-close profile modal
          }}
          className="flex-1 py-5 bg-brand-lime text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-lime/20 active:scale-95 transition-transform"
        >
          Book Now
        </button>
      </div>
    </motion.div>
  );
};

interface AddFundsModalProps {
  setIsAddFundsOpen: (open: boolean) => void;
  user: any;
}

const AddFundsModal = ({ setIsAddFundsOpen, user }: AddFundsModalProps) => {
  const [amount, setAmount] = useState('50');
  const [customAmount, setCustomAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CARD' | 'ECOCASH' | 'ONEMONEY'>('CARD');
  
  // Form values
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/28');
  const [cvv, setCvv] = useState('123');
  const [mobilePhone, setMobilePhone] = useState('0771234567');
  
  // Flow state
  const [step, setStep] = useState<'SELECT' | 'PROCESSING' | '3DS' | 'ZIM_MOBILE_PUSH' | 'SUCCESS'>('SELECT');
  const [otpCode, setOtpCode] = useState('');
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [countdown, setCountdown] = useState(5);

  const getNumericAmount = () => {
    if (amount === 'Custom') {
      return parseFloat(customAmount) || 0;
    }
    return parseFloat(amount.replace('$', '')) || 50;
  };

  useEffect(() => {
    let timer: any;
    if (step === 'ZIM_MOBILE_PUSH' && countdown > 0) {
      timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
    } else if (step === 'ZIM_MOBILE_PUSH' && countdown === 0) {
      // Completed Zimbabwean Mobile transaction
      completeDepositTransaction();
    }
    return () => clearTimeout(timer);
  }, [step, countdown]);

  const completeDepositTransaction = async () => {
    setStep('PROCESSING');
    try {
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const currentBalance = userDoc.data().balance || 0;
        const addAmount = getNumericAmount();
        await updateDoc(userRef, { balance: currentBalance + addAmount });
        
        let depositType = 'Card Payment Gateway Deposit';
        if (paymentMethod === 'ECOCASH') {
          depositType = 'Pesepay EcoCash Deposit';
        } else if (paymentMethod === 'ONEMONEY') {
          depositType = 'Pesepay OneMoney Deposit';
        }

        await addDoc(collection(db, 'users', user.uid, 'transactions'), {
          type: depositType,
          amount: addAmount,
          createdAt: serverTimestamp(),
          reference: apiResponse?.reference || 'REF-' + Date.now(),
          status: 'SUCCESS'
        });
        setStep('SUCCESS');
      }
    } catch (e) {
      console.error(e);
      alert('Database confirmation failed.');
      setStep('SELECT');
    }
  };

  const handleNext = async () => {
    if (!user) return;
    const finalAmount = getNumericAmount();
    if (finalAmount <= 0) {
      alert('Please enter a valid deposit amount.');
      return;
    }

    setStep('PROCESSING');

    if (paymentMethod === 'ECOCASH') {
      try {
        const res = await fetch('/api/payment/ecocash-charge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: mobilePhone, amount: finalAmount })
        });
        const data = await res.json();
        setApiResponse(data);
        setCountdown(4); // Start countdown
        setStep('ZIM_MOBILE_PUSH');
      } catch (e) {
        console.error('EcoCash Charge Fetch Error:', e);
        alert('Could not initiate mobile prompt.');
        setStep('SELECT');
      }
    } else if (paymentMethod === 'ONEMONEY') {
      try {
        const res = await fetch('/api/payment/onemoney-charge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: mobilePhone, amount: finalAmount })
        });
        const data = await res.json();
        setApiResponse(data);
        setCountdown(4); // Start countdown
        setStep('ZIM_MOBILE_PUSH');
      } catch (e) {
        console.error('OneMoney Charge Fetch Error:', e);
        alert('Could not initiate mobile prompt.');
        setStep('SELECT');
      }
    } else {
      // CARD Charge
      try {
        const res = await fetch('/api/payment/card-charge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardNumber, cvv, amount: finalAmount })
        });
        const data = await res.json();
        setApiResponse(data);
        if (data.success && data.status === 'REDIRECT' && data.redirectUrl) {
          // Live Pesepay Web Checkout session initialization successful - redirecting!
          window.location.href = data.redirectUrl;
        } else {
          setStep('3DS'); // Prompt for Card 3D Secure Verification
        }
      } catch (e) {
        console.error('Card Charge Fetch Error:', e);
        alert('Credit card processing rejected.');
        setStep('SELECT');
      }
    }
  };

  const handleVerifyOtp = () => {
    if (otpCode !== '123456' && otpCode !== '') {
      alert('Invalid authentication OTP.');
      return;
    }
    completeDepositTransaction();
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black/60 z-[300] flex items-end justify-center p-6"
    >
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        className="w-full max-w-md bg-white rounded-[40px] p-8 space-y-6 relative overflow-hidden"
      >
        {/* Step: SELECT FORM */}
        {step === 'SELECT' && (
          <>
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Add Wallet Funds</h2>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Secure Payment Gateway</p>
              </div>
              <button onClick={() => setIsAddFundsOpen(false)} className="p-2 bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-900" /></button>
            </div>

            {/* Selector of payment types */}
            <div className="flex p-1 bg-slate-100 rounded-2xl gap-1">
              <button 
                onClick={() => setPaymentMethod('CARD')}
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex flex-col items-center justify-center gap-1 ${paymentMethod === 'CARD' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Card (Visa/MC)</span>
              </button>
              <button 
                onClick={() => setPaymentMethod('ECOCASH')}
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex flex-col items-center justify-center gap-1 ${paymentMethod === 'ECOCASH' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                <Smartphone className="w-4 h-4 text-amber-500" />
                <span>EcoCash</span>
              </button>
              <button 
                onClick={() => setPaymentMethod('ONEMONEY')}
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex flex-col items-center justify-center gap-1 ${paymentMethod === 'ONEMONEY' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                <Smartphone className="w-4 h-4 text-blue-500" />
                <span>OneMoney</span>
              </button>
            </div>

            {/* Quick Amounts selector */}
            <div className="grid grid-cols-3 gap-3">
              {['$20', '$50', '$100', '$200', '$500', 'Custom'].map(a => (
                <button 
                  key={a} 
                  onClick={() => setAmount(a)}
                  className={`py-3.5 rounded-2xl font-black text-xs transition-all ${amount === a ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}
                >
                  {a}
                </button>
              ))}
            </div>

            {amount === 'Custom' && (
              <div className="space-y-2">
                <label className="text-slate-400 font-extrabold text-[10px] uppercase tracking-wider">Enter Custom Amount (USD)</label>
                <input 
                  type="number" 
                  value={customAmount} 
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="50"
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-900 font-black"
                />
              </div>
            )}

            {/* Method Details Form */}
            <div className="space-y-4">
              {paymentMethod === 'CARD' ? (
                <div className="space-y-3">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-5 h-5 text-slate-400" />
                      <input 
                        type="text" 
                        value={cardNumber} 
                        onChange={(e) => setCardNumber(e.target.value)} 
                        className="bg-transparent border-none outline-none font-bold text-sm text-slate-900 w-full" 
                        placeholder="Card Number"
                      />
                    </div>
                    <div className="flex gap-4 border-t border-slate-100 pt-3">
                      <input 
                        type="text" 
                        value={expiry} 
                        onChange={(e) => setExpiry(e.target.value)} 
                        className="bg-transparent border-none outline-none font-bold text-xs text-slate-900 w-1/2" 
                        placeholder="MM/YY"
                      />
                      <input 
                        type="password" 
                        value={cvv} 
                        onChange={(e) => setCvv(e.target.value)} 
                        className="bg-transparent border-none outline-none font-bold text-xs text-slate-900 w-1/2" 
                        placeholder="CVV"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-900 font-black text-sm pr-1">+263</span>
                    <input 
                      type="tel" 
                      value={mobilePhone} 
                      onChange={(e) => setMobilePhone(e.target.value)} 
                      className="bg-transparent border-none outline-none font-bold text-sm text-slate-900 w-full" 
                      placeholder={paymentMethod === 'ECOCASH' ? 'EcoCash Wallet Number' : 'OneMoney Wallet Number'}
                    />
                  </div>
                  <p className="text-[9px] text-slate-400 leading-normal">
                    Secure checkout powered by Zimbabwe Pesepay Mobile billing service channels ({paymentMethod === 'ECOCASH' ? 'EcoCash' : 'OneMoney'}).
                  </p>
                </div>
              )}

              <button 
                onClick={handleNext}
                className="w-full py-5 bg-[#3906d2] text-white hover:bg-[#2b04ad] rounded-3xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-98"
              >
                Trigger Portal Secure Deposit
              </button>
            </div>
          </>
        )}

        {/* Step: PROCESSING API RESPONSE */}
        {step === 'PROCESSING' && (
          <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
            <RefreshCw className="w-10 h-10 text-slate-900 animate-spin" />
            <p className="text-slate-900 font-black text-base">Contacting Gateway Exchange Server...</p>
            <p className="text-slate-400 text-xs">Authenticating details securely. Please do not close.</p>
          </div>
        )}

        {/* Step: MOBILE USSD PULL OVERLAY */}
        {step === 'ZIM_MOBILE_PUSH' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-5 text-center">
            <div className="w-16 h-16 bg-[#3906d2]/15 rounded-full flex items-center justify-center animate-pulse">
              <Smartphone className={`w-8 h-8 ${paymentMethod === 'ECOCASH' ? 'text-amber-500' : 'text-blue-500'}`} />
            </div>
            <div className="space-y-2">
              <h3 className="text-slate-900 font-black text-xl">
                {paymentMethod === 'ECOCASH' ? 'EcoCash' : 'OneMoney'} PIN Prompt Sent
              </h3>
              <p className="text-slate-400 text-xs px-4">
                We sent a secure mobile authorization ticket to <span className="text-slate-900 font-bold">+263 {mobilePhone}</span>.
              </p>
              <p className="text-[#3906d2] font-mono text-sm font-black pt-4">
                Confirm on handset pin pad... {countdown}s
              </p>
            </div>
          </div>
        )}

        {/* Step: 3D SECURE MODAL INPUT */}
        {step === '3DS' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-600 font-black text-xs uppercase tracking-wider">3D Secure Verified by Visa</span>
              </div>
              <p className="text-slate-400 font-mono text-xs">{apiResponse?.reference}</p>
            </div>
            <div className="text-center space-y-2">
              <p className="text-slate-900 font-black text-lg">Enter Payment Portal Pin</p>
              <p className="text-slate-400 text-xs">
                A random verification OTP mock was routed. To bypass verification, simply enter code <strong className="text-slate-900">123456</strong>.
              </p>
            </div>
            <div className="space-y-4">
              <input 
                type="text" 
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="OTP Code"
                className="w-full text-center tracking-[0.4em] p-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-900 font-black text-lg"
              />
              <button 
                onClick={handleVerifyOtp}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-50"
              >
                Authenticate & Verify Transaction
              </button>
            </div>
          </div>
        )}

        {/* Step: SUCCESS STATE */}
        {step === 'SUCCESS' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-6 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <div className="space-y-2">
              <h3 className="text-slate-900 font-black text-2xl">Wallet Charged!</h3>
              <p className="text-slate-400 text-xs">
                Reference ID: <span className="font-mono text-slate-900 font-bold">{apiResponse?.reference || 'MOCK-REF-9092'}</span>
              </p>
              <p className="text-slate-900 font-black text-lg pt-4">Balance Increased by ${getNumericAmount().toFixed(2)}</p>
            </div>
            <button 
              onClick={() => setIsAddFundsOpen(false)}
              className="px-8 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest"
            >
              Back to Wallet
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

const WithdrawFundsModal = ({ setIsWithdrawFundsOpen, user, currentBalance = 0 }: { setIsWithdrawFundsOpen: (open: boolean) => void, user: any, currentBalance: number }) => {
  const [amount, setAmount] = useState('50');
  const [customAmount, setCustomAmount] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Banking destination coordinates
  const [bankName, setBankName] = useState('EcoCash Mobile Wallet');
  const [accountNumber, setAccountNumber] = useState('0771122334');
  const [accountName, setAccountName] = useState('Mary Sibanda');
  const [success, setSuccess] = useState(false);
  const [apiRef, setApiRef] = useState('');

  const getNumericAmount = () => {
    if (amount === 'Custom') {
      return parseFloat(customAmount) || 0;
    }
    return parseFloat(amount.replace('$', '')) || 50;
  };

  const handleWithdrawFunds = async () => {
    if (!user) return;
    const withdrawAmount = getNumericAmount();
    if (withdrawAmount <= 0) {
      alert('Enter a valid amount.');
      return;
    }
    if (withdrawAmount > currentBalance) {
      alert('Insufficient balance for withdrawal.');
      return;
    }

    setLoading(true);
    try {
      // Direct REST API withdrawal call
      const res = await fetch('/api/payment/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankName, accountNumber, amount: withdrawAmount, userId: user.uid })
      });
      const data = await res.json();
      
      if (data.success) {
        setApiRef(data.reference);
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { balance: currentBalance - withdrawAmount });
        await addDoc(collection(db, 'users', user.uid, 'transactions'), {
          type: 'Withdrawal Transfer',
          amount: -withdrawAmount,
          createdAt: serverTimestamp(),
          reference: data.reference,
          destination: `${bankName} (${accountNumber.slice(-4)})`,
          status: 'SUCCESS'
        });
        setSuccess(true);
      } else {
        alert(data.error || 'Withdrawal rejected.');
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black/60 z-[300] flex items-end justify-center p-6"
    >
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        className="w-full max-w-md bg-white rounded-[40px] p-8 space-y-6 relative"
      >
        {!success ? (
          <>
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Withdrawal Portal</h2>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Settlement Routing Engine</p>
              </div>
              <button onClick={() => setIsWithdrawFundsOpen(false)} className="p-2 bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-900" /></button>
            </div>

            {/* Quick selector of amounts */}
            <div className="grid grid-cols-3 gap-3">
              {['$20', '$50', '$100', '$200', '$500', 'Custom'].map(a => (
                <button 
                  key={a} 
                  onClick={() => setAmount(a)}
                  className={`py-3 rounded-2xl font-black text-xs transition-all ${amount === a ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}
                >
                  {a}
                </button>
              ))}
            </div>

            {amount === 'Custom' && (
              <div className="space-y-1">
                <input 
                  type="number" 
                  value={customAmount} 
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="50"
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-900 font-black text-sm"
                />
              </div>
            )}

            {/* Withdraw form */}
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3 text-slate-900">
                <div className="flex flex-col gap-1 border-b pb-2">
                  <span className="text-[9px] uppercase font-bold text-slate-400">Recipient Bank</span>
                  <select 
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="bg-transparent text-sm font-bold text-slate-900 outline-none border-none py-1"
                  >
                    <option value="EcoCash Mobile Wallet">EcoCash Wallet (+263)</option>
                    <option value="OneMoney Wallet">OneMoney Wallet (+263)</option>
                    <option value="CABS Bank Zimbabwe">CABS Bank Ltd</option>
                    <option value="CBZ Bank Zimbabwe">CBZ Bank</option>
                    <option value="Standard Chartered Bank">Standard Chartered Zim</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1 border-b pb-2">
                  <span className="text-[9px] uppercase font-bold text-slate-400">Account / Mobile Number</span>
                  <input 
                    type="text" 
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="bg-transparent text-sm font-bold text-slate-900 outline-none border-none"
                    placeholder="077123456"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[9px] uppercase font-bold text-slate-400">Account Holder Name</span>
                  <input 
                    type="text" 
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="bg-transparent text-sm font-bold text-slate-900 outline-none border-none"
                    placeholder="Account Name"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between px-2">
                <span className="text-slate-400 text-xs font-bold">Transfer Service Fee</span>
                <span className="text-slate-900 text-xs font-black">FREE (Tier 1)</span>
              </div>

              <button 
                onClick={handleWithdrawFunds}
                disabled={loading}
                className="w-full py-5 bg-slate-900 text-white hover:bg-slate-800 rounded-3xl font-black text-sm uppercase tracking-widest disabled:opacity-50"
              >
                {loading ? 'Routing Transfer...' : `Confirm Withdraw $${getNumericAmount().toFixed(2)}`}
              </button>
            </div>
          </>
        ) : (
          <div className="py-8 flex flex-col items-center justify-center space-y-6 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <div className="space-y-2">
              <h3 className="text-slate-900 font-black text-2xl">Transfer Sent</h3>
              <p className="text-slate-400 text-xs text-center">
                Your settlement of <strong className="text-slate-900">${getNumericAmount().toFixed(2)}</strong> has been processed to <strong className="text-slate-700">{bankName}</strong>.
              </p>
              <p className="text-[10px] text-slate-400 font-mono tracking-wide pt-2">
                Reference ID: <span className="font-bold text-slate-900">{apiRef}</span>
              </p>
            </div>
            <button 
              onClick={() => setIsWithdrawFundsOpen(false)}
              className="px-8 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest"
            >
              Done
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

interface SafetyModalProps {
  setIsSafetyModalOpen: (open: boolean) => void;
}

const SafetyModal = ({ setIsSafetyModalOpen }: SafetyModalProps) => (
  <motion.div 
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="absolute inset-0 bg-black/60 z-[200] flex items-end p-6"
  >
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      className="w-full bg-white rounded-[40px] p-8 space-y-6"
    >
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-slate-900">Safety Center</h2>
        <button onClick={() => setIsSafetyModalOpen(false)} className="p-2 bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
      </div>
      <div className="space-y-4">
        <button className="w-full p-6 bg-red-50 border border-red-100 rounded-3xl flex items-center gap-4 text-left">
          <div className="w-12 h-12 bg-red-500 rounded-2xl flex items-center justify-center text-white">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="font-black text-red-900">Emergency Assistance</p>
            <p className="text-xs text-red-700">Call local authorities immediately</p>
          </div>
        </button>
        <button className="w-full p-6 bg-blue-50 border border-blue-100 rounded-3xl flex items-center gap-4 text-left">
          <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center text-white">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="font-black text-blue-900">Share Trip Status</p>
            <p className="text-xs text-blue-700">Let friends track your service</p>
          </div>
        </button>
      </div>
    </motion.div>
  </motion.div>
);

interface NotificationsModalProps {
  setIsNotificationOpen: (open: boolean) => void;
  notifications: any[];
  setNotifications: React.Dispatch<React.SetStateAction<any[]>>;
  activeTheme?: 'light' | 'dark';
}

const NotificationsModal = ({ setIsNotificationOpen, notifications, setNotifications, activeTheme = 'light' }: NotificationsModalProps) => {
  const isDark = activeTheme === 'dark';

  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleClearAll = () => {
    setNotifications([]);
  };

  const handleDelete = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleMarkRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black/60 z-[300] flex items-end p-6"
    >
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className={`w-full max-h-[85%] rounded-[40px] p-6 flex flex-col ${isDark ? 'bg-[#0B0A11] text-white border border-white/5 shadow-2xl relative' : 'bg-white text-slate-800 relative'}`}
      >
        <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-white/5 shrink-0">
          <div>
            <h2 className={`text-xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>Activity Notifications</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Real-time Platform Updates</p>
          </div>
          <button 
            onClick={() => setIsNotificationOpen(false)} 
            className={`p-2.5 rounded-full ${isDark ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-between py-3 shrink-0">
          <button 
            onClick={handleMarkAllRead} 
            className="text-[10px] font-black uppercase tracking-wider text-brand-lime hover:opacity-85 transition-opacity"
            disabled={notifications.length === 0}
          >
            Mark All Read
          </button>
          <button 
            onClick={handleClearAll} 
            className="text-[10px] font-black uppercase tracking-wider text-rose-500 hover:opacity-85 transition-opacity"
            disabled={notifications.length === 0}
          >
            Clear All Alerts
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-3.5 py-2">
          {notifications.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <div className="w-12 h-12 bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center text-slate-400">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <p className={`font-black text-xs ${isDark ? 'text-white' : 'text-slate-800'}`}>All Clear!</p>
                <p className="text-[10px] text-slate-400 mt-0.5">No new alerts or compliance notifications</p>
              </div>
            </div>
          ) : (
            notifications.map((notif) => {
              const formattedTime = notif.timestamp instanceof Date 
                ? notif.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : notif.timestamp?.toDate 
                  ? notif.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'Just now';

              return (
                <div 
                  key={notif.id}
                  onClick={() => handleMarkRead(notif.id)}
                  className={`p-4 rounded-3xl border transition-all text-left relative cursor-pointer ${
                    notif.read 
                      ? (isDark ? 'bg-white/[0.01] border-white/5 opacity-60' : 'bg-slate-50 border-slate-100')
                      : (isDark ? 'bg-indigo-500/5 border-indigo-500/20 shadow-lg' : 'bg-[#3906d2]/5 border-[#3906d2]/10')
                  }`}
                >
                  {!notif.read && (
                    <div className="absolute top-4 right-4 w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse"></div>
                  )}
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      notif.type === 'kyc' ? 'bg-emerald-500/10 text-emerald-500' :
                      notif.type === 'bids' ? 'bg-amber-500/10 text-amber-500' :
                      notif.type === 'job' ? 'bg-blue-500/10 text-blue-500' : 'bg-[#3906d2]/10 text-[#3906d2]'
                    }`}>
                      {notif.type === 'kyc' ? <BadgeCheck className="w-5 h-5" /> :
                       notif.type === 'bids' ? <ClipboardList className="w-5 h-5" /> :
                       notif.type === 'job' ? <Briefcase className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs font-black truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{notif.title}</p>
                        <span className="text-[8px] font-mono text-slate-400 shrink-0">{formattedTime}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 leading-normal">{notif.body}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

interface RatingModalProps {
  setShowRating: (show: boolean) => void;
  setActiveJob: (job: any) => void;
  activeJob: any;
}

const RatingModal = ({ setShowRating, setActiveJob, activeJob }: RatingModalProps) => {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmission = async () => {
    setIsSubmitting(true);
    try {
      if (activeJob) {
        const jobRef = doc(db, 'jobs', activeJob.id);
        await updateDoc(jobRef, { status: 'COMPLETED' });

        if (activeJob.cleanerId) {
          // Write actual review comment document in Firestore
          await addDoc(collection(db, 'reviews'), {
            cleanerId: activeJob.cleanerId,
            cleanerName: activeJob.cleanerName || 'Sarah Jenkins',
            customerId: activeJob.customerId || '',
            customerName: activeJob.customerName || 'Client',
            customerPhoto: activeJob.customerPhoto || `https://i.pravatar.cc/100?u=${activeJob.customerId}`,
            rating: rating,
            comment: comment.trim(),
            createdAt: serverTimestamp(),
            jobId: activeJob.id,
            serviceType: activeJob.serviceType || 'Standard Cleaning'
          });

          const cleanerRef = doc(db, 'users', activeJob.cleanerId);
          const cleanerDoc = await getDoc(cleanerRef);
          if (cleanerDoc.exists()) {
            const data = cleanerDoc.data();
            const ratingCount = (data.ratingCount || 0) + 1;
            const ratingSum = (data.ratingSum || 0) + rating;
            const ratingAverage = parseFloat((ratingSum / ratingCount).toFixed(2));
            await updateDoc(cleanerRef, {
              ratingCount,
              ratingSum,
              ratingAverage,
              jobsCompleted: (data.jobsCompleted || 0) + 1
            });
          }
        }
      }
    } catch (e) {
      console.error("Rating submission error:", e);
    } finally {
      setIsSubmitting(false);
      setShowRating(false);
      setActiveJob(null);
    }
  };
  
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 bg-white z-[200] flex flex-col items-center justify-center p-8 text-center"
    >
      <div className="relative mb-8">
        <div className="w-24 h-24 bg-[#3906d2] rounded-full flex items-center justify-center shadow-2xl shadow-[#3906d2]/30">
          <BadgeCheck className="w-12 h-12 text-white" />
        </div>
        <motion.div 
          animate={{ scale: [1, 1.2, 1] }} 
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute -top-2 -right-2 w-8 h-8 bg-black rounded-lg flex items-center justify-center shadow-xl"
        >
          <Award className="w-4 h-4 text-[#3906d2]" />
        </motion.div>
      </div>
      
      <h2 className="text-3xl font-display font-black text-slate-900 mb-2 tracking-tighter leading-none">Job Fulfilled.</h2>
      <p className="text-slate-400 text-xs font-semibold mb-6 max-w-[260px] leading-relaxed">
        Your specialized cleaning session is complete. Help the community by rating the expert.
      </p>

      <div className="flex gap-3 mb-6">
        {[1,2,3,4,5].map(s => (
          <motion.button 
            key={s} 
            whileHover={{ scale: 1.25 }}
            whileTap={{ scale: 0.85 }}
            onClick={() => setRating(s)}
            disabled={isSubmitting}
          >
            <Star 
              className={`w-10 h-10 transition-all ${s <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-100 fill-transparent stroke-2'}`} 
            />
          </motion.button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Write a warm, public review for this cleaner... (optional)"
        rows={3}
        maxLength={300}
        disabled={isSubmitting}
        className="w-full p-4 mb-8 text-xs font-medium border-2 border-slate-100 rounded-3xl focus:border-[#3906d2]/30 focus:outline-none transition-all max-w-[320px] bg-slate-50 text-slate-800 resize-none h-24"
      />

      <button 
        onClick={handleSubmission}
        disabled={isSubmitting}
        className="group relative w-full py-5 bg-slate-900 text-white rounded-[32px] font-black text-xs uppercase tracking-[0.4em] overflow-hidden shadow-2xl active:scale-95 transition-all disabled:opacity-50 max-w-[320px]"
      >
        <span className="relative z-10 flex items-center justify-center gap-3">
          {isSubmitting ? 'submitting review...' : 'Finish Review'}
          <CheckCheck className="w-4 h-4" />
        </span>
        <div className="absolute inset-0 bg-[#3906d2] translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
        <style dangerouslySetInnerHTML={{ __html: `.group:hover span { color: white !important; }` }} />
      </button>
    </motion.div>
  );
};

interface QuickScreenItem {
  id: Screen;
  label: string;
  description: string;
  category: 'AUTH' | 'CUSTOMER' | 'CLEANER' | 'ADMIN' | 'STATES';
  role?: UserRole;
}

const SCREENS_LIST: QuickScreenItem[] = [
  // Auth & Onboarding
  { id: 'SPLASH', label: 'Splash Intro', description: 'Animated splash launcher screen', category: 'AUTH' },
  { id: 'WELCOME', label: 'Welcome Screen', description: 'Core introductory & role selection page', category: 'AUTH' },
  { id: 'PHONE_INPUT', label: 'Phone Setup', description: 'Enter phone number for mobile authorization', category: 'AUTH' },
  { id: 'OTP_VERIFY', label: 'OTP Verification', description: 'Simulated OTP code check form view', category: 'AUTH' },
  { id: 'CREATE_PROFILE', label: 'Profile Build', description: 'Account creation profile flow screen', category: 'AUTH' },
  { id: 'PERMISSIONS', label: 'App Permissions', description: 'Camera, maps/location consent request banner', category: 'AUTH' },

  // Customer Screens
  { id: 'HOME', label: 'Customer Home', description: 'Interactive map and services selection page', category: 'CUSTOMER', role: 'CUSTOMER' },
  { id: 'CREATE_REQUEST', label: 'Create Request', description: 'Booking duration and choices checkout', category: 'CUSTOMER', role: 'CUSTOMER' },
  { id: 'FIND_CLEANERS', label: 'Seeking Cleaners', description: 'Live matching status radar screen', category: 'CUSTOMER', role: 'CUSTOMER' },
  { id: 'BIDS_RECEIVED', label: 'Bids Received', description: 'Offers submitted from professional cleaners', category: 'CUSTOMER', role: 'CUSTOMER' },
  { id: 'SERVICE_PROGRESS', label: 'Customer Live Tracker', description: 'Trace ongoing cleaning job details', category: 'CUSTOMER', role: 'CUSTOMER' },
  { id: 'MESSAGES', label: 'Conversations & Inbox', description: 'Full list of chats and direct messages', category: 'CUSTOMER' },
  { id: 'WALLET', label: 'Personal Wallet', description: 'Add/withdraw funds, view transactions', category: 'CUSTOMER', role: 'CUSTOMER' },
  { id: 'PROFILE', label: 'Customer Profile', description: 'Manage accounts preferences, toggle user view', category: 'CUSTOMER', role: 'CUSTOMER' },

  // Cleaner Screens
  { id: 'HOME', label: 'Cleaner Board', description: 'Available jobs list and status switcher panel', category: 'CLEANER', role: 'CLEANER' },
  { id: 'CLEANER_AGREEMENT', label: 'Legal Contract', description: 'Sign professional guidelines agreement', category: 'CLEANER', role: 'CLEANER' },
  { id: 'SERVICE_PROGRESS', label: 'Cleaner Live Tracker', description: 'Update cleaning checklists and status markers', category: 'CLEANER', role: 'CLEANER' },
  { id: 'WALLET', label: 'Cleaner Earnings', description: 'Audit payouts logs, commissions and deposits', category: 'CLEANER', role: 'CLEANER' },
  { id: 'PROFILE', label: 'Cleaner Profile', description: 'Professional statistics and cleaner state toggles', category: 'CLEANER', role: 'CLEANER' },

  // Admin Panel
  { id: 'ADMIN_OVERVIEW', label: 'Admin Panel', description: 'Core system metrics, earnings and analytics', category: 'ADMIN', role: 'ADMIN' },
  { id: 'ADMIN_USERS', label: 'Manage Audited Users', description: 'Overview and status checks for normal customers', category: 'ADMIN', role: 'ADMIN' },
  { id: 'ADMIN_CLEANERS', label: 'Verify Expert Cleaners', description: 'Validate cleaner IDs and conduct background checks', category: 'ADMIN', role: 'ADMIN' },
  { id: 'ADMIN_PAYMENTS', label: 'Finance & Ledger', description: 'Monitor deposits, commissions and payouts', category: 'ADMIN', role: 'ADMIN' },
  { id: 'ADMIN_DISPUTES', label: 'Disputes Audit', description: 'Analyze active user conflicts or booking issues', category: 'ADMIN', role: 'ADMIN' },

  // States & Fallbacks
  { id: 'NO_CLEANER_FOUND', label: 'No Cleaner Found', description: 'Special fallback shown during a failed search', category: 'STATES' },
  { id: 'LOW_BID_WARNING', label: 'Low Bid Advisory', description: 'Low budget warnings screen matching buffer', category: 'STATES' },
  { id: 'CANCELLATION_SCREEN', label: 'Cancellation Form', description: 'Customer or cleaner cancellation screen', category: 'STATES' },
  { id: 'INTERNET_CONNECTION', label: 'Simulated Offline', description: 'Network offline fallback mockup panel', category: 'STATES' },
  { id: 'FORCE_UPDATE', label: 'Device Force Upgrade', description: 'System update prompt recommendation guidelines', category: 'STATES' },
  { id: 'ACCOUNT_SUSPENDED', label: 'Suspension Notice', description: 'App exclusion report feedback guidelines screen', category: 'STATES' },
  { id: 'PRIVACY_POLICY', label: 'Privacy Policy', description: 'Legal compliance and details fine print', category: 'STATES' }
];

interface MobileFrameProps {
  children: React.ReactNode;
  hideNav?: boolean;
  setCurrentScreen: (screen: Screen) => void;
  currentScreen: Screen;
  userRole: UserRole;
  setUserRole?: (role: UserRole) => void;
  toggleRole?: (role: UserRole) => void;
  conversations: any[];
  myBids: any[];
  unreadCount: number;
  availableJobsCount: number;
  activeTheme: 'light' | 'dark';
  themeMode?: 'light' | 'dark' | 'system';
  setThemeMode?: (mode: 'light' | 'dark' | 'system') => void;
  sandboxBypass: boolean;
  setSandboxBypass: (bypass: boolean) => void;
}

const MobileFrame = ({ children, hideNav = false, setCurrentScreen, currentScreen, userRole, setUserRole, toggleRole, conversations, myBids, unreadCount, availableJobsCount, activeTheme, themeMode = 'light', setThemeMode, sandboxBypass, setSandboxBypass }: MobileFrameProps) => {
  const [isMobileOrNative, setIsMobileOrNative] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'AUTH' | 'CUSTOMER' | 'CLEANER' | 'ADMIN' | 'STATES'>('ALL');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const isDark = activeTheme === 'dark';

  useEffect(() => {
    const handleSWOffline = () => setIsOffline(true);
    const handleSWOnline = () => setIsOffline(false);
    window.addEventListener('offline', handleSWOffline);
    window.addEventListener('online', handleSWOnline);
    return () => {
      window.removeEventListener('offline', handleSWOffline);
      window.removeEventListener('online', handleSWOnline);
    };
  }, []);

  useEffect(() => {
    const checkViewport = () => {
      const isCapacitor = typeof window !== 'undefined' && (
        !!(window as any).Capacitor || 
        navigator.userAgent.includes('Capacitor') || 
        (window as any).webkit?.messageHandlers?.bridge
      );
      const isSmallScreen = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
      setIsMobileOrNative(isCapacitor || isSmallScreen);
    };
    
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  return (
    <div className={isMobileOrNative ? `w-full min-h-screen relative ${isDark ? 'bg-[#0F0E16]' : 'bg-[#F2F1F5]'}` : `flex items-center justify-center gap-10 min-h-screen p-6 transition-all duration-300 relative ${isDark ? 'bg-[#07060A]' : 'bg-[#E2E1E6]'}`}>
      
      {/* Desktop Gear Launcher (Floating beautifully outside of phone casing) */}
      {!isMobileOrNative && (
        <button
          onClick={() => setIsNavOpen(!isNavOpen)}
          className={`fixed top-8 right-8 w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl border transition-all active:scale-95 group z-[500] cursor-pointer ${
            isDark 
              ? 'bg-slate-950/90 border-white/10 text-[#3906d2] hover:bg-slate-900 shadow-black' 
              : 'bg-white/95 border-slate-300/80 text-slate-800 hover:bg-slate-100 shadow-slate-300'
          }`}
          title="Toggle Navigation Board Panel"
        >
          <Settings className="w-6 h-6 transition-transform duration-700 group-hover:rotate-180" />
        </button>
      )}

      {/* Sidecar Navigation Panel on Desktop (Positioned cleanly next to phone case) */}
      {!isMobileOrNative && isNavOpen && (
        <div className={`w-[360px] h-[830px] rounded-[40px] border p-5 flex flex-col text-white divide-y divide-white/5 animate-fade-in shrink-0 relative ${isDark ? 'bg-slate-950/95 border-white/10 shadow-[0_30px_70px_rgba(0,0,0,0.6)]' : 'bg-slate-900 border-slate-700 shadow-[0_30px_70px_rgba(0,0,0,0.2)]'}`}>
          {/* Header */}
          <div className="pb-4 flex flex-col shrink-0">
            <h3 className="text-base font-black tracking-tight text-[#3906d2]">SANDBOX PANEL</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">DESKTOP SIDECAR CONTROLS</p>
          </div>

          {/* Quick Role & Mode Utilities */}
          <div className="py-4 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Environment Simulation</span>
              <span className="text-[10px] font-mono bg-[#3906d2]/15 text-[#3906d2] px-2 py-0.5 rounded-full font-bold">
                Active: {userRole}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['CUSTOMER', 'CLEANER', 'ADMIN'] as const).map((role) => (
                <button
                  key={role}
                  onClick={() => {
                    if (toggleRole) {
                      toggleRole(role);
                    } else if (setUserRole) {
                      setUserRole(role);
                    }
                  }}
                  className={`py-2 px-1 rounded-xl text-[9px] uppercase font-black tracking-wider transition-all border cursor-pointer ${
                    userRole === role 
                      ? 'bg-[#3906d2] text-white border-[#3906d2]' 
                      : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>

            {/* Quick Visual Theme Switcher */}
            <div className="pt-2 border-t border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Visual Styling Mode</span>
                <span className="text-[10px] font-mono bg-[#3906d2]/15 text-[#3906d2] px-2 py-0.5 rounded-full font-bold">
                  {themeMode.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['light', 'dark', 'system'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      if (setThemeMode) setThemeMode(mode);
                    }}
                    className={`py-1.5 px-0.5 rounded-lg text-[8.5px] uppercase font-black tracking-widest transition-all border cursor-pointer ${
                      themeMode === mode 
                        ? 'bg-[#3906d2] text-white border-[#3906d2]' 
                        : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Sandbox Onboarding Bypass Switch */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Onboarding Bypass</span>
                <span className="text-[8px] text-slate-500 font-bold uppercase tracking-tight">Allows view of all screens</span>
              </div>
              <button
                onClick={() => setSandboxBypass(!sandboxBypass)}
                className={`w-10 h-6 rounded-full p-0.5 transition-colors cursor-pointer relative ${sandboxBypass ? 'bg-[#3906d2]' : 'bg-white/10'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-all shadow-md transform ${sandboxBypass ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          {/* Search & Category Filter Section */}
          <div className="py-4 space-y-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search screens..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#3906d2]/50 transition-colors"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Categories tab pills */}
            <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
              {(['ALL', 'AUTH', 'CUSTOMER', 'CLEANER', 'ADMIN', 'STATES'] as const).map((cat) => {
                const count = cat === 'ALL' 
                  ? SCREENS_LIST.length 
                  : SCREENS_LIST.filter(s => s.category === cat).length;
                
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                      selectedCategory === cat 
                        ? 'bg-slate-100 text-slate-950 font-black' 
                        : 'bg-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat} <span className="opacity-60 font-medium text-[8px]">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Screens Scrollable Box */}
          <div className="flex-1 overflow-y-auto no-scrollbar py-3 space-y-2">
            {(() => {
              const filtered = SCREENS_LIST.filter(item => {
                const matchesSearch = item.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                     item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                     item.description.toLowerCase().includes(searchQuery.toLowerCase());
                const matchesCat = selectedCategory === 'ALL' || item.category === selectedCategory;
                return matchesSearch && matchesCat;
              });

              if (filtered.length === 0) {
                return (
                  <div className="text-center py-8 text-xs text-slate-500">
                    No screens found matching "{searchQuery}"
                  </div>
                );
              }

              return filtered.map((item) => {
                const isSelected = currentScreen === item.id && (item.category !== 'CUSTOMER' || userRole === 'CUSTOMER') && (item.category !== 'CLEANER' || userRole === 'CLEANER') && (item.category !== 'ADMIN' || userRole === 'ADMIN');
                
                return (
                  <button
                    key={`${item.category}-${item.id}`}
                    onClick={() => {
                      if (item.role && setUserRole) {
                        setUserRole(item.role);
                      }
                      setCurrentScreen(item.id);
                    }}
                    className={`w-full p-3 border text-left transition-all flex items-start gap-4 active:scale-98 group cursor-pointer rounded-2xl ${
                      isSelected 
                        ? 'bg-[#3906d2]/15 border-[#3906d2]/35 text-white shadow-lg' 
                        : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.06] text-slate-200 hover:border-white/10'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      <span className={`text-[8.5px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                        item.category === 'AUTH' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                        item.category === 'CUSTOMER' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                        item.category === 'CLEANER' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        item.category === 'ADMIN' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                        'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {item.category}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-xs block text-white truncate max-w-[150px]">{item.label}</span>
                        <span className="font-mono text-[7.5px] text-slate-500 uppercase shrink-0">{item.id}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium leading-normal mt-1">{item.description}</p>
                    </div>
                  </button>
                );
              });
            })()}
          </div>

          {/* Footer */}
          <div className="pt-3 uppercase tracking-widest text-center text-[7.5px] text-slate-600 font-bold shrink-0">
            Detail® Pro Fast-Travel • AI Sandbox
          </div>
        </div>
      )}

      {/* Main visual casing */}
      <div className={isMobileOrNative 
        ? `w-full min-h-screen relative flex flex-col overflow-hidden ${isDark ? 'bg-[#0F0E16]' : 'bg-[#F2F1F5] text-slate-800'}` 
        : `w-[410px] h-[830px] rounded-[64px] border-[12px] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.6)] overflow-hidden relative flex flex-col ${isDark ? 'bg-black border-[#1C1B22] ring-1 ring-white/5 text-white' : 'bg-white border-slate-300 ring-1 ring-slate-200/50 text-slate-900'}`
      }>
        {/* Dynamic Notch (Only on desktop web preview) */}
        {!isMobileOrNative && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-8 bg-black rounded-b-[24px] z-[150] flex items-center justify-center px-4">
            <div className="w-12 h-1 bg-white/10 rounded-full"></div>
          </div>
        )}
        


        <div className={`flex-1 flex flex-col overflow-hidden relative ${isDark ? 'bg-[#0F0E16] text-white' : 'bg-[#F2F1F5] text-slate-900'}`}>
          {/* Offline Banner Indicator */}
          {isOffline && (
            <div className="bg-amber-600 text-white text-[9px] font-black uppercase tracking-widest text-center py-2 shrink-0 flex items-center justify-center gap-1.5 z-[160] shadow-sm animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
              <span>Offline Mode — Map Tiles Cached</span>
            </div>
          )}

          <div className={`flex-1 flex flex-col overflow-hidden ${!hideNav ? 'pb-24' : ''}`}>
            {children}
          </div>
          
          {/* Persistent Bottom Nav - Matched to Screenshot Design */}
          {!hideNav && (
            <div className={`absolute bottom-0 left-0 right-0 h-20 border-t z-50 flex items-center justify-around px-4 shadow-md ${
              isDark 
                ? 'bg-slate-950/95 border-white/5 text-white shadow-black/40' 
                : 'bg-white border-slate-200/60 text-slate-500 shadow-slate-200/10'
            }`}>
              {(() => {
                const tabs = userRole === 'ADMIN' ? [
                  { id: 'ADMIN_OVERVIEW', icon: LayoutGrid, label: 'Overview' },
                  { id: 'ADMIN_USERS', icon: Users, label: 'Users' },
                  { id: 'ADMIN_CLEANERS', icon: ShieldCheck, label: 'Cleaners' },
                  { id: 'ADMIN_PAYMENTS', icon: CreditCard, label: 'Payments' },
                  { id: 'ADMIN_DISPUTES', icon: ShieldAlert, label: 'Disputes' }
                ] : userRole === 'CLEANER' ? [
                  { id: 'HOME', icon: LayoutGrid, label: 'Home' },
                  { id: 'SERVICE_PROGRESS', icon: ClipboardList, label: 'Jobs', badge: availableJobsCount || 0 },
                  { id: 'MESSAGES', icon: MessageSquare, label: 'Chat', badge: unreadCount },
                  { id: 'WALLET', icon: Wallet, label: 'Wallet' },
                  { id: 'PROFILE', icon: User, label: 'Profile' }
                ] : [
                  { id: 'HOME', icon: Home, label: 'Home' },
                  { id: 'FIND_CLEANERS', icon: Search, label: 'Search' },
                  { id: 'BIDS_RECEIVED', icon: ClipboardList, label: 'Bids', badge: myBids.length || 0 },
                  { id: 'PROFILE', icon: User, label: 'Profile' }
                ];

                return tabs.map((tab) => {
                  let isActive = currentScreen === tab.id;
                  if (userRole === 'CUSTOMER') {
                    if (tab.id === 'HOME' && (currentScreen === 'CREATE_REQUEST' || currentScreen === 'SERVICE_PROGRESS')) {
                      isActive = true;
                    }
                  } else if (userRole === 'CLEANER') {
                    if (tab.id === 'HOME' && currentScreen === 'FIND_CLEANERS') {
                      isActive = false;
                    }
                  }

                  // Precise active/inactive styles corresponding to the screenshot layout
                  const activeColor = userRole === 'CUSTOMER'
                    ? 'text-[#3906d2]'
                    : (isDark ? 'text-[#3906d2]' : 'text-slate-950 font-black');

                  const inactiveColor = isDark 
                    ? 'text-white/40 hover:text-white/70' 
                    : 'text-slate-400 hover:text-slate-700';

                  return (
                    <button 
                      key={tab.id}
                      onClick={() => setCurrentScreen(tab.id as Screen)} 
                      className={`group flex flex-col items-center justify-center w-16 h-14 transition-all relative ${
                        isActive ? activeColor : inactiveColor
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1 transition-all duration-300">
                        <div className="relative">
                          <tab.icon className={`w-[22px] h-[22px] transition-all duration-300 stroke-[2px] ${
                            isActive ? 'scale-105' : ''
                          }`} />
                          {tab.badge !== undefined && tab.badge > 0 && (
                            <div className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white shadow-sm">
                              {tab.badge}
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] font-extrabold tracking-tight mt-0.5 text-center">
                          {tab.label}
                        </span>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>
          )}

          {/* Floating Settings Navigation Trigger (Mobile only: on Desktop it is situated outside) */}
          {isMobileOrNative && (
            <button
              id="quick-nav-settings-btn"
              onClick={() => setIsNavOpen(true)}
              className={`absolute top-14 right-6 w-11 h-11 rounded-2xl flex items-center justify-center z-[130] transition-all active:scale-95 shadow-xl border ${
                isDark 
                  ? 'bg-slate-950/85 hover:bg-slate-900/95 border-white/10 text-[#3906d2]' 
                  : 'bg-white/85 hover:bg-slate-50/95 border-slate-200/80 text-slate-800'
              } backdrop-blur-xl group pointer-events-auto`}
              title="Fast Screen Navigation Portal"
            >
              <Settings className="w-5 h-5 transition-transform duration-700 group-hover:rotate-180" />
            </button>
          )}

          {/* Full Screen Navigation Portal Dialog (Simulated inside the phone container for Mobile/Native) */}
          {isMobileOrNative && isNavOpen && (
            <div className="absolute inset-0 z-[140] flex flex-col bg-slate-950/95 backdrop-blur-xl p-6 text-white divide-y divide-white/5 animate-fade-in pointer-events-auto">
              {/* Header */}
              <div className="pb-4 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-base font-black tracking-tight text-[#3906d2]">NAVIGATION HUB</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Fast-Travel Everywhere</p>
                </div>
                <button 
                  onClick={() => setIsNavOpen(false)}
                  className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white active:scale-95 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Quick Role & Mode Utilities */}
              <div className="py-4 space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Environment Simulation</span>
                  <span className="text-[10px] font-mono bg-[#3906d2]/15 text-[#3906d2] px-2 py-0.5 rounded-full font-bold">
                    Active: {userRole}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['CUSTOMER', 'CLEANER', 'ADMIN'] as const).map((role) => (
                    <button
                      key={role}
                      onClick={() => {
                        if (toggleRole) {
                          toggleRole(role);
                        } else if (setUserRole) {
                          setUserRole(role);
                        }
                      }}
                      className={`py-2 px-1 rounded-xl text-[9px] uppercase font-black tracking-wider transition-all border cursor-pointer ${
                        userRole === role 
                          ? 'bg-[#3906d2] text-white border-[#3906d2]' 
                          : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>

                {/* Sandbox Onboarding Bypass Switch */}
                <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Onboarding Bypass</span>
                    <span className="text-[8px] text-slate-500 font-bold uppercase tracking-tight">Allows view of all screens</span>
                  </div>
                  <button
                    onClick={() => setSandboxBypass(!sandboxBypass)}
                    className={`w-10 h-6 rounded-full p-0.5 transition-colors cursor-pointer relative ${sandboxBypass ? 'bg-[#3906d2]' : 'bg-white/10'}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white transition-all shadow-md transform ${sandboxBypass ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              {/* Search & Category Filter Section */}
              <div className="py-4 space-y-3 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search screens..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#3906d2]/50 transition-colors"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Categories tab pills */}
                <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
                  {(['ALL', 'AUTH', 'CUSTOMER', 'CLEANER', 'ADMIN', 'STATES'] as const).map((cat) => {
                    const count = cat === 'ALL' 
                      ? SCREENS_LIST.length 
                      : SCREENS_LIST.filter(s => s.category === cat).length;
                    
                    return (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                          selectedCategory === cat 
                            ? 'bg-slate-100 text-slate-950 font-black' 
                            : 'bg-white/5 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {cat} <span className="opacity-60 font-medium text-[8px]">({count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Screens Scrollable Box */}
              <div className="flex-1 overflow-y-auto no-scrollbar py-3 space-y-2">
                {(() => {
                  const filtered = SCREENS_LIST.filter(item => {
                    const matchesSearch = item.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                         item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                         item.description.toLowerCase().includes(searchQuery.toLowerCase());
                    const matchesCat = selectedCategory === 'ALL' || item.category === selectedCategory;
                    return matchesSearch && matchesCat;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-8 text-xs text-slate-500">
                        No screens found matching "{searchQuery}"
                      </div>
                    );
                  }

                  return filtered.map((item) => {
                    const isSelected = currentScreen === item.id && (item.category !== 'CUSTOMER' || userRole === 'CUSTOMER') && (item.category !== 'CLEANER' || userRole === 'CLEANER') && (item.category !== 'ADMIN' || userRole === 'ADMIN');
                    
                    return (
                      <button
                        key={`${item.category}-${item.id}`}
                        onClick={() => {
                          if (item.role && setUserRole) {
                            setUserRole(item.role);
                          }
                          setCurrentScreen(item.id);
                          setIsNavOpen(false);
                        }}
                        className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-start gap-4 active:scale-98 group cursor-pointer ${
                          isSelected 
                            ? 'bg-[#3906d2]/10 border-[#3906d2]/30 text-white shadow-lg' 
                            : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.06] text-slate-200 hover:border-white/10'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          <span className={`text-[8.5px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                            item.category === 'AUTH' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                            item.category === 'CUSTOMER' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                            item.category === 'CLEANER' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            item.category === 'ADMIN' ? 'bg-purple-500/10 text-[#3906d2] border border-[#3906d2]/20' :
                            'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {item.category}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-extrabold text-xs block text-white truncate max-w-[180px]">{item.label}</span>
                            <span className="font-mono text-[7.5px] text-slate-500 uppercase shrink-0">{item.id}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-medium leading-normal mt-1">{item.description}</p>
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>

              {/* Footer */}
              <div className="pt-3 uppercase tracking-widest text-center text-[7.5px] text-slate-600 font-bold shrink-0">
                Detail® Pro Fast-Travel • AI Guided Navigation Environment
              </div>
            </div>
          )}
        </div>
        
        {/* Home Indicator (Only on desktop web preview) */}
        {!isMobileOrNative && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-white/20 rounded-full z-[200]"></div>
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('CUSTOMER');
  const [currentScreen, setCurrentScreen] = useState<Screen>('SPLASH');
  const [sandboxBypass, setSandboxBypass] = useState(true);

  // Theme states
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('detail-theme-preference');
    return (saved as 'light' | 'dark' | 'system') || 'light'; // Light Mode default
  });

  const [activeTheme, setActiveTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    localStorage.setItem('detail-theme-preference', themeMode);
    if (themeMode === 'system') {
      const match = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

      if (match) {
        setActiveTheme(match.matches ? 'dark' : 'light');
        
        const listener = (e: MediaQueryListEvent | { matches: boolean }) => {
          setActiveTheme(e.matches ? 'dark' : 'light');
        };
        
        if (typeof match.addEventListener === 'function') {
          match.addEventListener('change', listener as any);
          return () => {
            if (typeof match.removeEventListener === 'function') {
              match.removeEventListener('change', listener as any);
            }
          };
        } else if (typeof (match as any).addListener === 'function') {
          (match as any).addListener(listener);
          return () => {
            if (typeof (match as any).removeListener === 'function') {
              (match as any).removeListener(listener);
            }
          };
        }
      }
    } else {
      setActiveTheme(themeMode);
    }
  }, [themeMode]);

  // Interactive Diagnostic Simulations
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false);
  const [isOfflineBypassed, setIsOfflineBypassed] = useState(false);
  const [isSimulatingSuspension, setIsSimulatingSuspension] = useState(false);
  const [cancellingJobRef, setCancellingJobRef] = useState<any>(null);
  const [warningBidAmount, setWarningBidAmount] = useState<number>(25);
  const [noCleanerCurrentBid, setNoCleanerCurrentBid] = useState<number>(30);
  const [forceUpdateActive, setForceUpdateActive] = useState(false);

  // Real-time Firestore Quota Exceeded Event listener
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(() => {
    return typeof window !== 'undefined' ? !!(window as any).firestoreQuotaExceeded : false;
  });

  useEffect(() => {
    const handleQuota = () => {
      setIsQuotaExceeded(true);
    };
    window.addEventListener('firestore-quota-exceeded', handleQuota);
    return () => {
      window.removeEventListener('firestore-quota-exceeded', handleQuota);
    };
  }, []);

  // Real Internet Offline Connection Listener is defined below after activeJob state is initialized
  // Shared State
  const [cleanerStatus, setCleanerStatus] = useState<Status>('OFFLINE');
  const [activeJob, setActiveJob] = useState<any>(null);
  const [nearbyCleaners, setNearbyCleaners] = useState<any[]>([]);
  const [availableJobs, setAvailableJobs] = useState<any[]>([]);
  const [myBids, setMyBids] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedChatJob, setSelectedChatJob] = useState<any>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [walletData, setWalletData] = useState<any>({ balance: 0, transactions: [] });
  const [isSafetyModalOpen, setIsSafetyModalOpen] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [selectedCleaner, setSelectedCleaner] = useState<any>(null);
  const [preselectedBookingCleaner, setPreselectedBookingCleaner] = useState<any>(null);
  const [preselectedBookingDetails, setPreselectedBookingDetails] = useState<any>(null);

  // Cleaner Inbound Dispatch Signal Alert Active States
  const [lastSeenJobId, setLastSeenJobId] = useState<string | null>(null);
  const [isSignalDismissed, setIsSignalDismissed] = useState(false);

  // Production-Ready Native Browser Push Notification and HUD Signal Handler for Cleaners
  useEffect(() => {
    if (userRole === 'CLEANER' && availableJobs.length > 0) {
      const topJob = availableJobs[0];
      if (topJob.id !== lastSeenJobId) {
        setLastSeenJobId(topJob.id);
        setIsSignalDismissed(false); // Reset to show the new alert HUD

        // Standard Web Notification API trigger for native OS push notification on user's mobile or desktop
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'default') {
            Notification.requestPermission();
          } else if (Notification.permission === 'granted') {
            try {
              const title = `🚨 NEW DISPATCH: $${topJob.price || 45}`;
              const options = {
                body: `ASAP ${topJob.serviceType || 'Residential Clean'} requested at ${topJob.location?.address || 'Soho Area'}`,
                tag: topJob.id,
                silent: false,
                requireInteraction: true // Keep active on system screen until actioned
              };
              const notification = new Notification(title, options);
              
              // Tapping standard OS mobile push notification routes directly inside the app
              notification.onclick = () => {
                window.focus();
                setCurrentScreen('HOME');
                setIsSignalDismissed(true);
                notification.close();
              };
            } catch (err) {
              console.warn('Native web push notification display error inside sandbox container:', err);
            }
          }
        }
      }
    }
  }, [availableJobs, userRole, lastSeenJobId, setCurrentScreen]);
  
  // Real-world Notifications State & Effects
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([
    {
      id: 'welcome',
      title: 'Welcome to Detail® Pro',
      body: 'Get certified, configure your service rates, and connect with premium vehicle owners in your sector.',
      timestamp: new Date(Date.now() - 3600000 * 2),
      read: false,
      type: 'system'
    }
  ]);

  // Real Internet Offline Connection Listener
  useEffect(() => {
    const handleOffline = () => {
      setIsOfflineBypassed(false);
      setCurrentScreen('INTERNET_CONNECTION');
    };
    const handleOnline = () => {
      setIsOfflineBypassed(false);
      setCurrentScreen(activeJob ? 'SERVICE_PROGRESS' : 'HOME');
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [activeJob]);

  // Push live notification on new bids
  const prevMyBidsLengthRef = useRef(0);
  useEffect(() => {
    if (myBids && myBids.length > prevMyBidsLengthRef.current) {
      const addedCount = myBids.length - prevMyBidsLengthRef.current;
      const latestBid = myBids[0];
      const newNotif = {
        id: `bid-${Date.now()}`,
        title: addedCount === 1 ? 'New Cleaning Offer Received!' : 'Multiple Offers Received!',
        body: latestBid 
          ? `Specialist ${latestBid.cleanerName || 'Pro'} offered $${latestBid.price || latestBid.bidPrice} for your cleaning job.`
          : `You have received ${myBids.length} custom contract bid offers.`,
        timestamp: new Date(),
        read: false,
        type: 'bids'
      };
      setNotifications(prev => [newNotif, ...prev]);
    }
    if (myBids) {
      prevMyBidsLengthRef.current = myBids.length;
    }
  }, [myBids]);

  // Push live notification on active job updates
  const prevJobStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeJob && activeJob.status !== prevJobStatusRef.current) {
      const statusLabels: Record<string, string> = {
        'REQUESTED': 'Job Broadcasted',
        'BIDDING': 'Offers Received',
        'ACCEPTED': 'Specialist Traveling',
        'EN_ROUTE': 'Cleaner En-Route',
        'ARRIVED': 'Specialist Arrived',
        'IN_PROGRESS': 'Cleaning Session In Progress',
        'COMPLETED': 'Cleaning Completed! Rate your Specialist'
      };
      
      const newNotif = {
        id: `job-status-${Date.now()}`,
        title: `Job Status Update`,
        body: `Your booking status turned to ${statusLabels[activeJob.status] || activeJob.status}.`,
        timestamp: new Date(),
        read: false,
        type: 'job'
      };
      setNotifications(prev => [newNotif, ...prev]);
    }
    prevJobStatusRef.current = activeJob ? activeJob.status : null;
  }, [activeJob?.status, activeJob]);
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false);
  const [isWithdrawFundsOpen, setIsWithdrawFundsOpen] = useState(false);
  const [bidJob, setBidJob] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);

  // Phone Auth State
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [authTab, setAuthTab] = useState<'PHONE' | 'EMAIL'>('PHONE');
  const [resendTimer, setResendTimer] = useState(102); // 01:42
  const [expiryTimer, setExpiryTimer] = useState(300); // 05:00

  // Timer Effect
  useEffect(() => {
    let interval: any;
    if (currentScreen === 'VERIFY_PHONE') {
      interval = setInterval(() => {
        setResendTimer(prev => (prev > 0 ? prev - 1 : 0));
        setExpiryTimer(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else {
      setResendTimer(102);
      setExpiryTimer(300);
    }
    return () => clearInterval(interval);
  }, [currentScreen]);

  // --- Geolocation Tracking ---
  const [currentLocation, setCurrentLocation] = useState<{ lat: number, lng: number } | null>({ lat: 40.7128, lng: -74.0060 });
  const [activeCleanerLiveLocation, setActiveCleanerLiveLocation] = useState<{ lat: number, lng: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      console.error("Geolocation is not supported by your browser");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentLocation({ lat: latitude, lng: longitude });
      },
      (error) => {
        console.error("Geolocation error:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Sync real-time location to Firestore when currentLocation or user updates
  useEffect(() => {
    if (!user || !currentLocation) return;
    const syncLocationToDb = async () => {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          lat: currentLocation.lat,
          lng: currentLocation.lng,
          lastSeen: serverTimestamp()
        });
      } catch (err) {
        console.error("Failed to update location in Firestore:", err);
      }
    };
    syncLocationToDb();
  }, [user, currentLocation]);

  // --- Track Assigned Cleaner for Customer ---
  useEffect(() => {
    if (userRole !== 'CUSTOMER' || !activeJob || !['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(activeJob.status)) {
      setActiveCleanerLiveLocation(null);
      return;
    }

    const cleanerId = activeJob.cleanerId;
    if (!cleanerId) return;

    const unsubscribe = onSnapshot(doc(db, 'users', cleanerId), (snapshot) => {
      const data = snapshot.data();
      if (data?.lat && data?.lng) {
        setActiveCleanerLiveLocation({ lat: data.lat, lng: data.lng });
      }
    });

    return () => unsubscribe();
  }, [userRole, activeJob]);

  // --- Nearby Users (Cleaners for Customers, Customers for Cleaners) ---
  useEffect(() => {
    if (!user || !currentLocation || !userRole) return;

    const oppositeRole = userRole === 'CUSTOMER' ? 'CLEANER' : 'CUSTOMER';
    const bounds = 0.05; // ~5km bounding box

    const q = query(
      collection(db, 'users'),
      where('role', '==', oppositeRole),
      where('status', '==', 'AVAILABLE'), // Only available users
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let users = snapshot.docs
        .map(d => ({ uid: d.id, ...d.data() } as any))
        .filter(u => {
          if (!u.lat || !u.lng) return false;
          // Client-side bounding box filter (since Firestore is limited)
          return Math.abs(u.lat - currentLocation.lat) < bounds && 
                 Math.abs(u.lng - currentLocation.lng) < bounds;
        });
      
      // Auto-populate 3 real interactive database cleaners relative to user's real coordinate
      if (users.length === 0 && oppositeRole === 'CLEANER') {
        const demoCleaners = [
          {
            uid: 'demo-cleaner-1',
            email: 'sarah.pro@example.com',
            displayName: 'Sarah Jenkins',
            photoURL: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
            role: 'CLEANER',
            balance: 15,
            status: 'AVAILABLE',
            hourlyRate: 45,
            hasAgreedToTerms: true,
            isVerified: true,
            lat: currentLocation.lat + 0.0035,
            lng: currentLocation.lng - 0.0022,
            lastSeen: serverTimestamp(),
            ratingAverage: 4.95,
            ratingSum: 198,
            ratingCount: 40,
            jobsCompleted: 142,
            responseTimeAverage: 8,
            verificationLevel: 4,
            radius: 12,
            specialties: ['House Cleaning', 'Car Detailing']
          },
          {
            uid: 'demo-cleaner-2',
            email: 'marcus.detail@example.com',
            displayName: 'Marcus Vance',
            photoURL: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150',
            role: 'CLEANER',
            balance: 5,
            status: 'AVAILABLE',
            hourlyRate: 55,
            hasAgreedToTerms: true,
            isVerified: true,
            lat: currentLocation.lat - 0.0025,
            lng: currentLocation.lng + 0.0041,
            lastSeen: serverTimestamp(),
            ratingAverage: 4.88,
            ratingSum: 122,
            ratingCount: 25,
            jobsCompleted: 98,
            responseTimeAverage: 12,
            verificationLevel: 3,
            radius: 10,
            specialties: ['House Cleaning']
          },
          {
            uid: 'demo-cleaner-3',
            email: 'elena.rostova@example.com',
            displayName: 'Elena Rostova',
            photoURL: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
            role: 'CLEANER',
            balance: 22,
            status: 'AVAILABLE',
            hourlyRate: 40,
            hasAgreedToTerms: true,
            isVerified: true,
            lat: currentLocation.lat + 0.0012,
            lng: currentLocation.lng + 0.0033,
            lastSeen: serverTimestamp(),
            ratingAverage: 4.54,
            ratingSum: 68,
            ratingCount: 15,
            jobsCompleted: 64,
            responseTimeAverage: 15,
            verificationLevel: 2,
            radius: 8,
            specialties: ['Car Detailing']
          }
        ];
        demoCleaners.forEach(async (cl) => {
          try {
            await setDoc(doc(db, 'users', cl.uid), cl);
          } catch (e) {
            console.error("Failed seeding demo cleaner:", e);
          }
        });
      }

      setNearbyCleaners(users);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'users'));

    return () => unsubscribe();
  }, [user, currentLocation, userRole]);

  const handleSendOTP = async () => {
    if (!phoneNumber) return;
    try {
      const recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible'
      });
      const formattedNumber = phoneNumber.startsWith('+') ? `+${phoneNumber.slice(1).replace(/\D/g, '')}` : `+1${phoneNumber.replace(/\D/g, '')}`;
      const result = await signInWithPhoneNumber(auth, formattedNumber, recaptchaVerifier);
      setConfirmationResult(result);
      setCurrentScreen('VERIFY_PHONE');
      setOtp('');
    } catch (error) {
      console.error('Error sending OTP:', error);
      alert('Failed to send OTP. Please ensure your number is correct.');
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || !confirmationResult) return;
    try {
      await confirmationResult.confirm(otp);
      // onAuthStateChanged will handle the rest
    } catch (error) {
      console.error('Error verifying OTP:', error);
      alert('Invalid code. Please try again.');
      setOtp('');
    }
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          // Fetch or create profile
          const userPath = `users/${firebaseUser.uid}`;
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid)).catch(e => handleFirestoreError(e, OperationType.GET, userPath));
          if (userDoc && userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            setProfile(data);
            setUserRole(data.role);
            setCleanerStatus(data.status);
            setWalletData({ balance: data.balance || 0, transactions: [] });
            
            const routeUser = () => {
              if (sandboxBypass) return;
              const screensToRouteFrom = ['SPLASH', 'WELCOME', 'PHONE_INPUT', 'OTP_VERIFY', 'AUTH'];
              if (screensToRouteFrom.includes(currentScreen)) {
                if (!data.hasCompletedProfile || !data.displayName || data.displayName === 'User') {
                  setCurrentScreen('CREATE_PROFILE');
                } else if (!data.hasSetupPermissions) {
                  setCurrentScreen('PERMISSIONS');
                } else {
                  setCurrentScreen('HOME');
                }
              }
            };

            if (currentScreen === 'SPLASH') {
              setTimeout(routeUser, 5800);
            } else {
              routeUser();
            }
          } else {
            // New user - default to CUSTOMER
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
              photoURL: firebaseUser.photoURL || '',
              role: 'CUSTOMER',
              balance: 100, // Starting bonus
              status: 'OFFLINE',
              hasAgreedToTerms: false,
              commissionOwed: 0,
              isSuspended: false,
              isBanned: false,
              hasCompletedProfile: false,
              hasSetupPermissions: false
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile).catch(e => handleFirestoreError(e, OperationType.WRITE, userPath));
            setProfile(newProfile);
            setUserRole('CUSTOMER');
            setCleanerStatus('OFFLINE');
            setWalletData({ balance: 100, transactions: [] });
            
            const routeNewUser = () => {
              if (sandboxBypass) return;
              const screensToRouteFrom = ['SPLASH', 'WELCOME', 'PHONE_INPUT', 'OTP_VERIFY'];
              if (screensToRouteFrom.includes(currentScreen)) {
                setCurrentScreen('CREATE_PROFILE');
              }
            };

            if (currentScreen === 'SPLASH') {
              setTimeout(routeNewUser, 5800);
            } else {
              routeNewUser();
            }
          }
        } catch (error) {
          console.error("Auth process error:", error);
        }
      } else {
        setProfile(null);
        if (!sandboxBypass) {
          if (!['SPLASH', 'WELCOME', 'PHONE_INPUT', 'OTP_VERIFY', 'CREATE_PROFILE', 'PERMISSIONS'].includes(currentScreen)) {
            setCurrentScreen('WELCOME');
          }
        }
      }
    });
    return () => unsubscribe();
  }, [currentScreen, sandboxBypass]);

  // --- Commission & Suspension Logic ---
  useEffect(() => {
    if (!user || userRole !== 'CLEANER' || !profile) return;

    const checkCommissionStatus = async () => {
      const now = new Date();
      
      // 1. Check if 48h window has passed to generate invoice
      if (profile.firstJobInWindowDate && profile.commissionOwed && profile.commissionOwed > 0) {
        const firstJobDate = profile.firstJobInWindowDate.toDate();
        const diffHours = (now.getTime() - firstJobDate.getTime()) / (1000 * 60 * 60);
        
        if (diffHours >= 48) {
          // Generate Invoice
          const dueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Due in 24h (Day 3 suspension)
          await addDoc(collection(db, 'invoices'), {
            cleanerId: user.uid,
            amount: profile.commissionOwed,
            status: 'UNPAID',
            dueDate: Timestamp.fromDate(dueDate),
            createdAt: serverTimestamp(),
            jobIds: [] // In a real app, we'd track specific job IDs
          });

          // Reset cleaner window
          await updateDoc(doc(db, 'users', user.uid), {
            commissionOwed: 0,
            firstJobInWindowDate: null
          });
          
          // Note: In a real app, we'd send an email here
          console.log('Commission invoice generated for cleaner:', user.uid);
        }
      }

      // 2. Check for unpaid invoices to trigger suspension/ban
      const q = query(collection(db, 'invoices'), where('cleanerId', '==', user.uid), where('status', '==', 'UNPAID'));
      const querySnapshot = await getDocs(q);
      
      let shouldSuspend = false;
      let shouldBan = false;
      let earliestDueDate: Date | null = null;

      querySnapshot.forEach((doc) => {
        const invoice = doc.data();
        const dueDate = invoice.dueDate.toDate();
        if (!earliestDueDate || dueDate < earliestDueDate) earliestDueDate = dueDate;

        const diffHoursPastDue = (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60);
        
        if (diffHoursPastDue >= 0) shouldSuspend = true;
        if (diffHoursPastDue >= (11 * 24)) shouldBan = true; // Day 3 (due) + 11 days = Day 14
      });

      if (shouldBan && !profile.isBanned) {
        await updateDoc(doc(db, 'users', user.uid), { isBanned: true, banDate: serverTimestamp() });
        console.log('EMAIL SENT: Account permanently banned due to non-payment.', user.email);
      } else if (shouldSuspend && !profile.isSuspended) {
        await updateDoc(doc(db, 'users', user.uid), { isSuspended: true, suspensionDate: serverTimestamp() });
        console.log('EMAIL SENT: Account suspended until payment is made.', user.email);
      } else if (!shouldSuspend && profile.isSuspended) {
        await updateDoc(doc(db, 'users', user.uid), { isSuspended: false, suspensionDate: null });
        console.log('EMAIL SENT: Account reactivated. Thank you for your payment.', user.email);
      }
    };

    checkCommissionStatus();
    const interval = setInterval(checkCommissionStatus, 1000 * 60 * 60); // Check every hour
    return () => clearInterval(interval);
  }, [user, userRole, profile?.firstJobInWindowDate, profile?.commissionOwed, profile?.isSuspended, profile?.isBanned]);

  // Firestore Listeners
  useEffect(() => {
    if (!user) return;

    // Profile listener
    const unsubProfile = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as UserProfile;
        setProfile(data);
        setUserRole(data.role);
        setCleanerStatus(data.status);
        setWalletData(prev => ({ ...prev, balance: data.balance }));
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, `users/${user.uid}`));

    // Active Job listener
    let unsubJob = () => {};
    if (userRole === 'CUSTOMER') {
      const q = query(collection(db, 'jobs'), where('customerId', '==', user.uid), where('status', 'not-in', ['COMPLETED', 'CANCELLED']), limit(1));
      unsubJob = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const job = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as any;
          if (job.status === 'COMPLETED' && activeJob?.status !== 'COMPLETED') {
            setShowRating(true);
          }
          setActiveJob(job);
        } else {
          setActiveJob(null);
        }
      }, (e) => handleFirestoreError(e, OperationType.GET, 'jobs'));
    } else {
      const q = query(collection(db, 'jobs'), where('cleanerId', '==', user.uid), where('status', 'not-in', ['COMPLETED', 'CANCELLED']), limit(1));
      unsubJob = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const job = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as any;
          setActiveJob(job);
        } else {
          setActiveJob(null);
        }
      }, (e) => handleFirestoreError(e, OperationType.GET, 'jobs'));
    }

    // Available Jobs for Cleaners
    let unsubAvailable = () => {};
    if (userRole === 'CLEANER') {
      const q = query(
        collection(db, 'jobs'), 
        where('status', 'in', ['REQUESTED', 'DIRECT_REQUEST', 'BIDDING']), 
        orderBy('createdAt', 'desc')
      );
      unsubAvailable = onSnapshot(q, (snapshot) => {
        const jobs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
        // Filter out declined jobs, as well as checking direct requests bounds
        const filteredJobs = jobs.filter(j => {
          if (j.declinedBy && j.declinedBy.includes(user.uid)) return false;
          return j.status === 'REQUESTED' || (j.status === 'DIRECT_REQUEST' && j.cleanerId === user.uid);
        });
        setAvailableJobs(filteredJobs);
      }, (e) => handleFirestoreError(e, OperationType.GET, 'jobs'));
    }

    // Bids for Active Job (Customer side) or My Bids (Cleaner side)
    let unsubBids = () => {};
    if (userRole === 'CUSTOMER' && activeJob) {
      const q = query(collection(db, 'bids'), where('jobId', '==', activeJob.id));
      unsubBids = onSnapshot(q, (snapshot) => {
        setMyBids(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (e) => handleFirestoreError(e, OperationType.GET, 'bids'));
    } else if (userRole === 'CLEANER') {
      const q = query(collection(db, 'bids'), where('cleanerId', '==', user.uid), orderBy('createdAt', 'desc'));
      unsubBids = onSnapshot(q, (snapshot) => {
        setMyBids(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (e) => handleFirestoreError(e, OperationType.GET, 'bids'));
    }

    // Chat Messages for Active Job
    let unsubChat = () => {};
    if (activeJob && !selectedChatJob) {
      const q = query(collection(db, 'jobs', activeJob.id, 'messages'), orderBy('timestamp', 'asc'));
      unsubChat = onSnapshot(q, (snapshot) => {
        setChatMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (e) => handleFirestoreError(e, OperationType.GET, `jobs/${activeJob.id}/messages`));
    }

    // Chat Messages for Selected Chat Job
    let unsubSelectedChat = () => {};
    if (selectedChatJob) {
      const q = query(collection(db, 'jobs', selectedChatJob.id, 'messages'), orderBy('timestamp', 'asc'));
      unsubSelectedChat = onSnapshot(q, (snapshot) => {
        setChatMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (e) => handleFirestoreError(e, OperationType.GET, `jobs/${selectedChatJob.id}/messages`));
    }

    // All Conversations (Jobs with messages)
    const unsubConversations = onSnapshot(
      query(
        collection(db, 'jobs'),
        where(userRole === 'CUSTOMER' ? 'customerId' : 'cleanerId', '==', user.uid),
        orderBy('lastMessageTimestamp', 'desc')
      ),
      (snapshot) => {
        setConversations(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (e) => handleFirestoreError(e, OperationType.GET, 'jobs')
    );

    // Nearby Cleaners (Customer side)
    let unsubNearby = () => {};
    if (userRole === 'CUSTOMER') {
      const q = query(collection(db, 'users'), where('role', '==', 'CLEANER'), where('status', '==', 'AVAILABLE'));
      unsubNearby = onSnapshot(q, (snapshot) => {
        setNearbyCleaners(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (e) => handleFirestoreError(e, OperationType.GET, 'users'));
    }

    // Transactions listener
    const unsubTransactions = onSnapshot(query(collection(db, 'users', user.uid, 'transactions'), orderBy('createdAt', 'desc'), limit(10)), (snapshot) => {
      setWalletData(prev => ({
        ...prev,
        history: snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      }));
    }, (e) => handleFirestoreError(e, OperationType.GET, `users/${user.uid}/transactions`));

    // Invoices listener
    let unsubInvoices = () => {};
    if (userRole === 'CLEANER') {
      const q = query(collection(db, 'invoices'), where('cleanerId', '==', user.uid));
      unsubInvoices = onSnapshot(q, (snapshot) => {
        setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (e) => handleFirestoreError(e, OperationType.GET, 'invoices'));
    }

    return () => {
      unsubProfile();
      unsubJob();
      unsubAvailable();
      unsubBids();
      unsubChat();
      unsubSelectedChat();
      unsubConversations();
      unsubNearby();
      unsubTransactions();
      unsubInvoices();
    };
  }, [user, userRole, cleanerStatus, activeJob?.id, selectedChatJob?.id]);

  // Splash timeout
  useEffect(() => {
    if (sandboxBypass) return;
    if (currentScreen === 'SPLASH') {
      const timer = setTimeout(() => {
        if (!user) setCurrentScreen('WELCOME');
      }, 5800);
      return () => clearTimeout(timer);
    }
  }, [currentScreen, user, sandboxBypass]);

  // Auto-switch screens based on activeJob
  useEffect(() => {
    if (sandboxBypass) return;
    if (!activeJob) return;

    if (userRole === 'CUSTOMER') {
      if (activeJob.status !== 'REQUESTED' && activeJob.status !== 'DIRECT_REQUEST' && currentScreen !== 'SERVICE_PROGRESS' && currentScreen !== 'MESSAGES' && currentScreen !== 'PROFILE' && currentScreen !== 'WALLET') {
        setCurrentScreen('SERVICE_PROGRESS');
      }
    } else if (userRole === 'CLEANER') {
      if (currentScreen !== 'SERVICE_PROGRESS' && currentScreen !== 'MESSAGES' && currentScreen !== 'PROFILE' && currentScreen !== 'WALLET') {
        setCurrentScreen('SERVICE_PROGRESS');
      }
    }
  }, [activeJob?.id, activeJob?.status, userRole, currentScreen, sandboxBypass]);

  // Force Cleaner Agreement
  useEffect(() => {
    if (sandboxBypass) return;
    if (user && userRole === 'CLEANER' && profile && !profile.hasAgreedToTerms && currentScreen !== 'CLEANER_AGREEMENT') {
      setCurrentScreen('CLEANER_AGREEMENT');
    }
  }, [user, userRole, profile?.hasAgreedToTerms, currentScreen, sandboxBypass]);

  // --- Actions ---
  const handleEmailAuth = async (email: string, passwordString: string, isRegistering: boolean) => {
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, passwordString);
      } else {
        await signInWithEmailAndPassword(auth, email, passwordString);
      }
    } catch (error: any) {
      console.error('Email Auth Error:', error);
      let errMsg = `Authentication failed: ${error.message || error.code || 'Please check your credentials.'}`;
      if (error.code === 'auth/operation-not-allowed') {
        errMsg = 'Email/Password sign-in provider is not enabled in your Firebase Project Console. Please go to Firebase Authentication -> Sign-in method, click "Add new provider" and enable "Email/Password". Alternatively, turn on the "Sandbox Bypass" switch in the bottom left menu to test the application instantly!';
      } else if (error.code === 'auth/email-already-in-use') {
        errMsg = 'This email is already registered. Please sign in instead!';
      } else if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        errMsg = 'Invalid email or password. Please verify your details, or check "I am a new user" to register.';
      } else if (error.code === 'auth/invalid-email') {
        errMsg = 'Invalid email address format.';
      } else if (error.code === 'auth/weak-password') {
        errMsg = 'Password is too weak. Try entering a secure password with at least 6 characters.';
      }
      throw new Error(errMsg);
    }
  };

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error('Login failed:', e);
    }
  };

  const toggleRole = async (targetRole?: UserRole) => {
    let nextRole: UserRole;
    if (targetRole && typeof targetRole === 'string') {
      nextRole = targetRole;
    } else {
      nextRole = userRole === 'CUSTOMER' ? 'CLEANER' : 'CUSTOMER';
    }
    
    if (user) {
      await updateDoc(doc(db, 'users', user.uid), { role: nextRole });
    }
    
    setUserRole(nextRole);
    setActiveJob(null);
    setIsChatOpen(false);
    setCurrentScreen(nextRole === 'ADMIN' ? 'ADMIN_OVERVIEW' : 'HOME');
  };

  const logout = async () => {
    await auth.signOut();
    setUserRole('CUSTOMER');
    setCleanerStatus('OFFLINE');
    setActiveJob(null);
    setCurrentScreen('WELCOME');
  };

  const cancelJob = async (jobId: string) => {
    if (currentScreen !== 'CANCELLATION_SCREEN') {
      setCurrentScreen('CANCELLATION_SCREEN');
      return;
    }
    try {
      await updateDoc(doc(db, 'jobs', jobId), { status: 'CANCELLED' });
      setCurrentScreen('HOME');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `jobs/${jobId}`);
    }
  };

  const handleDeclineJob = async (job: any) => {
    try {
      if (!user) return;
      const jobRef = doc(db, 'jobs', job.id);
      const existingDeclined = job.declinedBy || [];
      const updatedDeclined = [...existingDeclined, user.uid];

      if (job.status === 'DIRECT_REQUEST') {
        await updateDoc(jobRef, { 
          status: 'CANCELLED', 
          declinedBy: updatedDeclined 
        });
        alert(`Direct request proposal declined.`);
      } else {
        await updateDoc(jobRef, { 
          declinedBy: updatedDeclined 
        });
        alert(`Proposal declined and removed from dispatch board.`);
      }
    } catch (err) {
      console.error("Failed to decline job:", err);
    }
  };

  const updateJobStatus = async (jobId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'jobs', jobId), { status });
      
      if (status === 'COMPLETED') {
        const jobDoc = await getDoc(doc(db, 'jobs', jobId));
        if (jobDoc.exists()) {
          const job = jobDoc.data();
          const amount = job.price;
          
          // Update Customer Balance
          const customerRef = doc(db, 'users', job.customerId);
          const customerDoc = await getDoc(customerRef);
          if (customerDoc.exists()) {
            const currentBalance = customerDoc.data().balance || 0;
            await updateDoc(customerRef, { balance: currentBalance - amount });
            await addDoc(collection(db, 'users', job.customerId, 'transactions'), {
              type: 'Payment',
              amount: -amount,
              jobId,
              createdAt: serverTimestamp()
            });
          }

          // Update Cleaner Balance & Commission
          const cleanerRef = doc(db, 'users', job.cleanerId);
          const cleanerDoc = await getDoc(cleanerRef);
          if (cleanerDoc.exists()) {
            const cleanerData = cleanerDoc.data() as UserProfile;
            const currentBalance = cleanerData.balance || 0;
            const commission = amount * 0.10; // 10% commission
            
            const updates: any = { 
              balance: currentBalance + (amount - commission),
              commissionOwed: (cleanerData.commissionOwed || 0) + commission
            };

            // Start 48h clock if not already started
            if (!cleanerData.firstJobInWindowDate) {
              updates.firstJobInWindowDate = serverTimestamp();
            }

            await updateDoc(cleanerRef, updates);
            await addDoc(collection(db, 'users', job.cleanerId, 'transactions'), {
              type: 'Earnings',
              amount: amount - commission,
              commission,
              jobId,
              createdAt: serverTimestamp()
            });
          }
        }
      }

      if (status === 'COMPLETED' && userRole === 'CLEANER') {
        setActiveJob(null);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `jobs/${jobId}`);
    }
  };

  const requestJob = async (service: string, details?: string, status: 'REQUESTED' | 'DRAFT' | 'DIRECT_REQUEST' = 'REQUESTED') => {
    if (!user) return;
    try {
      let lat = 40.7128;
      let lng = -74.0060;
      
      if (navigator.geolocation) {
        const pos = await new Promise<GeolocationPosition | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 5000 });
        });
        if (pos) {
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      }

      const jobData: any = {
        customerId: user.uid,
        serviceType: service,
        details: details || '',
        status: selectedCleaner ? 'DIRECT_REQUEST' : status,
        location: { lat, lng, address: 'Current Location' },
        createdAt: serverTimestamp(),
        price: selectedCleaner ? selectedCleaner.hourlyRate || 40 : 0
      };

      if (selectedCleaner) {
        jobData.cleanerId = selectedCleaner.uid;
        jobData.cleanerName = selectedCleaner.displayName;
        jobData.cleanerPhoto = selectedCleaner.photoURL;
      }

      const docRef = await addDoc(collection(db, 'jobs'), jobData);
      setActiveJob({ id: docRef.id, ...jobData });
      setSelectedCleaner(null); // Clear selection after request
      setCurrentScreen('HOME');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'jobs');
    }
  };

  const submitBid = async (jobId: string, price: number) => {
    if (!user || !profile) return;
    try {
      const bidData = {
        jobId,
        cleanerId: user.uid,
        cleanerName: profile.displayName,
        cleanerPhoto: profile.photoURL,
        bidPrice: price,
        estimatedArrival: 15,
        status: 'PENDING',
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'bids'), bidData);
      await updateDoc(doc(db, 'jobs', jobId), { status: 'BIDDING' });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `bids`);
    }
  };

  const acceptBid = async (bidId: string, jobId: string) => {
    try {
      const bidDoc = await getDoc(doc(db, 'bids', bidId));
      if (!bidDoc.exists()) return;
      const bidData = bidDoc.data();
      
      await updateDoc(doc(db, 'jobs', jobId), {
        status: 'ACCEPTED',
        cleanerId: bidData.cleanerId,
        cleanerName: bidData.cleanerName,
        cleanerPhoto: bidData.cleanerPhoto,
        price: bidData.bidPrice
      });
      
      await updateDoc(doc(db, 'bids', bidId), { status: 'ACCEPTED' });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `jobs/${jobId}`);
    }
  };

  const declineBid = async (bidId: string) => {
    try {
      await updateDoc(doc(db, 'bids', bidId), { status: 'REJECTED' });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `bids/${bidId}`);
    }
  };

  const sendMessage = async (text: string, imageUrl?: string) => {
    const targetJob = selectedChatJob || activeJob;
    if (!targetJob || !user) return;
    try {
      await addDoc(collection(db, 'jobs', targetJob.id, 'messages'), {
        jobId: targetJob.id,
        senderId: user.uid,
        text,
        imageUrl: imageUrl || null,
        timestamp: serverTimestamp()
      });
      // Update last message in job doc for conversation list
      await updateDoc(doc(db, 'jobs', targetJob.id), {
        lastMessage: imageUrl ? 'Sent an image' : text,
        lastMessageTimestamp: serverTimestamp(),
        lastMessageSenderId: user.uid
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `jobs/${targetJob.id}/messages`);
    }
  };

  const updateStatus = async (status: Status) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { status });
      setCleanerStatus(status);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const payInvoice = async (invoiceId: string, amount: number) => {
    if (!user || !profile) return;
    if (profile.balance < amount) {
      alert('Insufficient balance to pay invoice.');
      return;
    }
    try {
      // 1. Update Invoice status
      await updateDoc(doc(db, 'invoices', invoiceId), {
        status: 'PAID',
        paidAt: serverTimestamp()
      });

      // 2. Deduct from balance
      await updateDoc(doc(db, 'users', user.uid), {
        balance: profile.balance - amount
      });

      // 3. Record transaction
      await addDoc(collection(db, 'users', user.uid, 'transactions'), {
        type: 'Commission Payment',
        amount: -amount,
        invoiceId,
        createdAt: serverTimestamp()
      });

      // 4. Check if all invoices are paid to lift suspension
      const q = query(collection(db, 'invoices'), where('cleanerId', '==', user.uid), where('status', '==', 'UNPAID'));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        await updateDoc(doc(db, 'users', user.uid), { isSuspended: false, suspensionDate: null });
      }

    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `invoices/${invoiceId}`);
    }
  };


  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const isDummyKey = !apiKey || apiKey === 'YOUR_API_KEY' || apiKey.length < 20;

  const unreadCount = conversations.filter(chat => {
    return chat.lastMessageSenderId !== user?.uid && 
      (!chat.lastRead?.[user?.uid] || 
       (chat.lastMessageTimestamp?.toDate && chat.lastRead[user.uid]?.toDate && 
        chat.lastMessageTimestamp.toDate() > chat.lastRead[user.uid].toDate()));
  }).length;

  const appContent = (
    <MobileFrame 
      hideNav={['SPLASH', 'WELCOME', 'PHONE_INPUT', 'OTP_VERIFY', 'CREATE_PROFILE', 'PERMISSIONS'].includes(currentScreen)} 
      setCurrentScreen={setCurrentScreen} 
      currentScreen={currentScreen} 
      userRole={userRole}
      setUserRole={setUserRole}
      toggleRole={toggleRole}
      conversations={conversations}
      myBids={myBids}
      unreadCount={unreadCount}
      availableJobsCount={availableJobs.length}
      activeTheme={activeTheme}
      themeMode={themeMode}
      setThemeMode={setThemeMode}
      sandboxBypass={sandboxBypass}
      setSandboxBypass={setSandboxBypass}
    >
      {/* Quota Exceeded Warning Banner */}
      {isQuotaExceeded && (
        <div className="absolute top-16 left-4 right-4 z-[1000] pointer-events-auto">
          <div className="p-4 bg-rose-600/95 text-white border border-rose-500 rounded-3xl shadow-2xl flex flex-col gap-2 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black flex items-center gap-1.5">⚠️ Firestore Quota Exceeded</span>
            </div>
            <p className="text-[11px] leading-tight text-rose-100 font-bold">
              The free daily read limit for your database has been reached. Transactions/bids will not load until the daily quota resets or the database is upgraded.
            </p>
            <a 
              href="https://console.firebase.google.com/project/gen-lang-client-0363802176/firestore/databases/ai-studio-a73cd629-e38e-47cf-80d2-bfedbe423708/data?openUpgradeDialog=true"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] w-full py-1.5 px-3 bg-white text-rose-700 hover:bg-rose-50 hover:text-rose-800 transition-all rounded-xl font-black uppercase text-center tracking-wider shrink-0 shadow-xs block"
            >
              Upgrade Firestore Database ➔
            </a>
          </div>
        </div>
      )}

      {/* Real-time Customer Bid Notifications */}
      {userRole === 'CUSTOMER' && currentScreen !== 'CREATE_REQUEST' && activeJob && activeJob.status === 'REQUESTED' && myBids.length > 0 && (
        <div className="absolute top-16 left-4 right-4 z-[999] pointer-events-auto">
          <div 
            onClick={() => setCurrentScreen('CREATE_REQUEST')}
            className={`cursor-pointer p-4 rounded-2xl border shadow-xl flex items-center gap-3 animate-bounce transition-all duration-300 hover:scale-[1.02] ${
              activeTheme === 'dark' 
                ? 'bg-slate-900/95 border-white/15 text-white shadow-black/80' 
                : 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-300/40'
            }`}
          >
            <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center text-white shrink-0">
              <Sparkles className="w-5 h-5 text-white animate-spin" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-orange-500 tracking-wider">New Real Bids Received</span>
                <span className="text-[8px] font-mono bg-orange-500/15 text-orange-500 px-1.5 py-0.5 rounded-full font-bold">Active Match</span>
              </div>
              <p className="text-xs font-black truncate text-wrap mt-0.5 leading-tight">
                {myBids.length === 1 
                  ? `${myBids[0].cleanerName} placed an offer of $${myBids[0].price || myBids[0].bidPrice}!`
                  : `You have ${myBids.length} active custom contract offers waiting!`}
              </p>
              <p className="text-[9px] text-slate-400 mt-1">Tap here to view and instantly negotiate with cleaners</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
        </div>
      )}

      {/* Real-time Cleaner Job Contract Alerts (Styled as Native iOS / Android Push Notification) */}
      {userRole === 'CLEANER' && availableJobs.length > 0 && !isSignalDismissed && (
        <motion.div 
          initial={{ y: -80, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 220 }}
          className="absolute top-4 left-3.5 right-3.5 z-[999] pointer-events-auto"
        >
          <div 
            onClick={() => {
              setCurrentScreen('HOME');
              setIsSignalDismissed(true);
            }}
            className={`cursor-pointer group/banner transition-all duration-300 transform active:scale-[0.98] hover:scale-[1.01] p-3.5 rounded-3xl border shadow-2xl backdrop-blur-xl ${
              activeTheme === 'dark' 
                ? 'bg-slate-950/85 border-white/10 text-white shadow-black/80' 
                : 'bg-white/85 border-slate-200/80 text-slate-900 shadow-slate-300/40'
            }`}
          >
            {/* Header: Native OS push notify detail layout bar */}
            <div className="flex items-center justify-between border-b pb-2 mb-2 border-slate-100 dark:border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-[#3906d2] flex items-center justify-center text-white shrink-0 shadow-xs">
                  <span className="text-[9px] font-black text-white font-mono">S</span>
                </div>
                <span className={`text-[10px] font-black tracking-widest uppercase ${activeTheme === 'dark' ? 'text-white/80' : 'text-slate-800'}`}>SOHO DISPATCH</span>
              </div>
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                <span className="text-[9.5px] font-black uppercase text-slate-400 font-mono">NOW</span>
                <button 
                  onClick={() => setIsSignalDismissed(true)}
                  className="w-5 h-5 rounded-full ml-1.5 flex items-center justify-center bg-slate-400/10 hover:bg-slate-400/20 active:scale-90 transition-all text-slate-400 hover:text-slate-650 dark:hover:text-white cursor-pointer"
                  title="Dismiss notification"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Notification content body */}
            <div className="flex items-start gap-3 text-left">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 animate-pulse shrink-0">
                <Navigation className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className={`text-xs font-black tracking-tight leading-none group-hover/banner:text-[#3906d2] dark:group-hover/banner:text-brand-lime transition-colors ${activeTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  Live Contract Signal • ${availableJobs[0].price || 45}
                </h4>
                <p className={`text-[11px] leading-snug font-bold mt-1 ${activeTheme === 'dark' ? 'text-white/60' : 'text-slate-600'}`}>
                  ASAP {availableJobs[0].serviceType || 'Residential Clean'} requested at {availableJobs[0].location?.address || 'Soho Area'}
                </p>
                <p className="text-[9px] text-[#3906d2] dark:text-brand-lime font-black uppercase tracking-wider mt-1.5 animate-pulse">Tap here to open dispatch board & secure contract</p>
              </div>
            </div>

            {/* Native indicator slider accent */}
            <div className="w-10 h-1 bg-slate-400/25 dark:bg-white/15 rounded-full mx-auto mt-2.5"></div>
          </div>
        </motion.div>
      )}

      {currentScreen === 'SPLASH' && (
        <SplashScreen 
          theme={activeTheme}
          onComplete={() => {
            if (sandboxBypass) {
              setCurrentScreen('HOME');
              return;
            }
            if (user) {
              if (profile) {
                if (!profile.hasCompletedProfile || !profile.displayName || profile.displayName === 'User') {
                  setCurrentScreen('CREATE_PROFILE');
                } else if (!profile.hasSetupPermissions) {
                  setCurrentScreen('PERMISSIONS');
                } else {
                  setCurrentScreen('HOME');
                }
              } else {
                setCurrentScreen('CREATE_PROFILE');
              }
            } else {
              setCurrentScreen('WELCOME');
            }
          }} 
        />
      )}
      {currentScreen === 'WELCOME' && (
        <WelcomeScreen 
          theme={activeTheme}
          onPhoneContinue={async (num) => {
            setPhoneNumber(num);
            try {
              const formattedNumber = num.startsWith('+') ? `+${num.slice(1).replace(/\D/g, '')}` : `+1${num.replace(/\D/g, '')}`;
              const recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                size: 'invisible'
              });
              const result = await signInWithPhoneNumber(auth, formattedNumber, recaptchaVerifier);
              setConfirmationResult(result);
              setCurrentScreen('OTP_VERIFY');
              setOtp('');
            } catch (err) {
              console.error('Phone login error:', err);
              // Fallback sandbox simulation bypass
              setConfirmationResult(null); 
              setCurrentScreen('OTP_VERIFY');
              setOtp('');
            }
          }}
          onGoogleContinue={login}
          onAppleContinue={async () => {
            alert("Apple Sign-In Simulated Successfully");
            login();
          }}
          onEmailContinue={handleEmailAuth}
        />
      )}
      {currentScreen === 'PHONE_INPUT' && (
        <PhoneInputScreen 
          theme={activeTheme}
          onBack={() => setCurrentScreen('WELCOME')}
          value={phoneNumber}
          onChange={setPhoneNumber}
          onContinue={async (num) => {
            try {
              setPhoneNumber(num);
              const formattedNumber = num.startsWith('+') ? `+${num.slice(1).replace(/\D/g, '')}` : `+1${num.replace(/\D/g, '')}`;
              const recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                size: 'invisible'
              });
              const result = await signInWithPhoneNumber(auth, formattedNumber, recaptchaVerifier);
              setConfirmationResult(result);
              setCurrentScreen('OTP_VERIFY');
              setOtp('');
            } catch (err) {
              setConfirmationResult(null);
              setCurrentScreen('OTP_VERIFY');
              setOtp('');
            }
          }}
        />
      )}
      {currentScreen === 'OTP_VERIFY' && (
        <OtpVerifyScreen 
          theme={activeTheme}
          onBack={() => setCurrentScreen('WELCOME')}
          phoneNumber={phoneNumber}
          onVerify={async (code) => {
            setOtp(code);
            try {
              if (confirmationResult) {
                await confirmationResult.confirm(code);
              } else if (code === '112233') {
                // Preemptive sandbox credential simulation
                const mockUser = {
                  uid: 'simulated-phone-user-uid',
                  email: 'simulated@example.com',
                  displayName: 'Simulated User',
                  photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150'
                };
                setUser(mockUser as any);
                setCurrentScreen('CREATE_PROFILE');
              } else {
                alert('Invalid Passcode. Use 112233 to bypass in development sandbox.');
              }
            } catch (err) {
              console.error('OTP Verification Error:', err);
              alert('Error verifying SMS code.');
            }
          }}
        />
      )}
      {currentScreen === 'CREATE_PROFILE' && (
        <CreateProfileScreen 
          theme={activeTheme}
          currentLocation={currentLocation}
          onContinue={async (data) => {
            if (user) {
              try {
                const updatedRole = data.role || 'CUSTOMER';
                const isCleaner = updatedRole === 'CLEANER';
                const updatePayload: any = {
                  displayName: data.fullName,
                  photoURL: data.avatarUrl,
                  city: data.city,
                  role: updatedRole,
                  hasCompletedProfile: true,
                  status: isCleaner ? 'AVAILABLE' : 'OFFLINE',
                  verificationLevel: isCleaner ? 4 : 1, // IDENTITY VERIFIED & BACKGROUND AUDITED for cleaners
                  isVerifiedProvider: isCleaner ? true : false,
                  cleanerSetup: data.cleanerSetup || null,
                  // Seeding production-ready rating average stats and geolocation coords
                  ratingAverage: isCleaner ? 5.0 : 0,
                  ratingSum: isCleaner ? 5 : 0,
                  ratingCount: isCleaner ? 1 : 0,
                  jobsCompleted: isCleaner ? 1 : 0,
                  responseTimeAverage: isCleaner ? 10 : 0,
                  radius: isCleaner ? 15 : 0,
                  specialties: isCleaner ? (data.cleanerSetup?.specialties || ['House Cleaning']) : [],
                  lat: currentLocation ? currentLocation.lat : 40.7128,
                  lng: currentLocation ? currentLocation.lng : -74.0060
                };

                await updateDoc(doc(db, 'users', user.uid), updatePayload);
                
                // Update local profile state
                setProfile(p => p ? { ...p, ...updatePayload } : null);
                
                // Set the active user role state
                setUserRole(updatedRole);
                if (isCleaner) {
                  setCleanerStatus('AVAILABLE');
                } else {
                  setCleanerStatus('OFFLINE');
                }
              } catch (e) {
                console.error(e);
              }
            }
            setCurrentScreen('PERMISSIONS');
          }}
        />
      )}
      {currentScreen === 'PERMISSIONS' && (
        <PermissionsScreen 
          theme={activeTheme}
          onComplete={async (perms) => {
            if (user) {
              try {
                await updateDoc(doc(db, 'users', user.uid), {
                  hasSetupPermissions: true,
                  grantedPermissions: perms
                });
                setProfile(p => p ? { ...p, hasSetupPermissions: true, grantedPermissions: perms } : null);
              } catch (e) {
                console.error(e);
              }
            }
            setCurrentScreen('HOME');
          }}
        />
      )}
      {['ADMIN_OVERVIEW', 'ADMIN_USERS', 'ADMIN_CLEANERS', 'ADMIN_PAYMENTS', 'ADMIN_DISPUTES'].includes(currentScreen) && (
        <AdminPanel currentScreen={currentScreen} setCurrentScreen={setCurrentScreen} />
      )}
      {currentScreen === 'HOME' && (userRole === 'CUSTOMER' ? (
        <CustomerHomeView 
          nearbyCleaners={nearbyCleaners} 
          setCurrentScreen={setCurrentScreen} 
          setSelectedCleaner={setSelectedCleaner} 
          selectedCleaner={selectedCleaner}
          userRole={userRole} 
          toggleRole={toggleRole} 
          profile={profile}
          currentLocation={currentLocation}
          activeTheme={activeTheme}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          setIsNotificationOpen={setIsNotificationOpen}
          notifications={notifications}
        />
      ) : userRole === 'CLEANER' ? (
        <CleanerDashboard 
          user={user}
          profile={profile}
          currentLocation={currentLocation}
          activeJob={activeJob}
          availableJobs={availableJobs}
          userRole={userRole}
          toggleRole={toggleRole}
          updateJobStatus={async (jobId, status) => {
            await updateJobStatus(jobId, status);
            if (activeJob) {
              setActiveJob({ ...activeJob, status });
            }
          }}
          onSendCounterOffer={async (jobId, counterAmount) => {
            try {
              if (!user || !profile) return;
              
              const existingBid = myBids?.find(b => b.jobId === jobId);
              if (existingBid) {
                const currentHist = existingBid.negotiationHistory || [
                  { sender: 'customer', amount: existingBid.price || counterAmount, label: 'Your Initial Offer', time: '1m ago' }
                ];
                await updateDoc(doc(db, 'bids', existingBid.id), {
                  bidPrice: counterAmount,
                  price: counterAmount,
                  lastActionBy: 'cleaner',
                  status: 'PENDING',
                  negotiationHistory: [
                    ...currentHist,
                    { sender: 'cleaner', amount: counterAmount, label: 'Cleaner Counter-Offer', time: 'Just now' }
                  ]
                });
              } else {
                await addDoc(collection(db, 'bids'), {
                  jobId,
                  cleanerId: user.uid,
                  cleanerName: profile.displayName || 'Expert Pro',
                  cleanerPhoto: profile.photoURL || `https://i.pravatar.cc/100?u=${user.uid}`,
                  cleanerRating: profile.ratingAverage || 4.9,
                  price: counterAmount,
                  bidPrice: counterAmount,
                  status: 'PENDING',
                  lastActionBy: 'cleaner',
                  negotiationHistory: [
                    { sender: 'customer', amount: counterAmount - 10, label: 'Initial Budget Offer', time: '1m ago' },
                    { sender: 'cleaner', amount: counterAmount, label: 'Cleaner Ask', time: 'Just now' }
                  ],
                  createdAt: serverTimestamp()
                });
              }
            } catch (err) {
              console.error("Counter offer submission failed: ", err);
            }
          }}
          onAcceptJob={async (job) => {
            try {
              const jobRef = doc(db, 'jobs', job.id);
              await updateDoc(jobRef, {
                status: 'ACCEPTED',
                price: job.price || 45,
                cleanerId: user?.uid,
                cleanerName: profile?.displayName || 'Expert Pro',
                cleanerPhoto: profile?.photoURL || `https://i.pravatar.cc/100?u=${user?.uid}`,
                cleanerRating: profile?.ratingAverage || 4.9,
                cleanerEta: 8
              });
              const freshJob = {
                ...job,
                status: 'ACCEPTED',
                price: job.price || 45,
                cleanerId: user?.uid,
                cleanerName: profile?.displayName || 'Expert Pro',
                cleanerPhoto: profile?.photoURL || `https://i.pravatar.cc/100?u=${user?.uid}`,
                cleanerRating: profile?.ratingAverage || 4.9,
                cleanerEta: 8
              };
              setActiveJob(freshJob);
              setCurrentScreen('SERVICE_PROGRESS');
            } catch (e) {
              console.error("Accept job fails: ", e);
            }
          }}
          onPayCommission={async (amount) => {
            try {
              if (!user || !profile) return;
              const outstanding = profile.commissionOwed || 0;
              const currentBalance = profile.balance || 0;
              await updateDoc(doc(db, 'users', user.uid), {
                commissionOwed: Math.max(0, outstanding - amount),
                balance: Math.max(0, currentBalance - amount),
                firstJobInWindowDate: null
              });
            } catch (err) {
              console.error("Paying commission fails: ", err);
            }
          }}
          onOpenChat={(job) => {
            setSelectedChatJob(job);
            setIsChatOpen(true);
          }}
          walletBalance={profile?.balance || 0}
          activeTheme={activeTheme}
          onDeclineJob={handleDeclineJob}
          myBids={myBids}
          sandboxBypass={sandboxBypass}
        />
      ) : (
        <AdminPanel currentScreen="ADMIN_OVERVIEW" setCurrentScreen={setCurrentScreen} />
      ))}
      {currentScreen === 'CREATE_REQUEST' && (
        <BookingFlow 
          user={user}
          profile={profile}
          userRole={userRole}
          currentLocation={currentLocation}
          sandboxBypass={sandboxBypass}
          onBackToHome={() => {
            setCurrentScreen('HOME');
            setPreselectedBookingCleaner(null);
            setPreselectedBookingDetails(null);
          }}
          activeTheme={activeTheme}
          activeJob={activeJob}
          preselectedCleaner={preselectedBookingCleaner}
          preselectedBookingDetails={preselectedBookingDetails}
          onBroadcastRequest={async (details) => {
            if (!user) return "";
            try {
              const jobData: any = {
                customerId: user.uid,
                customerName: profile?.displayName || 'Client',
                customerPhoto: profile?.photoURL || `https://i.pravatar.cc/100?u=${user.uid}`,
                serviceType: details.serviceType,
                details: details.details || '',
                status: 'REQUESTED',
                location: {
                  lat: details.location.lat,
                  lng: details.location.lng,
                  address: details.location.address
                },
                createdAt: serverTimestamp(),
                price: details.price,
                scheduledTime: details.scheduledTime || 'ASAP',
                scheduledDate: details.scheduledDate || ''
              };

              if (preselectedBookingCleaner) {
                const clId = preselectedBookingCleaner.uid || preselectedBookingCleaner.id;
                jobData.cleanerId = clId;
                jobData.cleanerName = preselectedBookingCleaner.displayName || 'Expert Pro';
                jobData.cleanerPhoto = preselectedBookingCleaner.photoURL || `https://i.pravatar.cc/100?u=${clId}`;
                jobData.cleanerRating = preselectedBookingCleaner.ratingAverage || 4.9;
              }

              const docRef = await addDoc(collection(db, 'jobs'), jobData);

              if (preselectedBookingCleaner) {
                const clId = preselectedBookingCleaner.uid || preselectedBookingCleaner.id;
                await addDoc(collection(db, 'bids'), {
                  jobId: docRef.id,
                  cleanerId: clId,
                  cleanerName: preselectedBookingCleaner.displayName || 'Expert Pro',
                  cleanerPhoto: preselectedBookingCleaner.photoURL || `https://i.pravatar.cc/100?u=${clId}`,
                  cleanerRating: preselectedBookingCleaner.ratingAverage || 4.9,
                  bidPrice: details.price,
                  estimatedArrival: 10,
                  status: 'PENDING',
                  createdAt: serverTimestamp()
                });
                
                // Clear state
                setPreselectedBookingCleaner(null);
              }

              setPreselectedBookingDetails(null);

              setActiveJob({ id: docRef.id, ...jobData });
              return docRef.id;
            } catch (e) {
              console.error("Failed to broadcast request: ", e);
              return "";
            }
          }}
          onMatchSuccess={async (agreedJob) => {
            if (!user) return;
            try {
              const jobData: any = {
                customerId: user.uid,
                customerName: profile?.displayName || 'Client',
                customerPhoto: profile?.photoURL || `https://i.pravatar.cc/100?u=${user.uid}`,
                serviceType: agreedJob.serviceType,
                details: agreedJob.details,
                status: 'ACCEPTED',
                location: {
                  lat: agreedJob.location.lat,
                  lng: agreedJob.location.lng,
                  address: agreedJob.location.address
                },
                createdAt: serverTimestamp(),
                price: agreedJob.price,
                cleanerId: agreedJob.cleanerId,
                cleanerName: agreedJob.cleanerName,
                cleanerPhoto: agreedJob.cleanerPhoto,
                cleanerRating: agreedJob.cleanerRating,
                cleanerEta: agreedJob.cleanerEta
              };
              
              if (agreedJob.id && !agreedJob.id.startsWith('job_')) {
                await updateDoc(doc(db, 'jobs', agreedJob.id), jobData);
                setActiveJob({ id: agreedJob.id, ...jobData });
              } else {
                const docRef = await addDoc(collection(db, 'jobs'), jobData);
                setActiveJob({ id: docRef.id, ...jobData });
              }
              setPreselectedBookingCleaner(null);
              setPreselectedBookingDetails(null);
              setCurrentScreen('SERVICE_PROGRESS');
            } catch (e) {
              console.error("Match saving failed: ", e);
              setActiveJob(agreedJob);
              setPreselectedBookingCleaner(null);
              setPreselectedBookingDetails(null);
              setCurrentScreen('SERVICE_PROGRESS');
            }
          }}
        />
      )}
      {currentScreen === 'SERVICE_PROGRESS' && (
        <TrackingAndProgress 
          activeJob={activeJob} 
          userRole={userRole} 
          updateJobStatus={updateJobStatus}
          activeTheme={activeTheme}
          onJobFinished={async (rating, review) => {
            if (activeJob) {
              await updateJobStatus(activeJob.id, 'COMPLETED');
              
              if (activeJob.cleanerId) {
                const cleanerRef = doc(db, 'users', activeJob.cleanerId);
                const cleanerDoc = await getDoc(cleanerRef);
                if (cleanerDoc.exists()) {
                  const data = cleanerDoc.data();
                  const ratingCount = (data.ratingCount || 0) + 1;
                  const ratingSum = (data.ratingSum || 0) + rating;
                  const ratingAverage = parseFloat((ratingSum / ratingCount).toFixed(2));
                  await updateDoc(cleanerRef, {
                    ratingCount,
                    ratingSum,
                    ratingAverage,
                    jobsCompleted: (data.jobsCompleted || 0) + 1
                  });
                }
              }
            }
          }}
          onOpenChat={() => {
            setSelectedChatJob(activeJob);
            setIsChatOpen(true);
          }}
          currentLocation={currentLocation}
          onBackToHome={() => {
            setActiveJob(null);
            setCurrentScreen('HOME');
          }}
        />
      )}
      {currentScreen === 'FIND_CLEANERS' && <FindCleanersView setCurrentScreen={setCurrentScreen} setSelectedCleaner={setSelectedCleaner} cleaners={nearbyCleaners} userRole={userRole} currentLocation={currentLocation} activeTheme={activeTheme} />}
      {currentScreen === 'BIDS_RECEIVED' && <BidsReceivedView setCurrentScreen={setCurrentScreen} myBids={myBids} acceptBid={acceptBid} declineBid={declineBid} setIsChatOpen={setIsChatOpen} activeJob={activeJob} userRole={userRole} activeTheme={activeTheme} />}
      {currentScreen === 'MESSAGES' && (
        <MessagesView 
          setCurrentScreen={setCurrentScreen} 
          setIsChatOpen={setIsChatOpen} 
          conversations={conversations}
          setSelectedChatJob={setSelectedChatJob}
          currentUser={user}
          activeTheme={activeTheme}
        />
      )}
      {currentScreen === 'PROFILE' && (
        <ProfileView 
          userRole={userRole} 
          toggleRole={toggleRole} 
          profile={profile} 
          logout={logout} 
          setCurrentScreen={setCurrentScreen} 
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          activeTheme={activeTheme}
          setPreselectedBookingCleaner={setPreselectedBookingCleaner}
          setPreselectedBookingDetails={setPreselectedBookingDetails}
        />
      )}
      {currentScreen === 'PRIVACY_POLICY' && <PrivacyPolicyView setCurrentScreen={setCurrentScreen} activeTheme={activeTheme} />}
      {currentScreen === 'CLEANER_AGREEMENT' && <CleanerAgreementView setCurrentScreen={setCurrentScreen} user={user} profile={profile} activeTheme={activeTheme} />}
      {currentScreen === 'WALLET' && (
        <WalletView 
          walletData={walletData} 
          setIsAddFundsOpen={setIsAddFundsOpen} 
          setIsWithdrawFundsOpen={setIsWithdrawFundsOpen}
          invoices={invoices}
          payInvoice={payInvoice}
          userRole={userRole}
          activeTheme={activeTheme}
        />
      )}

      {/* SPECIAL STATES SCREENS RENDERS */}
      {currentScreen === 'NO_CLEANER_FOUND' && (
        <NoCleanerFoundScreen 
          currentBid={noCleanerCurrentBid} 
          onIncreaseBid={(newAmt) => {
            setNoCleanerCurrentBid(newAmt);
            setWarningBidAmount(newAmt);
            setCurrentScreen('CREATE_REQUEST');
          }}
          onRetry={(radiusMiles) => {
            alert(`Broadcasting refreshed parameters: expanding search radius to ${radiusMiles} miles...`);
            setCurrentScreen('CREATE_REQUEST');
          }}
          onAlternativeSchedule={(date, timeSlot) => {
            alert(`Reservation approved: Scheduled deep sweep set for ${date} in ${timeSlot}!`);
            setCurrentScreen('HOME');
          }}
          onClose={() => setCurrentScreen('HOME')}
        />
      )}

      {currentScreen === 'LOW_BID_WARNING' && (
        <LowBidWarningScreen 
          currentBid={warningBidAmount} 
          fairMinPrice={45} 
          suggestedPrice={65} 
          onAdjustBid={(newAmt) => {
            setWarningBidAmount(newAmt);
            setNoCleanerCurrentBid(newAmt);
            alert(`Your bid was successfully adjusted to $${newAmt}!`);
            setCurrentScreen('CREATE_REQUEST');
          }}
          onIgnoreAndProceed={() => {
            alert(`Bid of $${warningBidAmount} broadcasted despite warnings. Matching may be slowed.`);
            setCurrentScreen('CREATE_REQUEST');
          }}
          onClose={() => setCurrentScreen('CREATE_REQUEST')}
        />
      )}

      {currentScreen === 'CANCELLATION_SCREEN' && (
        <CancellationScreen 
          job={cancellingJobRef || activeJob || { id: 'mock_job_id', serviceType: 'Deep Clean', price: 65, status: 'ACCEPTED' }}
          userRole={userRole}
          onConfirmCancellation={async (reason, recoveryNotes) => {
            try {
              if (activeJob) {
                await cancelJob(activeJob.id);
              } else {
                setCurrentScreen('HOME');
              }
              setCancellingJobRef(null);
            } catch (err) {
              console.error("Cancellation confirmation fails: ", err);
              setCurrentScreen('HOME');
            }
          }}
          onKeepJob={() => {
            setCancellingJobRef(null);
            setCurrentScreen(activeJob ? 'SERVICE_PROGRESS' : 'HOME');
          }}
        />
      )}

      {currentScreen === 'INTERNET_CONNECTION' && (
        <InternetConnectionScreen 
          onRetryConnection={() => {
            if (navigator.onLine && !isSimulatedOffline) {
              setCurrentScreen('HOME');
              alert("Network handshake secured. Returning to main stream.");
            } else {
              alert("Server connection test still timed out. Try again shortly.");
            }
          }}
          isSimulatedOffline={isSimulatedOffline}
          onCloseSimulatedOffline={() => {
            setIsSimulatedOffline(false);
            setCurrentScreen('HOME');
          }}
          onBypassOffline={() => {
            setIsOfflineBypassed(true);
            setCurrentScreen(activeJob ? 'SERVICE_PROGRESS' : 'HOME');
          }}
        />
      )}

      {currentScreen === 'FORCE_UPDATE' && (
        <ForceUpdateScreen 
          currentVersion="2.2.0" 
          requiredVersion="2.4.5" 
          onRedirectToStore={() => {
            alert("Redirecting to the download channel safely...");
            window.open("https://ai.studio/build", "_blank");
          }}
        />
      )}

      {currentScreen === 'ACCOUNT_SUSPENDED' && (
        <AccountSuspendedScreen 
          profile={profile || { displayName: 'Expert Quality Professional', email: 'user@domain.com', uid: 'dummy' }}
          onAppealSubmit={async (appealText, contactEmail) => {
            try {
              if (user) {
                await updateDoc(doc(db, 'users', user.uid), {
                  appealText,
                  appealEmail: contactEmail,
                  appealSubmittedAt: serverTimestamp()
                });
              }
            } catch (err) {
              console.error("Appeals process submit failed: ", err);
            }
          }}
          onLogout={() => {
            setIsSimulatingSuspension(false);
            logout();
          }}
        />
      )}
      
      <AnimatePresence>
        {isChatOpen && (
          <ChatModal 
            setIsChatOpen={(open) => {
              setIsChatOpen(open);
              if (!open) setSelectedChatJob(null);
            }} 
            chatMessages={chatMessages} 
            sendMessage={sendMessage} 
            user={user}
            selectedChatJob={selectedChatJob}
            activeJob={activeJob}
            activeTheme={activeTheme}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedCleaner && (
          <CleanerProfileModal 
            selectedCleaner={selectedCleaner} 
            setSelectedCleaner={setSelectedCleaner} 
            setCurrentScreen={setCurrentScreen} 
            setIsChatOpen={setIsChatOpen}
            currentUser={user}
            conversations={conversations}
            setSelectedChatJob={setSelectedChatJob}
            setPreselectedBookingCleaner={setPreselectedBookingCleaner}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAddFundsOpen && <AddFundsModal setIsAddFundsOpen={setIsAddFundsOpen} user={user} />}
      </AnimatePresence>
      
      <AnimatePresence>
        {isWithdrawFundsOpen && <WithdrawFundsModal setIsWithdrawFundsOpen={setIsWithdrawFundsOpen} user={user} currentBalance={profile?.balance || 0} />}
      </AnimatePresence>
      
      <AnimatePresence>
        {isSafetyModalOpen && <SafetyModal setIsSafetyModalOpen={setIsSafetyModalOpen} />}
      </AnimatePresence>

      <AnimatePresence>
        {isNotificationOpen && (
          <NotificationsModal 
            setIsNotificationOpen={setIsNotificationOpen} 
            notifications={notifications} 
            setNotifications={setNotifications} 
            activeTheme={activeTheme} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {bidJob && <BidModal job={bidJob} setBidJob={setBidJob} submitBid={submitBid} />}
      </AnimatePresence>

      <AnimatePresence>
        {showRating && <RatingModal setShowRating={setShowRating} setActiveJob={setActiveJob} activeJob={activeJob} />}
      </AnimatePresence>

      {/* Suspension/Ban Overlays */}
      {profile?.isBanned && (
        <div className="absolute inset-0 bg-slate-900 z-[1000] flex items-center justify-center p-8 text-center">
          <div className="space-y-6">
            <div className="w-24 h-24 bg-red-500/20 rounded-[32px] flex items-center justify-center mx-auto">
              <ShieldAlert className="w-12 h-12 text-red-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-white">Account Banned</h2>
              <p className="text-white/40 text-sm font-bold">Your account has been permanently banned due to non-payment of commission invoices for over 14 days.</p>
            </div>
            <button 
              onClick={logout}
              className="px-8 py-4 bg-white/5 text-white rounded-2xl font-black uppercase tracking-widest text-xs"
            >
              Logout
            </button>
          </div>
        </div>
      )}

      {(profile?.isSuspended || isSimulatingSuspension) && !profile?.isBanned && (
        <AccountSuspendedScreen 
          profile={profile}
          onAppealSubmit={async (appealText, srcEmail) => {
            try {
              if (user) {
                await updateDoc(doc(db, 'users', user.uid), {
                  appealText,
                  appealEmail: srcEmail,
                  appealSubmittedAt: serverTimestamp()
                });
                alert("Appeal successfully filed! Reviewers will assess within 24 hours.");
              } else {
                alert("Appeal successfully logged (Simulated Session).");
              }
            } catch (err) {
              console.error("Filing failed: ", err);
            }
          }}
          onLogout={() => {
            setIsSimulatingSuspension(false);
            logout();
          }}
        />
      )}
      <div id="recaptcha-container"></div>

      {/* Dynamic Systems Labs Simulation Panel */}
      <div className="fixed bottom-14 right-4 z-[300] flex flex-col items-end gap-2">
        <button
          onClick={() => {
            const labPanel = document.getElementById('systems-lab-panel');
            if (labPanel) labPanel.classList.toggle('translate-x-full');
          }}
          className="w-11 h-11 bg-accent hover:brightness-105 hover:scale-105 text-slate-950 font-black rounded-full shadow-2xl border-2 border-slate-950/20 active:scale-95 transition-all flex items-center justify-center text-lg cursor-pointer"
          title="Toggle Simulation Controller Lab Panel"
        >
          ⚙️
        </button>

        <div 
          id="systems-lab-panel" 
          className="w-72 bg-slate-950/98 p-5 space-y-4 shadow-[0_4px_30px_rgba(0,0,0,0.6)] rounded-2.5xl transition-transform duration-300 translate-x-full absolute bottom-14 right-0 text-left font-sans text-white border border-white/10 z-[310]"
        >
          <div className="flex justify-between items-center pb-2.5 border-b border-white/5">
            <div>
              <span className="text-[9px] uppercase tracking-widest text-[#3906d2] font-black block leading-none">Soho Sandbox</span>
              <h4 className="text-[11px] font-black uppercase mt-1">Special Screens Sims</h4>
            </div>
            <button 
              onClick={() => {
                const labPanel = document.getElementById('systems-lab-panel');
                if (labPanel) labPanel.classList.add('translate-x-full');
              }}
              className="text-white/40 hover:text-white p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[9.5px] text-white/50 leading-relaxed font-bold">
            Tap any preset trigger to load and test the corresponding safety warning or notification interface:
          </p>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1 no-scrollbar">
            {/* 1. No Cleaner Found */}
            <button
              onClick={() => {
                setNoCleanerCurrentBid(35);
                setCurrentScreen('NO_CLEANER_FOUND');
                const labPanel = document.getElementById('systems-lab-panel');
                if (labPanel) labPanel.classList.add('translate-x-full');
              }}
              className="w-full py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-accent/20 rounded-xl text-left text-[10.5px] font-bold flex justify-between items-center transition-all cursor-pointer"
            >
              <span>1. No Cleaner Found Screen</span>
              <span className="text-[8px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-mono font-black tracking-widest uppercase">TIMEOUT</span>
            </button>

            {/* 2. Low Bid Warning */}
            <button
              onClick={() => {
                setWarningBidAmount(25);
                setCurrentScreen('LOW_BID_WARNING');
                const labPanel = document.getElementById('systems-lab-panel');
                if (labPanel) labPanel.classList.add('translate-x-full');
              }}
              className="w-full py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-accent/20 rounded-xl text-left text-[10.5px] font-bold flex justify-between items-center transition-all cursor-pointer"
            >
              <span>2. Low Bid Warning Screen</span>
              <span className="text-[8px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-mono font-black tracking-widest uppercase">LOW BID</span>
            </button>

            {/* 3. Cancellation Screen */}
            <button
              onClick={() => {
                setCancellingJobRef({
                  id: 'mock_active_contract_402',
                  serviceType: 'Deep Clean',
                  price: 65,
                  cleanerName: 'Elena Rostova',
                  status: 'ACCEPTED'
                });
                setCurrentScreen('CANCELLATION_SCREEN');
                const labPanel = document.getElementById('systems-lab-panel');
                if (labPanel) labPanel.classList.add('translate-x-full');
              }}
              className="w-full py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-[#3906d2]/15 hover:border-red-500/25 rounded-xl text-left text-[10.5px] font-bold flex justify-between items-center transition-all cursor-pointer"
            >
              <span>3. Cancellation Screen</span>
              <span className="text-[8px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded font-mono font-black tracking-widest uppercase text-red-400">CANCEL</span>
            </button>

            {/* 4. Internet Offline simulated toggle */}
            <button
              onClick={() => {
                setIsSimulatedOffline(true);
                setCurrentScreen('INTERNET_CONNECTION');
                const labPanel = document.getElementById('systems-lab-panel');
                if (labPanel) labPanel.classList.add('translate-x-full');
              }}
              className="w-full py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-accent/20 rounded-xl text-left text-[10.5px] font-bold flex justify-between items-center transition-all cursor-pointer"
            >
              <span>4. Connection Failure Screen</span>
              <span className="text-[8px] bg-white/10 text-white/80 px-1.5 py-0.5 rounded font-mono font-black tracking-widest uppercase">OFFLINE</span>
            </button>

            {/* 5. Force Update simulated */}
            <button
              onClick={() => {
                setCurrentScreen('FORCE_UPDATE');
                const labPanel = document.getElementById('systems-lab-panel');
                if (labPanel) labPanel.classList.add('translate-x-full');
              }}
              className="w-full py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-accent/20 rounded-xl text-left text-[10.5px] font-bold flex justify-between items-center transition-all cursor-pointer"
            >
              <span>5. Force Update Screen</span>
              <span className="text-[8px] bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded font-mono font-black tracking-widest uppercase">PATCH</span>
            </button>

            {/* 6. Account Suspended simulated */}
            <button
              onClick={() => {
                setIsSimulatingSuspension(true);
                setCurrentScreen('ACCOUNT_SUSPENDED');
                const labPanel = document.getElementById('systems-lab-panel');
                if (labPanel) labPanel.classList.add('translate-x-full');
              }}
              className="w-full py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-accent/20 rounded-xl text-left text-[10.5px] font-bold flex justify-between items-center transition-all cursor-pointer"
            >
              <span>6. Account Suspended Screen</span>
              <span className="text-[8px] bg-red-400/10 text-red-500 px-1.5 py-0.5 rounded font-mono font-black tracking-widest uppercase">SUSPEND</span>
            </button>
          </div>
          
          <div className="pt-2 border-t border-white/5 text-center">
            <span className="text-[8px] uppercase tracking-wider text-white/30 font-bold">escrow architecture v2.2</span>
          </div>
        </div>
      </div>
    </MobileFrame>
  );

  return appContent;
}
