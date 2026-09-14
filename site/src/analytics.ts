let active = false;
const distinctId = () => { const key='detail_anon_id'; let id=localStorage.getItem(key); if(!id){id=crypto.randomUUID();localStorage.setItem(key,id)} return id };
const safeProps = (props: Record<string, unknown> = {}) => ({ ...props, path: location.pathname, utm_source: new URLSearchParams(location.search).get('utm_source') || undefined, utm_medium: new URLSearchParams(location.search).get('utm_medium') || undefined, utm_campaign: new URLSearchParams(location.search).get('utm_campaign') || undefined });
export function setAnalyticsConsent(allowed: boolean) {
  localStorage.setItem('detail_analytics_consent', allowed ? 'yes' : 'no');
  if (allowed && import.meta.env.VITE_POSTHOG_KEY && !active) {
    active = true; track('page_view');
  }
  if (!allowed && active) active = false;
}
export function track(event: string, props?: Record<string, unknown>) {
  if (!active) return;
  const host=(import.meta.env.VITE_POSTHOG_HOST||'https://us.i.posthog.com').replace(/\/$/,'');
  void fetch(`${host}/capture/`,{method:'POST',headers:{'content-type':'application/json'},keepalive:true,body:JSON.stringify({api_key:import.meta.env.VITE_POSTHOG_KEY,event,properties:{distinct_id:distinctId(),...safeProps(props)}})}).catch(()=>undefined);
}
export const existingConsent = () => localStorage.getItem('detail_analytics_consent');
