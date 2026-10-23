const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '../..') + path.sep;
const ts = require(path.join(root, 'site/node_modules/typescript'));
const compile = path => ts.transpileModule(fs.readFileSync(root+path,'utf8').replace(/^import .*;\r?\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const operations=[];
const admin={from(table){let op='read',value;const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:table==='adminroles'?{elevated:true,permissions:[]}:null,error:null}),insert(v){op='insert';value=v;operations.push({table,op,value});return q},upsert(v){op='upsert';value=v;operations.push({table,op,value});return q},single:async()=>({data:null,error:{message:'column userId does not exist'}}),then(resolve){return Promise.resolve({data:null,error:null}).then(resolve)}};return q},auth:{getUser:async()=>({data:{user:{id:'audit-user'}},error:null})}};
let handler;
const api=vm.createContext({exports:{},createClient:()=>admin,Paynow:class{},Deno:{env:{get:k=>'audit-'+k},serve:h=>handler=h},console:{error(){},warn(){}},Request,Response,URL,URLSearchParams,crypto:require('crypto').webcrypto,TextEncoder,TextDecoder,AbortSignal,atob,btoa,fetch:()=>{throw Error('Network forbidden in audit probes')}});
vm.runInContext(compile('supabase/functions/marketplace-api/index.ts'),api);
(async()=>{
 try{await handler(new Request('http://localhost/functions/v1/marketplace-api',{method:'OPTIONS',headers:{origin:'http://localhost:5173'}}));console.log('preflight: unexpectedly succeeded')}catch(e){console.log('preflight:',e.name,e.message)}
 await vm.runInContext(`notify('audit-user',{title:'Audit',body:'Body',type:'NEW_BID',jobId:'audit-job'})`,api);
 console.log('notification insert column keys:',Object.keys(operations[0].value).join(','));
 operations.length=0;
 const jwt='x.'+btoa(JSON.stringify({aal:'aal2'}))+'.x';api.auditRequest=new Request('http://localhost',{headers:{authorization:'Bearer '+jwt}});
 const unknown=await vm.runInContext(`dispatch('adminMutation',{action:'change_status',targetId:'audit-job',reason:'audit probe',idempotencyKey:'audit-key-123'},auditRequest,{id:'audit-user'})`,api);
 console.log('unsupported admin mutation result:',JSON.stringify(unknown),'writes:',operations.map(x=>x.table).join(','));
 const stub={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
 const shim=vm.createContext({exports:{},createClient:()=>stub,AsyncStorage:{},signMediaValue:async x=>x,process:{env:{}},console:{warn(){}}});
 vm.runInContext(compile('mobile/services/supabase.ts'),shim);
 const row=vm.runInContext(`rowToData('openJobs',{jobid:'job-123',customerid:'customer-123',status:'PENDING',data:{serviceType:'Home'}})`,shim);
 console.log('openJobs normalization:',JSON.stringify(row),'id:',String(row.id));
 console.log('admin route parsing:',JSON.stringify(['/admin/bookings','/admin/support/case-123'].map(path=>{const [,route,focus]=path.split('/');return {path,route,focus}})));
 console.log('payout mismatch example: UI balance120-commission20 =',120-20,'API earnings100-commission20 =',100-20);
})().catch(e=>{console.error(e);process.exitCode=1});
