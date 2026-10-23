import {createClient} from 'npm:@supabase/supabase-js@2.80.0';

const url=Deno.env.get('SUPABASE_URL')??'';
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const schedulerSecret=Deno.env.get('CRON_SECRET')??'';
if(!url||!serviceKey||!schedulerSecret)throw new Error('Delivery worker environment is incomplete.');
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

async function deliver(row:Record<string,any>){
  try{
    if(row.provider==='EXPO'){
      const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({to:row.destination,...row.payload})});
      const result=await response.json().catch(()=>null);const ticket=Array.isArray(result?.data)?result.data[0]:result?.data;
      if(!response.ok||ticket?.status==='error'){
        const message=String(ticket?.message??result?.errors?.[0]?.message??`Expo returned ${response.status}`);
        if(ticket?.details?.error==='DeviceNotRegistered')await admin.from('userpushdevices').delete().eq('userid',row.userid).eq('expopushtoken',row.destination);
        await admin.rpc('finish_notification_delivery',{p_id:row.id,p_success:false,p_error:message,p_receipt_id:null});return;
      }
      await admin.rpc('finish_notification_delivery',{p_id:row.id,p_success:true,p_error:null,p_receipt_id:ticket?.id??null});return;
    }
    if(row.provider==='TWILIO'){
      const sid=Deno.env.get('TWILIO_ACCOUNT_SID')??'',token=Deno.env.get('TWILIO_AUTH_TOKEN')??'';
      const service=Deno.env.get('TWILIO_MESSAGING_SERVICE_SID')??'',from=Deno.env.get('TWILIO_FROM_NUMBER')??'';
      if(!sid||!token||(!service&&!from))throw new Error('Twilio SMS credentials are not configured.');
      const form=new URLSearchParams({To:row.destination,Body:String(row.payload?.body??'')});if(service)form.set('MessagingServiceSid',service);else form.set('From',from);
      form.set('StatusCallback',`${url.replace(/\/$/,'')}/functions/v1/twilio-status`);
      const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,{method:'POST',headers:{authorization:`Basic ${btoa(`${sid}:${token}`)}`,'content-type':'application/x-www-form-urlencoded'},body:form.toString()});
      const result=await response.json().catch(()=>null);if(!response.ok)throw new Error(String(result?.message??`Twilio returned ${response.status}`));
      await admin.rpc('finish_notification_delivery',{p_id:row.id,p_success:true,p_error:null,p_receipt_id:result?.sid??null});return;
    }
    throw new Error('Unknown notification provider.');
  }catch(error){
    const message=String(error).replace(/(?:AC|SK)[0-9a-f]{32}/gi,'[redacted]');
    await admin.rpc('finish_notification_delivery',{p_id:row.id,p_success:false,p_error:message,p_receipt_id:null});
  }
}

async function pollExpoReceipts(){
  const cutoff=new Date(Date.now()-5*60*1000).toISOString();
  const {data,error}=await admin.from('notificationdeliveries').select('id,userid,destination,providerreceiptid').eq('provider','EXPO').eq('status','ACCEPTED').not('providerreceiptid','is',null).is('receiptcheckedat',null).lt('createdat',cutoff).limit(300);
  if(error||!data?.length)return;
  for(let index=0;index<data.length;index+=100){
    const batch=data.slice(index,index+100);const response=await fetch('https://exp.host/--/api/v2/push/getReceipts',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({ids:batch.map(item=>item.providerreceiptid)})});
    if(!response.ok)continue;const result=await response.json().catch(()=>null);const receipts=result?.data??{};
    for(const item of batch){
      const receipt=receipts[item.providerreceiptid];if(!receipt)continue;
      const receiptError=receipt.status==='error'?String(receipt.message??receipt.details?.error??'Expo push receipt error'):null;
      await admin.from('notificationdeliveries').update({status:receiptError?'FAILED':'ACCEPTED',providerstatus:receiptError?'RECEIPT_ERROR':'ACCEPTED',receiptcheckedat:new Date().toISOString(),lastError:receiptError}).eq('id',item.id);
      if(receipt.details?.error==='DeviceNotRegistered')await admin.from('userpushdevices').delete().eq('userid',item.userid).eq('expopushtoken',item.destination);
    }
  }
}

Deno.serve(async request=>{
  if(request.method!=='POST')return json({error:'POST required.'},405);
  if(request.headers.get('x-scheduler-secret')!==schedulerSecret)return json({error:'Unauthorized.'},401);
  const {data:staleCleanersOffline,error:presenceLeaseError}=await admin.rpc('expire_stale_cleaner_presence',{p_limit:250});
  if(presenceLeaseError)console.error('Cleaner presence lease expiry failed',presenceLeaseError.message);
  const {data:expiredRateLimits,error:rateLimitCleanupError}=await admin.rpc('cleanup_expired_rate_limits',{p_limit:1000});
  if(rateLimitCleanupError)console.error('Expired rate-limit cleanup failed',rateLimitCleanupError.message);
  const {data:autoConfirmed,error:completionError}=await admin.rpc('expire_unanswered_completions',{p_limit:200});
  if(completionError)console.error('Completion expiry failed',completionError.message);
  const {data:expiredMatches,error:matchExpiryError}=await admin.rpc('expire_unmatched_instant_bookings',{p_limit:200});
  if(matchExpiryError)console.error('Instant booking expiry failed',matchExpiryError.message);
  const {error:offerExpiryError}=await admin.from('instantoffers').update({status:'EXPIRED',respondedat:new Date().toISOString()}).eq('status','OFFERED').lte('expiresat',new Date().toISOString());
  if(offerExpiryError)console.error('Instant offer expiry failed',offerExpiryError.message);
  const {data,error}=await admin.rpc('claim_notification_deliveries',{p_limit:100});if(error)return json({error:'Could not claim deliveries.'},503);
  await Promise.all((data??[]).map(deliver));
  await pollExpoReceipts().catch(error=>console.error('Expo receipt polling failed',String(error)));
  return json({claimed:data?.length??0,processed:data?.length??0,expiredRateLimits:expiredRateLimits??0,autoConfirmed:autoConfirmed??0,expiredInstantBookings:expiredMatches??0,staleCleanersOffline:staleCleanersOffline??0});
});
