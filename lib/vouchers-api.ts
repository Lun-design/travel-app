import { supabase } from './supabase';
import { buildDocumentPath } from './documents';
import { normalizeVoucherFileType, type Voucher } from './vouchers';

export type UploadVoucherInput = {
  tripId: string;
  userId: string;
  itemId?: string | null;
  title: string;
  fileName: string;
  fileType: string;
  data: ArrayBuffer;
  reservationNumber?: string | null;
  usageAt?: string | null;
  notes?: string | null;
};

export type VoucherUpdateInput = {
  item_id?: string | null;
  reservation_number?: string | null;
  usage_at?: string | null;
  notes?: string | null;
};

export async function listVouchers(tripId: string): Promise<Voucher[]> {
  const { data, error } = await supabase
    .from('vouchers')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Voucher[];
}

export async function uploadVoucher(input: UploadVoucherInput): Promise<Voucher> {
  const fileType = normalizeVoucherFileType(input.fileType);
  if (!fileType) throw new Error('僅支援圖片或 PDF 票券。');

  const path = buildDocumentPath(input.tripId, input.userId, input.fileName);
  const stored = await supabase.storage.from('travel-documents').upload(path, input.data, {
    contentType: input.fileType,
    upsert: false,
  });
  if (stored.error) throw stored.error;

  const { data, error } = await supabase.from('vouchers').insert({
    trip_id: input.tripId,
    item_id: input.itemId || null,
    title: input.title.trim() || input.fileName,
    file_url: null,
    file_type: fileType,
    file_path: path,
    uploaded_by: input.userId,
    reservation_number: input.reservationNumber?.trim() || null,
    usage_at: input.usageAt?.trim() || null,
    notes: input.notes?.trim() || null,
  }).select().single();
  if (error) {
    await supabase.storage.from('travel-documents').remove([path]);
    throw error;
  }
  return data as Voucher;
}

export async function getVoucherPreviewUrl(voucher: Pick<Voucher, 'file_path'>, expiresIn = 900): Promise<string> {
  const { data, error } = await supabase.storage.from('travel-documents').createSignedUrl(voucher.file_path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function updateVoucher(id: string, input: VoucherUpdateInput): Promise<Voucher> {
  const payload = {
    ...(input.item_id === undefined ? {} : { item_id: input.item_id }),
    ...(input.reservation_number === undefined ? {} : { reservation_number: input.reservation_number?.trim() || null }),
    ...(input.usage_at === undefined ? {} : { usage_at: input.usage_at?.trim() || null }),
    ...(input.notes === undefined ? {} : { notes: input.notes?.trim() || null }),
  };
  const { data, error } = await supabase.from('vouchers').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data as Voucher;
}

export async function deleteVoucher(voucher: Pick<Voucher, 'id' | 'file_path'>): Promise<void> {
  const removed = await supabase.storage.from('travel-documents').remove([voucher.file_path]);
  if (removed.error) throw removed.error;
  const { error } = await supabase.from('vouchers').delete().eq('id', voucher.id);
  if (error) throw error;
}
