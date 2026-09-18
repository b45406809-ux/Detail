import type { AdminClaims, OverviewData } from './types';
import { cloudflareCall, currentAdmin } from './session';

export async function verifiedAdminClaims():Promise<AdminClaims>{const admin=await currentAdmin();return {admin:true,elevated:admin.elevated,permissions:admin.permissions}}
export async function adminCall<T>(name:string,data:Record<string,unknown>={}):Promise<T>{return cloudflareCall<T>('/api/admin/rpc',{method:'POST',body:JSON.stringify({name,data})})}
export const waitlistAdminCall=<T>(path:string,options:{method?:string;body?:Record<string,unknown>}={})=>cloudflareCall<T>(path,{method:options.method||'GET',body:options.body?JSON.stringify(options.body):undefined});
export const getOverview=(period:'7d'|'30d'|'12m')=>adminCall<OverviewData>('adminOverview',{period});
export const mutateAdmin=(action:string,payload:Record<string,unknown>)=>adminCall<{ok:true;auditId:string}>('adminMutation',{action,...payload});
