#!/usr/bin/env python3
"""Create the waitlist D1 database, apply migrations, and deploy its Worker via Cloudflare's REST API."""
import json, os, secrets
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ACCOUNT = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '')
TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN', '')
DATABASE_NAME = os.environ.get('CLOUDFLARE_D1_DATABASE', 'detail-waitlist')
WORKER_NAME = os.environ.get('CLOUDFLARE_WAITLIST_WORKER', 'detail-waitlist')
if not ACCOUNT or not TOKEN:
    raise SystemExit('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.')
BASE = f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}'

def api(method, path, data=None, content_type='application/json'):
    if data is None: body = None
    elif content_type == 'application/json' and not isinstance(data, (bytes, bytearray)): body = json.dumps(data).encode()
    else: body = data
    request = Request(BASE + path, data=body, method=method, headers={'authorization': f'Bearer {TOKEN}', 'content-type': content_type})
    try:
        with urlopen(request, timeout=90) as result:
            payload = json.loads(result.read() or b'{}')
    except HTTPError as error:
        raise RuntimeError(f'Cloudflare API {method} {path} failed ({error.code}): {error.read().decode()[:1500]}') from error
    if payload.get('success') is False: raise RuntimeError(f'Cloudflare API error: {payload.get("errors")}')
    return payload.get('result')

def multipart(parts):
    boundary = '----detail' + secrets.token_hex(16); chunks = []
    for name, filename, content_type, value in parts:
        disposition = f'Content-Disposition: form-data; name="{name}"' + (f'; filename="{filename}"' if filename else '')
        chunks.extend([f'--{boundary}\r\n{disposition}\r\nContent-Type: {content_type}\r\n\r\n'.encode(), value, b'\r\n'])
    chunks.append(f'--{boundary}--\r\n'.encode())
    return b''.join(chunks), f'multipart/form-data; boundary={boundary}'

databases = api('GET', '/d1/database?per_page=100') or []
database = next((item for item in databases if item.get('name') == DATABASE_NAME), None)
if not database: database = api('POST', '/d1/database', {'name': DATABASE_NAME})
database_id = database['uuid']
for migration in sorted((ROOT / 'cloudflare' / 'migrations').glob('*.sql')):
    api('POST', f'/d1/database/{database_id}/query', {'sql': migration.read_text()})

metadata = {'main_module': 'worker.mjs', 'compatibility_date': '2026-09-18', 'bindings': [
    {'type': 'd1', 'name': 'DB', 'id': database_id},
    {'type': 'plain_text', 'name': 'FIREBASE_PROJECT_ID', 'text': os.environ.get('FIREBASE_PROJECT_ID', 'new1-4bb94')},
    {'type': 'plain_text', 'name': 'ALLOWED_ORIGINS', 'text': os.environ.get('WAITLIST_ALLOWED_ORIGINS', 'https://detail.co.zw,https://www.detail.co.zw,https://dashboard.detail.co.zw')},
]}
body, content_type = multipart([('metadata', None, 'application/json', json.dumps(metadata).encode()), ('worker.mjs', 'worker.mjs', 'application/javascript+module', (ROOT / 'cloudflare' / 'waitlist-worker.mjs').read_bytes())])
api('PUT', f'/workers/scripts/{WORKER_NAME}', body, content_type)
for name in ('TURNSTILE_SECRET', 'RESEND_API_KEY'):
    if value := os.environ.get(name): api('PUT', f'/workers/scripts/{WORKER_NAME}/secrets', {'name': name, 'text': value, 'type': 'secret_text'})
api('POST', f'/workers/scripts/{WORKER_NAME}/subdomain', {'enabled': True, 'previews_enabled': False})
subdomain = api('GET', '/workers/subdomain')['subdomain']
url = f'https://{WORKER_NAME}.{subdomain}.workers.dev'
print(f'D1 database {DATABASE_NAME}: {database_id}')
print(f'Waitlist API: {url}')
if output := os.environ.get('GITHUB_OUTPUT'):
    with open(output, 'a') as handle: handle.write(f'database_id={database_id}\napi_url={url}\n')
if summary := os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(summary, 'a') as handle: handle.write(f'## Cloudflare waitlist\n\nD1 database: `{DATABASE_NAME}` (`{database_id}`)\n\nAPI: {url}\n')
