import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import {
  auth,
  db,
  onAuthStateChanged,
  doc,
  onSnapshot,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  SupabaseCompatUser,
} from '../services/supabase';
import { UserProfile } from '../types';
import { registerCurrentPushDevice } from '../services/pushRegistration';
import { isCleanerPresenceStarting, resumeCleanerLocationUpdates, stopCleanerLocationUpdates } from '../services/locationTracking';
import { callFunction } from '../services/functions';
import * as Location from 'expo-location';

interface AuthContextValue {
  user: SupabaseCompatUser | null;
  profile: UserProfile | null;
  isLoading: boolean;
  profileError: string | null;
  locationTrackingError: string | null;
  refreshProfile: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  isLoading: true,
  profileError: null,
  locationTrackingError: null,
  refreshProfile: async () => {},
  updateProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SupabaseCompatUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [locationTrackingError, setLocationTrackingError] = useState<string | null>(null);
  const [listenerRevision, setListenerRevision] = useState(0);
  const userId = user?.uid;

  useEffect(() => {
    let active = true;
    const stop = () => {
      setLocationTrackingError(null);
      stopCleanerLocationUpdates().catch((error) => console.warn('Could not stop cleaner location task:', error));
    };
    if ((!isLoading && !userId) || profile?.role === 'CUSTOMER') {
      stop();
      return () => { active = false; };
    }
    if (profile?.role === 'CLEANER' && profile.status !== 'AVAILABLE') {
      if (profile.status === 'OFFLINE' && !isCleanerPresenceStarting()) stop();
      return () => { active = false; };
    }
    if (!userId || profile?.role !== 'CLEANER' || profile.status !== 'AVAILABLE') {
      return () => { active = false; };
    }

    let reconciling = false;
    const reconcile = async () => {
      if (reconciling) return;
      reconciling = true;
      try {
        await resumeCleanerLocationUpdates();
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await callFunction('updateCleanerLocation', { lat: position.coords.latitude, lng: position.coords.longitude });
        if (active) setLocationTrackingError(null);
      } catch (error) {
        if (active) setLocationTrackingError(error instanceof Error ? error.message : 'Location sharing needs attention.');
      } finally {
        reconciling = false;
      }
    };
    void reconcile();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && active) void reconcile();
    });
    return () => { active = false; subscription.remove(); };
  }, [isLoading, userId, profile?.role, profile?.status]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const sync = () => { registerCurrentPushDevice().catch((error) => console.warn('Could not refresh this device notification registration:', error)); };
    sync();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active' && active) sync(); });
    return () => { active = false; subscription.remove(); };
  }, [userId]);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let previousUserId: string | null | undefined;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      const nextUserId = firebaseUser?.uid ?? null;
      if (previousUserId === nextUserId) return;
      previousUserId = nextUserId;
      setProfile(null);
      setProfileError(null);
      setIsLoading(true);
      unsubProfile?.();
      unsubProfile = null;

      if (firebaseUser) {
        let firstLoad = true;
        unsubProfile = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (snap) => {
            setProfileError(null);
            setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
            if (firstLoad) {
              firstLoad = false;
              setIsLoading(false);
            }
          },
          (err) => {
            console.error('Profile listener error:', err);
            setProfileError('We could not load your account details. Check your connection and try again.');
            if (firstLoad) {
              firstLoad = false;
              setIsLoading(false);
            }
          }
        );
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => {
      unsubAuth();
      unsubProfile?.();
    };
  }, [listenerRevision]);

  const refreshProfile = useCallback(async () => {
    if (!user) { setProfile(null); return; }
    setProfileError(null);
    setIsLoading(true);
    setListenerRevision((revision) => revision + 1);
    try {
      const snapshot = await getDoc(doc(db, 'users', user.uid));
      setProfile(snapshot.exists() ? snapshot.data() as UserProfile : null);
      setIsLoading(false);
    } catch (error) {
      setProfileError('We could not load your account details. Check your connection and try again.');
      setIsLoading(false);
      throw error;
    }
  }, [user]);

  const updateProfile = useCallback(
    async (data: Partial<UserProfile>) => {
      if (!user) return;
      await updateDoc(doc(db, 'users', user.uid), { ...data, updatedAt: serverTimestamp() });
      // No manual setProfile needed — onSnapshot fires automatically after the write
    },
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, profile, isLoading, profileError, locationTrackingError, refreshProfile, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
