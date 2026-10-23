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

interface AuthContextValue {
  user: SupabaseCompatUser | null;
  profile: UserProfile | null;
  isLoading: boolean;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  isLoading: true,
  profileError: null,
  refreshProfile: async () => {},
  updateProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SupabaseCompatUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [listenerRevision, setListenerRevision] = useState(0);
  const userId = user?.uid;

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

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
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
    <AuthContext.Provider value={{ user, profile, isLoading, profileError, refreshProfile, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
