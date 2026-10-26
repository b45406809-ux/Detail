#!/usr/bin/env python3
"""Copy supported legacy Cloudflare D1 site/dashboard data to Supabase; preserve D1."""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

CF_ACCOUNT = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '').strip()
CF_DATABASE = os.environ.get('CLOUDFLARE_D1_DATABASE_ID', '').strip()
CF_DATABASE_NAME = os.environ.get('CLOUDFLARE_D1_DATABASE', 'detail-waitlist').strip()
CF_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN', '').strip()
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()
EXECUTE = os.environ.get('EXECUTE_MIGRATION', 'false').lower() == 'true'
PAGE_SIZE = 1000
BATCH_SIZE = 100
SUPPORTED_TABLES = ('waitlist', 'blog_posts', 'marketing_campaigns', 'dashboard_settings')
LEGACY_CORE_TABLES = ('users', 'jobs', 'bids', 'messages', 'push_tokens', 'payments')
LEGACY_AUTH_TABLES = ('admins', 'admin_invites', 'admin_sessions', 'admin_audit')


def request_json(url, method='GET', headers=None, payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        # Do not print response bodies: waitlist and dashboard data contain personal information.
        raw_error = error.read()
        detail = ''
        if 'api.cloudflare.com' in url:
            try:
                payload = json.loads(raw_error or b'{}')
                messages = [str(item.get('message', '')) for item in payload.get('errors', []) if isinstance(item, dict)]
                detail = '; '.join(message for message in messages if message)[:300]
            except (ValueError, TypeError):
                detail = ''
        suffix = f': {detail}' if detail else ''
        raise RuntimeError(f'Request failed ({error.code}) for {method} {url.split("?")[0]}{suffix}') from None


def d1_query(sql, params=None):
    global CF_DATABASE
    if not CF_DATABASE:
        response = request_json(
            f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT}/d1/database?per_page=100',
            headers={'Authorization': f'Bearer {CF_TOKEN}'},
        ) or {}
        databases = response.get('result', [])
        database = next((item for item in databases if item.get('name') == CF_DATABASE_NAME), None)
        if not database or not database.get('uuid'):
            raise RuntimeError(f'Cloudflare D1 database {CF_DATABASE_NAME!r} was not found in this account.')
        CF_DATABASE = database['uuid']
        print(f'Reading legacy D1 database: {CF_DATABASE_NAME}')
    url = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT}/d1/database/{CF_DATABASE}/query'
    result = request_json(url, 'POST', {
        'Authorization': f'Bearer {CF_TOKEN}', 'Content-Type': 'application/json'
    }, {'sql': sql, 'params': params or []})
    if not result or not result.get('success'):
        messages = [str(item.get('message', '')) for item in (result or {}).get('errors', []) if isinstance(item, dict)]
        detail = '; '.join(message for message in messages if message)[:300]
        raise RuntimeError(f'Cloudflare D1 query failed{f": {detail}" if detail else "."}')
    return result['result'][0].get('results', [])


def table_inventory():
    names = {row['name'] for row in d1_query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    counts = {}
    for table in sorted(names):
        # Names are taken only from sqlite_master and quoted as identifiers.
        safe_name = table.replace('"', '""')
        counts[table] = int(d1_query(f'SELECT COUNT(*) AS count FROM "{safe_name}"')[0]['count'])
    return names, counts


def fetch_table(table, columns):
    rows = []
    offset = 0
    while True:
        page = d1_query(f'SELECT {columns} FROM "{table}" LIMIT ? OFFSET ?', [PAGE_SIZE, offset])
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        offset += len(page)


def fetch_target_values(table, column):
    values = set()
    offset = 0
    endpoint = f'{SUPABASE_URL}/rest/v1/{table}?select={column}&order={column}.asc'
    headers = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'}
    while True:
        req = urllib.request.Request(endpoint, headers={**headers, 'Range': f'{offset}-{offset + PAGE_SIZE - 1}'})
        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                page = json.loads(response.read())
        except urllib.error.HTTPError as error:
            raise RuntimeError(f'Supabase {table} read failed ({error.code}).') from None
        values.update(str(row[column]) for row in page if row.get(column) is not None)
        if len(page) < PAGE_SIZE:
            return values
        offset += len(page)


def map_waitlist(row):
    email = str(row.get('email') or '').strip().lower()
    if not email or '@' not in email:
        raise RuntimeError('A source waitlist row has an invalid email; migration stopped before writing.')
    try:
        source_id = str(uuid.UUID(str(row.get('id'))))
    except (ValueError, TypeError, AttributeError):
        source_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f'cloudflare-d1-waitlist:{email}'))
    try:
        campaign = json.loads(row.get('campaign_json') or '{}')
    except (ValueError, TypeError):
        campaign = {}
    consent = str(row.get('marketing_email_permission') or 'NO').upper() == 'YES'
    return {
        'id': source_id, 'email': email,
        'fullname': str(row.get('full_name') or 'Waitlist member'),
        'phone': str(row.get('phone') or ''),
        'participanttype': str(row.get('participant_type') or 'CUSTOMER'),
        'serviceinterest': str(row.get('service_interest') or 'BOTH'),
        'country': row.get('country'), 'city': row.get('city'), 'area': row.get('area'),
        'preferredlanguage': str(row.get('preferred_language') or ''),
        'marketingemailpermission': 'YES' if consent else 'NO',
        'marketingconsent': {'granted': consent, 'source': 'legacy-cloudflare-d1', 'privacyAccepted': bool(row.get('privacy_accepted'))},
        'unsubscribetoken': row.get('unsubscribe_token'),
        'status': str(row.get('status') or 'WAITLISTED'),
        'createdat': row.get('created_at'),
        'data': {'campaign': campaign, 'legacyCloudflare': {'id': row.get('id'), 'updatedAt': row.get('updated_at')}}
    }


def map_blog(row):
    return {
        'id': str(row['id']), 'slug': row['slug'], 'title': row['title'], 'excerpt': row['excerpt'],
        'content': row['content'], 'keywords': row.get('keywords') or '', 'status': row.get('status') or 'DRAFT',
        'publishedat': row.get('published_at'), 'updatedat': row.get('updated_at'), 'createdat': row.get('created_at')
    }


def map_campaign(row):
    try:
        filters = json.loads(row.get('filters_json') or '{}')
    except (ValueError, TypeError):
        filters = {}
    # The old worker never stored message bodies, so make that limitation explicit in the archive row.
    return {
        'id': str(row['id']), 'subject': row.get('subject') or '(legacy campaign)',
        'message': '[Message body was not retained in the legacy database.]', 'status': 'SENT',
        'recipientcount': int(row.get('recipient_count') or 0), 'createdat': row.get('created_at'),
        'data': {'legacyCloudflare': {'actorUid': row.get('actor_uid'), 'filters': filters, 'idempotencyKey': row.get('idempotency_key'), 'messageBodyAvailable': False}}
    }


def map_setting(row):
    try:
        value = json.loads(row.get('value_json') or 'null')
    except (ValueError, TypeError):
        value = None
    return {'key': row['key'], 'value': value, 'updatedat': row.get('updated_at')}


def post_rows(table, rows):
    endpoint = f'{SUPABASE_URL}/rest/v1/{table}'
    headers = {
        'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json', 'Prefer': 'return=minimal'
    }
    for start in range(0, len(rows), BATCH_SIZE):
        request_json(endpoint, 'POST', headers, rows[start:start + BATCH_SIZE])


def main():
    if not all((CF_ACCOUNT, CF_TOKEN, SUPABASE_URL, SUPABASE_KEY)):
        raise SystemExit('Configure Cloudflare account/token and Supabase server-key credentials in the production GitHub environment.')
    tables, counts = table_inventory()
    print('Cloudflare D1 table row counts (no personal data):')
    for table, count in counts.items():
        print(f'  {table}: {count}')

    source_waitlist = fetch_table('waitlist', 'id,participant_type,full_name,phone,email,country,city,area,preferred_language,service_interest,marketing_email_permission,privacy_accepted,campaign_json,unsubscribe_token,status,created_at,updated_at') if 'waitlist' in tables else []
    source_blogs = fetch_table('blog_posts', 'id,slug,title,excerpt,content,keywords,status,author_id,created_at,updated_at,published_at') if 'blog_posts' in tables else []
    source_campaigns = fetch_table('marketing_campaigns', 'id,actor_uid,subject,recipient_count,filters_json,idempotency_key,created_at') if 'marketing_campaigns' in tables else []
    source_settings = fetch_table('dashboard_settings', 'key,value_json,updated_at,updated_by') if 'dashboard_settings' in tables else []

    waitlist = [map_waitlist(row) for row in source_waitlist]
    blogs = [map_blog(row) for row in source_blogs]
    campaigns = [map_campaign(row) for row in source_campaigns]
    settings = [map_setting(row) for row in source_settings]

    waitlist_emails = fetch_target_values('betawaitlist', 'email')
    blog_slugs = fetch_target_values('blogposts', 'slug')
    campaign_ids = fetch_target_values('marketingcampaigns', 'id')
    setting_keys = fetch_target_values('configuration', 'key')
    waitlist_unique = {}
    for row in waitlist:
        waitlist_unique.setdefault(row['email'].casefold(), row)
    pending_waitlist = [row for email, row in waitlist_unique.items() if email not in {v.casefold() for v in waitlist_emails}]
    pending_blogs = [row for row in blogs if row['slug'] not in blog_slugs]
    pending_campaigns = [row for row in campaigns if row['id'] not in campaign_ids]
    pending_settings = [row for row in settings if row['key'] not in setting_keys]

    print(f'Waitlist rows ready to import: {len(pending_waitlist)} of {len(waitlist_unique)} unique source emails')
    print(f'Blog posts ready to import: {len(pending_blogs)} of {len(blogs)}')
    print(f'Campaign records ready to import: {len(pending_campaigns)} of {len(campaigns)}')
    print(f'Dashboard settings ready to import: {len(pending_settings)} of {len(settings)}')
    core_rows = {table: counts.get(table, 0) for table in LEGACY_CORE_TABLES if counts.get(table, 0)}
    auth_rows = {table: counts.get(table, 0) for table in LEGACY_AUTH_TABLES if counts.get(table, 0)}
    if auth_rows:
        print(f'Legacy admin records need Supabase Auth re-invites; sessions and password hashes will not be copied: {sum(auth_rows.values())} rows across {len(auth_rows)} tables')
    if core_rows:
        print(f'Legacy marketplace rows require a separate identity-linked migration: {sum(core_rows.values())} rows across {len(core_rows)} tables')
    if not EXECUTE:
        print('Dry run only; no Supabase data was changed.')
        return
    if core_rows:
        raise RuntimeError('Import stopped because legacy users/jobs/payments data exists and needs an identity mapping plan before it can be safely migrated.')
    post_rows('betawaitlist', pending_waitlist)
    post_rows('blogposts', pending_blogs)
    post_rows('marketingcampaigns', pending_campaigns)
    post_rows('configuration', pending_settings)
    print(f'Imported waitlist={len(pending_waitlist)}, blog posts={len(pending_blogs)}, campaign records={len(pending_campaigns)}, settings={len(pending_settings)}.')
    print('Cloudflare D1 was left unchanged. Legacy admin accounts must be re-invited in Supabase.')
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as output:
            output.write('\n## Cloudflare D1 migration\n\n')
            output.write(f'- Waitlist imported: {len(pending_waitlist)}\n- Blog posts imported: {len(pending_blogs)}\n- Campaign history imported: {len(pending_campaigns)}\n- Dashboard settings imported: {len(pending_settings)}\n')
            output.write(f'- Legacy admin rows requiring re-invitation: {sum(auth_rows.values())}\n- Legacy marketplace rows requiring identity mapping: {sum(core_rows.values())}\n- Source database changed: no\n')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Migration failed: {error}', file=sys.stderr)
        raise SystemExit(1)
