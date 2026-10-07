import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = {
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
};
vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn(() => storage) } },
}));

const image = { tripId: 'trip-1', itemId: 'item-1', mimeType: 'image/jpeg', data: new ArrayBuffer(1200) };

beforeEach(() => {
  vi.clearAllMocks();
  storage.upload.mockResolvedValue({ error: null });
  storage.remove.mockResolvedValue({ error: null });
  storage.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.example/itinerary-photos/one.jpg' } });
});

describe('spot photo upload', () => {
  it('rejects unsupported formats and payloads larger than 2 MiB before Storage', async () => {
    const { validateSpotPhoto, uploadSpotPhoto } = await import('../lib/spot-photo-upload');
    expect(() => validateSpotPhoto('image/gif', 100)).toThrow(/JPG|PNG|WebP/);
    await expect(uploadSpotPhoto({ ...image, data: new ArrayBuffer(2 * 1024 * 1024 + 1) })).rejects.toThrow(/2 MB/);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('uploads to the dedicated public bucket and returns its URL', async () => {
    const { uploadSpotPhoto } = await import('../lib/spot-photo-upload');
    const { supabase } = await import('../lib/supabase');
    const result = await uploadSpotPhoto(image);
    expect(supabase.storage.from).toHaveBeenCalledWith('itinerary-photos');
    expect(storage.upload).toHaveBeenCalledWith(expect.stringMatching(/^trip-1\/item-1\/[\w-]+\.jpg$/), image.data, { contentType: 'image/jpeg', upsert: false });
    expect(result.url).toBe('https://cdn.example/itinerary-photos/one.jpg');
  });

  it('removes the new object if the itinerary URL update fails', async () => {
    const { uploadAndPersistSpotPhoto } = await import('../lib/spot-photo-upload');
    const persist = vi.fn().mockRejectedValue(new Error('DB update failed'));
    await expect(uploadAndPersistSpotPhoto(image, persist)).rejects.toThrow('DB update failed');
    expect(persist).toHaveBeenCalledWith('https://cdn.example/itinerary-photos/one.jpg');
    expect(storage.remove).toHaveBeenCalledWith([expect.stringMatching(/^trip-1\/item-1\//)]);
  });

  it('persists the public URL in itinerary_items.preview_url', async () => {
    const { uploadAndPersistSpotPhoto } = await import('../lib/spot-photo-upload');
    const { updateItineraryItemImage } = await import('../lib/itinerary-api');
    const { supabase } = await import('../lib/supabase');
    const query = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    vi.mocked(supabase.from).mockReturnValue(query as never);

    await uploadAndPersistSpotPhoto(image, async (url) => updateItineraryItemImage(image.itemId, url));

    expect(query.update).toHaveBeenCalledWith({ preview_url: 'https://cdn.example/itinerary-photos/one.jpg', photo_reference: null });
    expect(query.eq).toHaveBeenCalledWith('id', 'item-1');
  });
});

describe('spot photo compression policy', () => {
  it('recovers dimensions when the picker reports zero-sized media', async () => {
    const { resolveSpotPhotoDimensions } = await import('../lib/spot-photo-upload');
    const measure = vi.fn().mockResolvedValue({ width: 1200, height: 1800 });

    await expect(resolveSpotPhotoDimensions({ uri: 'blob:photo', width: 0, height: 0 }, measure))
      .resolves.toEqual({ width: 1200, height: 1800 });
    expect(measure).toHaveBeenCalledWith('blob:photo');
  });

  it('passes positive proportional dimensions to the renderer on web and mobile', async () => {
    const { compressSpotPhoto } = await import('../lib/spot-photo-upload');
    const render = vi.fn().mockResolvedValue({ uri: 'blob:ready', data: new ArrayBuffer(1200) });

    await compressSpotPhoto({ uri: 'blob:original', width: 3200, height: 2400, mimeType: 'image/jpeg' }, render);

    expect(render).toHaveBeenCalledWith({ uri: 'blob:original', width: 1600, height: 1200, quality: 0.82 });
  });

  it('tries smaller outputs and only returns an image within 2 MiB', async () => {
    const { compressSpotPhoto } = await import('../lib/spot-photo-upload');
    const render = vi.fn()
      .mockResolvedValueOnce({ uri: 'file:first.jpg', data: new ArrayBuffer(2 * 1024 * 1024 + 1) })
      .mockResolvedValueOnce({ uri: 'file:second.jpg', data: new ArrayBuffer(900_000) });
    const result = await compressSpotPhoto({ uri: 'file:original.png', width: 3200, height: 2400, mimeType: 'image/png' }, render);
    expect(render).toHaveBeenCalledTimes(2);
    expect(result.uri).toBe('file:second.jpg');
    expect(result.mimeType).toBe('image/jpeg');
  });
});
