import {createClient} from 'npm:@supabase/supabase-js@2.80.0';

const url=Deno.env.get('SUPABASE_URL')??'';
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const schedulerSecret=Deno.env.get('CRON_SECRET')??'';
if(!url||!serviceKey||!schedulerSecret)throw new Error('Delivery worker environment is incomplete.');
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

async function deliver(row:Record<string,any>){
  try{
    if(row.provider==='EXPO'&&row.payload?.data?.type==='INACTIVITY_REMINDER'){
      const [{data:controls},{data:profile},{data:preferences}]=await Promise.all([
        admin.from('configuration').select('value').eq('key','campaignControls').maybeSingle(),
        admin.from('users').select('lastactiveat').eq('id',row.userid).maybeSingle(),
        admin.from('usermarketingpreferences').select('inactivityremindersenabled,pushenabled').eq('userid',row.userid).maybeSingle(),
      ]);
      if(controls?.value?.inactivityPaused===true||preferences?.inactivityremindersenabled!==true||preferences?.pushenabled!==true||!profile||Date.parse(profile.lastactiveat)>Date.parse(row.createdat)||Date.now()-Date.parse(profile.lastactiveat)<7*86400000){
        await admin.from('notificationdeliveries').delete().eq('id',row.id);await admin.from('notifications').delete().eq('id',row.notificationid);return;
      }
    }
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

function escapeHtml(value:string){const entities:Record<string,string>={'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'};return value.replace(/[<>&"']/g,char=>entities[char]??char);}
async function deliverCampaign(row:Record<string,any>){
  try{
    const payload=row.payload??{};let receiptId:string|null=null;
    const preferenceField:Record<string,string>={EMAIL:'emailenabled',PUSH:'pushenabled',IN_APP:'inappenabled',SMS:'smsenabled',WHATSAPP:'whatsappenabled'};
    const field=preferenceField[row.channel];
    if(!field||!row.userid){await admin.rpc('finish_marketing_campaign_delivery',{p_id:row.id,p_success:false,p_error:'Campaign recipient is unavailable.',p_receipt_id:null,p_skipped:false});return;}
    const [{data:preferences,error:preferenceError},{data:profile,error:profileError}]=await Promise.all([
      admin.from('usermarketingpreferences').select('*').eq('userid',row.userid).maybeSingle(),
      admin.from('users').select('email,phone,isbanned,issuspended,accountdeletedat').eq('id',row.userid).maybeSingle(),
    ]);
    if(preferenceError||profileError)throw new Error('Could not recheck the recipient communication permission.');
    const contact=String(row.channel==='PUSH'?row.destination:row.channel==='IN_APP'?row.userid:row.channel==='EMAIL'?profile?.email:profile?.phone??'');
    const contactMatches=row.channel==='EMAIL'?contact.trim().toLowerCase()===String(row.destination).trim().toLowerCase():row.channel==='PUSH'?true:row.channel==='IN_APP'?true:contact===String(row.destination);
    if(!preferences?.[field]||!profile||profile.isbanned||profile.issuspended||profile.accountdeletedat||!contactMatches){await admin.rpc('finish_marketing_campaign_delivery',{p_id:row.id,p_success:false,p_error:null,p_receipt_id:null,p_skipped:true});return;}
    if(row.channel==='PUSH'){
      const {data:device,error}=await admin.from('userpushdevices').select('expopushtoken').eq('userid',row.userid).eq('expopushtoken',row.destination).maybeSingle();
      if(error)throw new Error('Could not recheck the recipient push registration.');
      if(!device){await admin.rpc('finish_marketing_campaign_delivery',{p_id:row.id,p_success:false,p_error:null,p_receipt_id:null,p_skipped:true});return;}
    }
    if(row.channel==='IN_APP'){
      const {data:existing,error:lookupError}=await admin.from('notifications').select('id').eq('userid',row.userid).contains('data',{campaignId:row.campaignid}).limit(1);
      if(lookupError)throw new Error('Announcement inbox lookup failed.');
      if(!existing?.length){const {error}=await admin.from('notifications').insert({userid:row.userid,title:String(payload.title??''),body:String(payload.body??''),type:'ANNOUNCEMENT',data:{type:'ANNOUNCEMENT',campaignId:row.campaignid}});if(error&&error.code!=='23505')throw new Error('Announcement inbox delivery failed.');}
    }else if(row.channel==='PUSH'){
      const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({to:row.destination,title:String(payload.title??''),body:String(payload.body??''),sound:'default',data:payload.data??{type:'ANNOUNCEMENT',campaignId:row.campaignid}})});
      const result=await response.json().catch(()=>null);const ticket=Array.isArray(result?.data)?result.data[0]:result?.data;
      if(!response.ok||ticket?.status!=='ok')throw new Error('Expo did not accept this announcement.');receiptId=String(ticket?.id??'');
    }else if(row.channel==='EMAIL'){
      const apiKey=Deno.env.get('RESEND_API_KEY')||Deno.env.get('EXPO_RESEND_API_KEY')||'';if(!apiKey)throw new Error('Resend is not configured.');
      const subject=String(payload.subject??''),message=String(payload.message??'');
      const unsubscribe=`${url.replace(/\/$/,'')}/functions/v1/marketing-unsubscribe?token=${encodeURIComponent(row.unsubscribetoken)}`;
      const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({from:'Detail <hello@detailapp.co.zw>',to:[row.destination],subject,html:`<p>${escapeHtml(message).replace(/\r?\n/g,'<br>')}</p><hr><p><a href="${unsubscribe}">Unsubscribe from Detail marketing emails</a></p>`})});
      const result=await response.json().catch(()=>null);if(!response.ok)throw new Error(`Resend rejected this email (HTTP ${response.status}).`);receiptId=String(result?.id??'');
    }else if(row.channel==='SMS'){
      const apiToken=Deno.env.get('SMSPOP_API_KEY')?.trim()||Deno.env.get('SMSPOP_API_TOKEN')?.trim()||'',senderId=Deno.env.get('SMSPOP_SENDER_ID')||'';if(!apiToken||!senderId)throw new Error('SMSPoP campaign delivery is not configured.');
      const unsubscribe=`${url.replace(/\/$/,'')}/functions/v1/marketing-unsubscribe?token=${encodeURIComponent(row.unsubscribetoken)}`;
      const response=await fetch('https://smspop.co.zw/api/campaigns',{method:'POST',headers:{authorization:`Bearer ${apiToken}`,accept:'application/json','content-type':'application/json'},body:JSON.stringify({name:`Detail campaign ${row.campaignid.slice(0,32)}`,message:`${String(payload.message??'')}\nStop Detail marketing: ${unsubscribe}`,sender_id:senderId,contact_import_method:'manual',manual_contacts:row.destination}),redirect:'error',signal:AbortSignal.timeout(12000)});
      const result=await response.json().catch(()=>null);const contact=Array.isArray(result?.data?.contacts)?result.data.contacts.find((item:Record<string,unknown>)=>String(item.phone??'').replace(/\D/g,'')===String(row.destination).replace(/\D/g,'')):null;
      if(!response.ok||result?.success!==true||String(contact?.status).toLowerCase()!=='sent')throw new Error(`SMSPoP did not accept this SMS (HTTP ${response.status}).`);receiptId=String(result?.data?.campaign_id??'');
    }else if(row.channel==='WHATSAPP'){
      const accessToken=Deno.env.get('WHATSAPP_ACCESS_TOKEN')||Deno.env.get('META_WHATSAPP_ACCESS_TOKEN')||'',phoneNumberId=Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')||Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID')||'',templateName=Deno.env.get('WHATSAPP_TEMPLATE_NAME')||Deno.env.get('META_WHATSAPP_TEMPLATE_NAME')||'';
      const version=Deno.env.get('WHATSAPP_GRAPH_API_VERSION')||'v22.0',language=Deno.env.get('WHATSAPP_TEMPLATE_LANGUAGE')||'en';if(!accessToken||!phoneNumberId||!templateName)throw new Error('WhatsApp campaign delivery is not configured.');
      const unsubscribe=`${url.replace(/\/$/,'')}/functions/v1/marketing-unsubscribe?token=${encodeURIComponent(row.unsubscribetoken)}`;
      const optOutFooter=`\nStop Detail marketing: ${unsubscribe}`;
      const templateBody=`${String(payload.message??'').slice(0,Math.max(0,1024-optOutFooter.length))}${optOutFooter}`;
      const response=await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`,{method:'POST',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:String(row.destination).replace(/\D/g,''),type:'template',template:{name:templateName,language:{code:language},components:[{type:'body',parameters:[{type:'text',text:templateBody}]}]}}),signal:AbortSignal.timeout(15000)});
      const result=await response.json().catch(()=>null);if(!response.ok||!result?.messages?.[0]?.id)throw new Error(`WhatsApp did not accept this template message (HTTP ${response.status}).`);receiptId=String(result.messages[0].id);
    }else throw new Error('Unknown campaign channel.');
    await admin.rpc('finish_marketing_campaign_delivery',{p_id:row.id,p_success:true,p_error:null,p_receipt_id:receiptId,p_skipped:false});
  }catch(error){
    const message=error instanceof Error?error.message:'Campaign provider delivery failed.';
    await admin.rpc('finish_marketing_campaign_delivery',{p_id:row.id,p_success:false,p_error:message.replace(/(?:AC|SK)[0-9a-f]{32}/gi,'[redacted]'),p_receipt_id:null,p_skipped:false});
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
  const {data:campaignJobs,error:campaignError}=await admin.rpc('claim_marketing_campaign_deliveries',{p_limit:50});
  if(campaignError)console.error('Campaign delivery claim failed',campaignError.message);
  const campaignIds=[...new Set((campaignJobs??[]).map((row:Record<string,any>)=>String(row.campaignid)))];
  if(campaignIds.length){const {error:statusError}=await admin.from('marketingcampaigns').update({status:'SENDING'}).in('id',campaignIds).eq('status','QUEUED');if(statusError)console.error('Campaign status update failed',statusError.message);}
  await Promise.all((campaignJobs??[]).map(deliverCampaign));
  const {data:uncertainCampaignDeliveries,error:uncertainCampaignError}=await admin.rpc('expire_uncertain_marketing_campaign_deliveries',{p_limit:500});
  if(uncertainCampaignError)console.error('Uncertain campaign delivery reconciliation failed',uncertainCampaignError.message);
  const {data:inactivityCount,error:inactivityError}=await admin.rpc('enqueue_inactivity_reminders',{p_limit:50});
  if(inactivityError)console.error('Inactivity reminder enqueue failed',inactivityError.message);
  await pollExpoReceipts().catch(error=>console.error('Expo receipt polling failed',String(error)));
  return json({claimed:data?.length??0,processed:data?.length??0,campaignsClaimed:campaignJobs?.length??0,uncertainCampaignDeliveries:uncertainCampaignDeliveries??0,inactivityRemindersQueued:inactivityCount??0,expiredRateLimits:expiredRateLimits??0,autoConfirmed:autoConfirmed??0,expiredInstantBookings:expiredMatches??0,staleCleanersOffline:staleCleanersOffline??0});
});
