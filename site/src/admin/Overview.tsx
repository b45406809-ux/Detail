import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { adminCall, getOverview } from './api';
import type { OverviewData } from './types';

const money = (value: number, currency: string) => new Intl.NumberFormat('en-ZW', { style: 'currency', currency }).format(value / 100);

function DatabaseUsage() {
  const [usage, setUsage] = useState<{asOf:string; databaseBytes:number; chatTableBytes:number; fileStorageBytes:number; fileCount:number; activeUsers30d:number; messages30d:number; providerMeters?:Record<string,any>; source?:string}>();
  const [error, setError] = useState('');
  const load = async (force=false) => {
    const key='detail:usage-snapshot:v1';
    if(!force){try{const cached=JSON.parse(sessionStorage.getItem(key)||'null');if(cached&&Date.now()-Date.parse(cached.asOf)<24*60*60*1000){setUsage(cached);return;}}catch{}}
    try{const fresh=await adminCall<any>('adminUsage');setUsage(fresh);sessionStorage.setItem(key,JSON.stringify(fresh));setError('');}
    catch{setError('Usage could not be read. Check Supabase Usage and Reports.');}
  };
  useEffect(() => { void load(); }, []);
  const r2=usage?.providerMeters?.cloudflareR2;
  const smsPop=usage?.providerMeters?.smspop;
  const rows=usage?[{name:'Database',value:usage.databaseBytes,limit:500_000_000,unit:'MB',divisor:1_000_000},{name:'Supabase file storage',value:usage.fileStorageBytes,limit:1_073_741_824,unit:'MB',divisor:1_000_000},{name:'Monthly active users (sign-in estimate)',value:usage.activeUsers30d,limit:50_000,unit:'users',divisor:1},{name:'Chat messages (30d; database rows)',value:usage.messages30d,limit:null,unit:'messages',divisor:1},...(r2?.status==='measured'?[{name:'Cloudflare R2 storage (account-wide)',value:r2.storageBytes,limit:r2.freeStorageBytes,unit:'GB',divisor:1_000_000_000}]:[])] : [];
  const alerts=rows.filter(row=>row.limit&&row.value/row.limit>=.6);
  return <article className="panel"><div className="panel-title"><h2>Usage and free-tier watch</h2><button onClick={()=>void load(true)}>Refresh usage</button></div>
    {alerts.map(row=><p className="alert-count" role="alert" key={row.name}><AlertTriangle size={14}/>{row.name} is at {(row.value/row.limit!*100).toFixed(1)}% of its Free-plan reference.</p>)}
    {error?<p className="inline-error">{error}</p>:!usage?<p className="muted">Loading usage…</p>:<><div className="rows">{rows.map(row=><div className="row" key={row.name}><b>{row.name}</b><span>{(row.value/row.divisor).toLocaleString(undefined,{maximumFractionDigits:1})} {row.unit}{row.limit?` / ${(row.limit/row.divisor).toLocaleString()} (${(row.value/row.limit*100).toFixed(1)}%)`:' · no fixed free-plan quota'}</span></div>)}</div><p className="muted">Chat table and indexes: {(usage.chatTableBytes/1_000_000).toFixed(1)} MB. Active users are estimated from sign-in timestamps. {usage.source === 'daily snapshot' ? 'Daily snapshot' : 'Live fallback'}: {new Date(usage.asOf).toLocaleString()}.</p></>}
    <h3>Provider meters</h3><div className="rows">
      {usage?.providerMeters?.supabaseApiRequests?.status==='measured' ? <div className="row"><b>Supabase API requests · last 24h</b><span>{Object.entries(usage.providerMeters.supabaseApiRequests.counts??{}).map(([name,value])=>`${name}: ${Number(value).toLocaleString()}`).join(' · ')} · telemetry only, not a billing meter</span></div> : <div className="row"><b>Supabase API requests</b><span>{usage?.providerMeters?.supabaseApiRequests?.note ?? 'Not measured yet; daily Management API telemetry is not connected.'}</span></div>}
      {usage?.providerMeters?.twilio?.status==='measured' ? <div className="row"><b>Twilio SMS · previous month</b><span>{(usage.providerMeters.twilio.records??[]).map((record:any)=>`${record.category}: ${record.count.toLocaleString()} ${record.countUnit ?? 'units'} · $${record.price.toFixed(2)}`).join(' · ') || 'No SMS usage records reported'}</span></div> : <div className="row"><b>Twilio SMS</b><span>{usage?.providerMeters?.twilio?.note ?? 'Not measured yet; daily provider snapshot has not run.'}</span></div>}
      {smsPop?.status==='measured' ? <div className="row"><b>SMSPoP · last 30 days</b><span>{smsPop.campaigns.toLocaleString()} campaigns · {smsPop.sent.toLocaleString()} accepted recipients · {smsPop.delivered.toLocaleString()} delivered · {smsPop.undelivered.toLocaleString()} undelivered · {smsPop.failed.toLocaleString()} failed. {smsPop.truncated ? 'History capped at 1,500 campaigns.' : ''} Report counts are not SMS credit totals.</span></div> : <div className="row"><b>SMSPoP</b><span>{smsPop?.note ?? 'Not measured yet; set SMSPOP_API_KEY or SMSPOP_API_TOKEN as a protected reporting secret.'}</span></div>}
      <div className="row"><b>Mapbox</b><span>Usage not connected. Account statistics need a statistics-enabled token; app map tokens cannot report billing usage.</span></div>
      {r2?.status==='measured' ? <div className="row"><b>Cloudflare R2</b><span>{(r2.storageBytes/1_000_000_000).toLocaleString(undefined,{maximumFractionDigits:2})} GB stored across the account · {Number(r2.objectCount).toLocaleString()} published objects · 10 GB free storage reference; request operations are not exposed by this endpoint.</span></div> : <div className="row"><b>Cloudflare R2</b><span>{r2?.note ?? 'R2 usage is not connected to the account usage API.'}</span></div>}
      <div className="row"><b>PostHog</b><span>Event volume and plan allowance are not connected to the account usage API.</span></div>
      <div className="row"><b>Resend</b><span>Email sends and monthly free allowance are not connected to provider usage reporting.</span></div>
      <div className="row"><b>Didit</b><span>KYC checks and remaining sandbox/live credits are not connected; no identity checks are triggered by monitoring.</span></div>
      <div className="row"><b>Paynow</b><span>Transaction volume and fees are not connected; sandbox/production totals must be checked in Paynow.</span></div>
      <div className="row"><b>Turnstile</b><span>Challenge volume and account quota are not connected.</span></div>
      <div className="row"><b>Firebase / Expo push</b><span>Push delivery and provider usage are not connected; notification sends are not generated by this monitor.</span></div>
      <div className="row"><b>Google and Apple sign-in</b><span>OAuth usage and provider quotas are not connected; Supabase monthly active users are only an estimate.</span></div>
    </div><p className="muted">Dashboard checks are cached for 24 hours and do not poll in the background. Free-plan limits shown here are references; confirm the active account plan and exact billing usage with each provider.</p>
    <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Open Supabase dashboard ↗</a>
  </article>;
}

export function Overview({ navigate, canViewUsage }: { navigate: (route: string, id?: string) => void; canViewUsage: boolean }) {
  const [period, setPeriod] = useState<'7d' | '30d' | '12m'>('30d');
  const [retryKey, setRetryKey] = useState(0);
  const [data, setData] = useState<OverviewData>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); setError(''); getOverview(period).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [period, retryKey]);
  if (loading) return <div className="admin-state">Loading timestamped operational metrics…</div>;
  if (error || !data) return <div className="admin-state error">Metrics unavailable: {error}<button onClick={() => setRetryKey(key => key + 1)}>Retry</button></div>;
  const max = Math.max(...data.revenue.map(p => p.amount), 1);
  return <section>
    <header className="module-header"><div><h1>Overview</h1><p>Operational day: <b>{data.timezone}</b> · Currency: <b>{data.currency}</b> · Updated {new Date(data.asOf).toLocaleString()}</p></div><RefreshCw size={18}/></header>
    <div className="metric-grid">{data.metrics.map(metric => <article className="metric" key={metric.label}><span>{metric.label}</span>{metric.error ? <strong className="error">Unavailable</strong> : <strong>{metric.format === 'money' ? money(metric.value, data.currency) : metric.value.toLocaleString()}</strong>}</article>)}</div>
    {canViewUsage && <DatabaseUsage/>}
    <article className="panel"><div className="panel-title"><h2>Captured revenue</h2><div>{(['7d','30d','12m'] as const).map(p => <button className={period === p ? 'active' : ''} onClick={() => setPeriod(p)} key={p}>{p}</button>)}</div></div><div className="chart" role="img" aria-label={`Revenue for ${period}`}>{data.revenue.map(point => <div className="bar-slot" key={point.label} title={`${point.label}: ${money(point.amount, data.currency)}`}><div className="bar" style={{height: `${Math.max(3, point.amount / max * 100)}%`}}/><small>{point.label}</small></div>)}</div></article>
    <article className="panel"><div className="panel-title"><h2>Jobs needing attention</h2><span className="alert-count"><AlertTriangle size={14}/>{data.attention.length}</span></div>{data.attention.length === 0 ? <p className="muted">No active operational alerts.</p> : <div className="rows">{data.attention.map(a => <button className="row" key={a.id} onClick={() => navigate(a.caseId ? 'support' : 'bookings', a.caseId || a.bookingId)}><b>{a.rule}</b><span>{a.ageMinutes}m · Open →</span></button>)}</div>}</article>
  </section>;
}
