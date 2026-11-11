import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, BadgeCheck, BriefcaseBusiness, CalendarClock, Check, ChevronRight, CreditCard, RefreshCw, Shield, ShieldAlert, UserRound, X } from 'lucide-react';
import { adminCall, mutateAdmin } from './api';

type UserTab = 'Overview'|'Bookings'|'Bids & reviews'|'Didit KYC'|'Activity'|'Finance'|'Support';
const tabs:UserTab[]=['Overview','Bookings','Bids & reviews','Didit KYC','Activity','Finance','Support'];
const humanize=(value:string)=>value.replaceAll('_',' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\b\w/g,(letter)=>letter.toUpperCase());
const dateTime=(value?:string|null)=>value?new Date(value).toLocaleString():'—';
const money=(amount:unknown,currency='USD')=>`${currency} ${Number(amount||0).toFixed(2)}`;
const safeDiditUrl=(value:string)=>{try{const parsed=new URL(value);return parsed.protocol==='https:'?parsed.href:null}catch{return null}};

function DiditValue({name,value,depth=0}:{name:string;value:any;depth?:number}){
  if(value===null||value===undefined||value==='')return null;
  const label=humanize(name);
  if(typeof value==='string'){
    const url=safeDiditUrl(value),isImage=/image|portrait|photo|selfie|front|back|face|portrait/i.test(name)&&url;
    if(isImage)return <figure className="didit-image"><a href={url!} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><img src={url!} alt={label} loading="lazy"/></a><figcaption>{label} · temporary Didit media link</figcaption></figure>;
    if(url)return <p className="didit-field"><b>{label}</b><a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open {label.toLowerCase()}</a></p>;
    return <p className="didit-field"><b>{label}</b><span>{value}</span></p>;
  }
  if(typeof value==='number'||typeof value==='boolean')return <p className="didit-field"><b>{label}</b><span>{String(value)}</span></p>;
  if(depth>5)return <p className="didit-field"><b>{label}</b><span>More nested provider data</span></p>;
  if(Array.isArray(value))return <section className="didit-array"><h4>{label} <small>{value.length}</small></h4>{value.length?value.slice(0,40).map((entry,index)=><article className="didit-record" key={`${name}-${index}`}><DiditValue name={`${name} ${index+1}`} value={entry} depth={depth+1}/></article>):<p className="muted">No {label.toLowerCase()} recorded.</p>}{value.length>40&&<p className="muted">Showing the first 40 results.</p>}</section>;
  if(typeof value==='object'){
    const entries=Object.entries(value as Record<string,unknown>).filter(([key])=>!['session_url','session_link'].includes(key.toLowerCase()));
    return <section className="didit-object"><h4>{label}</h4><div className="didit-fields">{entries.map(([key,child])=><DiditValue key={`${name}-${key}`} name={key} value={child} depth={depth+1}/>)}</div></section>;
  }
  return null;
}

function Section({title,children,empty}:{title:string;children:ReactNode;empty?:boolean}){
  return <section className="panel user-detail-section"><div className="user-detail-section-title"><h2>{title}</h2></div>{empty?<p className="muted">Nothing recorded yet.</p>:children}</section>;
}

export function UserDetail({userId,onBack}:{userId:string;onBack:()=>void}){
  const [detail,setDetail]=useState<any>(null),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState(''),[activeTab,setActiveTab]=useState<UserTab>('Overview'),[actionError,setActionError]=useState(''),[actionBusy,setActionBusy]=useState(false),[selectedDiditSession,setSelectedDiditSession]=useState<string|null>(null),[kycDecision,setKycDecision]=useState<any>(null),[kycLoading,setKycLoading]=useState(false);
  const load=useCallback(async()=>{setError('');try{const data=await adminCall<any>('adminUserDetail',{userId});setDetail(data);const sessionId=data.didit?.record?.sessionId||data.didit?.sessions?.[0]?.session_id||null;setSelectedDiditSession(sessionId);setKycDecision(data.didit?.decision??null)}catch(e:any){setError(e.message||'Could not load user details.')}finally{setLoading(false);setRefreshing(false)}},[userId]);
  useEffect(()=>{setLoading(true);setDetail(null);setActiveTab('Overview');setSelectedDiditSession(null);setKycDecision(null);setActionError('');void load()},[load]);
  const isCurrentDiditSession=!!detail?.didit?.record?.appLinked&&selectedDiditSession===detail?.didit?.record?.sessionId;
  const reviewable=isCurrentDiditSession&&!!kycDecision&&['Approved','Declined','In Review','Kyc Expired','Abandoned','Resubmitted'].includes(kycDecision.status);
  const timeline=useMemo(()=>detail?.timeline??[],[detail]);
  const selectDiditSession=async(sessionId:string)=>{
    if(sessionId===detail?.didit?.record?.sessionId){setSelectedDiditSession(sessionId);setKycDecision(detail.didit.decision);return}
    setSelectedDiditSession(sessionId);setKycLoading(true);setKycDecision(null);setActionError('');
    try{const data=await adminCall<any>('adminDiditSessionDetail',{userId,sessionId});setKycDecision(data.decision)}catch(e:any){setActionError(e.message||'Could not load this Didit session.')}
    finally{setKycLoading(false)}
  };
  const reviewDidit=async(decision:'APPROVE'|'DECLINE')=>{
    const title=decision==='APPROVE'?'approve':'decline';
    const reason=window.prompt(`Reason to ${title} this Didit verification`);
    if(!reason||reason.trim().length<4){setActionError('Enter a reason of at least four characters.');return}
    if(!window.confirm(`Confirm ${title} for ${detail.profile.displayName||detail.profile.email}? This updates the Didit session and Detail verification status.`))return;
    setActionBusy(true);setActionError('');
    try{await mutateAdmin('review_didit_kyc',{targetId:userId,sessionId:selectedDiditSession,decision,reason:reason.trim(),idempotencyKey:crypto.randomUUID()});await load()}
    catch(e:any){setActionError(e.message||'Didit review failed.')}
    finally{setActionBusy(false)}
  };
  const setAccountState=async()=>{
    const suspended=!(detail.profile.isSuspended||detail.profile.isBanned);
    const reason=window.prompt(suspended?'Reason to suspend this account':'Reason to reactivate this account');
    if(!reason||reason.trim().length<4){setActionError('Enter a reason of at least four characters.');return}
    if(!window.confirm(`${suspended?'Suspend':'Reactivate'} ${detail.profile.displayName||detail.profile.email}? This is audited.`))return;
    setActionBusy(true);setActionError('');
    try{await mutateAdmin('change_account_state',{targetId:userId,state:suspended?'SUSPENDED':'ACTIVE',reason:reason.trim(),idempotencyKey:crypto.randomUUID()});await load()}
    catch(e:any){setActionError(e.message||'Account update failed.')}
    finally{setActionBusy(false)}
  };
  const profile=detail?.profile,summary=detail?.summary;
  const reviewCount=detail?.reviews?.length??0;

  if(loading)return <section className="user-detail"><button className="user-detail-back" onClick={onBack}><ArrowLeft size={16}/> Back to users</button><article className="panel">Loading user history and Didit session…</article></section>;
  if(error&&!detail)return <section className="user-detail"><button className="user-detail-back" onClick={onBack}><ArrowLeft size={16}/> Back to users</button><div className="inline-error"><ShieldAlert size={16}/>{error}</div></section>;

  return <section className="user-detail">
    <div className="user-detail-topline"><button className="user-detail-back" onClick={onBack}><ArrowLeft size={16}/> Back to {profile.currentRole==='CLEANER'?'cleaners':'customers'}</button><button className="user-detail-refresh" onClick={()=>{setRefreshing(true);void load()}} disabled={refreshing}><RefreshCw size={15} className={refreshing?'is-spinning':''}/>{refreshing?'Refreshing…':'Refresh profile & Didit'}</button></div>
    {error&&<div className="inline-error"><ShieldAlert size={16}/>{error}</div>}
    {actionError&&<div className="inline-error"><ShieldAlert size={16}/>{actionError}</div>}
    <article className="panel user-identity-card">
      <div className="user-identity-main"><div className="user-avatar">{profile.photoURL?<img src={profile.photoURL} alt="" referrerPolicy="no-referrer"/>:<UserRound size={24}/>}</div><div className="user-identity-copy"><p className="eyebrow">User record · joined {dateTime(profile.createdAt)}</p><h1>{profile.displayName||'Unnamed user'}</h1><p>{profile.email||'No email'}{profile.phone?` · ${profile.phone}`:''}</p><div className="user-tags"><span>Current role: {humanize(profile.currentRole)}</span>{profile.marketplaceRoles.map((role:string)=><span className="user-tag-muted" key={role}>History: {humanize(role)}</span>)}{profile.accountType==='ORGANIZATION'&&<span>Organization</span>}</div></div></div>
      <div className="user-identity-status"><span className={`status-pill ${profile.isSuspended||profile.isBanned?'status-danger':'status-good'}`}>{profile.deletedAt?'Deleted':profile.isSuspended||profile.isBanned?'Suspended':'Active'}</span><span className="status-pill status-neutral">KYC · {profile.verificationStatus||'NOT_STARTED'}</span><button className="row-action" disabled={actionBusy||!!profile.deletedAt} onClick={()=>void setAccountState()}>{profile.isSuspended||profile.isBanned?'Reactivate account':'Suspend account'}</button></div>
    </article>
    <nav className="user-detail-tabs" aria-label="User record sections">{tabs.filter(tab=>tab!=='Finance'||detail.permissions.finance).filter(tab=>tab!=='Support'||detail.permissions.support).map(tab=><button key={tab} className={activeTab===tab?'active':''} onClick={()=>setActiveTab(tab)}>{tab}{tab==='Didit KYC'&&profile.verificationStatus==='PENDING'&&<i/>}</button>)}</nav>

    {activeTab==='Overview'&&<>
      <div className="user-stat-grid"><article><span>Bookings as customer</span><strong>{summary.customerBookings}</strong><small>{summary.completedAsCustomer} completed</small></article><article><span>Bookings as cleaner</span><strong>{summary.cleanerBookings}</strong><small>{summary.completedAsCleaner} completed</small></article><article><span>Didit verification</span><strong>{profile.verificationStatus||'Not started'}</strong><small>{kycDecision?.status||detail.didit?.record?.status||'No session'}</small></article><article><span>Reviews</span><strong>{summary.reviews}</strong><small>Ratings involving this user</small></article></div>
      <Section title="Account details"><div className="user-fact-grid"><p><b>Account ID</b><span>{profile.id}</span></p><p><b>Created</b><span>{dateTime(profile.createdAt)}</span></p><p><b>Last updated</b><span>{dateTime(profile.updatedAt)}</span></p><p><b>Email and terms</b><span>{profile.email||'—'} · {profile.termsAccepted?'Accepted':'Not accepted'}</span></p><p><b>Cleaner onboarding</b><span>{profile.cleanerOnboardingComplete?'Complete':'Incomplete'} · Agreement {profile.cleanerAgreementAccepted?'accepted':'pending'}</span></p><p><b>Cleaner profile</b><span>{profile.serviceArea||'No coverage'} · {(profile.serviceCategories||[]).map(humanize).join(', ')||'No services'} · {profile.experienceYears??0} years</span></p><p><b>Performance</b><span>{profile.jobsCompleted} jobs completed · {Number(profile.ratingAverage||0).toFixed(2)} average from {profile.ratingCount} ratings</span></p><p><b>Availability</b><span>{humanize(profile.availability||'OFFLINE')} · {profile.serviceRadiusKm?`${profile.serviceRadiusKm} km radius`:'—'}</span></p>{profile.organization&&<p><b>Organization</b><span>{profile.organization.name} · {profile.organization.city||profile.organization.country||'Location not listed'}</span></p>}{profile.organizationMemberships?.length>0&&<p><b>Organization memberships</b><span>{profile.organizationMemberships.map((membership:any)=>`${membership.role} · ${membership.status} · ${membership.organizationid}`).join(' | ')}</span></p>}</div></Section>
      <Section title="Recent bookings" empty={!detail.bookings.length}><BookingList bookings={detail.bookings.slice(0,6)} userId={userId}/></Section>
      <Section title="Latest account activity" empty={!timeline.length}><Timeline rows={timeline.slice(0,8)}/></Section>
    </>}
    {activeTab==='Bookings'&&<Section title={`Marketplace history · ${summary.totalBookings} total`} empty={!detail.bookings.length}>{summary.totalBookings>summary.bookingsReturned&&<p className="muted">Showing the latest {summary.bookingsReturned} records. Summary totals include all bookings.</p>}<BookingList bookings={detail.bookings} userId={userId}/></Section>}
    {activeTab==='Bids & reviews'&&<>
      <Section title={`Bids · ${detail.bids.length} recent`} empty={!detail.bids.length}><div className="record-table-wrap"><table><thead><tr><th>Booking</th><th>Bid</th><th>Status</th><th>Arrival estimate</th><th>Message</th><th>Submitted</th></tr></thead><tbody>{detail.bids.map((bid:any)=><tr key={bid.id}><td>{bid.jobid}</td><td>{money(bid.bidprice)}</td><td>{humanize(bid.status)}</td><td>{bid.estimatedarrival?`${bid.estimatedarrival} min`:'—'}</td><td className="wrap-cell">{bid.message||'—'}</td><td>{dateTime(bid.createdat)}</td></tr>)}</tbody></table></div></Section>
      <Section title="Ratings and reviews" empty={!reviewCount}><div className="record-list">{detail.reviews.map((review:any)=><article key={review.id}><div><strong>{'★'.repeat(Number(review.rating))} {review.rating}/5</strong><small>{dateTime(review.createdat)} · {review.customerid===userId?'Written by this user':'Received by this user'}</small></div><p>{review.comment||'No written comment.'}</p><small>Booking {review.jobid}</small></article>)}</div></Section>
    </>}
    {activeTab==='Didit KYC'&&<>
      <article className="panel kyc-summary-card"><div><div className="eyebrow">Identity verification · fetched live from Didit</div><h2>{kycDecision?.status||detail.didit?.record?.status||detail.didit?.user?.status||'No verification session'}</h2><p>{selectedDiditSession?`Session ${selectedDiditSession}`:detail.didit?.user?.full_name||'A Didit session has not been recorded for this account.'}</p><small>{detail.didit?.record?.consentedAt?`Consent recorded ${dateTime(detail.didit.record.consentedAt)}`:''}</small></div><BadgeCheck size={25}/></article>
      {detail.didit?.error&&<div className="inline-error"><ShieldAlert size={16}/>{detail.didit.error}</div>}
      {[detail.didit?.sessionsError,detail.didit?.userError,detail.didit?.networkError,detail.didit?.decisionError].filter(Boolean).map((message:string,index:number)=><div className="inline-error" key={`didit-error-${index}`}><ShieldAlert size={16}/>{message}</div>)}
      <div className="kyc-report-grid"><DiditValue name="Didit user profile" value={detail.didit?.user}/><DiditValue name="Fraud network memberships and shared signals" value={detail.didit?.networks}/></div>
      {detail.didit?.sessions?.length>0&&<section className="didit-session-list"><div className="user-detail-section-title"><h2>Verification history</h2><span>{detail.didit.sessions.length}{detail.didit.sessionsHasMore?'+':''} sessions</span></div><div>{detail.didit.sessions.map((session:any)=>{const current=session.session_id===detail.didit.record?.sessionId;const warnings=Array.isArray(session.top_warnings)?session.top_warnings:[];return <button key={session.session_id} className={`didit-session-card ${session.session_id===selectedDiditSession?'selected':''}`} onClick={()=>void selectDiditSession(session.session_id)}><span className="didit-session-avatar">{session.portrait_image&&safeDiditUrl(session.portrait_image)?<img src={session.portrait_image} alt="" referrerPolicy="no-referrer" loading="lazy"/>:<BadgeCheck size={17}/>}</span><span className="didit-session-main"><strong>{session.full_name||`Session S-${session.session_number??'—'}`}{current&&<i>Current</i>}</strong><small>{session.document_type||'Identity check'}{session.country?` · ${session.country}`:''} · {dateTime(session.created_at)}</small>{warnings.length>0&&<em>{warnings.map((warning:any)=>warning.short_description||warning.risk).filter(Boolean).join(' · ')}</em>}</span><span className={`status-pill ${session.status==='Approved'?'status-good':session.status==='Declined'?'status-danger':'status-neutral'}`}>{session.status}</span></button>})}</div>{detail.didit.sessionsHasMore&&<p className="muted">Didit returned the latest 100 sessions. Older sessions are available in the Didit console.</p>}<p className="muted">Past sessions are read-only here. Only the current session linked to this Detail account can change marketplace verification.</p></section>}
      {kycDecision&&<>
        <div className="kyc-review-actions"><span><Shield size={16}/> Manual decision is applied to the Didit session and Detail account.</span><div><button className="kyc-decline" disabled={actionBusy||!reviewable} onClick={()=>void reviewDidit('DECLINE')}><X size={15}/> Decline</button><button className="kyc-approve" disabled={actionBusy||!reviewable} onClick={()=>void reviewDidit('APPROVE')}><Check size={15}/> Approve</button></div></div>
        {kycLoading&&<p className="muted">Loading the selected Didit session…</p>}
        {!reviewable&&<p className="muted">{isCurrentDiditSession?'Didit does not allow a manual decision from this session state.':'Past Didit sessions are read-only. Select the current linked session to review marketplace verification.'}</p>}
        <div className="kyc-report-grid"><DiditValue name="Identity documents" value={kycDecision.id_verifications}/><DiditValue name="NFC verification" value={kycDecision.nfc_verifications}/><DiditValue name="Liveness checks" value={kycDecision.liveness_checks}/><DiditValue name="Face matches" value={kycDecision.face_matches}/><DiditValue name="AML screening" value={kycDecision.aml_screenings}/><DiditValue name="Database checks" value={kycDecision.database_validations}/><DiditValue name="Proof of address" value={kycDecision.poa_verifications}/><DiditValue name="Phone checks" value={kycDecision.phone_verifications}/><DiditValue name="Email checks" value={kycDecision.email_verifications}/><DiditValue name="IP and device analysis" value={kycDecision.ip_analyses}/><DiditValue name="Warnings and risk signals" value={kycDecision.warnings}/><DiditValue name="Cross-session links" value={kycDecision.linked_records}/><DiditValue name="Blocklist flags" value={kycDecision.blocklisted}/><DiditValue name="Manual review history" value={kycDecision.reviews}/><DiditValue name="Activity review history" value={kycDecision.activity_reviews}/><DiditValue name="Verification events" value={kycDecision.events}/><DiditValue name="Resubmissions" value={kycDecision.resubmissions}/><DiditValue name="Decision trace" value={kycDecision.decision_trace}/><DiditValue name="Workflow and checks" value={{features:kycDecision.features,workflow_id:kycDecision.workflow_id,workflow_type:kycDecision.workflow_type,workflow_version:kycDecision.workflow_version,created_at:kycDecision.created_at,updated_at:kycDecision.updated_at,session_number:kycDecision.session_number}}/></div>
        <details className="didit-full-record"><summary>Full Didit session report</summary><p className="muted">Provider media links expire. Open an image in a new tab to inspect it while this session is fresh.</p><DiditValue name="Full session report" value={kycDecision}/></details>
      </>}
      {!kycDecision&&!detail.didit?.error&&detail.didit?.record&&<p className="muted">The provider returned no decision payload. Refresh this page to retry the Didit lookup.</p>}
    </>}
    {activeTab==='Activity'&&<Section title={`Account timeline · ${timeline.length} recent events`} empty={!timeline.length}><Timeline rows={timeline}/></Section>}
    {activeTab==='Finance'&&detail.permissions.finance&&<>
      <Section title={`Payments · ${detail.finance.payments.length} recent`} empty={!detail.finance.payments.length}><div className="record-table-wrap"><table><thead><tr><th>Payment</th><th>Booking</th><th>Provider</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead><tbody>{detail.finance.payments.map((payment:any)=><tr key={payment.id}><td>{payment.reference||payment.id}</td><td>{payment.jobid||'—'}</td><td>{payment.provider}</td><td>{money(payment.amount,payment.currency)}</td><td>{humanize(payment.status)}</td><td>{dateTime(payment.createdat)}</td></tr>)}</tbody></table></div></Section>
      <Section title={`Wallet ledger · ${detail.finance.walletTransactions.length} recent`} empty={!detail.finance.walletTransactions.length}><div className="record-table-wrap"><table><thead><tr><th>Type</th><th>Amount</th><th>Balance</th><th>Status</th><th>Description</th><th>Created</th></tr></thead><tbody>{detail.finance.walletTransactions.map((tx:any)=><tr key={tx.id}><td>{tx.type}</td><td>{money(tx.amount)}</td><td>{humanize(tx.balancetype)}</td><td>{humanize(tx.status)}</td><td className="wrap-cell">{tx.description}</td><td>{dateTime(tx.createdat)}</td></tr>)}</tbody></table></div></Section>
    </>}
    {activeTab==='Support'&&detail.permissions.support&&<>
      <Section title={`Support cases · ${detail.support.cases.length} recent`} empty={!detail.support.cases.length}><div className="record-list">{detail.support.cases.map((item:any)=><article key={item.id}><div><strong>{item.reason||'Support request'}</strong><small>{humanize(item.status)} · {dateTime(item.createdat)}</small></div><p>{item.data?.description||'No additional description.'}</p><small>Case {item.id}{item.jobid?` · Booking ${item.jobid}`:''}</small></article>)}</div></Section>
      <Section title={`Chat history · ${detail.support.messages.length} recent messages`} empty={!detail.support.messages.length}><div className="record-list">{detail.support.messages.map((message:any)=><article key={message.id}><div><strong>{message.sendername||message.senderid}</strong><small>{dateTime(message.createdat)} · Booking {message.jobid}</small></div><p>{message.text||'Attachment message'}</p></article>)}</div></Section>
    </>}
  </section>;
}

function BookingList({bookings,userId}:{bookings:any[];userId:string}){
  return <div className="record-table-wrap"><table><thead><tr><th>Role</th><th>Service</th><th>Other party</th><th>Scheduled</th><th>Status</th><th>Price</th><th>Payment</th></tr></thead><tbody>{bookings.map((booking:any)=><tr key={booking.id}><td>{booking.customerid===userId?'Customer':'Cleaner'}</td><td>{booking.servicetype||booking.category||'Cleaning'}</td><td>{booking.otherParty}</td><td>{booking.scheduleddatetime?dateTime(booking.scheduleddatetime):booking.scheduledtime||'—'}</td><td>{humanize(booking.status)}</td><td>{booking.price||booking.budget?money(booking.price??booking.budget):'—'}</td><td>{humanize(booking.paymentstatus||booking.paymentmethod||'—')}</td></tr>)}</tbody></table></div>;
}

function Timeline({rows}:{rows:any[]}){
  return <div className="user-timeline">{rows.map((row:any)=><article key={row.id}><div className="timeline-icon">{row.type==='PAYMENT'?<CreditCard size={15}/>:row.type==='BOOKING'?<BriefcaseBusiness size={15}/>:row.type==='KYC'?<Shield size={15}/>:<CalendarClock size={15}/>}</div><div className="timeline-entry"><strong>{humanize(row.label||row.type)}</strong><p>{row.detail||'—'}</p><small>{dateTime(row.at)}{row.jobId?` · Booking ${row.jobId}`:''}</small></div><ChevronRight size={14}/></article>)}</div>;
}
