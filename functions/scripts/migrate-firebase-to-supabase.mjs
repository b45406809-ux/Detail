/**
 * One-shot, restartable Firestore/Auth/Storage import for the Supabase cutover.
 * Requires Firebase Admin credentials and a Supabase service role key.
 * Run first with --dry-run; this script never deletes from Firebase.
 */
import { createHash, randomBytes } from 'node:crypto';
import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';

const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_STORAGE_BUCKET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`);
const dryRun = process.argv.includes('--dry-run');
admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID, storageBucket: process.env.FIREBASE_STORAGE_BUCKET });
const firestore = admin.firestore();
const bucket = admin.storage().bucket();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const uuid = value => {
  const bytes = createHash('sha256').update(`detail-migration:${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex'); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
const plain = value => {
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (value instanceof admin.firestore.GeoPoint) return { latitude: value.latitude, longitude: value.longitude };
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, plain(v)]));
  return value;
};
const uidMap = new Map();
const idMap = new Map();
const legacyAdminRoles = [];
const tables = [
  ['organizations','organizations','uuid'], ['organizationMembers','organizationMembers','uuid'], ['organizationInvites','organizationInvites','uuid'],
  ['jobs','jobs','uuid'], ['openJobs','openJobs','uuid'], ['bids','bids','uuid'], ['messages','messages','uuid'], ['favorites','favorites','uuid'],
  ['notifications','notifications','uuid'], ['reviews','reviews','uuid'], ['disputes','disputes','uuid'], ['reviewCases','reviewCases','text'],
  ['payments','payments','text'], ['payoutRequests','payoutRequests','uuid'], ['transactions','walletTransactions','text'],
  ['walletTransactions','walletTransactions','text'], ['platformTransactions','platformTransactions','text'],
  ['adminRoles','adminRoles','uuid'], ['adminInvites','adminInvites','uuid'], ['adminAuditEvents','adminAuditEvents','text'],
  ['configuration','configuration','text'], ['betaWaitlist','betaWaitlist','uuid'], ['waitlist','betaWaitlist','uuid'],
  ['marketingCampaigns','marketingCampaigns','text'], ['supportCases','supportCases','text'], ['productSales','productSales','text'],
  ['reportingAggregates','reportingAggregates','text'],
];
const noIdTables = new Set(['configuration']);
const columns = {
  organizations: ['id','ownerId','name','registrationNumber','phone','country','city','createdAt','metadata'],
  openJobs: ['jobId','status','category','serviceType','budget','biddingExpiresAt','customerId','createdAt','data'],
  organizationMembers: ['id','organizationId','userId','role','status','cleanerName','email','verificationStatus','createdAt'],
  organizationInvites: ['id','organizationId','email','cleanerName','codeHash','expiresAt','acceptedBy','createdAt','createdBy'],
  jobs: ['id','customerId','cleanerId','customerName','customerPhoto','customerPhone','cleanerName','cleanerPhoto','cleanerPhone','cleanerRating','category','serviceType','checklist','description','location','scheduledTime','scheduledDateTime','timePreference','status','pricingStrategy','budget','price','photos','completionPhotos','biddingExpiresAt','reminderSent','estimatedDuration','cleanerLocation','cleanerLocationUpdatedAt','paidAt','paymentMethod','paymentStatus','earnings','rating','ratedAt','isFavoriteRebook','createdAt','updatedAt','data'],
  bids: ['id','jobId','cleanerId','cleanerName','cleanerPhoto','cleanerRating','cleanerReviewCount','cleanerJobsCompleted','cleanerEliteVerified','bidPrice','estimatedArrival','status','message','history','createdAt','updatedAt'],
  messages: ['id','jobId','senderId','senderName','text','imageUrl','read','createdAt'], favorites: ['id','customerId','cleanerId','cleanerName','cleanerPhoto','createdAt'],
  notifications: ['id','userId','title','body','type','jobId','read','createdAt','data'], reviews: ['id','jobId','customerId','cleanerId','rating','comment','createdAt','data'],
  disputes: ['id','jobId','customerId','cleanerId','status','reason','evidence','resolution','resolvedBy','createdAt','resolvedAt','data'],
  reviewCases: ['id','jobId','customerId','cleanerId','reporterId','status','reason','problemDescription','evidence','createdAt','data'],
  payments: ['id','jobId','customerId','cleanerId','provider','reference','pollUrl','redirectUrl','amount','currency','status','providerStatus','idempotencyKey','createdAt','updatedAt','data'],
  payoutRequests: ['id','cleanerId','amount','method','accountName','accountNumber','status','transferReference','settledBy','createdAt','settledAt','data'],
  walletTransactions: ['id','userId','jobId','payoutRequestId','paymentId','type','amount','balanceType','status','description','idempotencyKey','createdAt','data'],
  platformTransactions: ['id','jobId','paymentId','type','amount','status','createdAt','data'], adminRoles: ['userId','elevated','permissions','createdAt'],
  adminInvites: ['id','email','tokenHash','permissions','elevated','status','createdBy','createdAt','expiresAt'],
  adminAuditEvents: ['id','action','actorId','targetId','reason','amount','createdAt','immutable','data'], configuration: ['key','value','updatedBy','updatedAt'],
  betaWaitlist: ['id','email','fullName','phone','participantType','serviceInterest','country','city','area','preferredLanguage','marketingEmailPermission','marketingConsent','unsubscribeToken','status','createdAt','data'],
  marketingCampaigns: ['id','subject','message','status','recipientCount','createdBy','createdAt','data'], supportCases: ['id','jobId','customerId','cleanerId','ownerId','reason','status','createdAt','data'],
  productSales: ['id','productId','cleanerId','customerId','quantity','amount','status','createdAt','data'], reportingAggregates: ['id','type','period','createdAt','data'],
};
function mappedId(table, original) {
  const key = `${table}:${original}`;
  if (!idMap.has(key)) idMap.set(key, uuid(key));
  return idMap.get(key);
}
function remapKey(key, value) {
  if (typeof value === 'string') {
    if (/^(customerId|cleanerId|userId|ownerId|createdBy|acceptedBy|settledBy|reporterId|actorId|senderId|updatedBy)$/.test(key)) return uidMap.get(value) ?? value;
    if (key === 'jobId') return idMap.get(`jobs:${value}`) ?? value;
    if (key === 'organizationId') return idMap.get(`organizations:${value}`) ?? value;
    if (/^(jobId|customerId|cleanerId|userId)$/.test(key) && value === '') return null;
    const storage = value.match(/https?:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)/);
    if (storage) {
      const path = decodeURIComponent(storage[1]).split('/');
      if (path[0] === 'verification' || !['job-photos','profile-photos','chat-photos','job-completion'].includes(path[0])) return null;
      if (['job-completion','chat-photos'].includes(path[0])) { path[1] = idMap.get(`jobs:${path[1]}`) ?? path[1]; path[2] = uidMap.get(path[2]) ?? path[2]; }
      else if (['job-photos','profile-photos','verification'].includes(path[0])) path[1] = uidMap.get(path[1]) ?? path[1];
      return `detail-media/${path.join('/')}`;
    }
  }
  if (Array.isArray(value)) return value.map(item => remapKey(key, item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, remapKey(k,v)]));
  return value;
}
const snake = value => Object.fromEntries(Object.entries(value).map(([k,v]) => [k.toLowerCase(), v]));
async function writeRows(table, rows, onConflict) {
  for (let start = 0; start < rows.length; start += 250) {
    const options = onConflict ? { onConflict } : undefined;
    const { error } = await supabase.from(table).upsert(rows.slice(start, start + 250), options);
    if (error) throw new Error(`Import into ${table} failed: ${error.message}`);
  }
}

console.log(`${dryRun ? 'DRY RUN: ' : ''}starting Firebase to Supabase import for ${process.env.FIREBASE_PROJECT_ID}`);
const firebaseUsers = [];
for (let pageToken; ; ) {
  const page = await admin.auth().listUsers(1000, pageToken);
  firebaseUsers.push(...page.users); pageToken = page.pageToken;
  if (!pageToken) break;
}
const existingAuthUsers = [];
for (let page = 1; ; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  existingAuthUsers.push(...data.users);
  if (data.users.length < 1000) break;
}
for (const old of firebaseUsers) {
  const { data: existing } = await supabase.from('legacyauthmappings').select('supabaseuid').eq('firebaseuid', old.uid).maybeSingle();
  let newId = existing?.supabaseuid;
  if (!newId && !dryRun) {
    const prior = existingAuthUsers.find(candidate => candidate.user_metadata?.legacyFirebaseUid === old.uid);
    if (prior) {
      newId = prior.id;
      const { error: mapError } = await supabase.from('legacyauthmappings').upsert({ firebaseuid: old.uid, supabaseuid: newId, recoveryrequired: true });
      if (mapError) throw mapError;
    }
  }
  if (!newId && !dryRun) {
    const email = old.email?.trim().toLowerCase() || `legacy.${old.uid}@no-email.detail.invalid`;
    const { data, error } = await supabase.auth.admin.createUser({ email, phone: old.phoneNumber, email_confirm: !!old.emailVerified, phone_confirm: !!old.phoneNumber, password: randomBytes(36).toString('base64url'), user_metadata: { legacyFirebaseUid: old.uid, recoveryRequired: true, displayName: old.displayName ?? '' } });
    if (error) throw new Error(`Could not create auth account for ${old.uid}: ${error.message}`);
    newId = data.user.id;
    const { error: mapError } = await supabase.from('legacyauthmappings').upsert({ firebaseuid: old.uid, supabaseuid: newId, recoveryrequired: true });
    if (mapError) throw mapError;
  }
  if (newId) uidMap.set(old.uid, newId);
  if (newId && old.customClaims?.admin === true) legacyAdminRoles.push(snake({ userId: newId, elevated: old.customClaims.elevated === true, permissions: Array.isArray(old.customClaims.permissions) ? old.customClaims.permissions : [] }));
}
const profileRows = [];
const userSnapshots = await firestore.collection('users').get();
for (const snap of userSnapshots.docs) {
  const newId = uidMap.get(snap.id); if (!newId) { console.warn(`Skipping profile without auth mapping: ${snap.id}`); continue; }
  const source = remapKey('', plain(snap.data()));
  const known = ['email','displayName','photoURL','role','accountType','organizationId','balance','earningsBalance','commissionBalance','commissionOwed','status','hasAgreedToTerms','cleanerAgreementAccepted','cleanerOnboardingComplete','hasCompletedProfile','hasSetupPermissions','isSuspended','isBanned','verificationStatus','verificationLevel','serviceCategories','serviceRadiusKm','experienceYears','address','serviceArea','phone','location','jobsCompleted','ratingAverage','ratingCount','responseTimeAverage','expoPushToken','createdAt','updatedAt','metadata'];
  const extra = Object.fromEntries(Object.entries(source).filter(([key]) => !known.includes(key) && key !== 'uid'));
  const row = { id: newId, ...Object.fromEntries(known.filter(k => k !== 'organizationId' && source[k] !== undefined).map(k => [k, source[k]])), metadata: { ...(source.metadata ?? {}), ...extra, legacyFirebaseUid: snap.id } };
  profileRows.push(snake(row));
  idMap.set(`users:${snap.id}`, newId);
}
if (profileRows.length && !dryRun) {
  await writeRows('users', profileRows, 'id');
}
if (legacyAdminRoles.length && !dryRun) await writeRows('adminroles', legacyAdminRoles, 'userid');
console.log(`${dryRun ? 'would restore' : 'restored'} ${legacyAdminRoles.length} legacy administrator roles`);

for (const [collectionName, table, keyType] of tables) {
  if (collectionName === 'walletTransactions' && tables.some(([name]) => name === 'transactions')) continue;
  if (collectionName === 'waitlist' && tables.some(([name]) => name === 'betaWaitlist')) {
    const primaryWaitlist = await firestore.collection('betaWaitlist').limit(1).get();
    if (!primaryWaitlist.empty) continue;
  }
  const snapshot = await firestore.collection(collectionName).get().catch(error => { if (error.code === 5) return null; throw error; });
  if (!snapshot) continue;
  const rows = [];
  for (const doc of snapshot.docs) {
    const raw = remapKey('', plain(doc.data()));
    if (table === 'organizationInvites' && !raw.codeHash) { console.warn(`Skipping legacy organization invite without a hashed code: ${doc.id}`); continue; }
    if (table === 'adminInvites' && !raw.tokenHash) { console.warn(`Skipping legacy admin invite without a hashed token: ${doc.id}`); continue; }
    const id = noIdTables.has(table) ? doc.id : keyType === 'uuid' ? mappedId(collectionName, doc.id) : doc.id;
    idMap.set(`${collectionName}:${doc.id}`, id);
    if (table === 'openJobs') raw.jobId = idMap.get(`jobs:${doc.id}`) ?? mappedId('jobs', doc.id);
    if (table === 'adminRoles') raw.userId = uidMap.get(doc.id) ?? raw.userId;
    if (table === 'configuration') raw.key = doc.id;
    const allowed = new Set(columns[table] ?? []);
    const cols = Object.fromEntries(Object.entries(raw).filter(([k,v]) => allowed.has(k) && v !== undefined));
    if (table !== 'configuration' && table !== 'adminRoles') cols.id = id;
    if (table === 'adminRoles') cols.userId = uidMap.get(doc.id) ?? raw.userId;
    if (table === 'openJobs') cols.jobId = raw.jobId;
    if (allowed.has('data')) {
      const known = new Set([...allowed, 'id']);
      cols.data = { ...(raw.data ?? {}), ...Object.fromEntries(Object.entries(raw).filter(([k]) => !known.has(k))) };
    }
    rows.push(snake(cols));
  }
  if (rows.length && !dryRun) {
    await writeRows(table.toLowerCase(), rows);
  }
  console.log(`${dryRun ? 'would import' : 'imported'} ${rows.length} rows from ${collectionName} to ${table}`);
}

let eventCount = 0;
for (const jobDoc of (await firestore.collection('jobs').get()).docs) {
  const jobId = idMap.get(`jobs:${jobDoc.id}`);
  if (!jobId) continue;
  const events = await jobDoc.ref.collection('events').get();
  const rows = events.docs.map(event => {
    const raw = remapKey('', plain(event.data()));
    return snake({
      id: uuid(`jobEvents:${jobId}:${event.id}`), jobId,
      actorId: uidMap.get(raw.actorId ?? raw.uid ?? '') ?? null,
      actorRole: raw.actorRole ?? null, type: raw.type ?? raw.eventType ?? 'LEGACY_EVENT',
      previousState: raw.previousState ?? null, newState: raw.newState ?? raw.status ?? null,
      idempotencyKey: raw.idempotencyKey ?? event.id, reason: raw.reason ?? null,
      createdAt: raw.createdAt ?? event.createTime?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      data: raw.data ?? {},
    });
  });
  if (rows.length && !dryRun) {
    await writeRows('jobevents', rows, 'jobid,idempotencykey');
  }
  eventCount += rows.length;
}
console.log(`${dryRun ? 'would import' : 'imported'} ${eventCount} nested booking events`);

// Link imported organization owners after both sides of the circular
// organizations/users reference are present.
if (!dryRun) {
  const { data: orgs, error } = await supabase.from('organizations').select('id,ownerid');
  if (error) throw error;
  for (const org of orgs ?? []) {
    const { error: updateError } = await supabase.from('users').update({ organizationid: org.id, accounttype: 'ORGANIZATION' }).eq('id', org.ownerid);
    if (updateError) throw updateError;
  }
}

// Copy source object bytes into the private Supabase bucket. File paths are
// rewritten for UID-owned folders so the app's storage policies still apply.
const [files] = await bucket.getFiles();
let copied = 0;
let skipped = 0;
for (const file of files) {
  const oldPath = file.name;
  const pathParts = oldPath.split('/');
  if (pathParts[0] === 'verification') { skipped++; continue; }
  if (!['job-photos','profile-photos','chat-photos','job-completion'].includes(pathParts[0])) { skipped++; continue; }
  if (['job-completion','chat-photos'].includes(pathParts[0])) { pathParts[1] = idMap.get(`jobs:${pathParts[1]}`) ?? pathParts[1]; pathParts[2] = uidMap.get(pathParts[2]) ?? pathParts[2]; }
  else if (['job-photos','profile-photos','verification'].includes(pathParts[0])) pathParts[1] = uidMap.get(pathParts[1]) ?? pathParts[1];
  const nextPath = pathParts.join('/');
  if (dryRun) { copied++; continue; }
  const [bytes] = await file.download();
  const { error } = await supabase.storage.from('detail-media').upload(nextPath, bytes, { upsert: true, contentType: file.metadata.contentType ?? 'application/octet-stream' });
  if (error) throw new Error(`Storage copy failed for ${oldPath}: ${error.message}`);
  copied++;
}
console.log(`${dryRun ? 'would copy' : 'copied'} ${copied} storage objects`);
console.log(`skipped ${skipped} non-marketplace or identity-verification storage objects`);
console.log('Import finished. Review rejected rows, then require legacy users to recover credentials before launch. Firebase data was not deleted.');
