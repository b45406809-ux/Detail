import { createClient } from 'npm:@supabase/supabase-js@2.80.0';
import { Paynow } from 'npm:paynow@2.2.2';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const id = Deno.env.get('PAYNOW_INTEGRATION_ID') ?? '';
const key = Deno.env.get('PAYNOW_INTEGRATION_KEY') ?? '';
if (!url || !serviceKey || !id || !key) throw new Error('Paynow webhook environment is incomplete.');
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const paynow = new Paynow(id, key);

async function notifyOnce(userId:string,reference:string,status:string,payload:{title:string;body:string;type:string;jobId?:string|null}){
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${userId}:${reference}:${status}`)));
  const bytes=Array.from(digest.slice(0,16));bytes[6]=(bytes[6]&0x0f)|0x50;bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=bytes.map(v=>v.toString(16).padStart(2,'0')).join('');const notificationId=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  const {error}=await admin.rpc('create_notification_outbox_with_id',{p_notification_id:notificationId,p_user_id:userId,p_title:payload.title,p_body:payload.body,p_type:payload.type,p_job_id:payload.jobId??null,p_data:{paymentStatus:status}});
  if(error)throw error;
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('POST required', { status: 405 });
  try {
    // Paynow result URLs are form-encoded status updates. The official SDK
    // validates the integration hash before the reference can touch the ledger.
    const raw = await request.text();
    let update:any;
    try{update=paynow.parseStatusUpdate(raw);}catch{return new Response('Invalid Paynow callback', { status: 400 });}
    if (!update.reference || !update.status || !update.amount) return new Response('Invalid status update', { status: 400 });
    const reference=String(update.reference);
    let canonicalReference=reference;
    let {data:before,error:lookupError}=await admin.from('payments').select('id,reference,customerid,cleanerid,jobid,status,data').eq('reference',reference).maybeSingle();if(lookupError)throw lookupError;
    if(!before){
      const {data:attempt,error:attemptError}=await admin.from('paynowpaymentattempts').select('paymentid').eq('reference',reference).maybeSingle();if(attemptError)throw attemptError;
      if(attempt){const {data:payment,error:paymentError}=await admin.from('payments').select('id,reference,customerid,cleanerid,jobid,status,data').eq('id',attempt.paymentid).maybeSingle();if(paymentError)throw paymentError;before=payment??null;canonicalReference=payment?.reference??reference;}
    }
    const { data, error } = await admin.rpc('apply_paynow_status', {
      p_reference: canonicalReference, p_status: String(update.status), p_amount: Number(update.amount),
    });
    if (error) throw error;
    if(before&&reference!==canonicalReference&&before.jobid&&['ESCROWED','DELIVERED','PAID','DISPUTED'].includes(data?.status)){
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(reference)));
      const attemptHash=Array.from(digest.slice(0,16)).map(value=>value.toString(16).padStart(2,'0')).join('');
      const caseId=`retry_${attemptHash}`;
      await admin.from('supportcases').upsert({id:caseId,jobid:before.jobid,customerid:before.customerid,cleanerid:before.cleanerid,
        reason:'A previous Paynow checkout attempt received a captured status after a retry was created.',status:'URGENT',
        data:{type:'PAYNOW_RETRY_DUPLICATE',paymentId:before.id,previousReference:reference,currentReference:canonicalReference,paymentStatus:data.status}},
        {onConflict:'id',ignoreDuplicates:true});
      const {data:admins}=await admin.from('adminroles').select('userid');
      for(const row of admins??[])await notifyOnce(row.userid,reference,'RETRY_DUPLICATE',{title:'Paynow retry needs reconciliation',body:'An earlier checkout attempt received a captured status after a retry. Review the urgent support case.',type:'PAYMENT_DISPUTED',jobId:before.jobid});
    }
    if(data?.status==='REFUNDED'){
      const {data:payment}=await admin.from('payments').select('id,data').eq('id',before?.id??'').maybeSingle();
      if(payment){
        const updatedAt=new Date().toISOString();
        await admin.from('paynowrefundtransactions').update({status:'RECONCILIATION_REQUIRED',updatedat:updatedAt,data:{providerStatus:'REFUNDED',providerStatusAt:updatedAt}}).eq('paymentid',payment.id).in('status',['REQUESTED','SUBMITTED']);
        await admin.from('payments').update({data:{...payment.data,refundRequest:payment.data?.refundRequest?{...payment.data.refundRequest,status:'RECONCILIATION_REQUIRED',providerStatusAt:updatedAt}:undefined,refundSummary:{...(payment.data?.refundSummary??{}),latestStatus:'RECONCILIATION_REQUIRED',providerStatus:'REFUNDED',updatedAt}}}).eq('id',payment.id);
        if(before?.jobid){await admin.from('supportcases').upsert({id:`paynow_refund_reconcile_${payment.id}`,jobid:before.jobid,customerid:before.customerid,cleanerid:before.cleanerid,reason:'Paynow reported REFUNDED without refund-specific amount/reference evidence. Reconcile the provider transaction before confirming the refund ledger.',status:'URGENT',data:{type:'PAYNOW_REFUND_RECONCILIATION',paymentId:payment.id,providerStatus:'REFUNDED'}},{onConflict:'id'});}
      }
    }
    if(before&&data?.status){
      const booking=!!before.jobid;
      const messages:Record<string,{title:string;body:string;type:string}>={
        ESCROWED:{title:'Payment protected with BuySafe',body:'Paynow is holding the booking payment. Open Detail to follow the service.',type:'PAYMENT_ESCROWED'},
        DELIVERED:{title:'Delivery confirmed in Paynow',body:'The 24-hour dispute period has started.',type:'PAYMENT_DELIVERED'},
        PAID:{title:booking?'Paynow released the payment':'Wallet top-up completed',body:booking?'Paynow has released the payment to Detail.':'Your Detail wallet balance has been updated.',type:'PAYMENT_PAID'},
        DISPUTED:{title:'Paynow dispute opened',body:'Paynow reported a dispute. Detail support will review the booking.',type:'PAYMENT_DISPUTED'},
        REFUNDED:{title:'Paynow refund reported',body:'Paynow reported a refunded payment. Detail support is reconciling the refund amount and transaction reference.',type:'PAYMENT_REFUNDED'},
      };
      const message=messages[data.status];if(message){for(const userId of new Set([before.customerid,before.cleanerid].filter(Boolean)))await notifyOnce(String(userId),reference,String(data.status),{...message,jobId:before.jobid});}
      if(data.status==='DISPUTED'){const {data:admins}=await admin.from('adminroles').select('userid');for(const row of admins??[])await notifyOnce(row.userid,reference,'DISPUTED',{title:'Paynow dispute needs review',body:'A Paynow BuySafe dispute was opened. Review the support queue.',type:'PAYMENT_DISPUTED',jobId:before.jobid});}
    }
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Paynow callback rejected or failed', String(error));
    return new Response('Paynow callback processing failed', { status: 500 });
  }
});
