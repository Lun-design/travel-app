import { haversineDistanceKm, type Coordinate } from './itinerary';

export type OptimizableStop = {
  id: string;
  latitude: number | null;
  longitude: number | null;
};

export type RouteOptimizationMode = 'DRIVING' | 'WALKING';

export type RouteOptimizationLeg = {
  fromId: string;
  toId: string;
  distanceKm: number;
  durationMinutes: number;
  mode: RouteOptimizationMode;
};

export type RouteOptimizationResult<T extends OptimizableStop> = {
  items: T[];
  legs: RouteOptimizationLeg[];
  originalDistanceKm: number;
  totalDistanceKm: number;
  totalDurationMinutes: number;
  optimized: boolean;
  strategy: 'none' | 'exact' | 'nearest-neighbor';
  reason?: 'insufficient-stops' | 'missing-coordinates';
};

type SchedulableStop = OptimizableStop & {
  time?: string | null;
  start_time?: string | null;
  duration_minutes?: number | null;
  position?: number;
};

const EXACT_STOP_LIMIT = 10;
const WALKING_DISTANCE_LIMIT_KM = 1.2;
const WALKING_SPEED_KMH = 5;
const DRIVING_SPEED_KMH = 35;

function coordinateOf<T extends OptimizableStop>(item: T): Coordinate | null {
  const latitude = typeof item.latitude === 'number' || typeof item.latitude === 'string' ? Number(item.latitude) : NaN;
  const longitude = typeof item.longitude === 'number' || typeof item.longitude === 'string' ? Number(item.longitude) : NaN;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function distanceBetween<T extends OptimizableStop>(from: T, to: T): number {
  const fromCoordinate = coordinateOf(from);
  const toCoordinate = coordinateOf(to);
  return fromCoordinate && toCoordinate ? haversineDistanceKm(fromCoordinate, toCoordinate) : 0;
}

function routeDistance<T extends OptimizableStop>(items: readonly T[]): number {
  let total = 0;
  for (let index = 1; index < items.length; index += 1) total += distanceBetween(items[index - 1], items[index]);
  return total;
}

function routeKey<T extends OptimizableStop>(items: readonly T[]): string {
  return items.map((item) => item.id).join('\u0000');
}

function isBetterRoute<T extends OptimizableStop>(candidate: readonly T[], current: readonly T[] | null, epsilon = 1e-9): boolean {
  if (!current) return true;
  const candidateDistance = routeDistance(candidate);
  const currentDistance = routeDistance(current);
  if (candidateDistance < currentDistance - epsilon) return true;
  return Math.abs(candidateDistance - currentDistance) <= epsilon && routeKey(candidate) < routeKey(current);
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const result: T[][] = [];
  items.forEach((item, index) => {
    const remaining = [...items.slice(0, index), ...items.slice(index + 1)];
    permutations(remaining).forEach((tail) => result.push([item, ...tail]));
  });
  return result;
}

function exactRoute<T extends OptimizableStop>(items: readonly T[], fixFirstDestination: boolean): T[] {
  if (fixFirstDestination) {
    const first = items[0];
    let best: T[] | null = null;
    permutations(items.slice(1)).forEach((tail) => {
      const candidate = [first, ...tail];
      if (isBetterRoute(candidate, best)) best = candidate;
    });
    return best ?? items.slice();
  }

  let best: T[] | null = null;
  permutations(items).forEach((candidate) => {
    if (isBetterRoute(candidate, best)) best = candidate;
  });
  return best ?? items.slice();
}

function nearestNeighborFrom<T extends OptimizableStop>(items: readonly T[], startIndex: number): T[] {
  const remaining = items.slice();
  const route: T[] = [remaining.splice(startIndex, 1)[0]];
  while (remaining.length) {
    const current = route[route.length - 1];
    let nearestIndex = 0;
    for (let index = 1; index < remaining.length; index += 1) {
      const candidateDistance = distanceBetween(current, remaining[index]);
      const nearestDistance = distanceBetween(current, remaining[nearestIndex]);
      if (candidateDistance < nearestDistance - 1e-9
        || (Math.abs(candidateDistance - nearestDistance) <= 1e-9 && remaining[index].id < remaining[nearestIndex].id)) {
        nearestIndex = index;
      }
    }
    route.push(remaining.splice(nearestIndex, 1)[0]);
  }
  return route;
}

function nearestNeighborRoute<T extends OptimizableStop>(items: readonly T[], fixFirstDestination: boolean): T[] {
  if (fixFirstDestination) return nearestNeighborFrom(items, 0);
  let best: T[] | null = null;
  items.forEach((_item, index) => {
    const candidate = nearestNeighborFrom(items, index);
    if (isBetterRoute(candidate, best)) best = candidate;
  });
  return best ?? items.slice();
}

function buildLegs<T extends OptimizableStop>(items: readonly T[]): RouteOptimizationLeg[] {
  return items.slice(0, -1).map((from, index) => {
    const to = items[index + 1];
    const distanceKm = distanceBetween(from, to);
    const mode: RouteOptimizationMode = distanceKm <= WALKING_DISTANCE_LIMIT_KM ? 'WALKING' : 'DRIVING';
    const speed = mode === 'WALKING' ? WALKING_SPEED_KMH : DRIVING_SPEED_KMH;
    return {
      fromId: from.id,
      toId: to.id,
      distanceKm,
      durationMinutes: Math.max(1, Math.ceil((distanceKm / speed) * 60)),
      mode,
    };
  });
}

export function optimizeRoute<T extends OptimizableStop>(
  items: readonly T[],
  options: { fixFirstDestination?: boolean } = {},
): RouteOptimizationResult<T> {
  const original = items as T[];
  if (items.length < 3) {
    const legs = items.length > 1 ? buildLegs(items) : [];
    const totalDistanceKm = legs.reduce((sum, leg) => sum + leg.distanceKm, 0);
    const totalDurationMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
    return { items: original, legs, originalDistanceKm: totalDistanceKm, totalDistanceKm, totalDurationMinutes, optimized: false, strategy: 'none', reason: 'insufficient-stops' };
  }
  if (items.some((item) => coordinateOf(item) === null)) {
    return { items: original, legs: [], originalDistanceKm: 0, totalDistanceKm: 0, totalDurationMinutes: 0, optimized: false, strategy: 'none', reason: 'missing-coordinates' };
  }

  const fixFirstDestination = options.fixFirstDestination ?? true;
  const optimizedItems = items.length <= EXACT_STOP_LIMIT
    ? exactRoute(items, fixFirstDestination)
    : nearestNeighborRoute(items, fixFirstDestination);
  const legs = buildLegs(optimizedItems);
  const totalDistanceKm = legs.reduce((sum, leg) => sum + leg.distanceKm, 0);
  const totalDurationMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  const changed = optimizedItems.some((item, index) => item.id !== items[index]?.id);
  return {
    items: optimizedItems,
    legs,
    originalDistanceKm: routeDistance(items),
    totalDistanceKm,
    totalDurationMinutes,
    optimized: changed,
    strategy: items.length <= EXACT_STOP_LIMIT ? 'exact' : 'nearest-neighbor',
  };
}

function parseClock(value: string | null | undefined, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})/.exec(value?.trim() ?? '');
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : fallback;
}

function formatClock(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

/** Applies travel time and stop duration to the optimized order for preview/apply UI. */
export function applyOptimizedSchedule<T extends SchedulableStop>(
  result: RouteOptimizationResult<T>,
  options: { defaultStartTime?: string } = {},
): T[] {
  if (!result.items.length) return result.items;
  let cursor = parseClock(result.items[0].time ?? result.items[0].start_time, parseClock(options.defaultStartTime, 9 * 60));
  return result.items.map((item, index) => {
    const scheduled = { ...item, position: index, time: formatClock(cursor) };
    const stopDuration = Number.isFinite(item.duration_minutes) && (item.duration_minutes ?? 0) > 0 ? Number(item.duration_minutes) : 60;
    const travelDuration = result.legs[index]?.durationMinutes ?? 0;
    cursor += stopDuration + travelDuration;
    return scheduled;
  });
}
