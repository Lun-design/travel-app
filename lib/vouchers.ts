export type VoucherFileType = 'image' | 'pdf';

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
};

export function normalizeVoucherFileType(mimeType: string): VoucherFileType | null {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'pdf' || normalized === 'application/pdf' || normalized.endsWith('.pdf')) return 'pdf';
  if (normalized === 'image' || normalized.startsWith('image/')) return 'image';
  return null;
}
