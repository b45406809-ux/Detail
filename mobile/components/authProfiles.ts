import { supabase } from '../services/supabase';

/** Supabase's auth.users trigger creates a profile for new social providers. */
export async function ensureProfileExists(uid: string, email: string | null) {
  const { data } = await supabase.from('users').select('id').eq('id', uid).maybeSingle();
  if (data) return;
  throw new Error(`The Supabase profile trigger did not create a profile for ${email ?? uid}.`);
}
