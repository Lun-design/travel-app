import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRESET_AVATARS,
  buildProfileAvatarPath,
  getProfileDisplayName,
  getProfileInitial,
  getPresetAvatar,
  getCurrentProfile,
  isSupportedProfileAvatarType,
  updateCurrentProfile,
  uploadProfileAvatar,
} from '../lib/profiles';

const supabaseMock = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
    updateUser: vi.fn(),
  },
  from: vi.fn(),
  storage: { from: vi.fn() },
}));

vi.mock('../lib/supabase', () => ({ supabase: supabaseMock }));

describe('profile helpers', () => {
  it('uses display name, then full name, then email prefix, then user id', () => {
    expect(getProfileDisplayName({ display_name: '  小白  ', full_name: 'Alex', email: 'alex@example.com' }, 'user-1')).toBe('小白');
    expect(getProfileDisplayName({ display_name: ' ', full_name: 'Alex', email: 'alex@example.com' }, 'user-1')).toBe('Alex');
    expect(getProfileDisplayName({ display_name: null, full_name: null, email: 'alex@example.com' }, 'user-1')).toBe('alex');
    expect(getProfileDisplayName({ display_name: null, full_name: null, email: null }, 'user-1')).toBe('user-1');
  });

  it('creates a stable initial and exposes ten preset avatars', () => {
    expect(PRESET_AVATARS).toHaveLength(10);
    expect(getProfileInitial({ display_name: '小白' }, 'user-1')).toBe('小');
    expect(getProfileInitial({ display_name: null, full_name: null, email: 'alice@example.com' }, 'user-1')).toBe('A');
    expect(getPresetAvatar(`preset:${PRESET_AVATARS[0].id}`)).toEqual(PRESET_AVATARS[0]);
  });

  it('builds a safe per-user avatar storage path', () => {
    expect(buildProfileAvatarPath('user-1', 'My Avatar.JPG', 'upload-1')).toBe('user-1/upload-1-My-Avatar.JPG');
  });

  it('accepts common image avatar MIME types only', () => {
    expect(isSupportedProfileAvatarType('image/jpeg')).toBe(true);
    expect(isSupportedProfileAvatarType('image/png')).toBe(true);
    expect(isSupportedProfileAvatarType('application/pdf')).toBe(false);
  });
});

describe('profile API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'alice@example.com', user_metadata: { full_name: 'Alice' } } }, error: null });
  });

  it('hydrates a profile with auth metadata fallback fields', async () => {
    supabaseMock.from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'user-1', display_name: null, full_name: null, avatar_url: null, updated_at: 'now' }, error: null }) }) }),
    });

    await expect(getCurrentProfile()).resolves.toMatchObject({ id: 'user-1', full_name: 'Alice', email: 'alice@example.com' });
  });

  it('updates both the auth metadata and profile row', async () => {
    supabaseMock.auth.updateUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    supabaseMock.from.mockReturnValue({
      update: (payload: Record<string, unknown>) => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'user-1', ...payload }, error: null }) }) }) }),
    });

    await expect(updateCurrentProfile({ display_name: '小白', avatar_url: 'preset:cream' })).resolves.toMatchObject({ display_name: '小白', avatar_url: 'preset:cream' });
    expect(supabaseMock.auth.updateUser).toHaveBeenCalledWith({ data: { display_name: '小白', avatar_url: 'preset:cream' } });
  });

  it('uploads an avatar to the avatars bucket and returns its public URL', async () => {
    supabaseMock.storage.from.mockReturnValue({
      upload: async () => ({ error: null }),
      getPublicUrl: () => ({ data: { publicUrl: 'https://cdn.example/avatar.jpg' } }),
    });

    await expect(uploadProfileAvatar({ userId: 'user-1', fileName: 'avatar.jpg', fileType: 'image/jpeg', data: new ArrayBuffer(1), id: 'upload-1' })).resolves.toBe('https://cdn.example/avatar.jpg');
    expect(supabaseMock.storage.from).toHaveBeenCalledWith('avatars');
  });
});
