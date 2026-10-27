import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { AdminDashboard } from './AdminDashboard';
import { InviteAcceptance } from './InviteAcceptance';

export function AdminEntry() {
  if (location.pathname.startsWith('/admin/accept-invite')) return <InviteAcceptance/>;
  return <AdminSignIn/>;
}

function AdminSignIn() {
  const [user, setUser] = useState<User | null>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  if (user === undefined) return <main className="admin-login"><p>Checking secure session…</p></main>;
  // Administrator authorization and permissions are enforced by the API after
  // authentication. Admins no longer need to enroll or verify TOTP factors.
  if (user) return <AdminDashboard/>;

  const login = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try { await operation(); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };

  return <main className="admin-login"><form onSubmit={event => {
    event.preventDefault();
    login(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw error;
    });
  }}>
    <a className="admin-wordmark" href="/">DETAIL.</a><p>SECURE OPERATIONS</p><h1>Admin sign in</h1>
    <label>Email<input type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)}/></label>
    <label>Password<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)}/></label>
    {error && <div className="inline-error" role="alert">{error}</div>}
    <button className="login-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    <button type="button" disabled={busy} onClick={() => login(async () => {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/admin` } });
      if (error) throw error;
    })}>Continue with Google</button>
    <small>Authentication alone does not grant access. An administrator role assigned by Detail is required.</small>
  </form></main>;
}
