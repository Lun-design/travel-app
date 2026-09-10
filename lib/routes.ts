import { haversineDistanceKm, type Coordinate } from './itinerary';

export type TravelMode = 'DRIVING' | 'TRANSIT' | 'WALKING';

export type RoutePoint = Partial<Coordinate> & {
  title?: string | null;
  address?: string | null;
};

export type RouteEstimate = {
  distanceKm: number;
  durationMinutes: number;
  mode: TravelMode;
  source: 'google' | 'fallback';
  navigationUrl: string | null;
};

export type RouteFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export type RouteEstimatorOptions = {
  apiKey?: string | null;
  endpoint?: string;
  fetcher?: RouteFetcher;
  cache?: Map<string, RouteEstimate>;
};

const DEFAULT_ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const AVERAGE_SPEED_KMH: Record<TravelMode, number> = {
  DRIVING: 35,
  TRANSIT: 22,
  WALKING: 5,
};

function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function pointCoordinates(point: RoutePoint): Coordinate | null {
  if (!isCoordinate(point.latitude) || !isCoordinate(point.longitude)) return null;
  // Routes API rejects coordinates outside the valid latitude/longitude ranges.
  // Validate them before constructing the request so malformed persisted places
  // transparently use the geometry fallback instead of returning a 400.
  if (point.latitude < -90 || point.latitude > 90 || point.longitude < -180 || point.longitude > 180) return null;
  return { latitude: point.latitude, longitude: point.longitude };
}

function pointKey(point: RoutePoint): string {
  const coordinate = pointCoordinates(point);
  if (coordinate) return `${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`;
  return `${point.title?.trim() ?? ''}|${point.address?.trim() ?? ''}`;
}

export function routeCacheKey(origin: RoutePoint, destination: RoutePoint, mode: TravelMode): string {
  return `${pointKey(origin)}->${pointKey(destination)}:${mode}`;
}

export function calculateFallbackTravelMinutes(distanceKm: number, mode: TravelMode): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 1;
  return Math.max(1, Math.round((distanceKm / AVERAGE_SPEED_KMH[mode]) * 60));
}

function routePointValue(point: RoutePoint): string | null {
  const coordinate = pointCoordinates(point);
  if (coordinate) return `${coordinate.latitude},${coordinate.longitude}`;
  return point.address?.trim() || point.title?.trim() || null;
}

function googleTravelMode(mode: TravelMode): string {
  return mode.toLowerCase();
}

/**
 * The app keeps user-facing mode names, while Routes API v2 uses a different
 * enum (`DRIVE`, `WALK`, `TRANSIT`). Sending `DRIVING` or `WALKING` directly
 * makes computeRoutes reject an otherwise valid request with HTTP 400.
 */
function routesApiTravelMode(mode: TravelMode): 'DRIVE' | 'TRANSIT' | 'WALK' {
  if (mode === 'DRIVING') return 'DRIVE';
  if (mode === 'WALKING') return 'WALK';
  return 'TRANSIT';
}

export function buildGoogleMapsRouteUrl(origin: RoutePoint, destination: RoutePoint, mode: TravelMode): string | null {
  const originValue = routePointValue(origin);
  const destinationValue = routePointValue(destination);
  if (!originValue || !destinationValue) return null;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originValue)}&destination=${encodeURIComponent(destinationValue)}&travelmode=${googleTravelMode(mode)}`;
}

function fallbackEstimate(origin: RoutePoint, destination: RoutePoint, mode: TravelMode): RouteEstimate {
  const originCoordinate = pointCoordinates(origin);
  const destinationCoordinate = pointCoordinates(destination);
  const distanceKm = originCoordinate && destinationCoordinate
    ? haversineDistanceKm(originCoordinate, destinationCoordinate)
    : 0;
  return {
    distanceKm,
    durationMinutes: calculateFallbackTravelMinutes(distanceKm, mode),
    mode,
    source: 'fallback',
    navigationUrl: buildGoogleMapsRouteUrl(origin, destination, mode),
  };
}

function parseRouteEstimate(payload: unknown, mode: TravelMode, fallback: RouteEstimate): RouteEstimate | null {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { routes?: unknown }).routes)) return null;
  const route = (payload as { routes: Array<{ distanceMeters?: unknown; duration?: unknown }> }).routes[0];
  if (!route) return null;
  const distanceMeters = Number(route.distanceMeters);
  const durationSeconds = typeof route.duration === 'string'
    ? Number.parseFloat(route.duration.replace(/s$/i, ''))
    : Number(route.duration);
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0 || !Number.isFinite(durationSeconds) || durationSeconds < 0) return null;
  return {
    ...fallback,
    distanceKm: distanceMeters / 1000,
    durationMinutes: Math.max(1, Math.ceil(durationSeconds / 60)),
    mode,
    source: 'google',
  };
}

function routesRequestBody(origin: Coordinate, destination: Coordinate, mode: TravelMode): string {
  return JSON.stringify({
    origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
    destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
    travelMode: routesApiTravelMode(mode),
    ...(mode === 'DRIVING' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
    languageCode: 'zh-TW',
    units: 'METRIC',
  });
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    if (typeof response.text === 'function') return await response.text();
    if (typeof response.json === 'function') return JSON.stringify(await response.json());
  } catch {
    // Keep the original HTTP error useful even if the response body is unreadable.
  }
  return '';
}

export function createRouteEstimator(options: RouteEstimatorOptions = {}) {
  const cache = options.cache ?? new Map<string, RouteEstimate>();
  const endpoint = options.endpoint ?? DEFAULT_ROUTES_ENDPOINT;
  const apiKey = options.apiKey ?? (typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY : undefined);
  const fetcher = options.fetcher ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);

  return {
    cache,
    async getRoute(origin: RoutePoint, destination: RoutePoint, mode: TravelMode): Promise<RouteEstimate> {
      const key = routeCacheKey(origin, destination, mode);
      const cached = cache.get(key);
      if (cached) return cached;

      const fallback = fallbackEstimate(origin, destination, mode);
      const originCoordinate = pointCoordinates(origin);
      const destinationCoordinate = pointCoordinates(destination);
      if (!apiKey || !fetcher || !originCoordinate || !destinationCoordinate) {
        cache.set(key, fallback);
        return fallback;
      }

      try {
        const response = await fetcher(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
          },
          body: routesRequestBody(originCoordinate, destinationCoordinate, mode),
        });
        if (!response.ok) {
          const body = await readErrorBody(response);
          console.error('[Routes] API request failed', {
            endpoint,
            status: response.status,
            statusText: response.statusText,
            body,
            origin: originCoordinate,
            destination: destinationCoordinate,
            mode,
          });
          throw new Error(`Routes API request failed (${response.status})${body ? `: ${body}` : ''}`);
        }
        const parsed = parseRouteEstimate(await response.json(), mode, fallback) ?? fallback;
        cache.set(key, parsed);
        return parsed;
      } catch {
        cache.set(key, fallback);
        return fallback;
      }
    },
  };
}
