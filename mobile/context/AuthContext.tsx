import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  auth,
  db,
  onAuthStateChanged,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  FirebaseUser,
} from '../services/firebase';
import { UserProfile } from '../types';

interface AuthContextValue {
  user: FirebaseUser | null;
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
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
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

  // No-op: onSnapshot keeps profile live automatically
  const refreshProfile = useCallback(async () => {}, []);

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
