import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeVoucherFileType } from '../lib/vouchers';
import { deleteVoucher, getVoucherPreviewUrl } from '../lib/vouchers-api';

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
  beforeEach(() => vi.clearAllMocks());

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
});

describe('vouchers panel UI contract', () => {
  it('renders image thumbnails from signed URLs and updates local state after deletion', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/VouchersPanel.tsx'), 'utf8');

    expect(source).toContain('getVoucherPreviewUrl');
    expect(source).toContain('<Image');
    expect(source).toContain('setVouchers((current) => current.filter');
    expect(source).toContain('setPreviewUrls');
  });
});
