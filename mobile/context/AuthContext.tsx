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
  refreshProfile: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  isLoading: true,
  refreshProfile: async () => {},
  updateProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SupabaseCompatUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
      setIsLoading(true);
      unsubProfile?.();
      unsubProfile = null;

      if (firebaseUser) {
        let firstLoad = true;
        unsubProfile = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (snap) => {
            setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
            if (firstLoad) {
              firstLoad = false;
              setIsLoading(false);
            }
          },
          (err) => {
            console.error('Profile listener error:', err);
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
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) { setProfile(null); return; }
    const snapshot = await getDoc(doc(db, 'users', user.uid));
    setProfile(snapshot.exists() ? snapshot.data() as UserProfile : null);
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
    <AuthContext.Provider value={{ user, profile, isLoading, refreshProfile, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
