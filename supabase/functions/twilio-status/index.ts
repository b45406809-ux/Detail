import { createClient } from 'npm:@supabase/supabase-js@2.80.0';

const url=Deno.env.get('SUPABASE_URL')??'';
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const accountToken=Deno.env.get('TWILIO_AUTH_TOKEN')??'';
if(!url||!serviceKey||!accountToken)throw new Error('Twilio status callback environment is incomplete.');
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const encoder=new TextEncoder();

function constantTimeEqual(left:string,right:string){
  if(left.length!==right.length)return false;
  let difference=0;for(let index=0;index<left.length;index++)difference|=left.charCodeAt(index)^right.charCodeAt(index);
  return difference===0;
}

async function validTwilioSignature(request:Request,form:URLSearchParams){
  const signature=request.headers.get('x-twilio-signature');if(!signature)return false;
  const publicUrl=`${url.replace(/\/$/,'')}/functions/v1/twilio-status${new URL(request.url).search}`;
  const keys=[...new Set([...form.keys()])].sort();let payload=publicUrl;
  for(const name of keys)for(const value of form.getAll(name).sort())payload+=name+value;
  const key=await crypto.subtle.importKey('raw',encoder.encode(accountToken),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(payload)));
  const expected=btoa(String.fromCharCode(...digest));
  return constantTimeEqual(signature,expected);
}

Deno.serve(async request=>{
  if(request.method!=='POST')return json({error:'POST required.'},405);
  try{
    const form=new URLSearchParams(await request.text());
    if(!await validTwilioSignature(request,form))return json({error:'Invalid Twilio signature.'},403);
    const receiptId=form.get('MessageSid')??'',providerStatus=(form.get('MessageStatus')??'').toLowerCase();
    if(!/^SM[0-9a-f]{32}$/i.test(receiptId)||!['accepted','queued','sending','sent','delivered','read','failed','undelivered'].includes(providerStatus))return json({error:'Invalid Twilio status callback.'},400);
    const errorMessage=[form.get('ErrorCode'),form.get('ErrorMessage')].filter(Boolean).join(': ').slice(0,500)||null;
    const {error:recordError}=await admin.from('notificationdeliverycallbacks').upsert({providerreceiptid:receiptId,providerstatus:providerStatus,errorcode:form.get('ErrorCode')?.slice(0,80)??null,errormessage:errorMessage},{onConflict:'providerreceiptid,providerstatus'});
    if(recordError)throw recordError;
    const {error:applyError}=await admin.rpc('apply_twilio_delivery_status',{p_receipt_id:receiptId,p_provider_status:providerStatus,p_error:errorMessage});
    if(applyError)throw applyError;
    return json({ok:true});
  }catch(error){
    console.error('Twilio delivery status callback failed',String(error));
    return json({error:'Could not process Twilio status callback.'},503);
  }
});
