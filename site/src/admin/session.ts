const apiUrl=String(import.meta.env.VITE_WAITLIST_API_URL||'').replace(/\/$/,'');
const TOKEN_KEY='detail_admin_session';
export interface AdminSession {id:string;email:string;elevated:boolean;permissions:string[];mustChangePassword:boolean}
export const sessionToken=()=>localStorage.getItem(TOKEN_KEY)||'';
export function clearSession(){localStorage.removeItem(TOKEN_KEY)}
async function request<T>(path:string,options:RequestInit={}){if(!apiUrl)throw new Error('Cloudflare dashboard API is not configured.');const result=await fetch(`${apiUrl}${path}`,{...options,headers:{'content-type':'application/json',...(sessionToken()?{authorization:`Bearer ${sessionToken()}`}:{ }),...(options.headers||{})}});const body=await result.json().catch(()=>({})) as T&{error?:string};if(!result.ok)throw new Error(body.error||`Dashboard API returned ${result.status}.`);return body}
export async function login(email:string,password:string){const result=await request<{token:string;admin:AdminSession}>('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});localStorage.setItem(TOKEN_KEY,result.token);return result.admin}
export const currentAdmin=()=>request<AdminSession>('/api/auth/me');
export async function logout(){try{await request('/api/auth/logout',{method:'POST'})}finally{clearSession()}}
export const cloudflareCall=<T>(path:string,options:RequestInit={})=>request<T>(path,options);
