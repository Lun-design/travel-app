import { haversineDistanceKm, type Coordinate } from './itinerary';

/** Minimum data required by the route optimizer. */
export type ItineraryOptimizationStop = {
  id: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  /** `lat`/`lng` are accepted for adapters that have not normalised fields yet. */
  lat?: number | string | null;
  lng?: number | string | null;
  time?: string | null;
  start_time?: string | null;
  startTime?: string | null;
  duration_minutes?: number | string | null;
  duration?: number | string | null;
  position?: number;
  fixedTime?: string | boolean | null;
  fixed_time?: string | null;
  fixedTimeAnchor?: boolean;
  isTimeAnchor?: boolean;
  timeAnchor?: boolean;
  isFixed?: boolean;
  is_fixed?: boolean;
  locked?: boolean;
};

export type RouteOptimizationMode = 'DRIVING' | 'TRANSIT' | 'WALKING';

export type RouteOptimizationLeg = {
  fromId: string;
  toId: string;
  distanceKm: number;
  durationMinutes: number;
  mode: RouteOptimizationMode;
};

export type FixedTimeAnchor = string | {
  id: string;
  time?: string | null;
  start_time?: string | null;
  startTime?: string | null;
};

export type RouteOptimizationOptions = {
  /** Keep the first item in place. Defaults to true. */
  fixFirstDestination?: boolean;
  /**
   * Rebuild the clock schedule after reordering. The default is false: route
   * optimization is an order-only operation and must not overwrite times the
   * traveler entered manually. Use this only for an explicit reschedule flow.
   */
  recalculateStartTimes?: boolean;
  /** Items or IDs whose original slot/time must be preserved. */
  fixedTimeAnchors?: readonly FixedTimeAnchor[] | ReadonlySet<string> | Record<string, string | null | undefined>;
  /** Alias accepted by callers that call these appointments time anchors. */
  timeAnchors?: readonly FixedTimeAnchor[] | ReadonlySet<string> | Record<string, string | null | undefined>;
  /** Pairwise distance/time data. Missing values use the Haversine fallback. */
  distanceMatrix?: unknown;
  durationMatrix?: unknown;
  /** Existing route estimates or a pairwise route matrix. */
  routeEstimates?: unknown;
  defaultStartTime?: string | null;
  defaultDurationMinutes?: number;
  averageSpeedKmh?: number;
  travelMode?: RouteOptimizationMode;
};

export type OptimizedItineraryItem<T extends ItineraryOptimizationStop> = T & {
  position?: number;
  time?: string | null;
  start_time?: string | null;
};

export type RouteOptimizationResult<T extends ItineraryOptimizationStop> = {
  items: OptimizedItineraryItem<T>[];
  /** Alias useful to UI callers that prefer an explicit name. */
  orderedItems: OptimizedItineraryItem<T>[];
  order: OptimizedItineraryItem<T>[];
  legs: RouteOptimizationLeg[];
  originalDistanceKm: number;
  originalDurationMinutes: number;
  totalDistanceKm: number;
  totalDurationMinutes: number;
  optimized: boolean;
  strategy: 'none' | 'exact' | 'nearest-neighbor';
  reason?: 'insufficient-stops' | 'missing-coordinates';
};

const EXACT_STOP_LIMIT = 10;
const DEFAULT_START_MINUTES = 9 * 60;
const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_DRIVING_SPEED_KMH = 35;
const DEFAULT_TRANSIT_SPEED_KMH = 22;
const DEFAULT_WALKING_SPEED_KMH = 5;
const WALKING_DISTANCE_LIMIT_KM = 1.2;

type Metric = 'distance' | 'duration';
type IndexLookup = ReadonlyMap<string, number>;

function numeric(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function coordinateOf(item: ItineraryOptimizationStop): Coordinate | null {
  const latitude = numeric(item.latitude ?? item.lat);
  const longitude = numeric(item.longitude ?? item.lng);
  if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function parseClock(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours >= 24 || minutes < 0 || minutes >= 60) return null;
  return hours * 60 + minutes;
}

function formatClock(minutes: number): string {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function durationOf(item: ItineraryOptimizationStop, fallback: number): number {
  const value = numeric(item.duration_minutes ?? item.duration);
  return value !== null && value > 0 ? Math.round(value) : fallback;
}

function valueFromObject(value: unknown, metric: Metric): number | null {
  const direct = numeric(value);
  if (direct !== null) return direct;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (metric === 'distance') {
    const km = numeric(record.distanceKm ?? record.distance_km);
    if (km !== null && km >= 0) return km;
    const meters = numeric(record.distanceMeters ?? record.distance_meters);
    if (meters !== null && meters >= 0) return meters / 1000;
  } else {
    const minutes = numeric(record.durationMinutes ?? record.duration_minutes);
    if (minutes !== null && minutes >= 0) return minutes;
    const seconds = numeric(record.durationSeconds ?? record.duration_seconds);
    if (seconds !== null && seconds >= 0) return seconds / 60;
    const duration = record.duration;
    if (typeof duration === 'string') {
      const parsed = Number.parseFloat(duration.replace(/s$/i, ''));
      if (Number.isFinite(parsed) && parsed >= 0) return parsed / 60;
    }
  }
  return null;
}

function readMatrixValue(matrix: unknown, from: ItineraryOptimizationStop, to: ItineraryOptimizationStop, fromIndex: number, toIndex: number, metric: Metric): number | null {
  if (!matrix) return null;
  if (Array.isArray(matrix)) {
    return valueFromObject(matrix[fromIndex]?.[toIndex], metric);
  }
  if (matrix instanceof Map) {
    const map = matrix as Map<unknown, unknown>;
    const direct = map.get(`${from.id}->${to.id}`) ?? map.get(`${from.id}:${to.id}`) ?? map.get(from.id);
    if (direct instanceof Map) return valueFromObject(direct.get(to.id) ?? direct.get(toIndex), metric);
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      const nested = (direct as Record<string, unknown>)[to.id] ?? (direct as Record<string, unknown>)[String(toIndex)];
      return valueFromObject(nested ?? direct, metric);
    }
    return valueFromObject(direct, metric);
  }
  if (typeof matrix !== 'object') return null;
  const record = matrix as Record<string, unknown>;
  const direct = record[`${from.id}->${to.id}`]
    ?? record[`${from.id}:${to.id}`]
    ?? record[`${fromIndex}->${toIndex}`]
    ?? record[from.id];
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    const nested = (direct as Record<string, unknown>)[to.id] ?? (direct as Record<string, unknown>)[String(toIndex)];
    return valueFromObject(nested ?? direct, metric);
  }
  return valueFromObject(direct, metric);
}

function distanceFallback(from: ItineraryOptimizationStop, to: ItineraryOptimizationStop): number {
  const fromCoordinate = coordinateOf(from);
  const toCoordinate = coordinateOf(to);
  return fromCoordinate && toCoordinate ? haversineDistanceKm(fromCoordinate, toCoordinate) : 0;
}

function speedFor(mode: RouteOptimizationMode): number {
  if (mode === 'WALKING') return DEFAULT_WALKING_SPEED_KMH;
  if (mode === 'TRANSIT') return DEFAULT_TRANSIT_SPEED_KMH;
  return DEFAULT_DRIVING_SPEED_KMH;
}

function routeMetric(
  from: ItineraryOptimizationStop,
  to: ItineraryOptimizationStop,
  fromIndex: number,
  toIndex: number,
  options: RouteOptimizationOptions,
  metric: Metric,
): number | null {
  const matrix = metric === 'distance' ? options.distanceMatrix : options.durationMatrix;
  return readMatrixValue(matrix, from, to, fromIndex, toIndex, metric)
    ?? readMatrixValue(options.routeEstimates, from, to, fromIndex, toIndex, metric);
}

function pairMetrics<T extends ItineraryOptimizationStop>(from: T, to: T, fromIndex: number, toIndex: number, options: RouteOptimizationOptions): { distanceKm: number; durationMinutes: number; mode: RouteOptimizationMode } {
  const mode = options.travelMode ?? 'DRIVING';
  const distanceKm = Math.max(0, routeMetric(from, to, fromIndex, toIndex, options, 'distance') ?? distanceFallback(from, to));
  const matrixDuration = routeMetric(from, to, fromIndex, toIndex, options, 'duration');
  const effectiveMode = options.travelMode ?? (distanceKm <= WALKING_DISTANCE_LIMIT_KM ? 'WALKING' : 'DRIVING');
  const durationMinutes = Math.max(0, Math.round(matrixDuration ?? (distanceKm / speedFor(effectiveMode)) * 60));
  return { distanceKm, durationMinutes, mode: mode === 'DRIVING' && !options.travelMode ? effectiveMode : mode };
}

function routeLegs<T extends ItineraryOptimizationStop>(items: readonly T[], options: RouteOptimizationOptions, indexById?: IndexLookup): RouteOptimizationLeg[] {
  return items.slice(0, -1).map((from, index) => {
    const to = items[index + 1];
    const metrics = pairMetrics(
      from,
      to,
      indexById?.get(from.id) ?? index,
      indexById?.get(to.id) ?? index + 1,
      options,
    );
    return { fromId: from.id, toId: to.id, ...metrics };
  });
}

function totalDistance(legs: readonly RouteOptimizationLeg[]): number {
  return legs.reduce((sum, leg) => sum + leg.distanceKm, 0);
}

function totalDuration(legs: readonly RouteOptimizationLeg[]): number {
  return legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
}

function routeKey<T extends ItineraryOptimizationStop>(items: readonly T[]): string {
  return items.map((item) => item.id).join('\u0000');
}

function isBetter<T extends ItineraryOptimizationStop>(candidate: readonly T[], current: readonly T[] | null, options: RouteOptimizationOptions, indexById?: IndexLookup): boolean {
  if (!current) return true;
  const candidateLegs = routeLegs(candidate, options, indexById);
  const currentLegs = routeLegs(current, options, indexById);
  const candidateDuration = totalDuration(candidateLegs);
  const currentDuration = totalDuration(currentLegs);
  if (candidateDuration !== currentDuration) return candidateDuration < currentDuration;
  const candidateDistance = totalDistance(candidateLegs);
  const currentDistance = totalDistance(currentLegs);
  if (Math.abs(candidateDistance - currentDistance) > 1e-9) return candidateDistance < currentDistance;
  return routeKey(candidate) < routeKey(current);
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

function anchorConfig<T extends ItineraryOptimizationStop>(items: readonly T[], options: RouteOptimizationOptions): { fixedPositions: Set<number>; anchorTimes: Map<string, number> } {
  const fixedPositions = new Set<number>();
  const anchorTimes = new Map<string, number>();
  if (options.fixFirstDestination ?? true) fixedPositions.add(0);
  const configured = options.fixedTimeAnchors ?? options.timeAnchors;
  const addAnchor = (id: string, time?: unknown) => {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return;
    fixedPositions.add(index);
    const parsed = parseClock(time)
      ?? parseClock(typeof items[index].fixedTime === 'string' ? items[index].fixedTime : null)
      ?? parseClock(items[index].fixed_time)
      ?? parseClock(items[index].start_time)
      ?? parseClock(items[index].startTime)
      ?? parseClock(items[index].time);
    if (parsed !== null) anchorTimes.set(id, parsed);
  };
  if (configured instanceof Set) configured.forEach((id) => addAnchor(id));
  else if (Array.isArray(configured)) {
    configured.forEach((anchor) => {
      if (typeof anchor === 'string') addAnchor(anchor);
      else addAnchor(anchor.id, anchor.time ?? anchor.start_time ?? anchor.startTime);
    });
  } else if (configured && typeof configured === 'object') {
    Object.entries(configured).forEach(([id, time]) => addAnchor(id, time));
  }
  items.forEach((item, index) => {
    if (item.isTimeAnchor || item.timeAnchor || item.fixedTimeAnchor || item.isFixed || item.is_fixed || item.locked || item.fixedTime != null || item.fixed_time != null) {
      fixedPositions.add(index);
      const parsed = parseClock(typeof item.fixedTime === 'string' ? item.fixedTime : null)
        ?? parseClock(item.fixed_time)
        ?? parseClock(item.start_time)
        ?? parseClock(item.startTime)
        ?? parseClock(item.time);
      if (parsed !== null) anchorTimes.set(item.id, parsed);
    }
  });
  return { fixedPositions, anchorTimes };
}

function fillFixedSlots<T extends ItineraryOptimizationStop>(items: readonly T[], flexible: readonly T[], fixedPositions: ReadonlySet<number>): T[] {
  let flexibleIndex = 0;
  return items.map((item, index) => fixedPositions.has(index) ? item : flexible[flexibleIndex++]);
}

function exactOrder<T extends ItineraryOptimizationStop>(items: readonly T[], fixedPositions: ReadonlySet<number>, options: RouteOptimizationOptions, indexById?: IndexLookup): T[] {
  const flexible = items.filter((_item, index) => !fixedPositions.has(index));
  let best: T[] | null = null;
  permutations(flexible).forEach((candidateFlexible) => {
    const candidate = fillFixedSlots(items, candidateFlexible, fixedPositions);
    if (isBetter(candidate, best, options, indexById)) best = candidate;
  });
  return best ?? items.slice();
}

function nearestNeighbour<T extends ItineraryOptimizationStop>(items: readonly T[], startIndex: number, options: RouteOptimizationOptions, indexById?: IndexLookup): T[] {
  const remaining = items.map((_item, index) => index).filter((index) => index !== startIndex);
  const order = [startIndex];
  while (remaining.length) {
    const fromIndex = order[order.length - 1];
    let nearestAt = 0;
    let nearestDuration = Number.POSITIVE_INFINITY;
    remaining.forEach((toIndex, candidateIndex) => {
      const metrics = pairMetrics(
        items[fromIndex],
        items[toIndex],
        indexById?.get(items[fromIndex].id) ?? fromIndex,
        indexById?.get(items[toIndex].id) ?? toIndex,
        options,
      );
      if (metrics.durationMinutes < nearestDuration
        || (metrics.durationMinutes === nearestDuration && items[toIndex].id < items[remaining[nearestAt]].id)) {
        nearestAt = candidateIndex;
        nearestDuration = metrics.durationMinutes;
      }
    });
    order.push(remaining.splice(nearestAt, 1)[0]);
  }
  return order.map((index) => items[index]);
}

function nearestOrder<T extends ItineraryOptimizationStop>(items: readonly T[], fixedPositions: ReadonlySet<number>, options: RouteOptimizationOptions, indexById?: IndexLookup): T[] {
  const flexible = items.filter((_item, index) => !fixedPositions.has(index));
  if (!flexible.length) return items.slice();
  let bestFlexible = nearestNeighbour(flexible, 0, options, indexById);
  if (!(options.fixFirstDestination ?? true) && !fixedPositions.size) {
    for (let index = 1; index < flexible.length; index += 1) {
      const candidate = nearestNeighbour(flexible, index, options, indexById);
      if (isBetter(candidate, bestFlexible, options, indexById)) bestFlexible = candidate;
    }
  }
  return fillFixedSlots(items, bestFlexible, fixedPositions);
}

function hasUsableRouteData<T extends ItineraryOptimizationStop>(items: readonly T[], options: RouteOptimizationOptions, indexById?: IndexLookup): boolean {
  for (let fromIndex = 0; fromIndex < items.length; fromIndex += 1) {
    for (let toIndex = fromIndex + 1; toIndex < items.length; toIndex += 1) {
      const from = items[fromIndex];
      const to = items[toIndex];
      if (coordinateOf(from) && coordinateOf(to)) continue;
      const sourceIndex = indexById?.get(from.id) ?? fromIndex;
      const targetIndex = indexById?.get(to.id) ?? toIndex;
      if (routeMetric(from, to, sourceIndex, targetIndex, options, 'distance') !== null || routeMetric(from, to, sourceIndex, targetIndex, options, 'duration') !== null) continue;
      return false;
    }
  }
  return true;
}

function applySchedule<T extends ItineraryOptimizationStop>(items: readonly T[], legs: readonly RouteOptimizationLeg[], options: RouteOptimizationOptions, anchorTimes: ReadonlyMap<string, number>): OptimizedItineraryItem<T>[] {
  if (!items.length) return [];
  const defaultDuration = options.defaultDurationMinutes != null && Number.isFinite(options.defaultDurationMinutes) && options.defaultDurationMinutes > 0
    ? Math.round(options.defaultDurationMinutes)
    : DEFAULT_DURATION_MINUTES;
  const firstTime = anchorTimes.get(items[0].id)
    ?? parseClock(options.defaultStartTime)
    ?? parseClock(items[0].start_time)
    ?? parseClock(items[0].startTime)
    ?? parseClock(items[0].time)
    ?? DEFAULT_START_MINUTES;
  let cursor = firstTime;
  return items.map((item, index) => {
    const anchored = anchorTimes.get(item.id);
    const start = anchored ?? cursor;
    const next = { ...item, position: index } as OptimizedItineraryItem<T>;
    const formatted = formatClock(start);
    if ('time' in item) next.time = formatted;
    if ('start_time' in item) next.start_time = formatted;
    if ('startTime' in item) next.startTime = formatted;
    if (!('time' in item) && !('start_time' in item) && !('startTime' in item)) next.start_time = formatted;
    const stopDuration = durationOf(item, defaultDuration);
    cursor = Math.max(cursor, start) + stopDuration + (legs[index]?.durationMinutes ?? 0);
    return next;
  });
}

/**
 * Build a persistence-safe order payload. Route optimization may return a
 * preview with calculated times; applying that preview must retain the times
 * already stored on each matching item and only change its position.
 */
export function preserveItineraryTimes<T extends { id: string; time?: string | null; start_time?: string | null; startTime?: string | null; position?: number }>(
  originalItems: readonly T[],
  orderedItems: readonly T[],
): T[] {
  const originalById = new Map(originalItems.map((item) => [item.id, item]));
  return orderedItems.map((item, position) => {
    const original = originalById.get(item.id);
    const next = { ...item, position } as T;
    if (original && Object.prototype.hasOwnProperty.call(original, 'time')) next.time = original.time;
    if (original && Object.prototype.hasOwnProperty.call(original, 'start_time')) next.start_time = original.start_time;
    if (original && Object.prototype.hasOwnProperty.call(original, 'startTime')) next.startTime = original.startTime;
    return next;
  });
}

/**
 * Optimise a day's stops by travel time while preserving explicit anchors.
 * Up to ten stops use an exact permutation search; larger days use a
 * deterministic nearest-neighbour approximation. The input is never mutated.
 */
export function optimizeItineraryOrder<T extends ItineraryOptimizationStop>(items: readonly T[], options: RouteOptimizationOptions = {}): RouteOptimizationResult<T> {
  const original = items.slice();
  const indexById = new Map(original.map((item, index) => [item.id, index]));
  const originalLegs = routeLegs(original, options, indexById);
  const originalDistanceKm = totalDistance(originalLegs);
  const originalDurationMinutes = totalDuration(originalLegs);
  if (items.length <= 2) {
    // Zero, one, and two stops do not benefit from a permutation pass. Keep
    // the original references intact so callers can skip an unnecessary
    // state replacement while still receiving route metrics for a pair.
    const unchanged = original as OptimizedItineraryItem<T>[];
    return { items: unchanged, orderedItems: unchanged, order: unchanged, legs: originalLegs, originalDistanceKm, originalDurationMinutes, totalDistanceKm: originalDistanceKm, totalDurationMinutes: originalDurationMinutes, optimized: false, strategy: 'none', reason: 'insufficient-stops' };
  }
  if (!hasUsableRouteData(items, options, indexById)) {
    return { items: original as OptimizedItineraryItem<T>[], orderedItems: original as OptimizedItineraryItem<T>[], order: original as OptimizedItineraryItem<T>[], legs: originalLegs, originalDistanceKm, originalDurationMinutes, totalDistanceKm: originalDistanceKm, totalDurationMinutes: originalDurationMinutes, optimized: false, strategy: 'none', reason: 'missing-coordinates' };
  }

  const { fixedPositions, anchorTimes } = anchorConfig(items, options);
  const optimized = items.length <= EXACT_STOP_LIMIT
    ? exactOrder(items, fixedPositions, options, indexById)
    : nearestOrder(items, fixedPositions, options, indexById);
  const legs = routeLegs(optimized, options, indexById);
  const ordered = optimized.map((item, position) => ({ ...item, position })) as OptimizedItineraryItem<T>[];
  const scheduled = options.recalculateStartTimes
    ? applySchedule(ordered, legs, options, anchorTimes)
    : ordered;
  const changed = optimized.some((item, index) => item.id !== items[index]?.id);
  return {
    items: scheduled,
    orderedItems: scheduled,
    order: scheduled,
    legs,
    originalDistanceKm,
    originalDurationMinutes,
    totalDistanceKm: totalDistance(legs),
    totalDurationMinutes: totalDuration(legs),
    optimized: changed,
    strategy: items.length <= EXACT_STOP_LIMIT ? 'exact' : 'nearest-neighbor',
  };
}
