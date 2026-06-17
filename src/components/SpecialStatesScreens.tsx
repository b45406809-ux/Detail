import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, RefreshCw, ArrowUpRight, Calendar, Clock, DollarSign, 
  HelpCircle, ShieldAlert, X, ChevronRight, Check, WifiOff, RefreshCcw, 
  Sparkles, ShieldCheck, Mail, Send, LogOut, Download, AlertOctagon, Info, Map
} from 'lucide-react';

// ==========================================
// 1. NO CLEANER FOUND SCREEN
// ==========================================
interface NoCleanerFoundScreenProps {
  currentBid: number;
  onIncreaseBid: (newAmount: number) => void;
  onRetry: (radiusMiles: number) => void;
  onAlternativeSchedule: (date: string, timeSlot: string) => void;
  onClose: () => void;
}

export function NoCleanerFoundScreen({
  currentBid,
  onIncreaseBid,
  onRetry,
  onAlternativeSchedule,
  onClose
}: NoCleanerFoundScreenProps) {
  const [adjustedBid, setAdjustedBid] = useState(currentBid);
  const [expandRadius, setExpandRadius] = useState(3); // miles
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [isAlternativeSubmitted, setIsAlternativeSubmitted] = useState(false);

  const timeSlots = [
    "08:00 AM - 11:00 AM (Morning Sweep)",
    "11:30 AM - 02:30 PM (Mid-day Standard)",
    "03:00 PM - 06:00 PM (Afternoon Recovery)",
    "06:30 PM - 09:30 PM (Evening Premium)"
  ];

  const handleRetrySubmit = () => {
    setIsRetrying(true);
    setTimeout(() => {
      setIsRetrying(false);
      onRetry(expandRadius);
    }, 1500);
  };

  const handleAlternativeSubmit = () => {
    if (!selectedDate || !selectedTimeSlot) {
      alert("Please select a date and time slot first.");
      return;
    }
    setIsAlternativeSubmitted(true);
    setTimeout(() => {
      onAlternativeSchedule(selectedDate, selectedTimeSlot);
    }, 1500);
  };

  const speedMultiplier = adjustedBid >= currentBid + 30 ? "⚡️ 3x Instant Match" : 
                          adjustedBid >= currentBid + 15 ? "✨ 2x Faster Match" : "Standard Speed";

  return (
    <div className="absolute inset-0 z-50 bg-slate-950 text-white overflow-y-auto no-scrollbar pb-10 flex flex-col font-sans">
      {/* Upper Navigation Header */}
      <div className="pt-12 px-6 pb-4 flex items-center justify-between border-b border-white/5 bg-slate-900/40">
        <button onClick={onClose} className="p-2 -ml-2 rounded-xl active:bg-white/10 transition-colors">
          <X className="w-5 h-5 text-white/70" />
        </button>
        <h1 className="text-sm font-black uppercase tracking-widest text-amber-400">Match Timeout</h1>
        <div className="w-10"></div>
      </div>

      <div className="p-6 space-y-6 flex-1 max-w-md mx-auto w-full">
        {/* Core Magnifying Radar Scanning Offline Graphic */}
        <div className="text-center space-y-3 py-4">
          <div className="relative inline-block mx-auto">
            {/* Pulsing warning waves */}
            <div className="absolute inset-0 rounded-full border border-amber-500/20 bg-amber-500/5 blur-[4px] animate-ping duration-3000"></div>
            <div className="w-20 h-20 rounded-[28px] bg-slate-900 border border-amber-500/30 flex items-center justify-center shadow-lg relative z-10">
              <ShieldAlert className="w-9 h-9 text-amber-400 animate-pulse" />
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black text-white tracking-tight uppercase">No Cleaners Found In Radius</h2>
            <p className="text-xs text-white/50 leading-relaxed max-w-xs mx-auto">
              Your ASAP dispatch offer went unanswered inside the standard matching window. Professionals are active but filtering higher-margin contracts.
            </p>
          </div>
        </div>

        {/* SECTION A: INCREASE BID SUGGESTION (MANDATORY REQUIREMENT) */}
        <div className="p-5 rounded-2.5xl bg-white/5 border border-white/10 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-accent rounded-full"></span>
            <h3 className="text-xs font-black text-white/80 uppercase tracking-widest">1. Boost Bidding Limit</h3>
          </div>
          <p className="text-[10px] text-white/40 leading-normal">
            Bumping your contract's value instantly flags your request on nearby cleaners' dashboards with high-priority color rings.
          </p>

          <div className="space-y-3">
            {/* Presets Grid */}
            <div className="grid grid-cols-3 gap-2">
              {[15, 25, 35].map(amt => (
                <button
                  key={amt}
                  onClick={() => setAdjustedBid(currentBid + amt)}
                  className={`py-2.5 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    adjustedBid === currentBid + amt 
                      ? 'bg-accent text-slate-950 border-accent font-black shadow-lg shadow-accent/15' 
                      : 'bg-white/5 border-white/5 text-white/70 hover:border-white/10'
                  }`}
                >
                  +${amt} Boost
                </button>
              ))}
            </div>

            {/* Custom Interactive Slider */}
            <div className="p-3 bg-slate-900 rounded-xl space-y-2 border border-white/5">
              <div className="flex justify-between items-center">
                <span className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Adjusted Bid Amount</span>
                <span className="text-md font-black text-accent">${adjustedBid}</span>
              </div>
              <input
                type="range"
                min={currentBid}
                max={currentBid + 100}
                step={5}
                value={adjustedBid}
                onChange={(e) => setAdjustedBid(parseInt(e.target.value))}
                className="w-full accent-accent bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[8px] text-white/30 font-mono">
                <span>Default ${currentBid}</span>
                <span>Max booster ${currentBid + 100}</span>
              </div>
            </div>

            {/* Simulated match speed indicator */}
            <div className="p-2.5 bg-accent/10 border border-accent/25 rounded-lg flex items-center justify-between text-[10px] font-black uppercase text-accent">
              <span>Match Expectation:</span>
              <span className="font-heavy">{speedMultiplier}</span>
            </div>

            {adjustedBid > currentBid && (
              <button
                onClick={() => {
                  onIncreaseBid(adjustedBid);
                  alert(`Bid amount increased from $${currentBid} to $${adjustedBid}! Broadcasting updated price...`);
                }}
                className="w-full py-3 bg-accent text-slate-950 font-black rounded-xl text-[10px] uppercase tracking-widest hover:brightness-105 active:scale-98 transition-all"
              >
                Apply & Update Contract Price
              </button>
            )}
          </div>
        </div>

        {/* SECTION B: RETRY OPTIONS (MANDATORY REQUIREMENT) */}
        <div className="p-5 rounded-2.5xl bg-white/5 border border-white/10 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
            <h3 className="text-xs font-black text-white/80 uppercase tracking-widest">2. Filter Radius Expansion</h3>
          </div>
          <p className="text-[10px] text-white/40 leading-normal">
            Didn't get bids? Try expanding your search zone to recruit high-rated professionals who live slightly further but own rapid transit vehicles.
          </p>

          <div className="space-y-4">
            {/* Radius slider selection */}
            <div className="grid grid-cols-3 gap-2">
              {[3, 5, 8].map(mi => (
                <button
                  key={mi}
                  onClick={() => setExpandRadius(mi)}
                  className={`py-2 rounded-xl border text-[10px] uppercase tracking-wider font-bold transition-all ${
                    expandRadius === mi 
                      ? 'bg-white text-slate-950 border-white' 
                      : 'bg-white/5 border-white/5 text-white/60'
                  }`}
                >
                  {mi} Mile Grid
                </button>
              ))}
            </div>

            <button
              onClick={handleRetrySubmit}
              disabled={isRetrying}
              className="w-full py-3 bg-white/10 border border-white/15 hover:bg-white/15 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all text-white"
            >
              <RefreshCw className={`w-4 h-4 text-accent ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? "Recalibrating Radius..." : `Broadcast Request within ${expandRadius}mi`}
            </button>
          </div>
        </div>

        {/* SECTION C: ALTERNATIVE SCHEDULING (MANDATORY REQUIREMENT) */}
        <div className="p-5 rounded-2.5xl bg-white/5 border border-white/10 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-violet-400 rounded-full"></span>
            <h3 className="text-xs font-black text-white/80 uppercase tracking-widest">3. Pick Alternative Time</h3>
          </div>
          <p className="text-[10px] text-white/40 leading-normal">
            Convert this job into a standard calendar reservation. Scheduled jobs are extremely popular and have a 99.4% booking success rate.
          </p>

          <div className="space-y-3 text-left">
            {/* Date input */}
            <div className="space-y-1">
              <label className="text-[9px] uppercase tracking-wider text-white/40 font-bold block">Choose Calendar Date</label>
              <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full p-3 bg-slate-900 border border-white/10 rounded-xl font-bold text-xs outline-none text-white focus:border-accent"
                />
              </div>
            </div>

            {/* Time Slots selector carousel */}
            <div className="space-y-1">
              <label className="text-[9px] uppercase tracking-wider text-white/40 font-bold block">Available Booking Windows</label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 no-scrollbar">
                {timeSlots.map(slot => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedTimeSlot(slot)}
                    className={`w-full p-2.5 rounded-lg border text-left text-[10px] font-bold transition-all flex justify-between items-center ${
                      selectedTimeSlot === slot 
                        ? 'bg-white/15 border-accent text-white' 
                        : 'bg-white/5 border-white/5 text-white/60 hover:border-white/10'
                    }`}
                  >
                    <span>{slot}</span>
                    {selectedTimeSlot === slot && <Check className="w-3 h-3 text-accent shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleAlternativeSubmit}
              disabled={isAlternativeSubmitted}
              className="w-full py-3 bg-gradient-to-r from-[#3906d2] to-[#27049c] text-white font-black rounded-xl text-[10px] uppercase tracking-widest hover:brightness-105 transition-all text-center flex items-center justify-center gap-1.5"
            >
              {isAlternativeSubmitted ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Saving Appointment Slot...
                </>
              ) : (
                "Convert to Calendar Contract"
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}


// ==========================================
// 2. LOW BID WARNING SCREEN
// ==========================================
interface LowBidWarningScreenProps {
  currentBid: number;
  fairMinPrice: number;
  suggestedPrice: number;
  onAdjustBid: (newAmount: number) => void;
  onIgnoreAndProceed: () => void;
  onClose: () => void;
}

export function LowBidWarningScreen({
  currentBid,
  fairMinPrice,
  suggestedPrice,
  onAdjustBid,
  onIgnoreAndProceed,
  onClose
}: LowBidWarningScreenProps) {
  const [interactiveAdjust, setInteractiveAdjust] = useState(suggestedPrice);

  const calculateMatchingRate = () => {
    if (interactiveAdjust < fairMinPrice) return { rate: "15%", style: "text-red-400 bg-red-400/5 border-red-500/10", label: "Critically Low Response Chance" };
    if (interactiveAdjust < suggestedPrice) return { rate: "55%", style: "text-amber-400 bg-amber-400/5 border-amber-400/10", label: "Moderate Response Chance" };
    return { rate: "92%", style: "text-emerald-400 bg-[#3906d2]/5 border-[#3906d2]/15", label: "Extremely Dynamic Match Speed" };
  };

  const matcher = calculateMatchingRate();

  return (
    <div className="absolute inset-0 z-50 bg-slate-950 text-white overflow-y-auto no-scrollbar pb-10 flex flex-col font-sans">
      <div className="pt-12 px-6 pb-4 flex items-center justify-between border-b border-white/5 bg-slate-900/40">
        <button onClick={onClose} className="p-2 -ml-2 rounded-xl active:bg-white/10 transition-colors">
          <X className="w-5 h-5 text-white/70" />
        </button>
        <h1 className="text-sm font-black uppercase tracking-widest text-[#3906d2]">Contract Advice</h1>
        <div className="w-10"></div>
      </div>

      <div className="p-6 space-y-6 flex-1 max-w-md mx-auto w-full text-left">
        {/* Warning Indicator */}
        <div className="text-center space-y-3 py-3">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 border-2 border-amber-500/20 flex items-center justify-center mx-auto text-amber-400 text-2xl animate-pulse">
            ⚠️
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight uppercase">Low Bidding Alert</h2>
            <p className="text-xs text-white/50 leading-relaxed max-w-xs mx-auto mt-1">
              Your bidding price of <span className="text-white font-black">${currentBid}</span> is listed under our zone's fair-wage thresholds.
            </p>
          </div>
        </div>

        {/* SECTION A: FAIR MARKET PRICE WARNINGS (MANDATORY REQUIREMENT) */}
        <div className="p-5 rounded-2.5xl bg-white/5 border border-white/10 space-y-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block">⚡️ Soho Market Context</span>
          
          <div className="space-y-3">
            <p className="text-[10px] text-white/70 leading-relaxed">
              Nearby certified professionals pay laundry costs, travel fees, and a platform licensing royalty fee. Below average offers generally remain unassigned:
            </p>

            {/* Price Index Meter Bar Row */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[9px] font-bold text-white/40">
                <span>Soho Median Clean Standard</span>
                <span>${fairMinPrice} - ${suggestedPrice}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden flex">
                <div className="bg-red-500 w-[30%]"></div>
                <div className="bg-amber-400 w-[40%]"></div>
                <div className="bg-emerald-400 w-[30%]"></div>
              </div>
              <div className="flex justify-between text-[8px] text-white/30 font-mono">
                <span>Low Chance (${currentBid})</span>
                <span>Fair Zone (${fairMinPrice})</span>
                <span>Generous Zone (${suggestedPrice}+)</span>
              </div>
            </div>

            {/* List of factors */}
            <div className="space-y-1.5 pt-1.5 border-t border-white/5 text-[9.5px] text-white/50 leading-snug">
              <div className="flex gap-2 items-center">
                <span className="text-red-400">⚡️</span>
                <span>Average supply costs & detergent overhead: ~ $12.00</span>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-red-400">⚡️</span>
                <span>Subway/taxi travel time allocation: ~ 40 minutes transport</span>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-red-400">⚡️</span>
                <span>Contract secure escrow insurance levy coverage: standard</span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION B: SUGGESTED BID ADJUSTMENTS (MANDATORY REQUIREMENT) */}
        <div className="p-5 rounded-2.5xl bg-white/5 border border-white/10 space-y-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-accent block">🚀 Instant Adjustments</span>
          
          <div className="space-y-4">
            {/* Auto Fix Selector Option */}
            <button
              onClick={() => {
                onAdjustBid(suggestedPrice);
                alert(`Perfect choice! Your contract price has been optimized to $${suggestedPrice} for immediate booking.`);
                onClose();
              }}
              className="w-full p-4.5 bg-gradient-to-br from-[#3906d2]/20 to-slate-900 border border-[#3906d2]/30 rounded-2xl flex justify-between items-center text-left hover:border-accent hover:scale-[1.01] transition-all cursor-pointer"
            >
              <div>
                <span className="text-[9px] uppercase tracking-widest text-accent font-black block">RECOMMENDED AI ADJUSTMENT</span>
                <span className="text-sm font-black text-white">Optimize to ${suggestedPrice}</span>
                <p className="text-[9px] text-white/40 mt-1">Locks in average Soho wages & instant responder queues.</p>
              </div>
              <ArrowUpRight className="w-5 h-5 text-accent shrink-0 animate-bounce" />
            </button>

            {/* Manual Slider adjustment widget */}
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold">
                <span className="text-white/50 uppercase tracking-widest">Fine-Tune Bid</span>
                <span className="text-accent font-black">${interactiveAdjust}</span>
              </div>
              <input
                type="range"
                min={currentBid}
                max={suggestedPrice + 40}
                step={2}
                value={interactiveAdjust}
                onChange={(e) => setInteractiveAdjust(parseInt(e.target.value))}
                className="w-full accent-accent bg-white/10 h-1.5 rounded-lg cursor-pointer"
              />
            </div>

            {/* Calculated match probability widget */}
            <div className={`p-4 rounded-xl border flex items-center justify-between text-left ${matcher.style} transition-all`}>
              <div>
                <span className="text-[8px] uppercase tracking-widest font-black opacity-60">Estimated Match Probability</span>
                <p className="text-xs font-black">{matcher.label}</p>
              </div>
              <span className="text-xl font-mono font-black">{matcher.rate}</span>
            </div>

            {/* Slider Action Apply */}
            <button
              onClick={() => {
                onAdjustBid(interactiveAdjust);
                alert(`Price adjusted to $${interactiveAdjust}! Broadcasting updated contract...`);
                onClose();
              }}
              className="w-full py-3.5 bg-accent text-slate-950 font-black rounded-xl text-xs uppercase tracking-[0.15em] text-center shadow-lg active:scale-95 transition-transform"
            >
              Apply Selected Bid: ${interactiveAdjust}
            </button>
          </div>
        </div>

        {/* IGNORE WARNING CTA */}
        <div className="pt-2 text-center">
          <button
            onClick={onIgnoreAndProceed}
            className="text-[10px] uppercase font-black tracking-widest text-white/30 hover:text-white/60 underline"
          >
            Decide later, broadcast ${currentBid} contract now ➔
          </button>
        </div>
      </div>
    </div>
  );
}


// ==========================================
// 3. CANCELLATION SCREEN
// ==========================================
interface CancellationScreenProps {
  job: {
    id: string;
    serviceType: string;
    price: number;
    cleanerName?: string;
    status: string;
    createdAt?: any;
  } | null;
  userRole: 'CUSTOMER' | 'CLEANER';
  onConfirmCancellation: (reason: string, recoveryNotes: string) => void;
  onKeepJob: () => void;
}

export function CancellationScreen({
  job,
  userRole,
  onConfirmCancellation,
  onKeepJob
}: CancellationScreenProps) {
  const [selectedReason, setSelectedReason] = useState('');
  const [recoveryNotes, setRecoveryNotes] = useState('');
  const [agreeToPolicy, setAgreeToPolicy] = useState(false);
  const [isCancelllingLoading, setIsCancellingLoading] = useState(false);

  const customerReasons = [
    "Unexpected change of schedule",
    "Estimated arrival time is too long for my booking",
    "Cleaner did not respond to logistics chats",
    "Found an alternative cleaning option",
    "Accidentally broadcasted incorrect bid price",
    "Other/Personal logic"
  ];

  const cleanerReasons = [
    "Traffic jam / vehicle logistics breakdown",
    "Double booked calendar listing discrepancy",
    "Safety concerns regarding site conditions",
    "Clean-up requirements exceed my catalog capabilities",
    "Personal health emergency",
    "Other/Transit block"
  ];

  const activeReasons = userRole === 'CUSTOMER' ? customerReasons : cleanerReasons;

  // Penalty structures
  const penaltyAmount = userRole === 'CUSTOMER' ? 8.00 : 15.00;
  const refundPercent = 100;
  
  const handleFinalCancel = () => {
    if (!selectedReason) {
      alert("Please select a cancellation reason.");
      return;
    }
    if (!agreeToPolicy) {
      alert("You must agree to the contract termination and refund terms.");
      return;
    }

    setIsCancellingLoading(true);
    setTimeout(() => {
      setIsCancellingLoading(false);
      onConfirmCancellation(selectedReason, recoveryNotes);
    }, 1500);
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-950 text-white overflow-y-auto no-scrollbar pb-10 flex flex-col font-sans">
      <div className="pt-12 px-6 pb-4 flex items-center justify-between border-b border-white/5 bg-slate-900/40">
        <button onClick={onKeepJob} className="p-2 -ml-2 rounded-xl active:bg-white/10 transition-colors">
          <X className="w-5 h-5 text-white/70" />
        </button>
        <h1 className="text-sm font-black uppercase tracking-widest text-red-400">Cancel Contract</h1>
        <div className="w-10"></div>
      </div>

      <div className="p-6 space-y-6 flex-1 max-w-md mx-auto w-full text-left">
        {/* Caution Display */}
        <div className="text-center space-y-2 py-2">
          <div className="w-14 h-14 bg-red-500/10 border border-red-500/25 rounded-2xl flex items-center justify-center mx-auto text-red-400">
            <X className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-white uppercase">Cancel Match Request?</h2>
            <p className="text-[11px] text-white/55 max-w-xs mx-auto leading-relaxed mt-1">
              Terminating a confirmed escort / sweep reservation affects match scoring. Please review penalty terms.
            </p>
          </div>
        </div>

        {/* SECTION A: CANCELLATION REASONS (MANDATORY REQUIREMENT) */}
        <div className="space-y-3">
          <h3 className="text-xs font-black text-white/50 uppercase tracking-widest font-mono">1. Select Incident Reason</h3>
          
          <div className="space-y-2">
            {activeReasons.map((reason, index) => (
              <button
                key={index}
                onClick={() => setSelectedReason(reason)}
                className={`w-full p-3.5 rounded-xl border text-left text-xs font-bold transition-all flex items-center gap-3 cursor-pointer ${
                  selectedReason === reason 
                    ? 'bg-red-500/10 border-red-500 text-white' 
                    : 'bg-white/5 border-white/5 text-white/60 hover:border-white/10'
                }`}
              >
                <div className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  selectedReason === reason ? 'border-red-500' : 'border-white/25'
                }`}>
                  {selectedReason === reason && <div className="w-2 h-2 bg-red-500 rounded-full" />}
                </div>
                <span className="leading-snug">{reason}</span>
              </button>
            ))}
          </div>

          <textarea
            value={recoveryNotes}
            onChange={(e) => setRecoveryNotes(e.target.value)}
            placeholder="Help our support desk review logs. Add any additional notes about what went wrong..."
            className="w-full min-h-[80px] p-3.5 bg-slate-900 border border-white/10 rounded-xl focus:border-red-400 outline-none text-xs font-bold text-white resize-none mt-2"
          />
        </div>

        {/* SECTION B: PENALTY HANDLING (MANDATORY REQUIREMENT) */}
        <div className="p-4.5 bg-red-500/10 border border-red-500/15 rounded-2xl space-y-3">
          <div className="flex gap-2 items-center">
            <AlertOctagon className="w-4.5 h-4.5 text-red-400 shrink-0" />
            <span className="text-[10px] font-black uppercase text-red-400 tracking-wider">Cancellation & Fair Play Policy</span>
          </div>

          {userRole === 'CUSTOMER' ? (
            <p className="text-[9.5px] text-white/70 leading-relaxed">
              If you cancel within <span className="font-bold text-white">5 minutes</span> of contract binding: <span className="font-bold text-white text-emerald-400">FREE</span>. Cancellations occurring later trigger a fee of <span className="font-mono text-white font-bold">${penaltyAmount.toFixed(2)}</span> to compensate professionals for transit mileage loss.
            </p>
          ) : (
            <p className="text-[9.5px] text-white/70 leading-relaxed">
              Professionals who cancel accepted reservations within 30 minutes of arrival window forfeit active rank scores. Repeat cancellations may lead to permanent account suspension.
            </p>
          )}

          <div className="p-2.5 bg-slate-900 rounded-lg flex items-center justify-between text-[9px] font-bold border border-white/5 text-white/50 font-mono">
            <span>Deducted Fine Allocation:</span>
            <span className="text-red-400">${penaltyAmount.toFixed(2)}</span>
          </div>
        </div>

        {/* SECTION C: REFUND FLOW (MANDATORY REQUIREMENT) */}
        <div className="p-5 bg-white/5 border border-white/10 rounded-2.5xl space-y-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#3906d2] block">💰 Escrow Release & Refund Ledger</span>
          
          <div className="divide-y divide-white/5 text-[11px] font-bold space-y-2.5">
            <div className="flex justify-between items-center text-white/55 pt-1">
              <span>Paid Contract Value</span>
              <span className="font-mono">${job ? job.price : 65}</span>
            </div>
            
            <div className="flex justify-between items-center text-white/55 pt-2">
              <span>Cancellation Fee</span>
              <span className="font-mono text-red-400">-${penaltyAmount.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center pt-2 text-[#3906d2] font-black">
              <span>Immediate Refund Back to Wallet</span>
              <span className="text-base font-mono">${Math.max(0, (job ? job.price : 65) - penaltyAmount).toFixed(2)}</span>
            </div>
          </div>

          <p className="text-[9px] text-white/30 italic leading-snug">
            Security Guarantee: Funds are credited directly back to your secure in-app Wallet instantly, ready for alternative contract bids search. No credit card lag.
          </p>
        </div>

        {/* Policy check verification */}
        <label className="flex items-start gap-3 p-2 bg-white/5 rounded-xl border border-white/5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreeToPolicy}
            onChange={(e) => setAgreeToPolicy(e.target.checked)}
            className="w-4.5 h-4.5 rounded text-red-500 border-white/20 bg-slate-900 shrink-0 mt-0.5 focus:ring-0 cursor-pointer"
          />
          <span className="text-[9.5px] text-white/60 leading-normal font-bold">
            I understand and authorize the refund and fee deduction breakdown structured above.
          </span>
        </label>

        {/* CTAs */}
        <div className="grid grid-cols-2 gap-3.5 pt-2">
          <button
            type="button"
            onClick={onKeepJob}
            className="py-3 bg-white/10 border border-white/10 rounded-xl font-black text-[10px] uppercase tracking-wider text-[#3906d2]"
          >
            Go Back / Keep Contract
          </button>
          
          <button
            type="button"
            onClick={handleFinalCancel}
            disabled={!agreeToPolicy || !selectedReason || isCancelllingLoading}
            className={`py-3 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all text-center ${
              agreeToPolicy && selectedReason
                ? 'bg-red-500 text-white shadow-lg active:scale-95'
                : 'bg-slate-900 border border-white/5 text-white/25 cursor-not-allowed'
            }`}
          >
            {isCancelllingLoading ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                Refunding...
              </>
            ) : (
              "Confirm & Cancel"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}


// ==========================================
// 4. INTERNET CONNECTION / OFFLINE SCREEN
// ==========================================
interface InternetConnectionScreenProps {
  onRetryConnection: () => void;
  isSimulatedOffline?: boolean;
  onCloseSimulatedOffline?: () => void;
  onBypassOffline?: () => void;
}

export function InternetConnectionScreen({
  onRetryConnection,
  isSimulatedOffline,
  onCloseSimulatedOffline,
  onBypassOffline
}: InternetConnectionScreenProps) {
  const [testingConnection, setTestingConnection] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  const handleManualTest = () => {
    setTestingConnection(true);
    setTimeout(() => {
      setTestingConnection(false);
      onRetryConnection();
    }, 1500);
  };

  return (
    <div className="absolute inset-0 z-[100] bg-slate-950 text-white flex flex-col justify-center items-center p-6 font-sans">
      <div className="max-w-xs text-center space-y-6">
        
        {/* Beautiful connection offline indicator */}
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 rounded-full border border-red-500/20 bg-red-500/5 animate-pulse"></div>
          <div className="absolute inset-2 rounded-full border-2 border-dashed border-red-500/30 flex items-center justify-center bg-slate-900">
            <WifiOff className="w-8 h-8 text-red-400" />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-xl font-black text-white tracking-tight uppercase">Connection Failure</h1>
          <p className="text-xs text-white/50 leading-relaxed font-bold">
            Our real-time bidding stream has lost sync with cloud coordinator. Check your router signal.
          </p>
        </div>

        {/* Simulated offline indicator pill */}
        {isSimulatedOffline && (
          <div className="bg-amber-400/10 border border-amber-400/20 rounded-full py-1 px-3 inline-flex items-center gap-1.5 justify-center mx-auto text-[8px] font-black uppercase text-amber-500 tracking-wider">
            <span>● Simulating Offline Mode</span>
            {onCloseSimulatedOffline && (
              <button 
                onClick={onCloseSimulatedOffline}
                className="w-4 h-4 rounded-full bg-amber-400/10 hover:bg-amber-400/20 text-amber-500 flex items-center justify-center font-bold text-[9px]"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleManualTest}
          disabled={testingConnection}
          className="w-full py-4 bg-[#3906d2] text-white rounded-2xl font-black text-xs uppercase tracking-[0.25em] shadow-xl shadow-[#3906d2]/15 hover:brightness-105 active:scale-[0.97] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <RefreshCcw className={`w-4 h-4 text-slate-900 ${testingConnection ? 'animate-spin' : ''}`} />
          {testingConnection ? "Pinging Servers..." : "Re-test Connection"}
        </button>

        {/* Offline Cache Map Bypass Button */}
        <button
          onClick={onBypassOffline || onCloseSimulatedOffline}
          className="w-full py-4 bg-white/5 hover:bg-white/10 text-brand-lime border border-brand-lime/30 hover:border-brand-lime/60 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Map className="w-4 h-4 text-brand-lime" />
          Continue with Offline Map
        </button>

        {/* DIAGNOSTICS CARDS (MANDATORY REQUIREMENT) */}
        <div className="pt-2">
          <button
            onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}
            className="text-[10px] uppercase font-black tracking-widest text-[#3906d2]/80 hover:text-accent flex items-center gap-1 mx-auto"
          >
            <span>{diagnosticsOpen ? "Hide" : "Show"} Network Diagnostics</span>
            <ChevronRight className={`w-3.5 h-3.5 transform transition-transform ${diagnosticsOpen ? 'rotate-90' : ''}`} />
          </button>

          <AnimatePresence>
            {diagnosticsOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mt-3 text-left"
              >
                <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 space-y-2 font-mono text-[9px] text-white/50">
                  <div className="flex justify-between items-center pb-1 border-b border-white/5">
                    <span>WiFi / Cellular Gateway</span>
                    <span className="text-emerald-400 font-bold uppercase">Online (Standard)</span>
                  </div>
                  <div className="flex justify-between items-center pb-1 border-b border-white/5">
                    <span>Real-Time Socket Connection</span>
                    <span className="text-red-400 font-bold uppercase">Timed out</span>
                  </div>
                  <div className="flex justify-between items-center pb-1 border-b border-white/5">
                    <span>Soho Server IP Route Resolve</span>
                    <span className="text-emerald-400 font-bold uppercase">Resolved Google Cloud DNS</span>
                  </div>
                  <div className="flex justify-between items-center pb-1 border-b border-white/5">
                    <span>Local Database Sync Sync</span>
                    <span className="text-[#3906d2] font-bold">100% Offline Cache Enabled</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Ping latency test ticker</span>
                    <span>14000ms delay</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}


// ==========================================
// 5. FORCE UPDATE SCREEN
// ==========================================
interface ForceUpdateScreenProps {
  currentVersion: string;
  requiredVersion: string;
  onRedirectToStore: () => void;
}

export function ForceUpdateScreen({
  currentVersion,
  requiredVersion,
  onRedirectToStore
}: ForceUpdateScreenProps) {
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloadingSim, setIsDownloadingSim] = useState(false);

  const startDownloadSimulation = () => {
    setIsDownloadingSim(true);
    setDownloadProgress(2);
    const interval = setInterval(() => {
      setDownloadProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          alert("Dynamic build compilation successfully received. Launching fresh app shell now!");
          window.location.reload();
          return 100;
        }
        return p + Math.floor(Math.random() * 12) + 3;
      });
    }, 200);
  };

  return (
    <div className="absolute inset-0 z-[110] bg-slate-950 text-white flex flex-col justify-center items-center p-6 font-sans">
      <div className="max-w-xs text-center space-y-6">
        
        {/* Beautiful vector app icon wrapping */}
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute -inset-1 rounded-[32px] bg-gradient-to-tr from-[#3906d2] to-amber-400 blur-[8px] opacity-35 animate-pulse"></div>
          <div className="absolute inset-0 rounded-[28px] bg-slate-900 border border-white/10 flex items-center justify-center shadow-lg relative z-10">
            <Download className="w-10 h-10 text-accent animate-bounce" />
          </div>
        </div>

        {/* Title / notice */}
        <div className="space-y-2">
          <div className="bg-[#3906d2]/15 text-[#3906d2] border border-[#3906d2]/25 rounded-full py-1 px-3.5 inline-block text-[8px] font-black uppercase tracking-widest leading-none">
            REQUIRED SOFTWARE UPDATE
          </div>
          <h1 className="text-xl font-black text-white tracking-tight uppercase">Upgrade Required</h1>
          <p className="text-xs text-white/50 leading-relaxed font-bold">
            The platform's escrow framework has been patched to support higher security algorithms. To protect active contracts, immediate update is required.
          </p>
        </div>

        {/* Version details card */}
        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex justify-around text-center items-center">
          <div>
            <span className="text-[8px] uppercase tracking-widest text-white/40 block">Current</span>
            <span className="text-xs font-mono font-bold text-white/70">{currentVersion}</span>
          </div>
          <div className="w-px h-6 bg-white/10"></div>
          <div>
            <span className="text-[8px] uppercase tracking-widest text-white/40 block">Prerequisite</span>
            <span className="text-xs font-mono font-black text-accent">{requiredVersion}</span>
          </div>
        </div>

        {/* STORE REDIRECTS ACTIONS (MANDATORY REQUIREMENT) */}
        {!isDownloadingSim ? (
          <div className="space-y-3">
            <button
              onClick={onRedirectToStore}
              className="w-full py-4 bg-[#3906d2] text-white rounded-2xl font-black text-xs uppercase tracking-[0.25em] shadow-xl shadow-[#3906d2]/15 hover:brightness-105 active:scale-[0.97] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Download Pro Build Update</span>
            </button>
            
            <button
              onClick={startDownloadSimulation}
              className="w-full py-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl font-heavy font-black uppercase text-[9px] tracking-widest text-white"
            >
              Simulate Instant Manual Update
            </button>
          </div>
        ) : (
          <div className="space-y-3 p-3.5 bg-white/5 rounded-2xl border border-white/5 text-left font-sans">
            <div className="flex justify-between items-center text-[10px] font-black text-white/80">
              <span className="uppercase tracking-wide animate-pulse">Downloading Secure Packets</span>
              <span>{downloadProgress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
              <div className="bg-accent h-full transition-all duration-200" style={{ width: `${downloadProgress}%` }}></div>
            </div>
            <p className="text-[8px] text-white/40">Verifying signature codes & certificates...</p>
          </div>
        )}

        <p className="text-[9px] text-white/30 italic">
          Compatible with App Store, Google Play Store download channels. Secure cryptographic token: MD5sum verified.
        </p>

      </div>
    </div>
  );
}


// ==========================================
// 6. ACCOUNT SUSPENDED SCREEN
// ==========================================
interface AccountSuspendedScreenProps {
  profile: {
    displayName?: string;
    email?: string;
    uid?: string;
  } | null;
  onAppealSubmit: (appealText: string, contactEmail: string) => void;
  onLogout: () => void;
}

export function AccountSuspendedScreen({
  profile,
  onAppealSubmit,
  onLogout
}: AccountSuspendedScreenProps) {
  const [appealText, setAppealText] = useState('');
  const [contactEmail, setContactEmail] = useState(profile?.email || '');
  const [appealSubmitted, setAppealSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAppealSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!appealText.trim()) {
      alert("Please provide some context or reason to support your appeal.");
      return;
    }
    if (!contactEmail.trim()) {
      alert("Please provide a valid contact email.");
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setAppealSubmitted(true);
      onAppealSubmit(appealText, contactEmail);
    }, 1500);
  };

  return (
    <div className="absolute inset-0 z-[120] bg-slate-950 text-white overflow-y-auto no-scrollbar pb-10 flex flex-col font-sans">
      <div className="pt-12 px-6 pb-4 flex items-center justify-between border-b border-white/5 bg-slate-900/40">
        <button onClick={onLogout} className="p-2 -ml-2 rounded-xl active:bg-white/10 transition-colors flex items-center gap-1.5 text-red-400">
          <LogOut className="w-4.5 h-4.5" />
          <span className="text-[10px] font-black uppercase tracking-wider">Log Out</span>
        </button>
        <h1 className="text-sm font-black uppercase tracking-widest text-red-500">Security Breach</h1>
        <div className="w-10"></div>
      </div>

      <div className="p-6 space-y-6 flex-1 max-w-md mx-auto w-full text-left">
        {/* Core Warning Graphic */}
        <div className="text-center space-y-3 py-3">
          <div className="relative inline-block mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-red-500/20 bg-red-500/5 blur-[5px] animate-pulse"></div>
            <div className="w-16 h-16 rounded-[24px] bg-slate-900 border border-red-500/40 flex items-center justify-center relative z-10 text-red-500 mx-auto">
              <AlertTriangle className="w-8 h-8" />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-white uppercase">Account Suspended</h2>
            <p className="text-xs text-white/50 leading-relaxed max-w-xs mx-auto">
              Welcome, <span className="text-white font-bold">{profile?.displayName || "Expert Professional"}</span>. In-app bidding mechanics are currently locked for your profile.
            </p>
          </div>
        </div>

        {/* SECTION A: VIOLATION NOTICE (MANDATORY REQUIREMENT) */}
        <div className="p-5 rounded-2.5xl bg-red-950/20 border border-red-500/20 space-y-4 text-left">
          <span className="text-[10px] font-black uppercase tracking-widest text-red-400 block">⚠️ Security Policy Logs</span>
          
          <div className="space-y-3 text-[11px] font-bold">
            <div className="p-3 bg-red-500/5 rounded-xl border border-red-500/10 space-y-1 text-[10px] text-white/85">
              <span className="uppercase text-red-400 font-extrabold block">INCIDENT REPORT CODE:</span>
              <p className="font-mono text-white">SYS-RULE-RENEGOTIATE-402x</p>
              <p className="leading-relaxed text-white/60 mt-1">
                Our AI natural language monitor flagged a chat pattern renegotiating agreed contracts. Triggering third-party escrow overrides violates User Conduct agreements.
              </p>
            </div>

            <div className="flex justify-between items-center text-white/50 pt-1 text-[10px]">
              <span>Violation Registry Date:</span>
              <span>2026-05-25 (Soho platform sync)</span>
            </div>
            <div className="flex justify-between items-center text-white/50 text-[10px]">
              <span>Appeals status:</span>
              <span className="text-amber-500 font-bold uppercase">Pending Manual Review</span>
            </div>
          </div>
        </div>

        {/* SECTION B: APPEAL SUBMISSION PROCESS (MANDATORY REQUIREMENT) */}
        {!appealSubmitted ? (
          <form onSubmit={handleAppealSubmit} className="p-5 rounded-2.5xl bg-white/5 border border-white/10 space-y-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#3906d2] block">⚖️ Submit Appeals Petition</span>
            
            <p className="text-[10px] text-white/40 leading-normal">
              Appeals undergo manual analysis by our Soho dispatch center within 24 hours. Provide explicit context regarding the chat log flag.
            </p>

            <div className="space-y-3 text-left">
              <div className="space-y-1">
                <label className="text-[8px] uppercase tracking-wider text-white/40 font-bold block">Contact Email Address</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full p-3 bg-slate-900 border border-white/10 rounded-xl font-bold text-xs outline-none text-white focus:border-accent"
                  placeholder="name@domain.com"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[8px] uppercase tracking-wider text-white/40 font-bold block">Appeal Statement / Context</label>
                <textarea
                  value={appealText}
                  onChange={(e) => setAppealText(e.target.value)}
                  placeholder="Explain why your communication style complied with policies, or details regarding the out-of-escrow negotiations..."
                  className="w-full min-h-[100px] p-3.5 bg-slate-900 border border-white/10 rounded-xl focus:border-accent outline-none text-xs font-bold text-white resize-none"
                  required
                />
              </div>

              {/* Conduct Agree terms */}
              <label className="flex items-start gap-2.5 p-1 bg-white/5 rounded-lg text-[9px] text-white/60 select-none cursor-pointer">
                <input type="checkbox" className="w-4 h-4 text-red-500 rounded bg-slate-900 border-white/10 shrink-0 mt-0.5 cursor-pointer" required />
                <span>I confirm that all provided statements are true under platform licensing penalties.</span>
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 bg-accent text-slate-950 font-black rounded-xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Transmitting encrypted petition...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5 stroke-[2.5px]" />
                    File Official Appeal
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-5 rounded-2.5xl bg-emerald-950/15 border border-emerald-500/20 text-center space-y-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
              <Check className="w-5 h-5 stroke-[3px]" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase text-[#3906d2] tracking-widest">Petition Successfully Filed</h4>
              <p className="text-[10px] text-white/70 leading-relaxed mt-1">
                Your credentials and explanation was signed with IP logs and routed to Soho administrators. We'll reply to <span className="font-bold underline text-white">{contactEmail}</span> within 24 hours.
              </p>
            </div>
          </div>
        )}

        {/* SECTION C: CONTACT SUPPORT DESK (MANDATORY REQUIREMENT) */}
        <div className="p-5 rounded-2.5xl bg-white/5 border border-white/10 space-y-3.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#3906d2] block">📞 Dispatch Support Registry</span>
          <p className="text-[10.5px] text-white/50 leading-relaxed text-left">
            Need live human support? Ring our prompt safety hotline directly, or copy your unique diagnostic token to email.
          </p>
          
          <div className="grid grid-cols-2 gap-3 pt-1">
            <a
              href="mailto:safety@sohosweeps.corp"
              className="py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[9px] font-black tracking-wider uppercase text-white flex items-center justify-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5 text-accent" />
              Email Safety desk
            </a>
            <button
              onClick={() => {
                navigator.clipboard.writeText("DIAG-TOKEN-a73cd629-e38e-47cf-80d2-bfedbe423708");
                alert("Diagnostic safety token copied to clipboard! Share this token with support.");
              }}
              className="py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[9px] font-black tracking-wider uppercase text-white flex items-center justify-center gap-1.5"
            >
              🔐 Copy Token Key
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
