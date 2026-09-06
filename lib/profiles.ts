import { supabase } from './supabase';

export type Profile = {
  id: string;
  display_name: string | null;
  full_name?: string | null;
  email?: string | null;
  avatar_url: string | null;
  updated_at: string;
};

export type ProfileLike = Pick<Profile, 'display_name'> & {
  avatar_url?: string | null;
  full_name?: string | null;
  email?: string | null;
};

export type ProfileAvatarUploadInput = {
  userId: string;
  fileName: string;
  fileType: string;
  data: ArrayBuffer;
  id?: string;
};

export type PresetAvatar = { id: string; label: string; emoji: string; backgroundColor: string };

export const PRESET_AVATARS: readonly PresetAvatar[] = [
  { id: 'cream', label: '奶油', emoji: '☼', backgroundColor: '#F4E7CF' },
  { id: 'sage', label: '鼠尾草', emoji: '✦', backgroundColor: '#DCE8D6' },
  { id: 'terracotta', label: '陶土', emoji: '◒', backgroundColor: '#EBC7B7' },
  { id: 'sky', label: '晴空', emoji: '⌁', backgroundColor: '#D9E7EC' },
  { id: 'lavender', label: '薰衣草', emoji: '✿', backgroundColor: '#E5DDEB' },
  { id: 'lemon', label: '檸檬', emoji: '•', backgroundColor: '#F4EDB7' },
  { id: 'sand', label: '暖沙', emoji: '∿', backgroundColor: '#E9D9C7' },
  { id: 'coral', label: '珊瑚', emoji: '♡', backgroundColor: '#F2D0D0' },
  { id: 'forest', label: '森林', emoji: '⌂', backgroundColor: '#D7E1D5' },
  { id: 'ink', label: '墨色', emoji: '＋', backgroundColor: '#D9D6CE' },
];

const PROFILE_AVATAR_BUCKET = 'avatars';

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }
  return null;
}

export function getProfileDisplayName(profile: ProfileLike | null | undefined, fallback = '旅伴'): string {
  const emailPrefix = profile?.email?.split('@')[0] ?? null;
  return firstNonEmpty(profile?.display_name, profile?.full_name, emailPrefix, fallback) ?? fallback;
}

export function getProfileInitial(profile: ProfileLike | null | undefined, fallback = '旅'): string {
  return Array.from(getProfileDisplayName(profile, fallback))[0]?.toUpperCase() ?? fallback;
}

export function getPresetAvatar(value: string | null | undefined): PresetAvatar | null {
  if (!value?.startsWith('preset:')) return null;
  return PRESET_AVATARS.find((avatar) => `preset:${avatar.id}` === value) ?? null;
}

export function buildProfileAvatarPath(userId: string, fileName: string, id = String(Date.now())): string {
  const safeName = fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'avatar';
  return `${userId}/${id}-${safeName}`;
}

export function isSupportedProfileAvatarType(fileType: string): boolean {
  return /^image\/(?:jpeg|png|webp|gif)$/i.test(fileType);
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userData.user.id).maybeSingle();
  if (error) throw error;
  const metadata = userData.user.user_metadata ?? {};
  if (!data) {
    return {
      id: userData.user.id,
      display_name: firstNonEmpty(metadata.display_name, metadata.name, userData.user.email?.split('@')[0]) ?? null,
      full_name: firstNonEmpty(metadata.full_name, metadata.name),
      email: userData.user.email ?? null,
      avatar_url: firstNonEmpty(metadata.avatar_url) ?? null,
      updated_at: new Date().toISOString(),
    };
  }
  return {
    ...(data as Profile),
    full_name: firstNonEmpty((data as Profile).full_name, metadata.full_name, metadata.name),
    email: firstNonEmpty((data as Profile).email, userData.user.email),
    display_name: firstNonEmpty((data as Profile).display_name, metadata.display_name) ?? null,
  };
}

export async function updateCurrentProfile(input: Pick<Profile, 'display_name' | 'avatar_url'>): Promise<Profile> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('尚未登入');
  const displayName = input.display_name?.trim() || null;
  const avatarUrl = input.avatar_url?.trim() || null;
  const { error: metadataError } = await supabase.auth.updateUser({ data: { display_name: displayName, avatar_url: avatarUrl } });
  if (metadataError) throw metadataError;
  const { data, error } = await supabase.from('profiles').update({ display_name: displayName, avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq('id', userData.user.id).select().single();
  if (error) throw error;
  return { ...(data as Profile), email: userData.user.email ?? null };
}

export async function uploadProfileAvatar(input: ProfileAvatarUploadInput): Promise<string> {
  if (!isSupportedProfileAvatarType(input.fileType)) throw new Error('大頭照僅支援 JPG、PNG、WebP 或 GIF。');
  const path = buildProfileAvatarPath(input.userId, input.fileName, input.id);
  const stored = await supabase.storage.from(PROFILE_AVATAR_BUCKET).upload(path, input.data, { contentType: input.fileType, upsert: false });
  if (stored.error) throw stored.error;
  const { data } = supabase.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
