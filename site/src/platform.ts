const waitlistApiUrl=String(import.meta.env.VITE_WAITLIST_API_URL||'').replace(/\/$/,'');
export async function joinWaitlist(data:Record<string,unknown>){if(!waitlistApiUrl)throw new Error('Waitlist service is not configured. Please use WhatsApp support.');const result=await fetch(`${waitlistApiUrl}/api/waitlist`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});const body=await result.json().catch(()=>({})) as {error?:string};if(!result.ok)throw new Error(body.error||'We could not save your place. Please try again.');return body}
export type BetaConfig={bookingEnabled:boolean;waitlistEnabled:boolean;message:string;whatsapp:string};
export const SUPPORT_WHATSAPP='263714885936';
export async function loadBetaConfig():Promise<BetaConfig>{return {bookingEnabled:false,waitlistEnabled:true,message:'Bookings are being prepared for beta. Join the waitlist and we’ll let you know when your area opens.',whatsapp:SUPPORT_WHATSAPP}}
