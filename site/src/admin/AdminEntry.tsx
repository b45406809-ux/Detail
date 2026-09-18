import { useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, type User } from 'firebase/auth';
import { auth } from '../firebase';
import { AdminDashboard } from './AdminDashboard';
import { InviteAcceptance } from './InviteAcceptance';

export function AdminEntry() {
  if (location.pathname.startsWith('/admin/accept-invite')) return <InviteAcceptance/>;
  return <AdminSignIn/>;
}

function AdminSignIn() {
  const [user, setUser] = useState<User | null>();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  if (user === undefined) return <main className="admin-login"><p>Checking secure session…</p></main>;
  if (user) return <AdminDashboard/>;
  const login = async (operation: () => Promise<unknown>) => { setBusy(true); setError(''); try { await operation(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } };
  return <main className="admin-login"><form onSubmit={event => { event.preventDefault(); login(() => signInWithEmailAndPassword(auth, email, password)); }}><a className="admin-wordmark" href="/">DETAIL.</a><p>SECURE OPERATIONS</p><h1>Admin sign in</h1><label>Email<input type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)}/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)}/></label>{error && <div className="inline-error" role="alert">{error}</div>}<button className="login-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button><button type="button" disabled={busy} onClick={() => login(() => signInWithPopup(auth, new GoogleAuthProvider()))}>Continue with Google</button><small>Authentication is necessary but not sufficient. Your Firebase token must also carry a verified admin claim.</small></form></main>;
}
