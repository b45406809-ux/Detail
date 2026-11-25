import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { functionErrorMessage, supabase } from '../supabase';

export function InviteAcceptance() {
  const token = new URLSearchParams(location.search).get('token') || '';
  const [user, setUser] = useState<User | null>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const redirectTo = `${location.origin}/admin/accept-invite?token=${encodeURIComponent(token)}`;
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);
  const authenticate = async (create: boolean) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const address = email.trim().toLowerCase();
      const result = create
        ? await supabase.auth.signUp({ email: address, password, options: { emailRedirectTo: redirectTo } })
        : await supabase.auth.signInWithPassword({ email: address, password });
      if (result.error) throw result.error;
      if (create && !result.data.session) setNotice('If this address can be registered, check its inbox and spam folder for a confirmation link. Open it on this device, then return here. If you already have an account, sign in instead.');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const resend = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: redirectTo } });
      if (resendError) throw resendError;
      setNotice('If confirmation is needed for this account, check your inbox and spam folder for the email.');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  // App accounts sign in with an email code, Google or phone and have no password,
  // so offer the same email-code sign-in here for existing users.
  const sendCode = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
      if (otpError) throw otpError;
      setCodeSent(true);
      setNotice('Check your inbox and spam folder for a sign-in code from Detail, then enter it below.');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const verifyCode = async () => {
    setBusy(true); setError('');
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
      if (verifyError) throw verifyError;
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const savePassword = async () => {
    setError('');
    if (newPassword.length < 10) { setError('Use at least 10 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setPasswordSaved(true);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const accept = async () => {
    setBusy(true); setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('marketplace-api', { body: { name: 'acceptAdminInvite', data: { token } } });
      if (invokeError) throw new Error(await functionErrorMessage(invokeError, data));
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      setDone(true);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  if (!token) return <main className="admin-login"><form><h1>Invalid invitation</h1><p>The invitation link is missing its secure token.</p></form></main>;
  if (done && !passwordSaved) return <main className="admin-login"><form onSubmit={event => { event.preventDefault(); void savePassword(); }}><p>DETAIL SECURE OPERATIONS</p><h1>Set your dashboard password</h1><p>Your admin access is active. Set a password so you can sign in to the dashboard with your email and password next time.</p><label>New password<input type="password" required minLength={10} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label><label>Confirm password<input type="password" required minLength={10} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>{error && <div className="inline-error" role="alert">{error}</div>}<button type="submit" className="login-primary" disabled={busy}>Save password</button></form></main>;
  if (done) return <main className="admin-login"><form><h1>Access granted</h1><p>Your admin access is active and your password is saved. Next time, sign in to the dashboard with your email and password.</p><a className="login-primary invite-link" href="/admin">Open dashboard</a></form></main>;
  if (user === undefined) return <main className="admin-login"><p>Checking secure invitation…</p></main>;
  if (user) return <main className="admin-login"><form><h1>Accept admin invitation</h1><p>Signed in as {user.email}. The invitation must match this email.</p>{error && <div className="inline-error" role="alert">{error}</div>}<button type="button" className="login-primary" disabled={busy} onClick={accept}>{busy ? 'Verifying…' : 'Accept invitation'}</button><button type="button" disabled={busy} onClick={() => void supabase.auth.signOut()}>Use a different account</button></form></main>;
  return <main className="admin-login"><form onSubmit={event => { event.preventDefault(); void authenticate(false); }}><p>DETAIL SECURE OPERATIONS</p><h1>Admin invitation</h1><label>Email<input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)}/></label><label>Password<input type="password" minLength={8} required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)}/></label>{error && <div className="inline-error" role="alert">{error}</div>}{notice && <p role="status">{notice}</p>}<button className="login-primary" disabled={busy}>Sign in</button><button type="button" disabled={busy || !email || password.length < 8} onClick={() => void authenticate(true)}>Create account with this email</button><button type="button" disabled={busy || !email} onClick={() => void resend()}>Resend confirmation email</button><button type="button" disabled={busy || !email} onClick={() => void sendCode()}>Already use the Detail app? Email me a sign-in code</button>{codeSent && <><label>Sign-in code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} /></label><button type="button" className="login-primary" disabled={busy || code.trim().length < 6} onClick={() => void verifyCode()}>Verify code</button></>}<small>Use the email address that received the invitation. The link expires after seven days and can be used once.</small></form></main>;
}
