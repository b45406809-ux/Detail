import { useEffect,useState } from 'react';
import { AdminDashboard } from './AdminDashboard';
import { InviteAcceptance } from './InviteAcceptance';
import { clearSession,currentAdmin,login,type AdminSession } from './session';

export function AdminEntry(){if(location.pathname.startsWith('/admin/accept-invite'))return <InviteAcceptance/>;return <AdminSignIn/>}
 function AdminSignIn(){const [admin,setAdmin]=useState<AdminSession|null>();const [email,setEmail]=useState('crzzphillip@gmail.com');const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{currentAdmin().then(setAdmin).catch(()=>{clearSession();setAdmin(null)})},[]);
 if(admin===undefined)return <main className="admin-login"><p>Checking secure session…</p></main>;
 if(admin)return <AdminDashboard/>;
 const submit=async()=>{setBusy(true);setError('');try{setAdmin(await login(email,password))}catch(error){setError((error as Error).message)}finally{setBusy(false)}};
 return <main className="admin-login"><form onSubmit={event=>{event.preventDefault();void submit()}}><a className="admin-wordmark" href="/">DETAIL.</a><p>SECURE OPERATIONS</p><h1>Admin sign in</h1><label>Email<input type="email" required autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)}/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)}/></label>{error&&<div className="inline-error" role="alert">{error}</div>}<button className="login-primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button><small>Authentication and dashboard data are provided by the protected Cloudflare Worker and D1 database.</small></form></main>}
