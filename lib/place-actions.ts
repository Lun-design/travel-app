export type PlaceActionInput = {
  title: string | null | undefined;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function formatPlaceAddress(address: string | null | undefined): string | null {
  const value = typeof address === 'string' ? address.trim() : '';
  return value || null;
}

export function formatPlaceCoordinates(latitude: number | null | undefined, longitude: number | null | undefined): string | null {
  if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export function buildPlaceShareText(input: PlaceActionInput): string {
  const title = input.title?.trim() || '未命名景點';
  const address = formatPlaceAddress(input.address);
  const coordinates = formatPlaceCoordinates(input.latitude, input.longitude);
  return [title, address ? `地址：${address}` : null, coordinates ? `座標：${coordinates}` : null]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}
