export function formatPlaceAddress(address: string | null | undefined): string | null {
  const value = typeof address === 'string' ? address.trim() : '';
  return value || null;
}
