import { useEffect, useState } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';

export function InviteAcceptance() {
  const token=new URLSearchParams(location.search).get('token')||''; const [user,setUser]=useState<User|null>(); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const [done,setDone]=useState(false);
  useEffect(()=>onAuthStateChanged(auth,setUser),[]);
  const authenticate=async(create:boolean)=>{setBusy(true);setError('');try{if(create)await createUserWithEmailAndPassword(auth,email,password);else await signInWithEmailAndPassword(auth,email,password)}catch(error){setError((error as Error).message)}finally{setBusy(false)}};
  const accept=async()=>{setBusy(true);setError('');try{await httpsCallable(functions,'acceptAdminInvite')({token});await auth.currentUser?.getIdToken(true);setDone(true)}catch(error){setError((error as Error).message)}finally{setBusy(false)}};
  if(!token)return <main className="admin-login"><form><h1>Invalid invitation</h1><p>The invitation link is missing its secure token.</p></form></main>;
  if(done)return <main className="admin-login"><form><h1>Access granted</h1><p>Your verified admin claim is active.</p><a className="login-primary invite-link" href="/admin">Open dashboard</a></form></main>;
  if(user===undefined)return <main className="admin-login"><p>Checking secure invitation…</p></main>;
  if(user)return <main className="admin-login"><form><h1>Accept admin invitation</h1><p>Signed in as {user.email}. The invitation must match this email.</p>{error&&<div className="inline-error">{error}</div>}<button type="button" className="login-primary" disabled={busy} onClick={accept}>{busy?'Verifying…':'Accept invitation'}</button><button type="button" disabled={busy} onClick={()=>signOut(auth)}>Use a different account</button></form></main>;
  return <main className="admin-login"><form onSubmit={event=>{event.preventDefault();authenticate(false)}}><p>DETAIL SECURE OPERATIONS</p><h1>Admin invitation</h1><label>Email<input type="email" required value={email} onChange={event=>setEmail(event.target.value)}/></label><label>Password<input type="password" minLength={8} required value={password} onChange={event=>setPassword(event.target.value)}/></label>{error&&<div className="inline-error">{error}</div>}<button className="login-primary" disabled={busy}>Sign in</button><button type="button" disabled={busy} onClick={()=>authenticate(true)}>Create account with this email</button><small>The signed-in email must exactly match the invitation. The link expires after seven days and can be used once.</small></form></main>;
}
