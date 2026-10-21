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
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);
  if (user === undefined) return <main className="admin-login"><p>Checking secure session…</p></main>;
  if (user) return <AdminMfaGate user={user}/>;
  const login = async (operation: () => Promise<unknown>) => { setBusy(true); setError(''); try { await operation(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } };
  return <main className="admin-login"><form onSubmit={event => { event.preventDefault(); login(async () => { const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }); if (error) throw error; }); }}><a className="admin-wordmark" href="/">DETAIL.</a><p>SECURE OPERATIONS</p><h1>Admin sign in</h1><label>Email<input type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)}/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)}/></label>{error && <div className="inline-error" role="alert">{error}</div>}<button className="login-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button><button type="button" disabled={busy} onClick={() => login(async () => { const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/admin` } }); if (error) throw error; })}>Continue with Google</button><small>Authentication alone does not grant access. An administrator role assigned by Detail is required.</small></form></main>;
}

function AdminMfaGate({user}:{user:User}){
  const [stage,setStage]=useState<'checking'|'enroll'|'verify'|'ready'|'error'>('checking');
  const [factorId,setFactorId]=useState('');const [qr,setQr]=useState('');const [secret,setSecret]=useState('');
  const [code,setCode]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try{
        const {data:role}=await supabase.from('adminroles').select('userid').eq('userid',user.id).maybeSingle();
        if(!role)throw new Error('Your account does not have a verified administrator role.');
        const {data:assurance,error:assuranceError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();if(assuranceError)throw assuranceError;
        if(assurance.currentLevel==='aal2'){if(active)setStage('ready');return;}
        const {data:factors,error:factorsError}=await supabase.auth.mfa.listFactors();if(factorsError)throw factorsError;
        const factor=factors.totp.find(item=>item.status==='verified');
        if(factor){if(active){setFactorId(factor.id);setStage('verify');}return;}
        // Supabase does not expose the seed again after an interrupted setup.
        // Remove stale unverified factors and create a fresh QR code instead
        // of rendering undefined credentials or bypassing the second factor.
        for(const stale of factors.totp.filter(item=>item.status!=='verified')){
          const {error:removeError}=await supabase.auth.mfa.unenroll({factorId:stale.id});
          if(removeError)throw removeError;
        }
        const {data:newFactor,error:enrollError}=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'Detail Admin Authenticator'});if(enrollError)throw enrollError;
        if(active){setFactorId(newFactor.id);setQr(newFactor.totp.qr_code);setSecret(newFactor.totp.secret);setStage('enroll');}
      }catch(e){if(active){setError((e as Error).message);setStage('error');}}
    })();
    return()=>{active=false;};
  },[user.id]);
  const verify=async()=>{
    setBusy(true);setError('');try{
      const challenge=await supabase.auth.mfa.challenge({factorId});if(challenge.error)throw challenge.error;
      const result=await supabase.auth.mfa.verify({factorId,challengeId:challenge.data.id,code:code.trim()});if(result.error)throw result.error;
      const assurance=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();if(assurance.data?.currentLevel!=='aal2')throw new Error('Authenticator verification did not reach the required security level.');
      setStage('ready');
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  if(stage==='ready')return <AdminDashboard/>;
  if(stage==='checking')return <main className="admin-login"><p>Checking administrator security…</p></main>;
  return <main className="admin-login"><section><a className="admin-wordmark" href="/">DETAIL.</a><p>SECURE OPERATIONS</p><h1>{stage==='verify'?'Verify your sign-in':'Set up admin authentication'}</h1><p>Detail admin accounts require an authenticator code before accessing operations and finance tools.</p>{stage==='enroll'&&<><p>Scan this QR code in an authenticator app, then enter the six-digit code.</p>{qr&&<img alt="Authenticator setup QR code" src={qr} style={{width:220,height:220,background:'white',padding:12,borderRadius:12}}/>}{secret&&<small>Setup key: {secret}</small>}</>}{stage!=='error'&&<><label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))}/></label><button className="login-primary" disabled={busy||code.length!==6} onClick={()=>void verify()}>{busy?'Verifying…':'Verify authenticator'}</button></>}{error&&<div className="inline-error" role="alert">{error}</div>}<button onClick={()=>void supabase.auth.signOut()}>Sign out</button></section></main>;
}
