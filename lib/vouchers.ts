export type VoucherFileType = 'image' | 'pdf';
export type VoucherCategory = 'flight' | 'hotel' | 'ticket' | 'transport' | 'other';

export type Voucher = {
  id: string;
  trip_id: string;
  item_id: string | null;
  title: string;
  file_url: string | null;
  file_type: VoucherFileType;
  file_path: string;
  uploaded_by: string;
  created_at: string;
  reservation_number?: string | null;
  usage_at?: string | null;
  notes?: string | null;
  category?: VoucherCategory | null;
};

export function normalizeVoucherFileType(mimeType: string): VoucherFileType | null {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'pdf' || normalized === 'application/pdf' || normalized.endsWith('.pdf')) return 'pdf';
  if (normalized === 'image' || normalized.startsWith('image/')) return 'image';
  return null;
}

/** Match the private travel-documents Bucket's MIME and size restrictions. */
export const VOUCHER_UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const MAX_VOUCHER_UPLOAD_BYTES = 10 * 1024 * 1024;

export function resolveVoucherUploadMimeType(fileName: string, mimeType?: string | null): string {
  let normalized = mimeType?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (normalized === 'image/jpg') normalized = 'image/jpeg';
  if (!normalized || normalized === 'application/octet-stream') {
    const extension = fileName.trim().split('.').pop()?.toLowerCase();
    normalized = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' } as Record<string, string>)[extension ?? ''] ?? '';
  }
  if (!VOUCHER_UPLOAD_MIME_TYPES.some((type) => type === normalized)) {
    throw new Error('票券僅支援 JPG、PNG、WebP 或 PDF；GIF、HEIC 等格式請先轉換。');
  }
  return normalized;
}

export function validateVoucherUploadSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) throw new Error('檔案為空或無法讀取，請重新選擇。');
  if (size > MAX_VOUCHER_UPLOAD_BYTES) throw new Error('票券檔案不能超過 10 MB，請壓縮後再試。');
}

export function getVoucherUploadErrorMessage(error: unknown): string {
  const value = error && typeof error === 'object' && 'message' in error ? error.message : error;
  const message = typeof value === 'string' ? value : '';
  if (/mime.*(?:not supported|not allowed)|unsupported.*mime/i.test(message)) return '儲存空間不接受此格式，請改用 JPG、PNG、WebP 或 PDF。';
  if (/bucket.*not found/i.test(message)) return '票券儲存空間尚未設定，請聯絡行程管理者。';
  if (/row.level security|unauthorized|permission denied/i.test(message)) return '無法上傳票券，請確認已登入且具有此行程的編輯權限。';
  if (/maximum allowed size|payload too large/i.test(message)) return '票券檔案不能超過 10 MB，請壓縮後再試。';
  if (/failed to fetch|network request failed/i.test(message)) return '網路連線中斷，請恢復連線後再試。';
  return message || '上傳票券失敗，請稍後再試。';
}
