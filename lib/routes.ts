import { haversineDistanceKm, type Coordinate } from './itinerary';

export type TravelMode = 'DRIVING' | 'TRANSIT' | 'WALKING';

export type RoutePoint = Partial<Coordinate> & {
  title?: string | null;
  address?: string | null;
};

export type RouteEstimate = {
  distanceKm: number;
  durationMinutes: number;
  legs?: RouteLegEstimate[];
  mode: TravelMode;
  source: 'google' | 'fallback';
  navigationUrl: string | null;
};

export type RouteLegEstimate = {
  distanceKm: number;
  durationMinutes: number;
};

export type RouteSequenceEstimate = {
  legs: RouteEstimate[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
};

export type RouteFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export type RouteEstimatorOptions = {
  apiKey?: string | null;
  endpoint?: string;
  fetcher?: RouteFetcher;
  cache?: Map<string, RouteEstimate>;
  routingPreference?: 'TRAFFIC_AWARE' | 'TRAFFIC_UNAWARE';
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
  // (0, 0) is the usual placeholder for a missing geocode in imported trips.
  // Treat it as missing instead of sending a valid-but-wrong coordinate to
  // Routes API and poisoning the route cache with a huge detour.
  if (point.latitude === 0 && point.longitude === 0) return null;
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
    legs: [{ distanceKm, durationMinutes: calculateFallbackTravelMinutes(distanceKm, mode) }],
    mode,
    source: 'fallback',
    navigationUrl: buildGoogleMapsRouteUrl(origin, destination, mode),
  };
}

function parseDurationSeconds(value: unknown): number | null {
  if (typeof value === 'string') {
    const seconds = Number.parseFloat(value.replace(/s$/i, ''));
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

type RouteSpeedBounds = { minimumKmh: number; maximumKmh: number };

// Routes API occasionally returns a valid HTTP response with duration and
// distance belonging to different legs/units. These deliberately generous
// bounds reject only clearly impossible values while keeping real traffic,
// transfers, and walking delays intact.
const ROUTE_SPEED_BOUNDS: Record<TravelMode, RouteSpeedBounds> = {
  DRIVING: { minimumKmh: 8, maximumKmh: 120 },
  TRANSIT: { minimumKmh: 5, maximumKmh: 90 },
  WALKING: { minimumKmh: 2, maximumKmh: 8 },
};

/** Return false when a route duration is physically implausible for its distance. */
export function isRouteDurationPlausible(distanceKm: number, durationMinutes: number, mode: TravelMode): boolean {
  if (!Number.isFinite(distanceKm) || distanceKm < 0 || !Number.isFinite(durationMinutes) || durationMinutes < 0) return false;
  if (distanceKm === 0) return durationMinutes <= 30;

  const bounds = ROUTE_SPEED_BOUNDS[mode];
  const minimumMinutes = (distanceKm / bounds.maximumKmh) * 60;
  const maximumMinutes = Math.max(30, (distanceKm / bounds.minimumKmh) * 60 + 15);
  return durationMinutes + 0.001 >= minimumMinutes && durationMinutes <= maximumMinutes;
}

export type RouteDisplayEstimateInput = {
  distanceMeters?: number | null;
  distanceKm?: number | null;
  durationMinutes?: number | null;
};

/**
 * Final presentation guard for route labels. This intentionally accepts the
 * loose shape used by persisted/API data, so a stale value cannot bypass the
 * sanity check merely because it did not go through RouteEstimate first.
 */
export function sanitizeRouteDurationMinutes(input: RouteDisplayEstimateInput, mode: TravelMode = 'DRIVING'): number {
  const rawDistanceMeters = Number(input.distanceMeters);
  const distanceKm = Number.isFinite(rawDistanceMeters) && rawDistanceMeters >= 0
    ? rawDistanceMeters / 1000
    : Number.isFinite(Number(input.distanceKm)) && Number(input.distanceKm) >= 0
      ? Number(input.distanceKm)
      : 0;
  const rawDuration = Number(input.durationMinutes);
  const durationMinutes = Number.isFinite(rawDuration) && rawDuration >= 0
    ? rawDuration
    : calculateFallbackTravelMinutes(distanceKm, mode);
  const distanceMeters = distanceKm * 1000;
  // Hard presentation rules protect against old DB values such as 1 minute
  // for 35.5 km and 61 minutes for a 478 m segment.
  if (distanceMeters >= 10_000 && durationMinutes <= 5) {
    return Math.max(1, Math.round((distanceKm / 40) * 60));
  }
  if (distanceMeters <= 1_000 && durationMinutes >= 30) {
    return Math.max(1, Math.round((distanceKm / 5) * 60));
  }
  return isRouteDurationPlausible(distanceKm, durationMinutes, mode)
    ? Math.max(1, Math.round(durationMinutes))
    : calculateFallbackTravelMinutes(distanceKm, mode);
}

/** Build the exact user-facing duration text after the final sanity check. */
export function formatRouteEstimateDuration(input: RouteDisplayEstimateInput, mode: TravelMode = 'DRIVING'): string {
  return `${sanitizeRouteDurationMinutes(input, mode)} 分鐘`;
}

/**
 * Sanitize estimates at the presentation boundary as well as at the API
 * parser. A stale in-memory promise or an older browser cache can otherwise
 * re-introduce values such as 1 minute for 35 km or 61 minutes for 478 m.
 * The explicit meter guards mirror the user-facing safety rules and use
 * conservative geometry speeds when they fire.
 */
export function sanitizeRouteEstimateForDisplay(
  estimate: RouteEstimate | null | undefined,
  fallbackDistanceKm: number,
  mode: TravelMode,
): RouteEstimate {
  const distanceKm = Number.isFinite(estimate?.distanceKm) && (estimate?.distanceKm ?? 0) >= 0
    ? Number(estimate?.distanceKm)
    : Number.isFinite(fallbackDistanceKm) && fallbackDistanceKm >= 0 ? fallbackDistanceKm : 0;
  const durationMinutes = Number.isFinite(estimate?.durationMinutes) && (estimate?.durationMinutes ?? 0) >= 0
    ? Number(estimate?.durationMinutes)
    : calculateFallbackTravelMinutes(distanceKm, mode);
  const duration = sanitizeRouteDurationMinutes({ distanceKm, durationMinutes }, mode);
  const isFallback = duration !== Math.max(1, Math.round(durationMinutes))
    || !isRouteDurationPlausible(distanceKm, durationMinutes, mode)
    || estimate?.source === 'fallback';
  const navigationUrl = estimate?.navigationUrl ?? null;
  return {
    distanceKm,
    durationMinutes: duration,
    legs: [{ distanceKm, durationMinutes: duration }],
    mode,
    source: isFallback ? 'fallback' : (estimate?.source ?? 'fallback'),
    navigationUrl,
  };
}

function isRouteSequencePlausible(points: readonly RoutePoint[], sequence: RouteSequenceEstimate, mode: TravelMode): boolean {
  return sequence.legs.length === Math.max(0, points.length - 1)
    && sequence.legs.every((leg) => isRouteDurationPlausible(leg.distanceKm, leg.durationMinutes, mode));
}

function parseRouteEstimate(payload: unknown, mode: TravelMode, fallback: RouteEstimate): RouteEstimate | null {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { routes?: unknown }).routes)) return null;
  const route = (payload as { routes: Array<{ distanceMeters?: unknown; duration?: unknown; legs?: unknown }> }).routes[0];
  if (!route) return null;
  const rawLegs = Array.isArray(route.legs) ? route.legs : [];
  const parsedLegs = rawLegs.map((leg) => {
    if (!leg || typeof leg !== 'object') return null;
    const distanceMeters = Number((leg as { distanceMeters?: unknown }).distanceMeters);
    const durationSeconds = parseDurationSeconds((leg as { duration?: unknown }).duration);
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0 || durationSeconds === null) return null;
    return {
      distanceKm: distanceMeters / 1000,
      // Keep seconds internally so a route made of several short legs is
      // rounded only once after all legs have been added together.
      durationSeconds,
      durationMinutes: Math.max(1, Math.ceil(durationSeconds / 60)),
    };
  });
  const routeDistanceMeters = Number(route.distanceMeters);
  const routeDurationSeconds = parseDurationSeconds(route.duration);
  const hasLegs = rawLegs.length > 0 && parsedLegs.every((leg): leg is RouteLegEstimate & { durationSeconds: number } => leg !== null);
  if (!hasLegs && (!Number.isFinite(routeDistanceMeters) || routeDistanceMeters < 0 || routeDurationSeconds === null)) return null;
  const distanceKm = hasLegs
    ? parsedLegs.reduce((sum, leg) => sum + leg.distanceKm, 0)
    : routeDistanceMeters / 1000;
  const durationMinutes = hasLegs
    ? Math.max(1, Math.ceil(parsedLegs.reduce((sum, leg) => sum + leg.durationSeconds, 0) / 60))
    : Math.max(1, Math.ceil((routeDurationSeconds as number) / 60));
  if (!isRouteDurationPlausible(distanceKm, durationMinutes, mode)) return null;
  return {
    ...fallback,
    distanceKm,
    durationMinutes,
    legs: hasLegs
      ? parsedLegs.map(({ distanceKm: legDistanceKm, durationMinutes: legDurationMinutes }) => ({
        distanceKm: legDistanceKm,
        durationMinutes: legDurationMinutes,
      }))
      : [{ distanceKm, durationMinutes }],
    mode,
    source: 'google',
  };
}

function routesRequestBody(
  origin: Coordinate,
  destination: Coordinate,
  mode: TravelMode,
  routingPreference: 'TRAFFIC_AWARE' | 'TRAFFIC_UNAWARE',
  intermediates: Coordinate[] = [],
): string {
  return JSON.stringify({
    origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
    destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
    ...(intermediates.length ? {
      intermediates: intermediates.map((coordinate) => ({ location: { latLng: { latitude: coordinate.latitude, longitude: coordinate.longitude } } })),
    } : {}),
    travelMode: routesApiTravelMode(mode),
    ...(mode === 'DRIVING' ? { routingPreference } : {}),
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
  const sequenceCache = new Map<string, RouteSequenceEstimate>();
  const sequenceRequests = new Map<string, Promise<RouteSequenceEstimate>>();
  const endpoint = options.endpoint ?? DEFAULT_ROUTES_ENDPOINT;
  const apiKey = options.apiKey ?? (typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY : undefined);
  const fetcher = options.fetcher ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
  const routingPreference = options.routingPreference ?? 'TRAFFIC_UNAWARE';

  function sequenceKey(points: readonly RoutePoint[], mode: TravelMode): string {
    return `${mode}:${points.map(pointKey).join('>')}`;
  }

  function fallbackSequence(points: readonly RoutePoint[], mode: TravelMode): RouteSequenceEstimate {
    const legs = points.slice(0, -1).map((point, index) => fallbackEstimate(point, points[index + 1], mode));
    return {
      legs,
      totalDistanceKm: legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
      totalDurationMinutes: legs.reduce((sum, leg) => sum + leg.durationMinutes, 0),
    };
  }

  async function getRoute(origin: RoutePoint, destination: RoutePoint, mode: TravelMode): Promise<RouteEstimate> {
    const key = routeCacheKey(origin, destination, mode);
    const cached = cache.get(key);
    if (cached) {
      if (isRouteDurationPlausible(cached.distanceKm, cached.durationMinutes, mode)) return cached;
      // Do not let a pre-fix/stale cache entry keep rendering impossible
      // durations after the estimator's sanity rules have been corrected.
      cache.delete(key);
    }

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
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration',
        },
        body: routesRequestBody(originCoordinate, destinationCoordinate, mode, routingPreference),
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
  }

  async function loadRouteSequence(points: readonly RoutePoint[], mode: TravelMode, key: string): Promise<RouteSequenceEstimate> {
    const fallback = fallbackSequence(points, mode);
    const coordinates = points.map(pointCoordinates);
    if (!apiKey || !fetcher || coordinates.some((coordinate) => coordinate === null)) {
      sequenceCache.set(key, fallback);
      return fallback;
    }

    try {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration',
        },
        body: routesRequestBody(coordinates[0] as Coordinate, coordinates[coordinates.length - 1] as Coordinate, mode, routingPreference, coordinates.slice(1, -1) as Coordinate[]),
      });
      if (!response.ok) {
        const body = await readErrorBody(response);
        console.error('[Routes] batch API request failed', {
          endpoint,
          status: response.status,
          statusText: response.statusText,
          body,
          mode,
        });
        throw new Error(`Routes API request failed (${response.status})${body ? `: ${body}` : ''}`);
      }
      const parsed = parseRouteEstimate(await response.json(), mode, fallbackEstimate(points[0], points[points.length - 1], mode));
      if (!parsed || !parsed.legs || parsed.legs.length !== points.length - 1) {
        sequenceCache.set(key, fallback);
        return fallback;
      }
      const legs = parsed.legs.map((leg, index) => ({
        ...fallbackEstimate(points[index], points[index + 1], mode),
        distanceKm: leg.distanceKm,
        durationMinutes: leg.durationMinutes,
        legs: [leg],
        mode,
        source: 'google' as const,
        navigationUrl: buildGoogleMapsRouteUrl(points[index], points[index + 1], mode),
      }));
      const result = {
        legs,
        totalDistanceKm: legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
        totalDurationMinutes: legs.reduce((sum, leg) => sum + leg.durationMinutes, 0),
      };
      sequenceCache.set(key, result);
      return result;
    } catch {
      sequenceCache.set(key, fallback);
      return fallback;
    }
  }

  async function getRouteSequence(points: readonly RoutePoint[], mode: TravelMode): Promise<RouteSequenceEstimate> {
    if (points.length < 2) return { legs: [], totalDistanceKm: 0, totalDurationMinutes: 0 };
    const key = sequenceKey(points, mode);
    const cached = sequenceCache.get(key);
    if (cached) {
      if (isRouteSequencePlausible(points, cached, mode)) return cached;
      sequenceCache.delete(key);
    }
    const inFlight = sequenceRequests.get(key);
    if (inFlight) return inFlight;
    const request = loadRouteSequence(points, mode, key);
    sequenceRequests.set(key, request);
    try {
      return await request;
    } finally {
      sequenceRequests.delete(key);
    }
  }

  return {
    cache,
    sequenceCache,
    getRoute,
    getRouteSequence,
  };
}

/** Estimate every adjacent leg of a route and aggregate the API-backed totals. */
export async function estimateRouteSequence(
  points: readonly RoutePoint[],
  mode: TravelMode = 'DRIVING',
  estimator = createRouteEstimator(),
): Promise<RouteSequenceEstimate> {
  if (points.length < 2) return { legs: [], totalDistanceKm: 0, totalDurationMinutes: 0 };
  const legs = await Promise.all(points.slice(0, -1).map((point, index) => estimator.getRoute(point, points[index + 1], mode)));
  return {
    legs,
    totalDistanceKm: legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
    totalDurationMinutes: legs.reduce((sum, leg) => sum + leg.durationMinutes, 0),
  };
}
