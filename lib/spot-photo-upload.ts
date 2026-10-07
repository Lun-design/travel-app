import { supabase } from './supabase';

export const SPOT_PHOTO_BUCKET = 'itinerary-photos';
export const MAX_SPOT_PHOTO_BYTES = 2 * 1024 * 1024;
const SUPPORTED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type SpotPhotoUpload = {
  tripId: string;
  itemId: string;
  mimeType: string;
  data: ArrayBuffer;
};

export type CompressedSpotPhoto = { uri: string; data: ArrayBuffer; mimeType: 'image/jpeg' };
export type SpotPhotoRenderer = (options: { uri: string; width: number; quality: number }) => Promise<{ uri: string; data: ArrayBuffer }>;

export function validateSpotPhoto(mimeType: string, byteLength: number): void {
  if (!SUPPORTED_PHOTO_TYPES.has(mimeType)) throw new Error('照片僅支援 JPG、PNG 或 WebP。');
  if (!Number.isFinite(byteLength) || byteLength <= 0) throw new Error('照片檔案為空或無法讀取。');
  if (byteLength > MAX_SPOT_PHOTO_BYTES) throw new Error('照片須壓縮至 2 MB 以內。');
}

/** Try progressively smaller JPEG outputs while preserving the original photo until confirmation. */
export async function compressSpotPhoto(
  source: { uri: string; width: number; height: number; mimeType: string },
  render: SpotPhotoRenderer,
): Promise<CompressedSpotPhoto> {
  if (!SUPPORTED_PHOTO_TYPES.has(source.mimeType)) throw new Error('照片僅支援 JPG、PNG 或 WebP。');
  if (!source.uri || !Number.isFinite(source.width) || source.width <= 0 || !Number.isFinite(source.height) || source.height <= 0) {
    throw new Error('無法讀取照片尺寸，請重新選擇。');
  }
  for (const [maxWidth, quality] of [[1600, 0.82], [1400, 0.68], [1100, 0.54], [900, 0.42]]) {
    const output = await render({ uri: source.uri, width: Math.min(source.width, maxWidth), quality });
    if (output.data.byteLength > 0 && output.data.byteLength <= MAX_SPOT_PHOTO_BYTES) {
      return { ...output, mimeType: 'image/jpeg' };
    }
  }
  throw new Error('照片壓縮後仍超過 2 MB，請改選較小的照片。');
}

export async function uploadSpotPhoto(input: SpotPhotoUpload): Promise<{ url: string; path: string }> {
  validateSpotPhoto(input.mimeType, input.data.byteLength);
  if (!input.tripId || !input.itemId) throw new Error('缺少行程或景點資料，無法上傳照片。');
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const extension = input.mimeType === 'image/png' ? 'png' : input.mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${input.tripId}/${input.itemId}/${id}.${extension}`;
  const bucket = supabase.storage.from(SPOT_PHOTO_BUCKET);
  const { error } = await bucket.upload(path, input.data, { contentType: input.mimeType, upsert: false });
  if (error) throw error;
  const { data } = bucket.getPublicUrl(path);
  if (!data.publicUrl) {
    await bucket.remove([path]);
    throw new Error('無法取得上傳照片的公開網址。');
  }
  return { url: data.publicUrl, path };
}

export async function uploadAndPersistSpotPhoto(input: SpotPhotoUpload, persist: (url: string) => Promise<void>): Promise<string> {
  const uploaded = await uploadSpotPhoto(input);
  try {
    await persist(uploaded.url);
    return uploaded.url;
  } catch (error) {
    try { await supabase.storage.from(SPOT_PHOTO_BUCKET).remove([uploaded.path]); }
    catch (cleanupError) { console.error('[SpotPhoto] failed to remove unlinked upload', cleanupError); }
    throw error;
  }
}
