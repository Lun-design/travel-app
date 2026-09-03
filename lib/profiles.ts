import { supabase } from './supabase';

export type Profile = { id: string; display_name: string | null; avatar_url: string | null; updated_at: string };

export async function getCurrentProfile(): Promise<Profile | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userData.user.id).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function updateCurrentProfile(input: Pick<Profile, 'display_name' | 'avatar_url'>): Promise<Profile> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('尚未登入');
  const { data, error } = await supabase.from('profiles').update({ ...input, updated_at: new Date().toISOString() }).eq('id', userData.user.id).select().single();
  if (error) throw error;
  return data as Profile;
}
