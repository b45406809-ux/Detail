#!/usr/bin/env python3
"""Create/update a Cloudflare KV namespace, upload generated campaign assets, and deploy a public read-only Worker."""
import json,mimetypes,os,secrets,sys,time
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request,urlopen
ROOT=Path(__file__).resolve().parents[1]; GENERATED=ROOT/'marketing'/'generated'; WORKER=ROOT/'cloudflare'/'marketing-assets-worker.mjs'
ACCOUNT=os.environ.get('CLOUDFLARE_ACCOUNT_ID','');TOKEN=os.environ.get('CLOUDFLARE_API_TOKEN','');TITLE=os.environ.get('CLOUDFLARE_KV_NAMESPACE','detail-marketing-assets');SCRIPT=os.environ.get('CLOUDFLARE_WORKER_NAME','detail-marketing-assets')
if not ACCOUNT or not TOKEN:raise SystemExit('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.')
BASE=f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}'

def api(method,path,data=None,content_type='application/json'):
 # JSON callers may pass a Python value or an already encoded payload (for
 # example, the pretty-printed manifest). Never try to json.dumps bytes.
 body=None if data is None else (json.dumps(data).encode() if content_type=='application/json' and not isinstance(data,(bytes,bytearray)) else data)
 request=Request(BASE+path,data=body,method=method,headers={'authorization':f'Bearer {TOKEN}','content-type':content_type})
 try:
  with urlopen(request,timeout=90) as response: raw=response.read();return json.loads(raw) if raw else {}
 except HTTPError as error:
  raise RuntimeError(f'Cloudflare API {method} {path} failed ({error.code}): {error.read().decode()[:1000]}') from error

def namespace_id():
 result=api('GET','/storage/kv/namespaces?per_page=100').get('result',[])
 match=next((item for item in result if item.get('title')==TITLE),None)
 if match:return match['id']
 created=api('POST','/storage/kv/namespaces',{'title':TITLE})
 return created['result']['id']

def multipart(parts):
 boundary='----detail'+secrets.token_hex(16);chunks=[]
 for name,filename,ctype,value in parts:
  disposition=f'Content-Disposition: form-data; name="{name}"'+(f'; filename="{filename}"' if filename else '')+'\r\n'
  chunks.extend([f'--{boundary}\r\n'.encode(),disposition.encode(),f'Content-Type: {ctype}\r\n\r\n'.encode(),value,b'\r\n'])
 chunks.append(f'--{boundary}--\r\n'.encode());return b''.join(chunks),f'multipart/form-data; boundary={boundary}'

if not GENERATED.exists():raise SystemExit('Run scripts/generate-instagram-carousel.py before upload.')
namespace=namespace_id();assets=[]
for path in sorted(GENERATED.rglob('*')):
 if not path.is_file():continue
 key=path.relative_to(GENERATED).as_posix();ctype=mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
 api('PUT',f'/storage/kv/namespaces/{namespace}/values/{quote(key,safe="/")}',path.read_bytes(),ctype);assets.append({'key':key,'bytes':path.stat().st_size,'contentType':ctype})
manifest={'name':'Detail Instagram launch carousel','owner':'Catalyst Labs','updatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'assets':assets}
api('PUT',f'/storage/kv/namespaces/{namespace}/values/manifest.json',json.dumps(manifest,indent=2).encode(),'application/json')
metadata={'main_module':'worker.mjs','compatibility_date':'2026-09-18','bindings':[{'type':'kv_namespace','name':'ASSETS','namespace_id':namespace}]}
body,ctype=multipart([('metadata',None,'application/json',json.dumps(metadata).encode()),('worker.mjs','worker.mjs','application/javascript+module',WORKER.read_bytes())])
api('PUT',f'/workers/scripts/{SCRIPT}',body,ctype);api('POST',f'/workers/scripts/{SCRIPT}/subdomain',{'enabled':True,'previews_enabled':False})
subdomain=api('GET','/workers/subdomain')['result']['subdomain'];url=f'https://{SCRIPT}.{subdomain}.workers.dev'
print(f'Uploaded {len(assets)} assets to KV namespace {TITLE} ({namespace}).');print(f'Public asset library: {url}')
if output:=os.environ.get('GITHUB_OUTPUT'):open(output,'a').write(f'namespace_id={namespace}\nassets_url={url}\n')
if summary:=os.environ.get('GITHUB_STEP_SUMMARY'):open(summary,'a').write(f'## Detail marketing assets\n\nUploaded **{len(assets)}** generated files to Cloudflare KV.\n\nPublic library: {url}\n')
