import { useEffect, useState } from 'react';
import { Download, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { waitlistAdminCall } from './api';

interface WaitlistRow { id:string; participantType:string; fullName:string; phone:string; email:string; country:string; city:string; area:string; preferredLanguage:string; serviceInterest:string; marketingEmailPermission:'YES'|'NO'; status:string; createdAt:string }
interface WaitlistResult { rows:WaitlistRow[]; nextCursor:string|null }

export function Waitlist() {
  const [result,setResult]=useState<WaitlistResult>({rows:[],nextCursor:null}); const [cursor,setCursor]=useState<string>(); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const [subject,setSubject]=useState(''); const [message,setMessage]=useState(''); const [sending,setSending]=useState(false); const [sent,setSent]=useState('');
  const [filters,setFilters]=useState({country:'',city:'',serviceInterest:'',preferredLanguage:''});
  const load=(next?:string)=>{setLoading(true);setError('');waitlistAdminCall<WaitlistResult>(`/api/admin/waitlist?limit=50${next?`&cursor=${encodeURIComponent(next)}`:''}`).then(data=>{setResult(data);setCursor(next)}).catch(e=>setError(e.message)).finally(()=>setLoading(false));};
  useEffect(()=>load(),[]);
  const download=()=>{
    const columns=['participantType','fullName','phone','email','country','city','area','preferredLanguage','serviceInterest','marketingEmailPermission','status','createdAt'] as const;
    const cell=(value:unknown)=>{
      let safe=String(value??'');
      if(/^[\s\u0000-\u001f]*[=+\-@]/.test(safe))safe=`'${safe}`;
      return `"${safe.replaceAll('"','""')}"`;
    };
    const csv=[columns.map(cell).join(','),...result.rows.map(row=>columns.map(key=>cell(row[key])).join(','))].join('\r\n');
    const url=URL.createObjectURL(new Blob([`\uFEFF${csv}`],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`detail-waitlist-${new Date().toISOString().slice(0,10)}.csv`;link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const send=async()=>{if(!subject.trim()||!message.trim())return setError('Enter a campaign subject and message.');if(!confirm('Send this campaign only to waitlist members who explicitly selected Yes to marketing email?'))return;setSending(true);setError('');setSent('');try{const response=await waitlistAdminCall<{recipientCount:number}>('/api/admin/campaign',{method:'POST',body:{subject,message,filters,idempotencyKey:crypto.randomUUID()}});setSent(`Campaign sent to ${response.recipientCount} opted-in recipient${response.recipientCount===1?'':'s'}.`);setSubject('');setMessage('')}catch(e:any){setError(e.message)}finally{setSending(false)}};
  return <section><header className="module-header"><div><h1>Waitlist & Email</h1><p>Contact preferences, service demand and consent-safe marketing</p></div><button onClick={()=>load(cursor)}><RefreshCw size={16}/> Refresh</button></header>
    <article className="panel consent-note"><ShieldCheck size={20}/><div><b>Consent enforced server-side</b><p>Campaigns are sent only to records whose latest marketing choice is Yes. Each message includes an unsubscribe link and every send is audited.</p></div></article>
    {error&&<div className="inline-error">{error}</div>}{sent&&<div className="inline-success">{sent}</div>}
    <article className="panel"><div className="panel-title"><h2>Waitlist records</h2><button onClick={download} disabled={!result.rows.length}><Download size={15}/> Download current page CSV</button></div><div className="table-wrap"><table><thead><tr><th>Type</th><th>Name</th><th>Phone</th><th>Email</th><th>Country</th><th>City</th><th>Area / suburb</th><th>Language</th><th>Services</th><th>Marketing</th><th>Joined</th></tr></thead><tbody>{loading?<tr><td colSpan={11}>Loading waitlist…</td></tr>:result.rows.length===0?<tr><td colSpan={11}>No waitlist records yet.</td></tr>:result.rows.map(row=><tr key={row.id}><td>{row.participantType}</td><td>{row.fullName}</td><td>{row.phone}</td><td>{row.email}</td><td>{row.country}</td><td>{row.city}</td><td>{row.area}</td><td>{row.preferredLanguage}</td><td>{row.serviceInterest}</td><td><span className={row.marketingEmailPermission==='YES'?'status-yes':'status-no'}>{row.marketingEmailPermission}</span></td><td>{row.createdAt?new Date(row.createdAt).toLocaleDateString():'—'}</td></tr>)}</tbody></table></div><div className="pager"><span>50 records per server page</span><div><button disabled={!cursor} onClick={()=>load()}>First page</button><button disabled={!result.nextCursor} onClick={()=>load(result.nextCursor||undefined)}>Next page</button></div></div></article>
    <article className="panel campaign"><div className="panel-title"><div><h2>New marketing campaign</h2><p className="muted">Requires the marketing.send custom-claim permission. Sends matching opted-in recipients in batches of up to 100 and rechecks consent before every batch.</p></div><Mail size={20}/></div><div className="campaign-filters"><input placeholder="Country (optional)" value={filters.country} onChange={e=>setFilters({...filters,country:e.target.value})}/><input placeholder="City (optional)" value={filters.city} onChange={e=>setFilters({...filters,city:e.target.value})}/><select value={filters.serviceInterest} onChange={e=>setFilters({...filters,serviceInterest:e.target.value})}><option value="">All service interests</option><option value="HOUSE">House cleaning</option><option value="CAR">Car cleaning</option><option value="BOTH">Both</option></select><select value={filters.preferredLanguage} onChange={e=>setFilters({...filters,preferredLanguage:e.target.value})}><option value="">All languages</option><option>English</option><option>Shona</option><option>Ndebele</option><option>Other</option></select></div><label>Subject<input maxLength={140} value={subject} onChange={e=>setSubject(e.target.value)}/></label><label>Plain-text message<textarea maxLength={5000} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Write the campaign. Detail adds the greeting and unsubscribe footer automatically."/></label><button onClick={send} disabled={sending}>{sending?'Sending audited campaign…':'Review and send campaign'}</button></article>
  </section>;
}
