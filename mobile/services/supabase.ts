import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient, type User as SupabaseUser } from '@supabase/supabase-js';
import { signMediaValue } from './storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
if (!supabaseUrl || !supabaseAnonKey) console.warn('Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');

export const supabase = createClient(supabaseUrl || 'http://127.0.0.1:54321', supabaseAnonKey || 'local-anon-key', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' },
});

export interface SupabaseCompatUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  phoneNumber?: string;
  displayName?: string;
  photoURL?: string;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  getIdTokenResult: (forceRefresh?: boolean) => Promise<{ claims: Record<string, unknown> }>;
  reload: () => Promise<void>;
  _user: SupabaseUser;
}

function compatUser(user: SupabaseUser | null): SupabaseCompatUser | null {
  if (!user) return null;
  const profile = user.user_metadata ?? {};
  return {
    uid: user.id,
    email: user.email ?? null,
    emailVerified: !!user.email_confirmed_at,
    phoneNumber: user.phone ?? undefined,
    displayName: typeof profile.displayName === 'string' ? profile.displayName : undefined,
    photoURL: typeof profile.avatar_url === 'string' ? profile.avatar_url : undefined,
    _user: user,
    getIdToken: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) throw error ?? new Error('Sign in required.');
      return data.session.access_token;
    },
    getIdTokenResult: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) throw error ?? new Error('Sign in required.');
      return { claims: { ...data.session.user.app_metadata, ...data.session.user.user_metadata } };
    },
    reload: async () => { await supabase.auth.getUser(); },
  };
}

export const auth = {
  get currentUser(): SupabaseCompatUser | null { return compatUser(currentAuthUser); },
};
let currentAuthUser: SupabaseUser | null = null;
supabase.auth.getSession().then(({ data }) => { currentAuthUser = data.session?.user ?? null; }).catch(() => {});
supabase.auth.onAuthStateChange((_event, session) => { currentAuthUser = session?.user ?? null; });

export function onAuthStateChanged(_auth: typeof auth, callback: (user: SupabaseCompatUser | null) => void) {
  let active = true;
  supabase.auth.getSession().then(({ data }) => { if (active) callback(compatUser(data.session?.user ?? null)); });
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    currentAuthUser = session?.user ?? null;
    callback(compatUser(session?.user ?? null));
  });
  return () => { active = false; subscription.unsubscribe(); };
}

export async function signInWithEmailAndPassword(_auth: typeof auth, email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
  return { user: compatUser(data.user)! };
}
export async function createUserWithEmailAndPassword(_auth: typeof auth, email: string, password: string, options: { data?: Record<string, unknown> } = {}) {
  const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options });
  if (error) throw error;
  if (!data.user) throw new Error('Account creation did not return a user.');
  return { user: compatUser(data.user)! };
}
export async function signOut(_auth: typeof auth) {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { error: tokenError } = await supabase
      .from('users')
      .update({ expoPushToken: null })
      .eq('id', user.id);
    if (tokenError) console.warn('Could not revoke the signed-in device push token:', tokenError.message);
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
export async function sendEmailVerification(user: SupabaseCompatUser) {
  if (!user.email) throw new Error('Your account has no email address.');
  const { error } = await supabase.auth.resend({ type: 'signup', email: user.email });
  if (error) throw error;
}
export async function sendPasswordResetEmail(_auth: typeof auth, email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: 'detail://reset-password' });
  if (error) throw error;
}

/** Exchanges Supabase recovery links whether the app is cold-started or already open. */
export async function handleAuthCallback(url: string) {
  const parsed = new URL(url);
  const query = parsed.searchParams;
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const code = query.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }
  const tokenHash = query.get('token_hash') ?? hash.get('token_hash');
  const type = query.get('type') ?? hash.get('type');
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'recovery' | 'signup' | 'email' | 'magiclink' | 'invite' | 'email_change' });
    if (error) throw error;
    return;
  }
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw error;
    return;
  }
  throw new Error('This authentication link is invalid or expired. Request a new link and try again.');
}

export const firebaseConfig = {
  apiKey: '', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: '',
};

type Filter = { type: 'where'; field: string; operator: string; value: unknown };
type Order = { type: 'order'; field: string; direction: 'asc' | 'desc' };
type Limit = { type: 'limit'; count: number };
type Constraint = Filter | Order | Limit;
type CollectionRef = { kind: 'collection'; table: string };
type DocumentRef = { kind: 'document'; table: string; id: string };
type QueryRef = { kind: 'query'; collection: CollectionRef; constraints: Constraint[] };
type Ref = CollectionRef | DocumentRef | QueryRef;
interface DocumentSnapshot { id: string; exists: () => boolean; data: () => any; }
interface QuerySnapshot { docs: DocumentSnapshot[]; size: number; empty: boolean; forEach: (fn: (snap: DocumentSnapshot) => void) => void; }

const tableAliases: Record<string, string> = { transactions: 'walletTransactions' };
const physicalTables: Record<string, string> = { openJobs:'openjobs', jobEvents:'jobevents', organizationMembers:'organizationmembers', organizationInvites:'organizationinvites', walletTransactions:'wallettransactions', platformTransactions:'platformtransactions', payoutRequests:'payoutrequests', adminRoles:'adminroles', adminInvites:'admininvites', adminAuditEvents:'adminauditevents', betaWaitlist:'betawaitlist', marketingCampaigns:'marketingcampaigns', legacyAuthMappings:'legacyauthmappings', privateKyc:'privatekyc', authRateLimits:'authratelimits' };
const primaryKeys: Record<string, string> = { openJobs: 'jobid' };
const physicalTable = (table: string) => physicalTables[table] ?? table;
const physicalColumn = (column: string) => column.toLowerCase();
const newId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
  const value = Math.floor(Math.random() * 16);
  return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
});
const camelColumns: Record<string, string[]> = {
  users: ['email','displayName','photoURL','role','accountType','organizationId','balance','earningsBalance','commissionBalance','commissionOwed','status','hasAgreedToTerms','cleanerAgreementAccepted','cleanerOnboardingComplete','hasCompletedProfile','hasSetupPermissions','isSuspended','isBanned','verificationStatus','verificationLevel','serviceCategories','serviceRadiusKm','experienceYears','address','serviceArea','phone','location','jobsCompleted','ratingAverage','ratingCount','responseTimeAverage','expoPushToken','createdAt','updatedAt','metadata'],
  jobs: ['customerId','cleanerId','customerName','customerPhoto','customerPhone','cleanerName','cleanerPhoto','cleanerPhone','cleanerRating','category','serviceType','checklist','description','location','scheduledTime','scheduledDateTime','timePreference','status','pricingStrategy','budget','price','photos','completionPhotos','biddingExpiresAt','reminderSent','estimatedDuration','cleanerLocation','cleanerLocationUpdatedAt','paidAt','paymentMethod','paymentStatus','earnings','rating','ratedAt','isFavoriteRebook','createdAt','updatedAt','data','bookingMode','suppliesRequired','suppliesFee','arrivalAt','serviceStartedAt','completionSubmittedAt','customerResponseAt','matchExpiresAt'],
  openJobs: ['jobId','status','category','serviceType','budget','biddingExpiresAt','customerId','createdAt','data'],
  bids: ['jobId','cleanerId','cleanerName','cleanerPhoto','cleanerRating','cleanerReviewCount','cleanerJobsCompleted','cleanerEliteVerified','bidPrice','estimatedArrival','status','message','history','createdAt','updatedAt'],
  favorites: ['customerId','cleanerId','cleanerName','cleanerPhoto','createdAt'],
  messages: ['jobId','senderId','senderName','text','imageUrl','read','createdAt'],
  notifications: ['userId','title','body','type','jobId','read','createdAt','data'],
  reviews: ['jobId','customerId','cleanerId','rating','comment','createdAt','data'],
  payoutRequests: ['cleanerId','amount','method','accountName','accountNumber','status','transferReference','settledBy','createdAt','settledAt','data'],
  walletTransactions: ['userId','jobId','payoutRequestId','paymentId','type','amount','balanceType','status','description','idempotencyKey','createdAt','data'],
  organizations: ['ownerId','name','registrationNumber','phone','country','city','createdAt','metadata'],
  organizationMembers: ['organizationId','userId','role','status','cleanerName','email','verificationStatus','createdAt'],
};

export const db: SupabaseClient = supabase;
export function doc(_dbOrCollection: SupabaseClient | CollectionRef, table?: string, id?: string): DocumentRef {
  if ((typeof _dbOrCollection === 'object') && 'kind' in _dbOrCollection && _dbOrCollection.kind === 'collection') {
    return { kind: 'document', table: _dbOrCollection.table, id: newId() };
  }
  if (!table || !id) throw new Error('Document table and id are required.');
  return { kind: 'document', table: tableAliases[table] ?? table, id };
}
export const collection = (_db: SupabaseClient, table: string): CollectionRef => ({ kind: 'collection', table: tableAliases[table] ?? table });
export const query = (collectionRef: CollectionRef, ...constraints: Constraint[]): QueryRef => ({ kind: 'query', collection: collectionRef, constraints });
export const where = (field: string, operator: string, value: unknown): Filter => ({ type: 'where', field, operator, value });
export const orderBy = (field: string, direction: 'asc' | 'desc' = 'asc'): Order => ({ type: 'order', field, direction });
export const limit = (count: number): Limit => ({ type: 'limit', count });
export const serverTimestamp = () => new Date().toISOString();
export const Timestamp = { fromDate: (date: Date) => date, fromMillis: (millis: number) => new Date(millis), now: () => new Date() };
export const increment = (amount: number) => ({ __increment: amount });

function tableOf(ref: Ref): string { return ref.kind === 'query' ? ref.collection.table : ref.table; }
function idOf(ref: DocumentRef): string { return ref.id; }
function keyOf(table: string): string { return primaryKeys[table] ?? 'id'; }
function rowToData(table: string, row: Record<string, any>) {
  if (row.__signedData) return row.__signedData;
  const known = ['id','data',...(camelColumns[table] ?? [])];
  const names = new Map(known.map(name => [name.toLowerCase(), name]));
  const normalized = Object.fromEntries(Object.entries(row).map(([key,value]) => [names.get(key.toLowerCase()) ?? key,value]));
  const result = { ...normalized.data, ...normalized };
  delete result.data;
  delete result.__signedData;
  if (table === 'users') result.uid = row.id;
  if (table === 'openJobs') result.id = row.jobid ?? normalized.jobId;
  return result;
}
function dataToRow(table: string, input: Record<string, any>) {
  const columns = camelColumns[table] ?? Object.keys(input).filter(k => k !== 'id' && k !== 'uid');
  const row: Record<string, any> = {};
  for (const key of columns) if (input[key] !== undefined) row[key] = normalizeMedia(input[key]);
  if (table === 'users' && input.uid) row.id = input.uid;
  if (table === 'organizations' && input.id) row.id = input.id;
  if (table === 'openJobs' && input.id) row.jobId = input.id;
  if (table === 'jobs' || table === 'notifications' || table === 'walletTransactions' || table === 'reviews') {
    const known = new Set([...(camelColumns[table] ?? []), 'id','uid']);
    row.data = Object.fromEntries(Object.entries(input).filter(([key]) => !known.has(key)).map(([key, value]) => [key, normalizeMedia(value)]));
  }
  return Object.fromEntries(Object.entries(row).map(([key,value]) => [physicalColumn(key),value]));
}

function normalizeMedia(value: any): any {
  if (typeof value === 'string') {
    const marker = '/storage/v1/object/sign/detail-media/';
    const index = value.indexOf(marker);
    if (index >= 0) return `detail-media/${decodeURIComponent(value.slice(index + marker.length).split('?')[0])}`;
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeMedia);
  if (value && typeof value === 'object' && !(value instanceof Date)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeMedia(item)]));
  return value;
}

function applyConstraints(builder: any, constraints: Constraint[]) {
  for (const constraint of constraints) {
    if (constraint.type === 'where') {
      const column = physicalColumn(constraint.field);
      if (constraint.operator === '==') builder = builder.eq(column, constraint.value);
      else if (constraint.operator === '!=') builder = builder.neq(column, constraint.value);
      else if (constraint.operator === 'in') builder = builder.in(column, constraint.value as unknown[]);
      else if (constraint.operator === 'array-contains') builder = builder.contains(column, [constraint.value]);
      else if (constraint.operator === '<') builder = builder.lt(column, constraint.value);
      else if (constraint.operator === '<=') builder = builder.lte(column, constraint.value);
      else if (constraint.operator === '>') builder = builder.gt(column, constraint.value);
      else if (constraint.operator === '>=') builder = builder.gte(column, constraint.value);
    } else if (constraint.type === 'order') builder = builder.order(physicalColumn(constraint.field), { ascending: constraint.direction === 'asc' });
    else if (constraint.type === 'limit') builder = builder.limit(constraint.count);
  }
  return builder;
}

function documentSnapshot(table: string, row: Record<string, any> | null): DocumentSnapshot {
  const value = row ? row.__signedData as Record<string, any> | undefined : undefined;
  return { id: row ? String(row[keyOf(table)]) : '', exists: () => !!row, data: () => value ?? (row ? rowToData(table, row) : undefined) };
}
function querySnapshot(table: string, rows: Record<string, any>[]): QuerySnapshot {
  const docs = rows.map(row => documentSnapshot(table, row));
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn: (snap: ReturnType<typeof documentSnapshot>) => void) => docs.forEach(fn) };
}
async function fetchRows(ref: QueryRef) {
  const table = ref.collection.table;
  let builder: any = supabase.from(physicalTable(table)).select('*');
  builder = applyConstraints(builder, ref.constraints);
  const { data, error } = await builder;
  if (error) throw error;
  const rows = (data ?? []) as Record<string, any>[];
  return Promise.all(rows.map(async row => ({ ...row, __signedData: await signMediaValue(rowToData(table, row)) })));
}

export async function getDoc(ref: DocumentRef) {
  const { data, error } = await supabase.from(physicalTable(ref.table)).select('*').eq(keyOf(ref.table), ref.id).maybeSingle();
  if (error) throw error;
  const row = data as Record<string, any> | null;
  if (row) row.__signedData = await signMediaValue(rowToData(ref.table, row));
  return documentSnapshot(ref.table, row);
}
export async function getDocs(ref: QueryRef) { return querySnapshot(ref.collection.table, await fetchRows(ref)); }
export async function setDoc(ref: DocumentRef, input: Record<string, any>, options?: { merge?: boolean }) {
  const row = dataToRow(ref.table, input);
  if (options?.merge) {
    const { data: old, error: readError } = await supabase.from(physicalTable(ref.table)).select('*').eq(keyOf(ref.table), ref.id).maybeSingle();
    if (readError) throw readError;
    if (old) {
      if (row.data) row.data = { ...((old as Record<string, any>).data ?? {}), ...row.data };
      delete row[keyOf(ref.table)];
      if (ref.table === 'users') for (const key of ['email','role','accounttype','organizationid','balance','earningsbalance','commissionbalance','commissionowed','status','verificationstatus','verificationlevel','issuspended','isbanned','cleaneragreementaccepted','cleaneronboardingcomplete','jobscompleted','ratingaverage','ratingcount','responsetimeaverage','walletRestricted','locationPoint','locationUpdatedAt','accountDeletedAt','createdAt']) delete row[key.toLowerCase()];
      const { error } = await supabase.from(physicalTable(ref.table)).update(row).eq(keyOf(ref.table), ref.id);
      if (error) throw error;
      return;
    }
  }
  row[keyOf(ref.table)] = ref.id;
  const { error } = await supabase.from(physicalTable(ref.table)).upsert(row);
  if (error) throw error;
}
export async function updateDoc(ref: DocumentRef, input: Record<string, any>) {
  const { data: old, error: readError } = await supabase.from(physicalTable(ref.table)).select('*').eq(keyOf(ref.table), ref.id).maybeSingle();
  if (readError) throw readError;
  if (!old) throw new Error('Record not found.');
  const row = dataToRow(ref.table, input);
  const unknown = row.data ? { ...(old as Record<string, any>).data, ...row.data } : undefined;
  if (unknown) {
    for (const [key, value] of Object.entries(input)) {
      if ((value as any)?.__increment !== undefined) unknown[key] = Number(unknown[key] ?? 0) + Number((value as any).__increment);
    }
    row.data = unknown;
  }
  for (const [key, value] of Object.entries(input)) {
    if ((value as any)?.__increment !== undefined && camelColumns[ref.table]?.includes(key)) {
      row[physicalColumn(key)] = Number((old as Record<string, any>)[physicalColumn(key)] ?? 0) + Number((value as any).__increment);
    }
  }
  if (ref.table === 'users') for (const key of ['role','accounttype','organizationid','balance','earningsbalance','commissionbalance','commissionowed','status','verificationstatus','verificationlevel','issuspended','isbanned','cleaneragreementaccepted','createdat']) delete row[key];
  const { error } = await supabase.from(physicalTable(ref.table)).update(row).eq(keyOf(ref.table), ref.id);
  if (error) throw error;
}
export async function deleteDoc(ref: DocumentRef) {
  const { error } = await supabase.from(physicalTable(ref.table)).delete().eq(keyOf(ref.table), ref.id);
  if (error) throw error;
}
export async function addDoc(ref: CollectionRef, input: Record<string, any>) {
  const { data, error } = await supabase.from(physicalTable(ref.table)).insert(dataToRow(ref.table, input)).select('*').single();
  if (error) throw error;
  return { id: String((data as Record<string, any>)[keyOf(ref.table)]) };
}

export function onSnapshot(ref: DocumentRef, next: (snapshot: DocumentSnapshot) => void, error?: (error: Error) => void): () => void;
export function onSnapshot(ref: QueryRef, next: (snapshot: QuerySnapshot) => void, error?: (error: Error) => void): () => void;
export function onSnapshot(ref: DocumentRef | QueryRef, next: (snapshot: any) => void, error?: (error: Error) => void) {
  let stopped = false;
  const table = tableOf(ref);
  const refresh = async () => {
    try {
      if (stopped) return;
      if (ref.kind === 'document') next(await getDoc(ref));
      else next(querySnapshot(table, await fetchRows(ref)));
    } catch (err) { if (!stopped) error?.(err as Error); }
  };
  const channel = supabase.channel(`watch:${table}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: physicalTable(table) }, refresh)
    .subscribe();
  void refresh();
  return () => { stopped = true; void supabase.removeChannel(channel); };
}

export function writeBatch(_db: SupabaseClient) {
  const operations: Array<() => Promise<unknown>> = [];
  return {
    set: (ref: DocumentRef, value: Record<string, any>, options?: { merge?: boolean }) => operations.push(() => setDoc(ref, value, options)),
    update: (ref: DocumentRef, value: Record<string, any>) => operations.push(() => updateDoc(ref, value)),
    delete: (ref: DocumentRef) => operations.push(() => deleteDoc(ref)),
    commit: async () => { for (const operation of operations) await operation(); },
  };
}

export enum OperationType { CREATE = 'create', UPDATE = 'update', DELETE = 'delete', LIST = 'list', GET = 'get', WRITE = 'write' }
export function handleFirestoreError(error: unknown) { throw error instanceof Error ? error : new Error(String(error)); }
