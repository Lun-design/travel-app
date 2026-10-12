import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeVoucherFileType } from '../lib/vouchers';
import { deleteVoucher, getVoucherPreviewUrl, updateVoucher, uploadVoucher } from '../lib/vouchers-api';

const supabaseMock = vi.hoisted(() => ({
  storage: { from: vi.fn() },
  from: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: supabaseMock }));

describe('voucher helpers', () => {
  it('normalizes supported MIME types to image or pdf', () => {
    expect(normalizeVoucherFileType('application/pdf')).toBe('pdf');
    expect(normalizeVoucherFileType('image/jpeg')).toBe('image');
    expect(normalizeVoucherFileType('image/png')).toBe('image');
    expect(normalizeVoucherFileType('text/plain')).toBeNull();
  });
});

describe('voucher storage API', () => {
  it.each(['image/gif', 'image/svg+xml', 'image/heic'])('rejects %s before any Storage or database request', async (fileType) => {
    await expect(uploadVoucher({ tripId: 'trip', userId: 'user', title: '票券', fileName: 'ticket.gif', fileType, data: new ArrayBuffer(100) })).rejects.toThrow(/JPG|PNG|WebP|PDF/);
    expect(supabaseMock.storage.from).not.toHaveBeenCalled();
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
  it('rejects empty or oversized files before Storage', async () => {
    const input = { tripId: 'trip', userId: 'user', title: 'ticket', fileName: 'ticket.png', fileType: 'image/png' };
    await expect(uploadVoucher({ ...input, data: new ArrayBuffer(0) })).rejects.toThrow(/空|讀取/);
    await expect(uploadVoucher({ ...input, data: new ArrayBuffer(10485761) })).rejects.toThrow(/10 MB/);
    expect(supabaseMock.storage.from).not.toHaveBeenCalled();
  });
  it('infers a missing MIME type for a supported file and persists the uploaded ticket', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    supabaseMock.storage.from.mockReturnValue({ upload });
    const insert = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'new-ticket' }, error: null }) }) });
    supabaseMock.from.mockReturnValue({ insert });
    await expect(uploadVoucher({ tripId: 'trip', userId: 'user', title: 'ticket', fileName: 'ticket.PNG', fileType: 'application/octet-stream', data: new ArrayBuffer(100) })).resolves.toMatchObject({ id: 'new-ticket' });
    expect(upload).toHaveBeenCalledWith(expect.any(String), expect.any(ArrayBuffer), { contentType: 'image/png', upsert: false });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ file_type: 'image' }));
  });
  it('surfaces storage errors and does not delete the row on failure', async () => {
    supabaseMock.storage.from.mockReturnValue({ remove: vi.fn().mockResolvedValue({ error: new Error('Storage permission denied') }) });
    await expect(deleteVoucher({ id: 'v1', file_path: 't/file' })).rejects.toThrow('Storage permission denied');
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
  it('surfaces database errors after storage deletion', async () => {
    supabaseMock.storage.from.mockReturnValue({ remove: vi.fn().mockResolvedValue({ error: null }) });
    supabaseMock.from.mockReturnValue({ delete: () => ({ eq: vi.fn().mockResolvedValue({ error: new Error('Database permission denied') }) }) });
    await expect(deleteVoucher({ id: 'v1', file_path: 't/file' })).rejects.toThrow('Database permission denied');
  });
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.storage.from.mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: new Error('Storage rejected file') }) });
  });

  it('creates a signed Storage URL for image previews', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.example/ticket.jpg' }, error: null });
    supabaseMock.storage.from.mockReturnValue({ createSignedUrl });

    await expect(getVoucherPreviewUrl({ file_path: 'trip/user/ticket.jpg' })).resolves.toBe('https://signed.example/ticket.jpg');
    expect(supabaseMock.storage.from).toHaveBeenCalledWith('travel-documents');
    expect(createSignedUrl).toHaveBeenCalledWith('trip/user/ticket.jpg', 900);
  });

  it('removes the Storage object before deleting the voucher row by id', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    supabaseMock.storage.from.mockReturnValue({ remove });
    const eq = vi.fn().mockResolvedValue({ error: null });
    supabaseMock.from.mockReturnValue({ delete: () => ({ eq }) });

    await deleteVoucher({ id: 'voucher-1', file_path: 'trip/user/ticket.jpg' });

    expect(remove).toHaveBeenCalledWith(['trip/user/ticket.jpg']);
    expect(supabaseMock.from).toHaveBeenCalledWith('vouchers');
    expect(eq).toHaveBeenCalledWith('id', 'voucher-1');
  });

  it('updates reservation metadata and binds a voucher to an itinerary item', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'voucher-1', item_id: 'item-2', reservation_number: 'ABC123', usage_at: '2026-10-23T10:00:00.000Z', notes: '電子票' }, error: null });
    const eq = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    const update = vi.fn().mockReturnValue({ eq });
    supabaseMock.from.mockReturnValue({ update });

    await updateVoucher('voucher-1', { item_id: 'item-2', reservation_number: 'ABC123', usage_at: '2026-10-23T10:00:00.000Z', notes: '電子票' });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ item_id: 'item-2', reservation_number: 'ABC123', usage_at: '2026-10-23T10:00:00.000Z', notes: '電子票' }));
    expect(eq).toHaveBeenCalledWith('id', 'voucher-1');
  });
});

describe('vouchers panel UI contract', () => {
  it('renders image thumbnails from signed URLs and updates local state after deletion', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/VouchersPanel.tsx'), 'utf8');

    expect(source).toContain('getVoucherPreviewUrl');
    expect(source).toContain('<Image');
    expect(source).toContain('setVouchers((current) => current.filter');
    expect(source).toContain('setPreviewUrls');
  });

  it('stops delete taps from bubbling into the voucher preview action', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/VouchersPanel.tsx'), 'utf8');

    expect(source).toContain('event.stopPropagation()');
    expect(source).toContain('onPress={(event) =>');
    expect(source).toContain('setToast(error?.message');
  });

  it('exposes preview, binding, reservation fields, and usage time in the UI', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/VouchersPanel.tsx'), 'utf8');
    const upload = readFileSync(path.resolve(process.cwd(), 'src/components/VoucherUploadModal.tsx'), 'utf8');
    const preview = readFileSync(path.resolve(process.cwd(), 'src/components/VoucherPreviewModal.tsx'), 'utf8');
    const metadata = readFileSync(path.resolve(process.cwd(), 'src/components/VoucherMetadataModal.tsx'), 'utf8');
    expect(source).toContain('bindingVoucher');
    expect(source).toContain('setBindingVoucher');
    expect(source).toContain('setPreview(voucher)');
    expect(source).toContain('updateVoucher');
    expect(source).toContain('setBindingItemId');
    expect(source).toContain('VoucherMetadataModal');
    expect(source).toContain('visible={bindingVoucher !== null}');
    expect(source).toContain('bindingItems.map');
    expect(source).toContain('resizeMode="cover"');
    expect(source).toContain('updateItineraryItemReservationTags');
    expect(source).toContain("'ticketed'");
    expect(upload).toContain('reservationNumber');
    expect(upload).toContain('usageAt');
    expect(upload).toContain('notes');
    expect(preview).toContain('getVoucherPreviewUrl');
    expect(preview).toContain('Linking.openURL');
    expect(preview).toContain('Linking.openURL(url).catch');
    expect(metadata).toContain('updateVoucher');
    expect(metadata).toContain('reservation_number');
    expect(metadata).toContain('usage_at');
  });

  it('provides reservation-number copy controls backed by the clipboard API', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/VouchersPanel.tsx'), 'utf8');

    expect(source).toContain('navigator.clipboard.writeText');
    expect(source).toContain('複製預約編號');
    expect(source).toContain('預約編號已複製');
  });

  it('exposes category filters and category labels for voucher cards', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/VouchersPanel.tsx'), 'utf8');
    const metadata = readFileSync(path.resolve(process.cwd(), 'src/components/VoucherMetadataModal.tsx'), 'utf8');

    expect(source).toContain('篩選');
    expect(source).toContain('getVoucherCategoryLabel');
    expect(metadata).toContain('voucherCategoryOptions');
    expect(metadata).toContain('category');
  });
});
