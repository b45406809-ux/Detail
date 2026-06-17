import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, MapPin, X, Camera, Clock, Calendar, Check, Search, 
  AlertCircle, RefreshCw, Star, Info, Shield, DollarSign, 
  ArrowRight, User, Navigation, HelpCircle, Key, Lock, ArrowUpRight,
  TrendingUp, Compass, Award, HeartHandshake, CheckCircle2, MessageSquare,
  ShieldAlert, ShieldCheck
} from 'lucide-react';
import Map, { Marker } from 'react-map-gl';
import maplibregl from 'maplibre-gl';
import { db, addDoc, collection, serverTimestamp, query, where, onSnapshot, updateDoc, doc } from '../firebase';

const OSM_STYLE = "https://tiles.openfreemap.org/styles/dark";

// --- Mock Cleaners for visual matching simulation ---
const MOCK_CLEANERS = [
  {
    uid: 'm-cleaner-1',
    displayName: 'Marcus Vance',
    photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150',
    experienceYears: 4,
    ratingAverage: 4.9,
    jobsCompleted: 342,
    distanceMiles: 0.8,
    etaMinutes: 8,
    initialCounter: 55,
    vehicleType: 'Tesla Model 3 (White)'
  },
  {
    uid: 'm-cleaner-2',
    displayName: 'Elena Rostova',
    photoURL: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150',
    experienceYears: 6,
    ratingAverage: 4.95,
    jobsCompleted: 612,
    distanceMiles: 1.4,
    etaMinutes: 12,
    initialCounter: 70,
    vehicleType: 'Toyota RAV4 (Black)'
  },
  {
    uid: 'm-cleaner-3',
    displayName: 'Damian Chen',
    photoURL: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150',
    experienceYears: 3,
    ratingAverage: 4.8,
    jobsCompleted: 184,
    distanceMiles: 2.1,
    etaMinutes: 16,
    initialCounter: 48,
    vehicleType: 'Honda Civic (Silver)'
  }
];

interface SavedLocation {
  id: string;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  type: 'home' | 'work' | 'other';
}

const DEFAULT_SAVED_LOCATIONS: SavedLocation[] = [
  { id: 'loc-1', name: 'Home Stay', address: '128 Mercer St, Soho', city: 'New York, NY 10012', lat: 40.7233, lng: -74.0017, type: 'home' },
  { id: 'loc-2', name: 'Work Loft', address: '450 Lexington Ave', city: 'New York, NY 10017', lat: 40.7534, lng: -73.9745, type: 'work' },
  { id: 'loc-3', name: 'Spandrel Gym', address: '142 W 24th St', city: 'New York, NY 10011', lat: 40.7441, lng: -73.9944, type: 'other' }
];

interface BookingFlowProps {
  user: any;
  profile: any;
  userRole: string;
  currentLocation: { lat: number, lng: number } | null;
  onBackToHome: () => void;
  onMatchSuccess: (agreedJob: any) => void;
  onBroadcastRequest?: (requestDetails: { serviceType: string; price: number; details: string; location: any; scheduledTime?: string; scheduledDate?: string }) => Promise<string>;
  activeTheme?: 'light' | 'dark';
  activeJob?: any;
  preselectedCleaner?: any;
  preselectedBookingDetails?: {
    serviceType: string;
    price: number;
    location?: { lat: number; lng: number; address: string; city?: string };
    details?: string;
  } | null;
  sandboxBypass?: boolean;
}

type Step = 
  | 'CREATE_REQUEST' 
  | 'LOCATION_PICKER' 
  | 'BID_REVIEW' 
  | 'SEARCHING' 
  | 'INCOMING_OFFERS' 
  | 'COUNTER_OFFER' 
  | 'AGREEMENT_CONFIRMATION';

export function BookingFlow({ 
  user, 
  profile, 
  userRole, 
  currentLocation: userGps, 
  onBackToHome, 
  onMatchSuccess,
  onBroadcastRequest,
  activeTheme = 'light',
  activeJob,
  preselectedCleaner,
  preselectedBookingDetails,
  sandboxBypass = true
}: BookingFlowProps) {
  const isDark = activeTheme === 'dark';
  const cBg = isDark ? 'bg-slate-950' : 'bg-white';
  const cText = isDark ? 'text-white' : 'text-slate-900';
  const cTextMuted = isDark ? 'text-white/50' : 'text-slate-500';
  const cTextMutedLight = isDark ? 'text-white/40' : 'text-slate-400';
  const cBorder = isDark ? 'border-white/10' : 'border-slate-200';
  const cCard = isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-slate-50 border-slate-200 hover:bg-slate-100/75';
  const cInput = isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/20' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400';
  
  const isServiceAvailableForCleaner = (serviceId: string) => {
    if (!preselectedCleaner) return true;
    const specialties = Array.isArray(preselectedCleaner.specialties) ? preselectedCleaner.specialties : ['House Cleaning'];
    if (serviceId === 'Car Detailing') {
      return specialties.includes('Car Detailing');
    } else {
      return specialties.includes('House Cleaning');
    }
  };
  
  
  // Basic Flow States
  const [step, setStep] = useState<Step>(activeJob && activeJob.status === 'REQUESTED' ? 'INCOMING_OFFERS' : 'CREATE_REQUEST');
  
  // Real-time backend Job ID tracker
  const [currentJobId, setCurrentJobId] = useState<string | null>(activeJob && activeJob.status === 'REQUESTED' ? activeJob.id : null);

  // Job & Booking choices
  const [selectedService, setSelectedService] = useState<string>(() => {
    if (preselectedBookingDetails?.serviceType) {
      return preselectedBookingDetails.serviceType;
    }
    if (preselectedCleaner && Array.isArray(preselectedCleaner.specialties)) {
      const hasHouse = preselectedCleaner.specialties.includes('House Cleaning');
      const hasCar = preselectedCleaner.specialties.includes('Car Detailing');
      if (hasCar && !hasHouse) {
        return 'Car Detailing';
      }
    }
    return 'Deep Clean';
  });
  const [selectedVehicle, setSelectedVehicle] = useState('Sedan');
  const [isCarRelated, setIsCarRelated] = useState<boolean>(() => {
    if (preselectedBookingDetails?.serviceType) {
      return preselectedBookingDetails.serviceType === 'Car Detailing';
    }
    if (preselectedCleaner && Array.isArray(preselectedCleaner.specialties)) {
      const hasHouse = preselectedCleaner.specialties.includes('House Cleaning');
      const hasCar = preselectedCleaner.specialties.includes('Car Detailing');
      if (hasCar && !hasHouse) {
        return true;
      }
    }
    return false;
  });
  const [jobDetails, setJobDetails] = useState(preselectedBookingDetails?.details || '');
  const [selectedTime, setSelectedTime] = useState('ASAP');
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [bidAmount, setBidAmount] = useState<number>(() => {
    if (preselectedBookingDetails?.price) {
      return preselectedBookingDetails.price;
    }
    return preselectedCleaner ? (preselectedCleaner.hourlyRate || 40) : 45;
  });
  const [photos, setPhotos] = useState<string[]>([
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=200'
  ]);

  // House Cleaning Service Request Form states based on user PDF
  const [propertySize, setPropertySize] = useState<string>('');
  const [areasToClean, setAreasToClean] = useState<string[]>([]);
  const [cleaningRequired, setCleaningRequired] = useState<string[]>([]);
  const [houseCondition, setHouseCondition] = useState<string>('');
  const [additionalServices, setAdditionalServices] = useState<string[]>([]);
  const [specialInstructionsCheck, setSpecialInstructionsCheck] = useState<string[]>([]);
  const [specialInstructionsOther, setSpecialInstructionsOther] = useState<string>('');

  // Car Cleaning Service Request Form states based on user PDF
  const [carExterior, setCarExterior] = useState<string[]>([]);
  const [carInterior, setCarInterior] = useState<string[]>([]);
  const [carDeep, setCarDeep] = useState<string[]>([]);
  const [carCondition, setCarCondition] = useState<string>('');
  const [carSpecialRequests, setCarSpecialRequests] = useState<string[]>([]);
  const [carSpecialRequestsOther, setCarSpecialRequestsOther] = useState<string>('');

  // Saved and Selected Locations
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>(DEFAULT_SAVED_LOCATIONS);
  const [selectedLocation, setSelectedLocation] = useState<SavedLocation>(() => {
    if (preselectedBookingDetails?.location) {
      return {
        id: 'rebook-loc',
        name: 'Rebooked Location',
        address: preselectedBookingDetails.location.address,
        city: preselectedBookingDetails.location.city || 'Zimbabwe',
        lat: preselectedBookingDetails.location.lat,
        lng: preselectedBookingDetails.location.lng,
        type: 'home'
      };
    }
    return {
      id: 'current-gps',
      name: 'Current Location',
      address: '742 Broadway, Greenwich Village',
      city: 'New York, NY 10003',
      lat: userGps?.lat || 40.7295,
      lng: userGps?.lng || -73.9965,
      type: 'home'
    };
  });

  // Location Picker Interactive States
  const [pickerState, setPickerState] = useState({
    latitude: preselectedBookingDetails?.location?.lat || userGps?.lat || 40.7295,
    longitude: preselectedBookingDetails?.location?.lng || userGps?.lng || -73.9965,
    zoom: 15
  });
  const [pickerAddress, setPickerAddress] = useState(() => {
    if (preselectedBookingDetails?.location) {
      return preselectedBookingDetails.location.address;
    }
    return '742 Broadway, Greenwich Village';
  });
  const [pickerCity, setPickerCity] = useState(() => {
    if (preselectedBookingDetails?.location) {
      return preselectedBookingDetails.location.city || 'New York, NY 10003';
    }
    return 'New York, NY 10003';
  });
  const [tempLocationName, setTempLocationName] = useState('Custom Pin Point');
  const [savedLocationType, setSavedLocationType] = useState<'home' | 'work' | 'other'>('home');

  // Searching State Simulation
  const [cleanersScanned, setCleanersScanned] = useState(0);
  const [offersReceivedCount, setOffersReceivedCount] = useState(0);

  // Offers & Counter offer States
  const [loadingBids, setLoadingBids] = useState<boolean>(true);
  const [cleanerOffers, setCleanerOffers] = useState<any[]>([]);
  const [activeNegotiatingCleaner, setActiveNegotiatingCleaner] = useState<any>(null);
  const [negotiationTimeline, setNegotiationTimeline] = useState<any[]>([]);
  const [counterInputAmount, setCounterInputAmount] = useState<number>(0);

  // Agreement Confirmation States
  const [finalAgreedPrice, setFinalAgreedPrice] = useState<number>(45);
  const [assignedCleaner, setAssignedCleaner] = useState<any>(null);

  // Quick Wallet Top-up States
  const [depositAmount, setDepositAmount] = useState<number>(50);
  const [isDepositing, setIsDepositing] = useState<boolean>(false);

  // Nominatim Reverse Geocoding helper
  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`, {
        headers: { 'Accept-Language': 'en' }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.address) {
          const road = data.address.road || data.address.pedestrian || data.address.suburb || 'Custom Location';
          const houseNumber = data.address.house_number ? data.address.house_number + ' ' : '';
          const street = houseNumber + road;
          const city = data.address.city || data.address.town || data.address.village || data.address.county || 'Metro Area';
          const state = data.address.state || '';
          const postcode = data.address.postcode || '';
          const locationCity = [city, state, postcode].filter(Boolean).join(', ');
          return { address: street, city: locationCity };
        }
      }
    } catch (err) {
      console.error("Failed to reverse geocode:", err);
    }
    return null;
  };

  // Tracking GPS
  useEffect(() => {
    if (userGps) {
      setSelectedLocation(prev => ({
        ...prev,
        lat: userGps.lat,
        lng: userGps.lng
      }));
      setPickerState(prev => ({
        ...prev,
        latitude: userGps.lat,
        longitude: userGps.lng
      }));
      // Resolve actual address on startup
      reverseGeocode(userGps.lat, userGps.lng).then(res => {
        if (res) {
          setSelectedLocation(prev => ({
            ...prev,
            address: res.address,
            city: res.city
          }));
          setPickerAddress(res.address);
          setPickerCity(res.city);
        }
      });
    }
  }, [userGps]);

  // Debounced Map Drag Geocoding
  useEffect(() => {
    if (step !== 'LOCATION_PICKER') return;
    const timer = setTimeout(async () => {
      const res = await reverseGeocode(pickerState.latitude, pickerState.longitude);
      if (res) {
        setPickerAddress(res.address);
        setPickerCity(res.city);
      }
    }, 850);
    return () => clearTimeout(timer);
  }, [pickerState.latitude, pickerState.longitude, step]);

  // Real-time Live Bids database subscription
  useEffect(() => {
    if (!currentJobId) return;

    const q = query(collection(db, 'bids'), where('jobId', '==', currentJobId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bids = snapshot.docs.map(docRef => {
        const data = docRef.data();
        return {
          id: docRef.id,
          uid: data.cleanerId,
          displayName: data.cleanerName,
          photoURL: data.cleanerPhoto || `https://i.pravatar.cc/100?u=${data.cleanerId}`,
          experienceYears: 4,
          ratingAverage: data.cleanerRating || 4.9,
          jobsCompleted: 342,
          distanceMiles: data.estimatedArrival ? parseFloat((data.estimatedArrival * 0.1).toFixed(1)) : 1.2,
          etaMinutes: data.estimatedArrival || 10,
          counterPrice: data.bidPrice || data.price,
          status: data.status,
          previousPrices: []
        };
      });
      // Set synchronized bids in state
      setCleanerOffers(bids);
      setLoadingBids(false);
    }, (err) => {
      console.error("Error watching live bids inside BookingFlow:", err);
      setLoadingBids(false);
    });

    return () => unsubscribe();
  }, [currentJobId]);

  // Fair Price indicator calculations (Dynamic AI Guidelines)
  const getAIPriceRecommendation = () => {
    let base = 35;
    if (selectedService === 'Deep Clean') base = 50;
    if (selectedService === 'Post-Party Restoration') base = 65;
    if (selectedService === 'Premium Detailing') base = 80;

    if (isCarRelated) {
      if (selectedVehicle === 'SUV') base += 15;
      if (selectedVehicle === 'Truck') base += 25;
      if (selectedVehicle === 'Motorcycle') base -= 10;
    }

    const low = Math.round(base * 0.85);
    const fairMin = base;
    const fairMax = Math.round(base * 1.2);
    
    let status: 'LOW' | 'FAIR' | 'GENEROUS' = 'FAIR';
    let label = 'Fair Price Range';
    let textStyle = 'text-amber-500';
    let bgStyle = 'bg-amber-500/10 border-amber-500/20';

    if (bidAmount < low) {
      status = 'LOW';
      label = 'Below average. Cleaners may take longer to respond!';
      textStyle = 'text-red-400';
      bgStyle = 'bg-red-500/10 border-red-500/20';
    } else if (bidAmount > fairMax) {
      status = 'GENEROUS';
      label = 'High offer! Expect instant premium bids.';
      textStyle = 'text-emerald-400';
      bgStyle = 'bg-emerald-500/10 border-emerald-500/20';
    } else {
      status = 'FAIR';
      label = 'Healthy range. Optimal chance of responses.';
      textStyle = 'text-[#3906d2]';
      bgStyle = 'bg-[#3906d2]/10 border-[#3906d2]/20';
    }

    return { low, fairMin, fairMax, status, label, textStyle, bgStyle };
  };

  const aiRec = getAIPriceRecommendation();

  // Handle service detection
  const handleServiceChange = (service: string) => {
    setSelectedService(service);
    // Auto flag car service
    const isCar = service.toLowerCase().includes('car') || service.toLowerCase().includes('detail');
    setIsCarRelated(isCar);
    
    // Auto adjust base bid values based on selected service
    if (service === 'Post-Party Restoration') setBidAmount(75);
    else if (service === 'Premium Detailing') setBidAmount(85);
    else if (service === 'Express Regular') setBidAmount(40);
    else setBidAmount(50);
  };

  // GPS Auto-Detection (Using Real Nominatim API)
  const handleGPSAutoDetect = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPickerState({ latitude: lat, longitude: lng, zoom: 15 });
        const res = await reverseGeocode(lat, lng);
        if (res) {
          setPickerAddress(res.address);
          setPickerCity(res.city);
        } else {
          setPickerAddress('GPS Verified Pinpoint');
          setPickerCity('Latitude: ' + lat.toFixed(4) + ', Longitude: ' + lng.toFixed(4));
        }
      }, () => {
        alert('Could not access current GPS. Using NYC simulation.');
      });
    } else {
      alert('Geolocation not supported.');
    }
  };

  // Trigger onBroadcastRequest when step becomes SEARCHING to create real document in Firestore
  useEffect(() => {
    if (step === 'SEARCHING' && !currentJobId && onBroadcastRequest) {
      const detailsParts = isCarRelated
        ? [
            carExterior.length > 0 ? `Exterior: ${carExterior.join(', ')}` : '',
            carInterior.length > 0 ? `Interior: ${carInterior.join(', ')}` : '',
            carDeep.length > 0 ? `Deep Cleaning: ${carDeep.join(', ')}` : '',
            carCondition ? `Vehicle Condition: ${carCondition}` : '',
            (carSpecialRequests.length > 0 || carSpecialRequestsOther) 
              ? `Special Requests: ${[...carSpecialRequests, carSpecialRequestsOther].filter(Boolean).join(', ')}` 
              : '',
            jobDetails ? `Notes: ${jobDetails}` : ''
          ].filter(Boolean)
        : [
            propertySize ? `Property Size: ${propertySize} m²` : '',
            areasToClean.length > 0 ? `Areas to Clean: ${areasToClean.join(', ')}` : '',
            cleaningRequired.length > 0 ? `Cleaning Required: ${cleaningRequired.join(', ')}` : '',
            houseCondition ? `House Condition: ${houseCondition}` : '',
            additionalServices.length > 0 ? `Additional Services: ${additionalServices.join(', ')}` : '',
            (specialInstructionsCheck.length > 0 || specialInstructionsOther) 
              ? `Special Instructions: ${[...specialInstructionsCheck, specialInstructionsOther].filter(Boolean).join(', ')}` 
              : '',
            jobDetails ? `Notes: ${jobDetails}` : ''
          ].filter(Boolean);

      const combinedDetails = detailsParts.length > 0 
        ? detailsParts.join('\n') 
        : `Requested ${selectedService} for ${isCarRelated ? selectedVehicle : 'premises'}.`;

      onBroadcastRequest({
        serviceType: selectedService,
        price: bidAmount,
        details: combinedDetails,
        location: {
          lat: selectedLocation.lat,
          lng: selectedLocation.lng,
          address: selectedLocation.address || pickerAddress
        },
        scheduledTime: selectedTime === 'Schedule' ? 'Schedule' : selectedTime,
        scheduledDate: selectedTime === 'Schedule' ? scheduledDate : ''
      }).then(jobId => {
        if (jobId) {
          setCurrentJobId(jobId);
        }
      }).catch(err => {
        console.error("Failed to broadcast real job via API:", err);
      });
    }
  }, [
    step, 
    selectedService, 
    bidAmount, 
    selectedLocation, 
    pickerAddress, 
    selectedTime, 
    scheduledDate, 
    isCarRelated,
    selectedVehicle,
    propertySize, 
    areasToClean, 
    cleaningRequired, 
    houseCondition, 
    additionalServices, 
    specialInstructionsCheck, 
    specialInstructionsOther, 
    carExterior,
    carInterior,
    carDeep,
    carCondition,
    carSpecialRequests,
    carSpecialRequestsOther,
    jobDetails, 
    currentJobId, 
    onBroadcastRequest
  ]);

  // Real-time listener for bids in Firestore for the current active job ID
  useEffect(() => {
    if (!currentJobId) return;
    const q = query(collection(db, 'bids'), where('jobId', '==', currentJobId));
    const unsub = onSnapshot(q, (snapshot) => {
      const bids = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          uid: data.cleanerId || 'unknown-cleaner',
          cleanerId: data.cleanerId || '',
          displayName: data.cleanerName || 'Sarah Jenkins',
          photoURL: data.cleanerPhoto || `https://i.pravatar.cc/100?u=${data.cleanerId || 'cleaner'}`,
          ratingAverage: data.cleanerRating !== undefined ? data.cleanerRating : 4.9,
          counterPrice: data.bidPrice !== undefined ? data.bidPrice : data.price,
          price: data.price !== undefined ? data.price : 45,
          distanceMiles: data.distanceMiles !== undefined ? data.distanceMiles : 1.2,
          etaMinutes: data.estimatedArrival !== undefined ? data.estimatedArrival : 8,
          jobsCompleted: data.jobsCompleted !== undefined ? data.jobsCompleted : 112,
          status: data.status || 'PENDING',
          createdAt: data.createdAt,
          ...data
        };
      });
      setCleanerOffers(bids);
      setOffersReceivedCount(bids.length);
      setLoadingBids(false);

      // Auto-slide into Incoming Offers screen as soon as a real bid is added in Firestore
      if (step === 'SEARCHING' && bids.length > 0) {
        setStep('INCOMING_OFFERS');
      }

      // Auto-transition to AGREEMENT_CONFIRMATION if a bid transitions to ACCEPTED status
      const acceptedBid = bids.find(b => b.status === 'ACCEPTED');
      if (acceptedBid && (step === 'INCOMING_OFFERS' || step === 'COUNTER_OFFER' || step === 'SEARCHING')) {
        setFinalAgreedPrice(acceptedBid.counterPrice || acceptedBid.price);
        setAssignedCleaner(acceptedBid);
        setStep('AGREEMENT_CONFIRMATION');
      }
    }, (err) => {
      console.error("Error listening to bids in BookingFlow snapshot:", err);
      setLoadingBids(false);
    });
    return () => unsub();
  }, [currentJobId, step]);

  // Active Radar Scan Screen Loader State
  useEffect(() => {
    if (step === 'SEARCHING') {
      setCleanersScanned(0);
      // Increment scanned cleaners count visually
      const interval = setInterval(() => {
        setCleanersScanned(prev => {
          if (prev >= 24) {
            clearInterval(interval);
            return 24;
          }
          return prev + Math.floor(Math.random() * 4) + 1;
        });
      }, 500);

      return () => {
        clearInterval(interval);
      };
    }
  }, [step]);

  // Counter Handling
  const handleOpenCounterScreen = (cleaner: any) => {
    setActiveNegotiatingCleaner(cleaner);
    setCounterInputAmount(Math.round((bidAmount + (cleaner.counterPrice || cleaner.price || bidAmount)) / 2));
    setNegotiationTimeline([
      { sender: 'customer', amount: bidAmount, label: 'Your Initial Offer', time: '1m ago' },
      { sender: 'cleaner', amount: cleaner.counterPrice || cleaner.price || bidAmount, label: `${cleaner.displayName}'s Ask`, time: 'Just now' }
    ]);
    setStep('COUNTER_OFFER');
  };

  const submitCounterOffer = async () => {
    const liveNegotiatingBid = activeNegotiatingCleaner 
      ? (cleanerOffers.find(o => o.id === activeNegotiatingCleaner.id) || activeNegotiatingCleaner) 
      : null;

    // If it's a real Firestore Bid doc, let's update it!
    if (activeNegotiatingCleaner.id) {
      try {
        const currentHist = liveNegotiatingBid?.negotiationHistory || [
          { sender: 'customer', amount: bidAmount, label: 'Your Initial Offer', time: '1m ago' },
          { sender: 'cleaner', amount: activeNegotiatingCleaner.counterPrice || activeNegotiatingCleaner.price, label: `${activeNegotiatingCleaner.displayName}'s Ask`, time: 'Just now' }
        ];
        const updatedHistory = [
          ...currentHist,
          { sender: 'customer', amount: counterInputAmount, label: 'Customer Counter Proposal', time: 'Just now' }
        ];

        await updateDoc(doc(db, 'bids', activeNegotiatingCleaner.id), {
          bidPrice: counterInputAmount,
          price: counterInputAmount, // backup
          lastActionBy: 'customer',
          negotiationHistory: updatedHistory,
          status: 'PENDING'
        });

        // If it's a simulated cleaner from MOCK_CLEANERS and bypass is off:
        if (activeNegotiatingCleaner.uid.startsWith('m-cleaner-') && !sandboxBypass) {
          setTimeout(async () => {
            try {
              const accepted = Math.random() > 0.4;
              if (accepted) {
                alert(`🎉 ${activeNegotiatingCleaner.displayName} accepted your Counter-Offer of $${counterInputAmount}!`);
                const resolvedHistory = [
                  ...updatedHistory,
                  { sender: 'cleaner', amount: counterInputAmount, label: 'Cleaner Accepted Offer', time: 'Just now' }
                ];
                await updateDoc(doc(db, 'bids', activeNegotiatingCleaner.id), { 
                  status: 'ACCEPTED', 
                  bidPrice: counterInputAmount, 
                  lastActionBy: 'cleaner',
                  negotiationHistory: resolvedHistory
                });
                if (currentJobId) {
                  await updateDoc(doc(db, 'jobs', currentJobId), {
                    status: 'ACCEPTED',
                    cleanerId: activeNegotiatingCleaner.uid,
                    cleanerName: activeNegotiatingCleaner.displayName,
                    cleanerPhoto: activeNegotiatingCleaner.photoURL,
                    cleanerRating: activeNegotiatingCleaner.ratingAverage,
                    cleanerEta: activeNegotiatingCleaner.etaMinutes || 10,
                    price: counterInputAmount
                  });
                }
              } else {
                const calculatedCounter = Math.round(counterInputAmount * 1.08);
                alert(`💬 ${activeNegotiatingCleaner.displayName} countered back with $${calculatedCounter}.`);
                const resolvedHistory = [
                  ...updatedHistory,
                  { sender: 'cleaner', amount: calculatedCounter, label: 'Cleaner Counter-Offer', time: 'Just now' }
                ];
                await updateDoc(doc(db, 'bids', activeNegotiatingCleaner.id), { 
                  bidPrice: calculatedCounter, 
                  price: calculatedCounter, 
                  lastActionBy: 'cleaner',
                  negotiationHistory: resolvedHistory
                });
              }
            } catch (err) {
              console.error("Failed to run simulated cleaner counter response: ", err);
            }
          }, 2000);
        }
      } catch (err) {
        console.error("Failed to submit counter offer:", err);
      }
    } else {
      // Offline fallback
      const updatedOffers = cleanerOffers.map(co => {
        if (co.uid === activeNegotiatingCleaner.uid) {
          return {
            ...co,
            counterPrice: Math.round(counterInputAmount * 1.15),
          };
        }
        return co;
      });
      setCleanerOffers(updatedOffers);
    }
    setStep('INCOMING_OFFERS');
    alert(`Counter-offer of $${counterInputAmount} sent! Waiting for response...`);
  };

  const acceptOfferDirectly = async (cleaner: any) => {
    setFinalAgreedPrice(cleaner.counterPrice || cleaner.initialCounter);
    setAssignedCleaner(cleaner);
    setStep('AGREEMENT_CONFIRMATION');

    if (cleaner.id) {
      try {
        await updateDoc(doc(db, 'bids', cleaner.id), { status: 'ACCEPTED' });
        if (currentJobId) {
          await updateDoc(doc(db, 'jobs', currentJobId), {
            status: 'ACCEPTED',
            cleanerId: cleaner.uid,
            cleanerName: cleaner.displayName,
            cleanerPhoto: cleaner.photoURL,
            cleanerRating: cleaner.ratingAverage,
            cleanerEta: cleaner.etaMinutes || 10,
            price: cleaner.counterPrice
          });
        }
      } catch (err) {
        console.error("Failed to accept bid in Firestore:", err);
      }
    }
  };

  const handleFinalConfirmAndTrack = () => {
    // Generate real-looking job object for app integration
    const finalJob = {
      id: currentJobId || 'job_' + Date.now(),
      serviceType: selectedService,
      details: jobDetails || `Requested ${selectedService} for ${isCarRelated ? selectedVehicle : 'your premises'}.`,
      status: 'ACCEPTED',
      price: finalAgreedPrice,
      location: {
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
        address: selectedLocation.address
      },
      cleanerId: assignedCleaner?.uid || 'temp-cleaner-id',
      cleanerName: assignedCleaner?.displayName || 'Assigned Professional',
      cleanerPhoto: assignedCleaner?.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150',
      cleanerRating: assignedCleaner?.ratingAverage || 4.9,
      cleanerEta: assignedCleaner?.etaMinutes || 10,
      createdAt: new Date()
    };
    onMatchSuccess(finalJob);
  };

  return (
    <div id="booking-flow-container" className={`flex-1 flex flex-col relative overflow-hidden font-sans transition-colors duration-300 ${cBg} ${cText}`}>
      
      {/* 1. CREATE REQUEST SCREEN */}
      {step === 'CREATE_REQUEST' && (
        <div id="booking-create-request" className="flex-1 flex flex-col h-full overflow-hidden">
          
          {/* Header */}
          <div className={`pt-12 px-6 pb-4 flex items-center justify-between border-b ${isDark ? 'border-white/5 bg-slate-900/40' : 'border-slate-150 bg-slate-50/80 backdrop-blur-md'}`}>
            <button onClick={onBackToHome} className={`p-2 -ml-2 rounded-xl active:opacity-75 transition-all`}>
              <ChevronLeft className={`w-5 h-5 ${cText}`} />
            </button>
            <h1 className="text-sm font-black uppercase tracking-widest text-[#3906d2]">Custom Bidding</h1>
            <div className="w-10"></div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-4 pb-28 space-y-6">
            
            {preselectedCleaner && (
              <div className={`p-4 rounded-3xl border-2 flex items-center justify-between ${isDark ? 'bg-white/5 border-white/10' : 'bg-[#3906d2]/5 border-[#3906d2]/10'}`}>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img 
                      src={preselectedCleaner.photoURL || `https://i.pravatar.cc/100?u=${preselectedCleaner.uid || preselectedCleaner.id}`} 
                      className="w-11 h-11 rounded-2xl object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
                  </div>
                  <div className="text-left">
                    <span className="text-[8px] font-black text-[#3906d2] uppercase tracking-widest block">Direct Booking Request</span>
                    <h3 className={`text-xs font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{preselectedCleaner.displayName}</h3>
                    <p className="text-[9px] text-slate-400 font-bold mt-0.5">{Array.isArray(preselectedCleaner.specialties) ? preselectedCleaner.specialties[0] : 'Specialist Partner'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[8px] font-bold text-slate-400 uppercase block">Hourly Price</span>
                  <span className="text-sm font-black text-brand-lime">${preselectedCleaner.hourlyRate || 40}</span>
                </div>
              </div>
            )}

            {/* Service Selection */}
            <div className="space-y-3">
              <h2 className={`text-xs font-black uppercase tracking-wider ${cTextMuted}`}>1. Select Service Category</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'Deep Clean', icon: Award, desc: 'Detailed intensive clean' },
                  { id: 'Express Regular', icon: Compass, desc: 'Quick sweep & mop' },
                  { id: 'Car Detailing', icon: Navigation, desc: 'Vacuum & polish' },
                  { id: 'Post-Party Restoration', icon: RefreshCw, desc: 'Heavy recovery work' }
                ].map((s) => {
                  const isS = selectedService === s.id;
                  const isAvailable = isServiceAvailableForCleaner(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => isAvailable && handleServiceChange(s.id)}
                      className={`text-left p-3.5 rounded-2xl border transition-all flex flex-col gap-2 relative overflow-hidden ${
                        !isAvailable
                          ? 'opacity-35 cursor-not-allowed bg-slate-100 border-slate-200'
                          : isS 
                            ? 'bg-[#3906d2] text-white border-[#3906d2] shadow-lg shadow-[#3906d2]/15 md:scale-[1.02]' 
                            : cCard
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <s.icon className={`w-5 h-5 ${!isAvailable ? 'text-slate-400' : isS ? 'text-white' : 'text-[#3906d2]'}`} />
                        {!isAvailable && (
                          <span className="text-[7px] font-bold uppercase tracking-wider text-rose-500 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded-md">
                            Locked
                          </span>
                        )}
                      </div>
                      <div>
                        <p className={`text-xs font-black tracking-tight leading-snug ${!isAvailable ? 'text-slate-400' : isS ? 'text-slate-950' : cText}`}>{s.id}</p>
                        <p className={`text-[9px] mt-0.5 line-clamp-1 ${!isAvailable ? 'text-slate-400' : isS ? 'text-white/80' : cTextMutedLight}`}>
                          {!isAvailable ? `Blocked by specialty` : s.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Conditional Vehicle Type Section */}
            {isCarRelated && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }}
                className={`space-y-3 p-4 rounded-2xl border ${cCard}`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#3906d2] rounded-full"></span>
                  <h2 className={`text-xs font-black uppercase tracking-widest ${isDark ? 'text-white/80' : 'text-slate-800'}`}>Select Vehicle Type</h2>
                </div>
                <div className="grid grid-cols-4 gap-1.5 xs:gap-2">
                  {['Sedan', 'SUV', 'Truck', 'Motorcycle'].map((v) => {
                    const isV = selectedVehicle === v;
                    return (
                      <button
                        key={v}
                        onClick={() => setSelectedVehicle(v)}
                        className={`py-2.5 px-0.5 items-center justify-center rounded-xl text-center text-[8.5px] xs:text-[9.5px] sm:text-[10px] font-black uppercase transition-all border truncate shadow-xs ${
                          isV 
                            ? 'bg-white text-slate-950 border-white font-black shadow-sm' 
                            : isDark ? 'bg-white/5 border-white/5 text-white/60' : 'bg-white border-slate-200 text-slate-500'
                        }`}
                        title={v}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Pickup / Job Location Card */}
            <div className="space-y-3">
              <h2 className={`text-xs font-black uppercase tracking-wider ${cTextMuted}`}>2. Bidding Location</h2>
              <div 
                onClick={() => {
                  setPickerState({
                    latitude: selectedLocation.lat,
                    longitude: selectedLocation.lng,
                    zoom: 15
                  });
                  setStep('LOCATION_PICKER');
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${cCard}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#3906d2]/10 rounded-xl border border-[#3906d2]/20 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-[#3906d2]" />
                  </div>
                  <div>
                    <span className={`text-[10px] uppercase font-black tracking-widest ${cTextMuted}`}>
                      {selectedLocation.name}
                    </span>
                    <p className={`text-xs font-bold line-clamp-1 ${cText}`}>{selectedLocation.address}</p>
                    <p className={`text-[10px] ${cTextMutedLight}`}>{selectedLocation.city}</p>
                  </div>
                </div>
                <div className="text-[10px] font-black text-[#3906d2] uppercase tracking-wider ml-2 flex items-center gap-1">
                  Change <span className="text-xs">➔</span>
                </div>
              </div>
            </div>

            {/* Optional Scheduling Section */}
            <div className="space-y-3">
              <h2 className={`text-xs font-black uppercase tracking-wider ${cTextMuted}`}>3. Schedule Time</h2>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'ASAP', label: 'ASAP Mode', desc: 'Matching now' },
                  { id: 'Today', label: 'Later Today', desc: 'Flexible 2-4h' },
                  { id: 'Schedule', label: 'Calendar', desc: scheduledDate || 'Choose Date' }
                ].map((t) => {
                  const isT = selectedTime === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        setSelectedTime(t.id);
                        if (t.id === 'Schedule') {
                          const dateEl = document.getElementById('bidding-date-input');
                          dateEl?.click();
                        }
                      }}
                      className={`relative p-3 rounded-2xl text-center border transition-all ${
                        isT 
                          ? (isDark ? 'bg-white text-slate-950 border-white font-black' : 'bg-slate-950 text-white border-slate-950 font-black') 
                          : cCard
                      }`}
                    >
                      <p className="text-[10px] font-black uppercase tracking-wider">{t.label}</p>
                      <p className={`text-[8px] truncate ${isT ? (isDark ? 'text-slate-800 font-medium' : 'text-slate-200 font-medium') : cTextMutedLight}`}>
                        {t.desc}
                      </p>
                      {t.id === 'Schedule' && (
                        <input 
                           id="bidding-date-input"
                           type="date"
                           className="absolute inset-0 opacity-0 pointer-events-none"
                           onChange={(e) => {
                             if (e.target.value) {
                               setScheduledDate(e.target.value);
                               setSelectedTime('Schedule');
                             }
                           }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mandatory Bid Amount Input */}
            <div className="space-y-3">
              <h2 className={`text-xs font-black uppercase tracking-wider ${cTextMuted}`}>4. Set Your Bid Limit</h2>
              <div className={`relative p-5 rounded-3xl border flex flex-col items-center gap-3 ${cCard}`}>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setBidAmount(prev => Math.max(15, prev - 5))}
                    className={`w-10 h-10 rounded-full border hover:opacity-80 active:scale-90 flex items-center justify-center transition-all text-lg font-black ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 text-slate-800 shadow-sm'}`}
                  >
                    -
                  </button>
                  <div className="flex items-baseline gap-1 text-center">
                    <span className="text-lg font-black text-[#3906d2]">$</span>
                    <input 
                      type="number"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(Math.max(1, parseInt(e.target.value) || 0))}
                      className={`w-24 text-center bg-transparent text-3xl font-black focus:outline-none focus:border-b border-[#3906d2] ${cText}`}
                    />
                  </div>
                  <button 
                    onClick={() => setBidAmount(prev => prev + 5)}
                    className={`w-10 h-10 rounded-full border hover:opacity-80 active:scale-90 flex items-center justify-center transition-all text-lg font-black ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 text-slate-800 shadow-sm'}`}
                  >
                    +
                  </button>
                </div>

                {/* Fair Price AI Indicator */}
                <div className={`w-full p-3 rounded-xl border flex items-center gap-3 transition-colors ${aiRec.bgStyle}`}>
                  <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <TrendingUp className={`w-3.5 h-3.5 ${aiRec.textStyle}`} />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black uppercase tracking-wider ${aiRec.textStyle}`}>
                        AI Advice: {aiRec.status}
                      </span>
                      <span className={`text-[8px] ${isDark ? 'text-white/30' : 'text-slate-500/50'}`}>| Range: ${aiRec.low}-${aiRec.fairMax}</span>
                    </div>
                    <p className={`text-[9px] leading-snug truncate ${isDark ? 'text-white/60' : 'text-slate-600'}`}>{aiRec.label}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* House Cleaning Service Request Form (Direct Transcription of OCR/PDF) */}
            {!isCarRelated && (
              <div className={`p-5 rounded-3xl border space-y-5 ${cCard}`}>
                <div className="flex items-center gap-2 border-b pb-2 border-[#3906d2]/10">
                  <ShieldCheck className="w-5 h-5 text-[#3906d2]" />
                  <h2 className="text-xs font-black uppercase tracking-widest text-[#3906d2]">
                    Service Request Form
                  </h2>
                </div>

                {/* 1. Property Size */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className={`text-[10px] font-black uppercase tracking-wider ${cTextMuted}`}>
                      Property Size
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">Approximate area</span>
                  </div>
                  <div className="relative">
                    <input 
                      id="property-size-input"
                      type="number" 
                      value={propertySize} 
                      onChange={(e) => setPropertySize(e.target.value)} 
                      placeholder="e.g. 85" 
                      className={`w-full p-4 pr-12 rounded-2xl border text-xs font-black outline-none focus:border-[#3906d2] ${cInput}`}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 font-mono">
                      m²
                    </div>
                  </div>
                </div>

                <div className="border-b border-dashed border-slate-200/50 dark:border-white/5"></div>

                {/* 2. Areas to Clean */}
                <div className="space-y-2">
                  <span className={`text-[10px] font-black uppercase tracking-wider block ${cTextMuted}`}>
                    Areas to Clean
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {['Entire house', 'Living room', 'Kitchen', 'Bedrooms', 'Bathrooms'].map((area) => {
                      const isSel = areasToClean.includes(area);
                      return (
                        <button
                          key={area}
                          type="button"
                          onClick={() => {
                            if (isSel) {
                              setAreasToClean(areasToClean.filter(a => a !== area));
                            } else {
                              setAreasToClean([...areasToClean, area]);
                            }
                          }}
                          className={`p-3 rounded-xl border text-left text-[11px] font-bold flex items-center justify-between transition-all active:scale-98 cursor-pointer ${
                            isSel 
                              ? 'bg-[#3906d2]/15 border-[#3906d2] text-[#3906d2]' 
                              : isDark ? 'bg-white/5 border-white/5 text-white/70 hover:bg-white/10' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>{area}</span>
                          <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${isSel ? 'bg-[#3906d2] border-[#3906d2] text-white' : 'border-slate-300'}`}>
                            {isSel && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-b border-dashed border-slate-200/50 dark:border-white/5"></div>

                {/* 3. Cleaning Required */}
                <div className="space-y-2">
                  <span className={`text-[10px] font-black uppercase tracking-wider block ${cTextMuted}`}>
                    Cleaning Required
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      'Basic cleaning', 
                      'Deep cleaning', 
                      'Sweeping & mopping', 
                      'Dusting & vacuuming', 
                      'Kitchen cleaning', 
                      'Bathroom cleaning', 
                      'Window cleaning'
                    ].map((req) => {
                      const isSel = cleaningRequired.includes(req);
                      return (
                        <button
                          key={req}
                          type="button"
                          onClick={() => {
                            if (isSel) {
                              setCleaningRequired(cleaningRequired.filter(r => r !== req));
                            } else {
                              setCleaningRequired([...cleaningRequired, req]);
                            }
                          }}
                          className={`p-3 rounded-xl border text-left text-[11px] font-bold flex items-center justify-between transition-all active:scale-98 cursor-pointer ${
                            isSel 
                              ? 'bg-[#3906d2]/15 border-[#3906d2] text-[#3906d2]' 
                              : isDark ? 'bg-white/5 border-white/5 text-white/70 hover:bg-white/10' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>{req}</span>
                          <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${isSel ? 'bg-[#3906d2] border-[#3906d2] text-white' : 'border-slate-300'}`}>
                            {isSel && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-b border-dashed border-slate-200/50 dark:border-white/5"></div>

                {/* 4. House Condition */}
                <div className="space-y-2">
                  <span className={`text-[10px] font-black uppercase tracking-wider block ${cTextMuted}`}>
                    House Condition
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {['Lightly dirty', 'Moderately dirty', 'Very dirty', 'Pet hair or heavy stains'].map((cond) => {
                      const isSel = houseCondition === cond;
                      return (
                        <button
                          key={cond}
                          type="button"
                          onClick={() => setHouseCondition(cond)}
                          className={`p-3 rounded-xl border text-left text-[11px] font-bold flex items-center justify-between transition-all active:scale-98 cursor-pointer ${
                            isSel 
                              ? 'bg-[#3906d2]/15 border-[#3906d2] text-[#3906d2]' 
                              : isDark ? 'bg-white/5 border-white/5 text-white/70 hover:bg-white/10' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>{cond}</span>
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${isSel ? 'bg-[#3906d2] border-[#3906d2]' : 'border-slate-300'}`}>
                            {isSel && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-b border-dashed border-slate-200/50 dark:border-white/5"></div>

                {/* 5. Additional Services */}
                <div className="space-y-2">
                  <span className={`text-[10px] font-black uppercase tracking-wider block ${cTextMuted}`}>
                    Additional Services
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {['Laundry', 'Ironing', 'Dish washing', 'Fridge/Oven cleaning'].map((service) => {
                      const isSel = additionalServices.includes(service);
                      return (
                        <button
                          key={service}
                          type="button"
                          onClick={() => {
                            if (isSel) {
                              setAdditionalServices(additionalServices.filter(s => s !== service));
                            } else {
                              setAdditionalServices([...additionalServices, service]);
                            }
                          }}
                          className={`p-3 rounded-xl border text-left text-[11px] font-bold flex items-center justify-between transition-all active:scale-98 cursor-pointer ${
                            isSel 
                              ? 'bg-[#3906d2]/15 border-[#3906d2] text-[#3906d2]' 
                              : isDark ? 'bg-white/5 border-white/5 text-white/70 hover:bg-white/10' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>{service}</span>
                          <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${isSel ? 'bg-[#3906d2] border-[#3906d2] text-white' : 'border-slate-300'}`}>
                            {isSel && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-b border-dashed border-slate-200/50 dark:border-white/5"></div>

                {/* 6. Special Instructions */}
                <div className="space-y-3">
                  <span className={`text-[10px] font-black uppercase tracking-wider block ${cTextMuted}`}>
                    Special Instructions
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {['Handle fragile items carefully', 'Do not move personal belongings'].map((inst) => {
                      const isSel = specialInstructionsCheck.includes(inst);
                      return (
                        <button
                          key={inst}
                          type="button"
                          onClick={() => {
                            if (isSel) {
                              setSpecialInstructionsCheck(specialInstructionsCheck.filter(i => i !== inst));
                            } else {
                              setSpecialInstructionsCheck([...specialInstructionsCheck, inst]);
                            }
                          }}
                          className={`p-3 rounded-xl border text-left text-[11px] font-bold flex items-center justify-between transition-all active:scale-98 cursor-pointer ${
                            isSel 
                              ? 'bg-[#3906d2]/15 border-[#3906d2] text-[#3906d2]' 
                              : isDark ? 'bg-white/5 border-white/5 text-white/70 hover:bg-white/10' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className="leading-tight shrink-1 pr-1">{inst}</span>
                          <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all shrink-0 ${isSel ? 'bg-[#3906d2] border-[#3906d2] text-white' : 'border-slate-300'}`}>
                            {isSel && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="pt-1.5">
                    <span className="text-[8px] font-black uppercase tracking-widest text-[#3906d2]/60 mb-1 block">Specify Other Instructions</span>
                    <input 
                      id="additional-instructions-input"
                      type="text" 
                      value={specialInstructionsOther} 
                      onChange={(e) => setSpecialInstructionsOther(e.target.value)} 
                      placeholder="E.g., handle pet area with care..." 
                      className={`w-full p-4 rounded-2xl border text-xs font-black outline-none focus:border-[#3906d2] ${cInput}`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Car Cleaning Service Request Form (Direct Transcription of OCR/PDF) */}
            {isCarRelated && (
              <div className={`p-5 rounded-3xl border space-y-5 ${cCard}`}>
                <div className="flex items-center gap-2 border-b pb-2 border-[#3906d2]/10">
                  <ShieldCheck className="w-5 h-5 text-[#3906d2]" />
                  <h2 className="text-xs font-black uppercase tracking-widest text-[#3906d2]">
                    Car Cleaning Service Form
                  </h2>
                </div>

                {/* 1. Type of Cleaning Required */}
                <div className="space-y-4">
                  <span className={`text-[10px] font-black uppercase tracking-wider block ${cTextMuted}`}>
                    1. Type of Cleaning Required (Tick all that apply)
                  </span>

                  {/* Exterior */}
                  <div className="space-y-2">
                    <span className="text-[9px] font-extrabold uppercase tracking-wide text-[#3906d2]">
                      Exterior
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        'Basic wash',
                        'Wash & dry',
                        'Wax/polish',
                        'Tyre & rim cleaning',
                        'Window cleaning',
                        'Engine bay cleaning'
                      ].map((item) => {
                        const isSel = carExterior.includes(item);
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              if (isSel) {
                                setCarExterior(carExterior.filter(x => x !== item));
                              } else {
                                setCarExterior([...carExterior, item]);
                              }
                            }}
                            className={`p-3 rounded-xl border text-left text-[11px] font-bold flex items-center justify-between transition-all active:scale-98 cursor-pointer ${
                              isSel 
                                ? 'bg-[#3906d2]/15 border-[#3906d2] text-[#3906d2]' 
                                : isDark ? 'bg-white/5 border-white/5 text-white/70 hover:bg-white/10' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <span>{item}</span>
                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${isSel ? 'bg-[#3906d2] border-[#3906d2] text-white' : 'border-slate-300'}`}>
                              {isSel && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-b border-dashed border-slate-200/50 dark:border-white/5"></div>

                  {/* Interior */}
                  <div className="space-y-2">
                    <span className="text-[9px] font-extrabold uppercase tracking-wide text-[#3906d2]">
                      Interior
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        'Basic vacuum',
                        'Thorough interior cleaning',
                        'Seat cleaning',
                        'Carpet & floor mat cleaning',
                        'Dashboard & door panel polish',
                        'Boot/trunk cleaning',
                        'Interior window cleaning',
                        'Air freshener'
                      ].map((item) => {
                        const isSel = carInterior.includes(item);
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              if (isSel) {
                                setCarInterior(carInterior.filter(x => x !== item));
                              } else {
                                setCarInterior([...carInterior, item]);
                              }
                            }}
                            className={`p-3 rounded-xl border text-left text-[11px] font-bold flex items-center justify-between transition-all active:scale-98 cursor-pointer ${
                              isSel 
                                ? 'bg-[#3906d2]/15 border-[#3906d2] text-[#3906d2]' 
                                : isDark ? 'bg-white/5 border-white/5 text-white/70 hover:bg-white/10' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <span>{item}</span>
                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${isSel ? 'bg-[#3906d2] border-[#3906d2] text-white' : 'border-slate-300'}`}>
                              {isSel && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-b border-dashed border-slate-200/50 dark:border-white/5"></div>

                  {/* Deep Cleaning */}
                  <div className="space-y-2">
                    <span className="text-[9px] font-extrabold uppercase tracking-wide text-rose-500">
                      Deep Cleaning
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        'Full detailing',
                        'Stain removal',
                        'Pet hair removal',
                        'Odour removal'
                      ].map((item) => {
                        const isSel = carDeep.includes(item);
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              if (isSel) {
                                setCarDeep(carDeep.filter(x => x !== item));
                              } else {
                                setCarDeep([...carDeep, item]);
                              }
                            }}
                            className={`p-3 rounded-xl border text-left text-[11px] font-bold flex items-center justify-between transition-all active:scale-98 cursor-pointer ${
                              isSel 
                                ? 'bg-[#3906d2]/15 border-[#3906d2] text-[#3906d2]' 
                                : isDark ? 'bg-white/5 border-white/5 text-white/70 hover:bg-white/10' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <span>{item}</span>
                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${isSel ? 'bg-[#3906d2] border-[#3906d2] text-white' : 'border-slate-300'}`}>
                              {isSel && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="border-b border-dashed border-slate-200/50 dark:border-white/5"></div>

                {/* 2. Vehicle Condition */}
                <div className="space-y-2">
                  <span className={`text-[10px] font-black uppercase tracking-wider block ${cTextMuted}`}>
                    2. Vehicle Condition
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      'Lightly dirty',
                      'Moderately dirty',
                      'Very dirty',
                      'Muddy',
                      'Food or drink spills'
                    ].map((cond) => {
                      const isSel = carCondition === cond;
                      return (
                        <button
                          key={cond}
                          type="button"
                          onClick={() => setCarCondition(cond)}
                          className={`p-3 rounded-xl border text-left text-[11px] font-bold flex items-center justify-between transition-all active:scale-98 cursor-pointer ${
                            isSel 
                              ? 'bg-[#3906d2]/15 border-[#3906d2] text-[#3906d2]' 
                              : isDark ? 'bg-white/5 border-white/5 text-white/70 hover:bg-white/10' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>{cond}</span>
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${isSel ? 'bg-[#3906d2] border-[#3906d2]' : 'border-slate-300'}`}>
                            {isSel && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-b border-dashed border-slate-200/50 dark:border-white/5"></div>

                {/* 3. Special Requests */}
                <div className="space-y-3">
                  <span className={`text-[10px] font-black uppercase tracking-wider block ${cTextMuted}`}>
                    3. Special Requests
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      'Handle valuables carefully',
                      'Do not move personal items',
                      'Child seat cleaning'
                    ].map((inst) => {
                      const isSel = carSpecialRequests.includes(inst);
                      return (
                        <button
                          key={inst}
                          type="button"
                          onClick={() => {
                            if (isSel) {
                              setCarSpecialRequests(carSpecialRequests.filter(i => i !== inst));
                            } else {
                              setCarSpecialRequests([...carSpecialRequests, inst]);
                            }
                          }}
                          className={`p-3 rounded-xl border text-left text-[11px] font-bold flex items-center justify-between transition-all active:scale-98 cursor-pointer ${
                            isSel 
                              ? 'bg-[#3906d2]/15 border-[#3906d2] text-[#3906d2]' 
                              : isDark ? 'bg-white/5 border-white/5 text-white/70 hover:bg-white/10' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className="leading-tight shrink-1 pr-1">{inst}</span>
                          <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all shrink-0 ${isSel ? 'bg-[#3906d2] border-[#3906d2] text-white' : 'border-slate-300'}`}>
                            {isSel && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="pt-1.5">
                    <span className="text-[8px] font-black uppercase tracking-widest text-[#3906d2]/60 mb-1 block">Specify Other Instructions</span>
                    <input 
                      id="car-additional-instructions-input"
                      type="text" 
                      value={carSpecialRequestsOther} 
                      onChange={(e) => setCarSpecialRequestsOther(e.target.value)} 
                      placeholder="E.g., handle pet area with care..." 
                      className={`w-full p-4 rounded-2xl border text-xs font-black outline-none focus:border-[#3906d2] ${cInput}`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Photos & Extra Details */}
            <div className="space-y-3">
              <h2 className={`text-xs font-black uppercase tracking-wider font-mono ${cTextMuted}`}>6. Extra Notes & Real Photos</h2>
              <textarea
                value={jobDetails}
                onChange={(e) => setJobDetails(e.target.value)}
                placeholder="Ex. Note any custom gate codes or specific access instructions..."
                className={`w-full min-h-[90px] p-4 rounded-2xl focus:border-[#3906d2] text-xs font-bold outline-none resize-none border ${cInput}`}
              />
              
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar py-1">
                <label className={`w-16 h-16 rounded-xl border border-dashed hover:border-[#3906d2] transition-all flex flex-col items-center justify-center gap-1 cursor-pointer shrink-0 ${isDark ? 'border-white/20 bg-white/5' : 'border-slate-300 bg-slate-50'}`}>
                  <Camera className={`w-4 h-4 ${cTextMutedLight}`} />
                  <span className={`text-[8px] font-bold tracking-tighter uppercase ${cTextMutedLight}`}>Add</span>
                  <input 
                    type="file" 
                    placeholder="Take photo"
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const r = new FileReader();
                        r.onload = (ev) => {
                          if (ev.target?.result) setPhotos(p => [...p, ev.target!.result as string]);
                        };
                        r.readAsDataURL(file);
                      }
                    }} 
                  />
                </label>
                {photos.map((ph, idx) => (
                  <div key={idx} className={`relative w-16 h-16 rounded-xl overflow-hidden shrink-0 group border ${cBorder}`}>
                    <img src={ph} alt="Upload thumb" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => setPhotos(p => p.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center hover:bg-red-500"
                    >
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Fixed Footer CTA */}
          <div className={`absolute bottom-0 left-0 right-0 p-5 backdrop-blur-2xl border-t z-25 ${isDark ? 'bg-slate-950/80 border-white/5' : 'bg-white/95 border-slate-150'}`}>
            <button 
              onClick={() => setStep('BID_REVIEW')}
              className="w-full py-4.5 bg-[#3906d2] text-white rounded-2xl font-black text-xs uppercase tracking-[0.25em] shadow-xl shadow-[#3906d2]/15 active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              Continue to Review
              <ArrowRight className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}

      {/* 2. LOCATION PICKER SCREEN */}
      {step === 'LOCATION_PICKER' && (
        <div id="booking-location-picker" className="flex-1 flex flex-col h-full overflow-hidden">
          
          {/* Main Map Arena */}
          <div className="flex-1 relative bg-slate-900">
            <Map
              {...pickerState}
              onMove={evt => setPickerState(prev => ({ ...prev, ...evt.viewState }))}
              mapLib={maplibregl}
              style={{ width: '100%', height: '100%' }}
              mapStyle={OSM_STYLE}
              attributionControl={false}
            >
              {/* Virtual Static Pin at center of viewport */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="flex flex-col items-center -translate-y-5">
                  <div className="bg-slate-950 text-white/90 text-[9px] font-black px-3 py-1.5 rounded-full border border-white/10 shadow-2xl flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 bg-[#3906d2] rounded-full animate-ping"></span>
                    DRAG MAP TO SET PIN
                  </div>
                  <div className="w-10 h-10 bg-slate-950 rounded-full flex items-center justify-center shadow-2xl border-2 border-[#3906d2] mt-2">
                    <MapPin className="w-5 h-5 text-[#3906d2] fill-current animate-bounce" />
                  </div>
                  <div className="w-2.5 h-1.5 bg-black/50 rounded-full blur-[1px] mt-1"></div>
                </div>
              </div>
            </Map>

            {/* Back Button */}
            <button 
              onClick={() => setStep('CREATE_REQUEST')}
              className="absolute top-12 left-6 w-12 h-12 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-white/15 text-white flex items-center justify-center active:scale-90 transition-all z-20"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Action Buttons Layer */}
            <div className="absolute bottom-6 left-6 right-6 flex justify-between gap-3 z-20">
              <button 
                onClick={handleGPSAutoDetect}
                className="flex-1 py-3 bg-white/10 hover:bg-white/15 backdrop-blur-md rounded-xl border border-white/15 text-[10px] font-black uppercase tracking-wider text-white flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Compass className="w-4 h-4 text-[#3906d2] animate-spin" />
                Live GPS Auto-Detect
              </button>
            </div>
          </div>

          {/* Interactive Sliding Bottom Drawer */}
          <div className={`border-t p-6 space-y-4 ${isDark ? 'bg-slate-950 border-white/10' : 'bg-white border-slate-200 shadow-[0_-5px_25px_rgba(0,0,0,0.05)]'}`}>
            
            {/* Input Place Details */}
            <div className="space-y-2">
              <label className={`text-[10px] uppercase font-black tracking-widest ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Pin Location Label / Name</label>
              <input 
                type="text"
                value={tempLocationName}
                onChange={(e) => setTempLocationName(e.target.value)}
                className={`w-full p-3 rounded-xl text-xs font-bold outline-none border focus:border-[#3906d2] ${isDark ? 'bg-white/5 border-white/15 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                placeholder="Name this spot: e.g. Office Stay, Beach House"
              />
            </div>

            {/* Address Summary */}
            <div className={`p-3.5 rounded-2xl border flex gap-3 text-left ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200 shadow-sm'}`}>
              <div className="w-7 h-7 bg-[#3906d2]/10 border border-[#3906d2]/20 rounded-lg flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-[#3906d2]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-black ${isDark ? 'text-white/90' : 'text-slate-800'}`}>{pickerAddress}</p>
                <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-slate-400'}`}>{pickerCity} • (Lat: {pickerState.latitude.toFixed(4)}, Lng: {pickerState.longitude.toFixed(4)})</p>
              </div>
            </div>

            {/* Saved Locations Quick Selector */}
            <div className="space-y-1.5">
              <p className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Saved Locations Quick Select:</p>
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                {savedLocations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => {
                      setPickerState({
                        latitude: loc.lat,
                        longitude: loc.lng,
                        zoom: 15
                      });
                      setPickerAddress(loc.address);
                      setPickerCity(loc.city);
                      setTempLocationName(loc.name);
                      setSavedLocationType(loc.type);
                    }}
                    className={`p-2.5 rounded-xl border hover:border-[#3906d2]/50 active:scale-95 transition-all text-left shrink-0 min-w-[120px] ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200 shadow-sm'}`}
                  >
                    <p className="text-[10px] font-black text-[#3906d2] leading-none mb-1">{loc.name}</p>
                    <p className={`text-[8px] truncate max-w-[120px] ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{loc.address}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Confim Selection CTA */}
            <button 
              onClick={() => {
                const finalLoc: SavedLocation = {
                  id: 'loc_' + Date.now(),
                  name: tempLocationName || 'Selected Location',
                  address: pickerAddress,
                  city: pickerCity,
                  lat: pickerState.latitude,
                  lng: pickerState.longitude,
                  type: savedLocationType
                };
                
                // If label was modified, save to active spot
                setSelectedLocation(finalLoc);
                
                // Add to saved shortcuts list
                setSavedLocations(prev => {
                  const exists = prev.some(l => l.address === pickerAddress);
                  if (exists) return prev;
                  return [finalLoc, ...prev];
                });

                setStep('CREATE_REQUEST');
              }}
              className="w-full py-4 bg-[#3906d2] text-white font-black text-xs uppercase tracking-[0.2em] rounded-xl shadow-lg active:scale-98 transition-all"
            >
              Confirm Selected Pinpoint
            </button>
          </div>
        </div>
      )}

      {/* 3. BID REVIEW SCREEN */}
      {step === 'BID_REVIEW' && (
        <div id="booking-bid-review" className="flex-1 flex flex-col h-full overflow-hidden">
          
          {/* Header */}
          <div className={`pt-12 px-6 pb-4 flex items-center justify-between border-b ${isDark ? 'border-white/5 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
            <button onClick={() => setStep('CREATE_REQUEST')} className={`p-2 -ml-2 rounded-xl active:bg-white/10 transition-colors ${isDark ? 'text-white' : 'text-slate-800'}`}>
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-black uppercase tracking-widest text-[#3906d2]">Verify Bid Details</h1>
            <div className="w-10"></div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6 pb-32">
            
            {/* Bid Glow Ring Widget */}
            <div className={`relative p-6 rounded-3xl border shadow-2xl overflow-hidden flex flex-col items-center ${isDark ? 'bg-slate-900 border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900' : 'bg-slate-50 border-slate-200 bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 shadow-sm'}`}>
              <div className="absolute inset-x-0 -top-40 h-52 bg-[#3906d2]/5 rounded-full blur-[100px] pointer-events-none"></div>
              
              <Lock className="w-5 h-5 text-[#3906d2] mb-2 animate-pulse" />
              <p className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Active Bid Offer</p>
              <h1 className="text-5xl font-black text-[#3906d2] tracking-tighter mt-1">${bidAmount}</h1>
              
              <div className={`mt-4 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border ${isDark ? 'bg-white/5 border-white/10 text-white/70' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                Single-Job Contract Offer
              </div>
            </div>

            {/* Request Summary Cards */}
            <div className="space-y-3">
              <h2 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Bidding Specifications</h2>
              
              <div className={`rounded-2xl border overflow-hidden divide-y ${isDark ? 'bg-white/5 border-white/10 divide-white/5' : 'bg-white border-slate-200 divide-slate-100 shadow-sm'}`}>
                
                {/* Service type */}
                <div className="p-4 flex justify-between items-center text-left">
                  <div>
                    <span className={`text-[9px] uppercase tracking-widest block font-black ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Selection Category</span>
                    <span className={`text-xs font-black ${isDark ? 'text-white/95' : 'text-slate-900'}`}>{selectedService}</span>
                  </div>
                  {isCarRelated && (
                    <div className={`px-3 py-1 rounded-lg text-[8px] font-black tracking-widest uppercase border ${isDark ? 'bg-white/10 border-white/15 text-[#3906d2]' : 'bg-slate-100 border-slate-200 text-[#3906d2]'}`}>
                      🚗 {selectedVehicle}
                    </div>
                  )}
                </div>

                {/* Location */}
                <div className="p-4 text-left">
                  <span className={`text-[9px] uppercase tracking-widest block font-black ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Contract Spot</span>
                  <div className="flex items-start gap-2 mt-1">
                    <MapPin className="w-4 h-4 text-[#3906d2] shrink-0 mt-0.5" />
                    <div>
                      <p className={`text-xs font-black leading-tight ${isDark ? 'text-white/95' : 'text-slate-900'}`}>{selectedLocation.name}</p>
                      <p className={`text-[10px] line-clamp-1 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{selectedLocation.address}</p>
                    </div>
                  </div>
                </div>

                {/* Hours/Timing */}
                <div className="p-4 flex justify-between items-center text-left">
                  <div>
                    <span className={`text-[9px] uppercase tracking-widest block font-black ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Selected Timeframe</span>
                    <span className={`text-xs font-black ${isDark ? 'text-white/95' : 'text-slate-900'}`}>
                      {selectedTime === 'Schedule' ? `Schedule: ${scheduledDate}` : `${selectedTime} Priority`}
                    </span>
                  </div>
                  <Clock className="w-4 h-4 text-[#3906d2]" />
                </div>

                {/* House/Car custom form summary */}
                {isCarRelated && (carExterior.length > 0 || carInterior.length > 0 || carDeep.length > 0 || carCondition || carSpecialRequests.length > 0 || carSpecialRequestsOther) && (
                  <div className="p-4 text-left">
                    <span className={`text-[9px] uppercase tracking-widest block font-black ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Form Specifications</span>
                    <div className="mt-2 space-y-1 text-xs">
                      {carExterior.length > 0 && (
                        <p className={isDark ? 'text-white/80' : 'text-slate-700'}><strong className="text-[#3906d2]">Exterior:</strong> {carExterior.join(', ')}</p>
                      )}
                      {carInterior.length > 0 && (
                        <p className={isDark ? 'text-white/80' : 'text-slate-700'}><strong className="text-[#3906d2]">Interior:</strong> {carInterior.join(', ')}</p>
                      )}
                      {carDeep.length > 0 && (
                        <p className={isDark ? 'text-white/80' : 'text-slate-700'}><strong className="text-rose-500">Deep Cleaning:</strong> {carDeep.join(', ')}</p>
                      )}
                      {carCondition && (
                        <p className={isDark ? 'text-white/80' : 'text-slate-700'}><strong className="text-[#3906d2]">Condition:</strong> {carCondition}</p>
                      )}
                      {(carSpecialRequests.length > 0 || carSpecialRequestsOther) && (
                        <p className={isDark ? 'text-white/80' : 'text-slate-700'}><strong className="text-[#3906d2]">Special:</strong> {[...carSpecialRequests, carSpecialRequestsOther].filter(Boolean).join(', ')}</p>
                      )}
                    </div>
                  </div>
                )}

                {!isCarRelated && (propertySize || areasToClean.length > 0 || cleaningRequired.length > 0 || houseCondition || additionalServices.length > 0 || specialInstructionsCheck.length > 0 || specialInstructionsOther) && (
                  <div className="p-4 text-left">
                    <span className={`text-[9px] uppercase tracking-widest block font-black ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Form Specifications</span>
                    <div className="mt-2 space-y-1 text-xs">
                      {propertySize && (
                        <p className={isDark ? 'text-white/80' : 'text-slate-700'}><strong className="text-[#3906d2]">Property Size:</strong> {propertySize} m²</p>
                      )}
                      {areasToClean.length > 0 && (
                        <p className={isDark ? 'text-white/80' : 'text-slate-700'}><strong className="text-[#3906d2]">Areas:</strong> {areasToClean.join(', ')}</p>
                      )}
                      {cleaningRequired.length > 0 && (
                        <p className={isDark ? 'text-white/80' : 'text-slate-700'}><strong className="text-[#3906d2]">Required:</strong> {cleaningRequired.join(', ')}</p>
                      )}
                      {houseCondition && (
                        <p className={isDark ? 'text-white/80' : 'text-slate-700'}><strong className="text-[#3906d2]">Condition:</strong> {houseCondition}</p>
                      )}
                      {additionalServices.length > 0 && (
                        <p className={isDark ? 'text-white/80' : 'text-slate-700'}><strong className="text-[#3906d2]">Additional:</strong> {additionalServices.join(', ')}</p>
                      )}
                      {(specialInstructionsCheck.length > 0 || specialInstructionsOther) && (
                        <p className={isDark ? 'text-white/80' : 'text-slate-700'}><strong className="text-[#3906d2]">Special:</strong> {[...specialInstructionsCheck, specialInstructionsOther].filter(Boolean).join(', ')}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Cleaner Estimated Match Speed */}
            <div className={`p-4 rounded-2xl border flex items-center gap-3 ${isDark ? 'bg-[#3906d2]/15 border-[#3906d2]/20' : 'bg-[#3906d2]/5 border-[#3906d2]/15'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold animate-pulse ${isDark ? 'bg-slate-950 text-[#3906d2]' : 'bg-slate-100 text-[#3906d2]'}`}>
                🕒
              </div>
              <div className="flex-1 text-left">
                <p className="text-[10px] font-black uppercase text-[#3906d2]">Avg response time: ~2-3 Minutes</p>
                <p className={`text-[9px] leading-relaxed ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  There are <span className={isDark ? "text-white font-heavy underline" : "text-slate-900 font-heavy underline"}>12 expert cleaners</span> matching your filter within a 3-mile radius.
                </p>
              </div>
            </div>

            {/* Extra Specifications */}
            {jobDetails && (
              <div className={`p-4 rounded-2xl border text-left ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-150 shadow-sm'}`}>
                <span className={`text-[9px] uppercase tracking-widest block font-black ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Extra Specifics</span>
                <p className={`text-xs font-bold mt-1 leading-snug italic ${isDark ? 'text-white/80' : 'text-slate-700'}`}>"{jobDetails}"</p>
              </div>
            )}

            {/* Safety Lock Note */}
            <div className="flex gap-2.5 items-start px-2">
              <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className={`text-[9px] leading-snug text-left ${isDark ? 'text-white/40' : 'text-slate-500'}`}>
                Funds are held in secure escrow. You only release payment to the professional once you confirm they completed the job to your high satisfaction.
              </p>
            </div>

          </div>

          {/* Broadcast CTA Slider Bar */}
          <div className={`absolute bottom-0 left-0 right-0 p-5 backdrop-blur-2xl border-t z-25 ${isDark ? 'bg-slate-950/80 border-white/5' : 'bg-white/95 border-slate-150 shadow-lg'}`}>
            {(profile?.balance || 0) < bidAmount ? (
              <div className="space-y-4">
                <div className={`p-4 rounded-2.5xl text-left space-y-2 border ${isDark ? 'bg-red-500/15 border-red-500/20' : 'bg-red-500/10 border-red-500/15'}`}>
                  <div className="flex items-center gap-2 text-rose-500 font-extrabold text-[10px] uppercase tracking-wider">
                    <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                    INSUFFICIENT FUNDS
                  </div>
                  <p className={`text-[10px] leading-relaxed ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                    Balance: <span className={`font-heavy ${isDark ? 'text-white' : 'text-slate-900'}`}>${(profile?.balance || 0).toFixed(2)}</span>. This request is valued at <span className="text-[#3906d2] font-heavy">${bidAmount}</span>. Add funds to complete the broadcast request.
                  </p>
                  
                  {/* Quick deposit selector */}
                  <div className="flex gap-2 pt-1 font-mono">
                    {[20, 50, 100, 200].map(amt => (
                      <button
                        key={amt}
                        onClick={() => setDepositAmount(amt)}
                        className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${
                          depositAmount === amt 
                            ? 'bg-[#3906d2] border-[#3906d2] text-white' 
                            : isDark ? 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10' : 'bg-slate-100 border-slate-200 text-slate-800 hover:bg-slate-200'
                        }`}
                      >
                        +${amt}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={async () => {
                    if (!user) return;
                    setIsDepositing(true);
                    try {
                      const userRef = doc(db, 'users', user.uid);
                      const currentBalance = profile?.balance || 0;
                      await updateDoc(userRef, { balance: currentBalance + depositAmount });
                      await addDoc(collection(db, 'users', user.uid, 'transactions'), {
                        type: 'Deposit (Quick)',
                        amount: depositAmount,
                        createdAt: serverTimestamp()
                      });
                      alert(`🎉 Wallet updated successfully! Added $${depositAmount} to your balance.`);
                    } catch (e) {
                      console.error("Failed to add funds inside booking flow:", e);
                      alert('Could not update wallet balance. Please try again.');
                    } finally {
                      setIsDepositing(false);
                    }
                  }}
                  disabled={isDepositing}
                  className={`w-full py-4.5 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${isDark ? 'bg-white text-slate-950 hover:bg-slate-100' : 'bg-slate-900 text-white hover:bg-slate-850'}`}
                >
                  {isDepositing ? 'Processing Top-up...' : `Confirm & Top-up $${depositAmount}`}
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setStep('SEARCHING')}
                className="w-full py-5 bg-[#3906d2] text-white rounded-2xl font-black text-[13px] uppercase tracking-[0.3em] shadow-2xl shadow-[#3906d2]/40 active:scale-98 transition-all flex items-center justify-center gap-2"
              >
                <ArrowUpRight className="w-5 h-5 text-white animate-bounce" />
                Broadcast Offer Request
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. SEARCHING FOR CLEANERS SCREEN */}
      {step === 'SEARCHING' && (
        <div id="booking-searching" className={`flex-1 flex flex-col h-full p-6 justify-between overflow-hidden relative ${isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
          
          {/* Subtle Ambient Radar Lines Grid */}
          <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
            <div className="w-[500px] h-[500px] rounded-full border border-[#3906d2] animate-ping duration-[3000ms]"></div>
            <div className={`w-[300px] h-[300px] rounded-full border animate-pulse ${isDark ? 'border-white' : 'border-slate-300'}`}></div>
            <div className="w-[150px] h-[150px] rounded-full border border-[#3906d2]"></div>
          </div>

          <div className={`w-full flex justify-between items-center pt-10 px-2 z-10 font-sans ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
            <span className="text-[10px] font-black uppercase tracking-widest animate-pulse text-[#3906d2]">Scanning Airwaves...</span>
            <div className={`border px-3 py-1 rounded-full text-[9px] font-black ${isDark ? 'bg-white/10 border-white/15' : 'bg-slate-200 border-slate-300'}`}>
              ACTIVE ESCROW APPROVED
            </div>
          </div>

          {/* Epic Pulsing Radar Centerpiece */}
          <div className="flex flex-col items-center justify-center space-y-8 z-10 my-auto">
            <div className="relative flex justify-center items-center w-52 h-52">
              
              {/* Radar Sweeper Spin */}
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                className="absolute inset-0 rounded-full border-2 border-[#3906d2]/10 border-t-[#3906d2]/80 border-r-[#3906d2]/80"
              />

              {/* Pulsing Base Ring */}
              <div className={`absolute w-44 h-44 rounded-full border flex flex-col items-center justify-center text-center shadow-[0_0_80px_rgba(57,6,210,0.1)] ${isDark ? 'border-white/5 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                <Compass className="w-10 h-10 text-[#3906d2] animate-spin duration-[8s] mb-2" />
                <p className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Broadcasting</p>
                <p className={`text-xl font-black mt-0.5 ${isDark ? 'text-white' : 'text-slate-800'}`}>${bidAmount} OFFER</p>
              </div>

              {/* Ping particles mimicking cleaners in radius */}
              <div className="absolute top-10 right-10 w-2.5 h-2.5 bg-[#3906d2] rounded-full border border-white shadow-[0_0_15px_#3906d2] animate-ping"></div>
              <div className={`absolute bottom-8 left-12 w-2 h-2 rounded-full border shadow-[0_0_10px_rgba(0,0,0,0.1)] animate-pulse ${isDark ? 'bg-white border-white' : 'bg-slate-600 border-slate-600'}`}></div>
              <div className="absolute top-32 left-6 w-2.5 h-2.5 bg-[#3906d2] rounded-full border border-white shadow-[0_0_12px_#3906d2] animate-ping duration-1500"></div>
            </div>

            {/* Live stats */}
            <div className="space-y-1.5 text-center">
              <h2 className={`text-lg font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-850'}`}>Matching Custom Contracts</h2>
              <p className={`text-xs tracking-wide max-w-xs leading-relaxed font-sans ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                Scanned <span className="text-[#3906d2] font-bold">{cleanersScanned}/24</span> verified pros near Soho...
              </p>
            </div>
          </div>

          {/* Bid Increase Suggestion Banner (Mandatory user feature request!) */}
          <div className="z-10 space-y-4 mb-4">
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-left ${isDark ? 'bg-[#3906d2]/10 border-[#3906d2]/25 shadow-2xl' : 'bg-[#3906d2]/5 border-[#3906d2]/15 shadow-sm'}`}
            >
              <div className="flex gap-2 items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isDark ? 'bg-slate-950' : 'bg-slate-100'}`}>
                  <ArrowUpRight className="w-4.5 h-4.5 text-[#3906d2]" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-black tracking-wider text-[#3906d2]">BOOST MATCH SUCCESS SPEED</p>
                  <p className={`text-[9px] ${isDark ? 'text-white/75' : 'text-slate-650'}`}>Add +$10 to matching criteria to get responses 2x faster!</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setBidAmount(p => p + 10);
                  alert('Bid price updated to $' + (bidAmount + 10) + '! Scanning restarted.');
                }}
                className="px-3.5 py-2.5 bg-[#3906d2] text-white rounded-xl text-[9px] font-black uppercase tracking-wider scale-95"
              >
                +$10 Booster
              </button>
            </motion.div>

            {/* Direct to Board */}
            <button 
              onClick={() => {
                setStep('INCOMING_OFFERS');
              }}
              className="text-[9px] text-[#3906d2]/60 hover:text-[#3906d2]/90 underline uppercase tracking-widest block mx-auto py-1 cursor-pointer font-bold"
            >
              (Skip and view Offers board directly)
            </button>
          </div>
        </div>
      )}

      {/* 5. INCOMING CLEANER OFFERS SCREEN */}
      {step === 'INCOMING_OFFERS' && (
        <div id="booking-incoming-offers" className="flex-1 flex flex-col h-full overflow-hidden">
          
          {/* Header */}
          <div className="pt-12 px-6 pb-4 flex items-center justify-between border-b border-white/5 bg-slate-900/40">
            <button onClick={() => setStep('BID_REVIEW')} className="p-2 -ml-2 rounded-xl active:bg-white/10 transition-colors">
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <div className="text-center">
              <h1 className="text-sm font-black uppercase tracking-widest text-[#3906d2]">Milestone Offers</h1>
              <p className="text-[9px] text-white/45 uppercase tracking-tighter"> Escrow value: ${bidAmount}</p>
            </div>
            <div className="w-10"></div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-4 pb-24 text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">
                {loadingBids ? "Finding Live Offers..." : "Received Counter-Offers"}
              </span>
              <span className={`px-2 py-0.5 rounded text-[9px] font-black ${loadingBids ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 animate-pulse' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'}`}>
                {loadingBids ? "Connecting Specialists..." : "Escrow Locked"}
              </span>
            </div>

            {loadingBids ? (
              // Bids Received Skeleton Loader List
              [...Array(3)].map((_, idx) => (
                <div 
                  key={idx} 
                  className="p-4 rounded-2.5xl bg-white/5 border border-white/10 space-y-3 relative overflow-hidden animate-pulse"
                >
                  {/* Category overlay label skeleton */}
                  <div className="absolute top-0 right-0 py-1.5 px-3 bg-white/5 rounded-bl-xl border-l border-b border-white/5">
                    <div className="w-16 h-2 rounded bg-white/20"></div>
                  </div>

                  <div className="flex gap-3">
                    {/* Pulsing Avatar */}
                    <div className="relative animate-pulse">
                      <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15" />
                      <div className="absolute -bottom-1 -right-1 bg-slate-950 px-2.5 py-1 rounded border border-white/10 w-9 h-4 bg-white/5 flex items-center" />
                    </div>

                    {/* Text rows skeleton */}
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3.5 bg-white/20 rounded w-1/3"></div>
                      <div className="h-2.5 bg-white/10 rounded w-2/3 animate-pulse"></div>
                      <div className="h-2 bg-white/5 rounded w-1/2"></div>
                    </div>
                  </div>

                  {/* Pricing grid skeleton */}
                  <div className="p-3 bg-slate-900/60 rounded-xl flex items-center justify-between border border-white/5">
                    <div className="space-y-1">
                      <div className="h-2 bg-white/10 rounded w-16 animate-pulse"></div>
                      <div className="h-5 bg-white/15 rounded w-12"></div>
                    </div>
                    <div className="space-y-1 flex flex-col items-end">
                      <div className="h-2 bg-white/10 rounded w-20"></div>
                      <div className="h-3 bg-white/10 rounded w-24 animate-pulse"></div>
                    </div>
                  </div>

                  {/* Action buttons skeletons */}
                  <div className="grid grid-cols-3 gap-2 pt-1 font-sans">
                    <div className="h-8.5 rounded-xl bg-white/5 border border-white/10" />
                    <div className="h-8.5 rounded-xl bg-white/5 border border-white/10" />
                    <div className="h-8.5 rounded-xl bg-[#3906d2]/20" />
                  </div>
                </div>
              ))
            ) : (
              cleanerOffers.map((cleaner, i) => (
              <div 
                key={cleaner.uid} 
                className="p-4 rounded-2.5xl bg-white/5 border border-white/10 hover:border-white/15 transition-all space-y-3 relative overflow-hidden"
              >
                {/* Background badge */}
                <span className="absolute top-0 right-0 py-1 px-3 bg-white/10 text-[8px] font-black tracking-widest uppercase text-white/80 rounded-bl-xl border-l border-b border-white/5">
                  Pro Cleaner
                </span>

                <div className="flex gap-3">
                  {/* Avatar */}
                  <div className="relative">
                    <img 
                      src={cleaner.photoURL} 
                      alt="" 
                      className="w-14 h-14 rounded-2xl object-cover border border-white/10"
                    />
                    <div className="absolute -bottom-1 -right-1 bg-slate-950 px-1 py-0.5 rounded border border-white/10 flex items-center gap-0.5 text-[8px] font-black">
                      <Star className="w-2.5 h-2.5 text-[#eab308] fill-current" />
                      {cleaner.ratingAverage}
                    </div>
                  </div>

                  {/* Rating, Experience */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-white truncate">{cleaner.displayName}</p>
                    <p className="text-[10px] text-[#3906d2] font-heavy font-mono tracking-tight">
                      ⭐️ Verified • {cleaner.jobsCompleted} Completed contracts
                    </p>
                    <p className="text-[9px] text-white/40 mt-0.5 font-bold">
                      📍 {cleaner.distanceMiles} Miles away ({cleaner.etaMinutes}mins arrival ETA)
                    </p>
                  </div>
                </div>

                {/* Offer Price Grid */}
                <div className="p-3 bg-slate-900 rounded-xl flex items-center justify-between border border-white/5">
                  <div>
                    <span className="text-[8px] uppercase tracking-widest text-white/40 block">Counter-Offer Bid</span>
                    <span className="text-xl font-black text-[#3906d2]">${cleaner.counterPrice}</span>
                  </div>
                  <div>
                    <span className="text-[8px] uppercase tracking-widest text-white/40 block">Price Difference</span>
                    <span className="text-[11px] font-bold text-red-400 font-mono">
                      +${cleaner.counterPrice - bidAmount} from your bid
                    </span>
                  </div>
                </div>

                {/* Triple Button Actions (Accept / Reject / Counter) */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  
                  {/* Counter action */}
                  <button 
                    onClick={() => handleOpenCounterScreen(cleaner)}
                    className="py-2.5 rounded-xl border border-white/10 hover:border-white/20 text-white font-black text-[9px] uppercase tracking-widest transition-all active:scale-95 text-center bg-white/5"
                  >
                    Counter
                  </button>

                  {/* Reject / Dismiss Action */}
                  <button 
                    onClick={async () => {
                      if (cleaner.id) {
                        try {
                          await updateDoc(doc(db, 'bids', cleaner.id), { status: 'REJECTED' });
                        } catch (e) {
                          console.error("Failed to reject bid:", e);
                        }
                      }
                      setCleanerOffers(prev => prev.filter(c => c.uid !== cleaner.uid));
                      alert(`Review rejected. Offer from ${cleaner.displayName} has been dismissed.`);
                    }}
                    className="py-2.5 rounded-xl border border-white/10 hover:border-red-500/25 hover:text-red-400 text-white/60 font-black text-[9px] uppercase tracking-widest transition-all active:scale-95 text-center bg-white/5"
                  >
                    Reject
                  </button>

                  {/* Accept Action */}
                  <button 
                    onClick={() => acceptOfferDirectly(cleaner)}
                    className="py-2.5 rounded-xl bg-[#3906d2] hover:brightness-105 text-white font-black text-[9px] uppercase tracking-widest transition-all active:scale-95 text-center"
                  >
                    Accept
                  </button>

                </div>

              </div>
            )))}

            {!loadingBids && cleanerOffers.length === 0 && (
              <div className="py-20 text-center space-y-4">
                <div className="w-12 h-12 rounded-full border border-dashed border-white/20 flex items-center justify-center mx-auto text-xl text-white/40">
                  🍃
                </div>
                <p className="text-xs text-white/50 max-w-xs mx-auto">No Active bids are left. You can rebuild your bid limit to trigger a brand-new live match search.</p>
                <button 
                  onClick={() => setStep('CREATE_REQUEST')}
                  className="px-4 py-2 bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-wider mx-auto"
                >
                  Adjust Bid Amount
                </button>
              </div>
            )}
            
          </div>
        </div>
      )}

      {/* 6. COUNTER OFFER SCREEN */}
      {step === 'COUNTER_OFFER' && activeNegotiatingCleaner && (
        <div id="booking-counter-offer" className="flex-1 flex flex-col h-full overflow-hidden">
          
          {/* Header */}
          <div className="pt-12 px-6 pb-4 flex items-center justify-between border-b border-white/5 bg-slate-900/40">
            <button onClick={() => setStep('INCOMING_OFFERS')} className="p-2 -ml-2 rounded-xl active:bg-white/10 transition-colors">
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <div className="text-center">
              <h1 className="text-xs font-black uppercase tracking-widest text-[#3906d2]">Counter-Bid Engine</h1>
              <p className="text-[9px] text-white/40 uppercase">With {activeNegotiatingCleaner.displayName}</p>
            </div>
            <div className="w-10"></div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6 text-left pb-28">

            {/* Custom Interactive Bidding Timeline Visual Widget (Spec Requirement) */}
            <div className="space-y-3">
              <h2 className="text-xs font-black text-white/50 uppercase tracking-wider">Bidding Timeline Milestones</h2>
              
              <div className="p-4 bg-white/5 rounded-2.5xl border border-white/10 relative space-y-4">
                
                {/* Visual Line connector */}
                <div className="absolute left-[29px] top-8 bottom-8 w-0.5 bg-white/10" />

                {(() => {
                  const liveNegotiation = activeNegotiatingCleaner 
                    ? (cleanerOffers.find(o => o.id === activeNegotiatingCleaner.id) || activeNegotiatingCleaner) 
                    : null;
                  const currentTimeline = liveNegotiation?.negotiationHistory || negotiationTimeline;
                  return currentTimeline.map((item: any, key: number) => (
                    <div key={key} className="flex gap-4 items-start relative z-10">
                      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 text-sm ${
                        item.sender?.toLowerCase() === 'customer' 
                          ? 'bg-slate-950 border-[#3906d2] text-[#3906d2]' 
                          : 'bg-slate-900 border-white text-white'
                      }`}>
                        {item.sender?.toLowerCase() === 'customer' ? '👤' : '🧹'}
                      </div>
                      <div id={`timeline-milestone-${key}`} className="flex-1 bg-slate-900/40 p-2.5 rounded-xl border border-white/5">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black uppercase text-white/80">
                            {item.label || (item.sender?.toLowerCase() === 'customer' ? 'Customer Offer' : 'Cleaner Proposal')}
                          </span>
                          <span className="text-[8px] text-white/30">{item.time || 'Just now'}</span>
                        </div>
                        <p className="text-xs font-black text-[#3906d2] mt-1">${item.amount}</p>
                      </div>
                    </div>
                  ));
                })()}

                {/* Real-time Indicator draft */}
                <div className="flex gap-4 items-start relative z-10 opacity-60">
                  <div className="w-8 h-8 rounded-full border-2 border-dashed border-white/10 bg-slate-950 flex items-center justify-center shrink-0 text-sm">
                    ⚡️
                  </div>
                  <div className="flex-1 bg-black/40 p-2.5 rounded-xl border border-dashed border-white/10">
                    <span className="text-[10px] font-black text-[#3906d2] uppercase animate-pulse">Your Pending Counter Offer</span>
                    <p className="text-xs font-black text-white mt-1">${counterInputAmount}</p>
                  </div>
                </div>

              </div>
            </div>

            {/* Price Wheel Selector */}
            <div className="space-y-2 text-center bg-slate-900 p-5 rounded-2.5xl border border-white/10">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/40 block">Set Counter Amount</span>
              <div className="flex justify-center items-center gap-4 py-2">
                <button 
                  onClick={() => setCounterInputAmount(p => Math.max(15, p - 2))}
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 text-xl font-bold flex items-center justify-center active:scale-95"
                >
                  -
                </button>
                <span className="text-3xl font-black text-[#3906d2]">${counterInputAmount}</span>
                <button 
                  onClick={() => setCounterInputAmount(p => p + 2)}
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 text-xl font-bold flex items-center justify-center active:scale-95"
                >
                  +
                </button>
              </div>

              {/* Counter-offer boundary warning/advice */}
              <p className="text-[9.5px] text-white/50 leading-relaxed pt-1.5 border-t border-white/5">
                Pro tip: Setting counter halfway (${Math.round((bidAmount + activeNegotiatingCleaner.counterPrice) / 2)}) guarantees extreme matching potential.
              </p>
            </div>

            {/* MANDATORY NO MESSAGING NOTICE (From explicit instructions!) */}
            <div className="p-4 bg-red-500/10 border border-red-500/25 rounded-2xl flex items-start gap-3">
              <Lock className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] font-black uppercase text-red-400">Lines Of Communication Locked</span>
                <p className="text-[9px] text-white/60 leading-normal mt-0.5">
                  Direct chat/messages are locked until a matching price has been approved and bound in escrow. Counter systems protect identity and bidding security.
                </p>
              </div>
            </div>

          </div>

          {/* Locked Timeline CTA */}
          <div className="absolute bottom-0 left-0 right-0 p-5 bg-slate-950/80 backdrop-blur-2xl border-t border-white/5 z-25 flex flex-col gap-2">
            {(() => {
              const liveNegotiation = activeNegotiatingCleaner 
                ? (cleanerOffers.find(o => o.id === activeNegotiatingCleaner.id) || activeNegotiatingCleaner) 
                : null;
              if (liveNegotiation && liveNegotiation.lastActionBy === 'cleaner') {
                return (
                  <button 
                    onClick={() => acceptOfferDirectly(liveNegotiation)}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg active:scale-98 transition-all text-center cursor-pointer font-sans"
                  >
                    Accept Cleaner's Counter (${liveNegotiation.bidPrice || liveNegotiation.price || activeNegotiatingCleaner.counterPrice})
                  </button>
                );
              }
              return null;
            })()}
            <button 
              onClick={submitCounterOffer}
              className="w-full py-4.5 bg-[#3906d2] text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg active:scale-98 transition-all text-center"
            >
              Submit Counter Offer
            </button>
          </div>
        </div>
      )}

      {/* 7. AGREEMENT CONFIRMATION SCREEN */}
      {step === 'AGREEMENT_CONFIRMATION' && assignedCleaner && (
        <div id="booking-agreement-confirmation" className="flex-1 flex flex-col h-full bg-slate-950 p-6 justify-between overflow-hidden relative">
          
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-slate-950 pointer-events-none"></div>

          {/* Visual sparkles confetti in background simulation */}
          <div className="absolute inset-x-10 top-20 flex justify-between pointer-events-none opacity-40">
            <span className="text-xl rotate-12 animate-ping text-[#3906d2]">✨</span>
            <span className="text-2xl -rotate-12 animate-pulse text-[#3906d2]">✨</span>
          </div>

          <div className="w-full pt-10 text-center z-10">
            <div id="price-lock-badge" className="inline-flex items-center gap-1.5 px-4.5 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[#3906d2] text-[10px] font-black uppercase tracking-[0.25em] shadow-[0_0_20px_rgba(57,6,210,0.15)]">
              <Check className="w-3.5 h-3.5 text-[#3906d2] stroke-[3px]" />
              PRICE LOCK SECURED
            </div>
          </div>

          {/* Celebration core content block */}
          <div className="my-auto space-y-6 z-10 text-center">
            
            <div className="relative inline-block">
              {/* Pulsing ring wrapping cleaner portrait */}
              <div className="absolute -inset-2 rounded-[32px] border border-[#3906d2]/20 bg-[#3906d2]/5 blur-[2px] animate-pulse"></div>
              
              <img 
                src={assignedCleaner.photoURL} 
                alt="Contractor Profile" 
                className="relative w-28 h-28 rounded-[28px] object-cover border-4 border-[#3906d2] mx-auto shadow-2xl"
              />

              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#3906d2] text-white text-[10px] font-extrabold px-3.5 py-1.5 rounded-full border-2 border-slate-950 uppercase tracking-widest whitespace-nowrap shadow-md font-sans">
                {assignedCleaner.ratingAverage} ★ Rated
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] text-white/50 uppercase tracking-widest font-black">Contract Assigned</p>
              <h1 className="text-xl font-black text-white">{assignedCleaner.displayName}</h1>
              <p className="text-[10px] font-mono text-[#3906d2]">
                {assignedCleaner.experienceYears} Years Experience • {assignedCleaner.jobsCompleted} Projects
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto p-4.5 bg-white/5 rounded-2.5xl border border-white/5">
              <div className="text-center border-r border-white/10 last:border-0 pr-2">
                <span className="text-[8px] uppercase tracking-widest text-white/40 block font-black">Arrival ETA</span>
                <span className="text-md font-black text-white">{assignedCleaner.etaMinutes} mins</span>
              </div>
              <div className="text-center pl-2">
                <span className="text-[8px] uppercase tracking-widest text-white/40 block font-black">Bound Cost</span>
                <span className="text-md font-black text-[#3906d2]">${finalAgreedPrice}</span>
              </div>
            </div>

            {/* Vehicle descriptor */}
            <p className="text-[10px] text-white/50 italic">
               En route driving {assignedCleaner.vehicleType || 'Silver SUV'}
            </p>

          </div>

          {/* Footer Interactive Actions */}
          <div className="z-10 space-y-3 mb-4">
            
            {/* Agreement Guarantee Stamp */}
            <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-[9px] text-white/55 flex justify-center items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              100% Satisfied ESCROW Secure Guarantee Included
            </div>

            <button 
              onClick={handleFinalConfirmAndTrack}
              className="w-full py-4.5 bg-[#3906d2] hover:brightness-105 text-white font-black text-xs uppercase tracking-[0.25em] rounded-2xi flex items-center justify-center gap-2 transition-transform active:scale-98 shadow-xl shadow-[#3906d2]/15"
            >
              <Navigation className="w-4 h-4 fill-current text-slate-950" />
              Live Track on Map
            </button>
          </div>

        </div>
      )}

    </div>
  );
}
