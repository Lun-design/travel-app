import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { reorderItineraryItems, sortItineraryItemsByPosition } from '@/lib/itinerary';
import { shiftSubsequentItems } from '@/lib/time-buffer';
import { buildDaySchedule } from '@/lib/schedule';
import { describeItineraryOrderError, updateItineraryItemsOrder } from '@/lib/itinerary-api';
import {
  displayRouteSegments,
  EmptyTimeline,
  InsertSpotButton,
  orderPayload,
  routeDurationsForSchedule,
  timelineItemsRevision,
  TimelineCard,
  useRouteSegments,
  useWeatherByItem,
  type ItineraryTimelineProps,
} from './ItineraryTimeline.shared';
import type { TravelMode } from '@/lib/routes';

export function ItineraryTimeline({
  items,
  tripId,
  themeMode = 'system',
  onEdit,
  onDelete,
  onReorder,
  onShiftSubsequent,
  scheduleContext,
  vouchers,
  onPreviewVoucher,
  focusedItemId,
  onInsertAtPosition,
  onUpdateImage,
}: ItineraryTimelineProps) {
  const [localItems, setLocalItems] = useState(() => sortItineraryItemsByPosition(items));
  const incomingItems = useMemo(() => sortItineraryItemsByPosition(items), [items]);
  const incomingRevision = timelineItemsRevision(incomingItems);
  const parentRevision = useRef(incomingRevision);
  const displayItems = incomingRevision !== parentRevision.current ? incomingItems : localItems;
  const [routeModes, setRouteModes] = useState<Record<string, TravelMode>>({});
  const routeState = useRouteSegments(displayItems, routeModes, { tripId, day: displayItems[0]?.day_number });
  const routeEstimates = routeState.estimates;
  const routeTransitMinutes = useMemo(() => routeDurationsForSchedule(routeEstimates), [routeEstimates]);
  const segments = useMemo(
    () => displayRouteSegments(routeState.items, routeModes, routeEstimates),
    [routeState.items, routeEstimates, routeModes],
  );
  const segmentsByFromId = useMemo(
    () => new Map(segments.map((segment) => [segment.fromId, segment])),
    [segments],
  );
  const scheduled = useMemo(
    () => scheduleContext
      ? buildDaySchedule(displayItems, { ...scheduleContext, transitMinutesByFromId: routeTransitMinutes })
      : [],
    [displayItems, routeTransitMinutes, scheduleContext],
  );
  const scheduleById = useMemo(
    () => new Map(scheduled.map((entry) => [entry.item.id, entry])),
    [scheduled],
  );
  const weatherById = useWeatherByItem(displayItems, scheduleContext, tripId, routeTransitMinutes);
  const handleRouteModeChange = useCallback((fromId: string, mode: TravelMode) => {
    setRouteModes((current) => ({ ...current, [fromId]: mode }));
  }, []);

  useEffect(() => {
    parentRevision.current = incomingRevision;
    setLocalItems(incomingItems);
  }, [incomingItems, incomingRevision]);

  async function moveItem(itemId: string, direction: -1 | 1) {
    const sourceIndex = displayItems.findIndex((item) => item.id === itemId);
    const destinationIndex = sourceIndex + direction;
    if (sourceIndex < 0 || destinationIndex < 0 || destinationIndex >= displayItems.length) return;
    // Equivalent to the previous `const previous = localItems;` snapshot,
    // but includes a newer parent revision when one arrived between renders.
    const previous = displayItems;
    const ordered = reorderItineraryItems(displayItems, sourceIndex, destinationIndex);
    if (ordered === displayItems) return;
    setLocalItems(ordered);
    try {
      await (onReorder ? onReorder(orderPayload(ordered)) : updateItineraryItemsOrder(orderPayload(ordered)));
    } catch (error) {
      // Roll back to the exact snapshot shown before this click. The parent
      // `items` prop can be one render behind while the RPC is in flight.
      setLocalItems(previous);
      Alert.alert('排序更新失敗', describeItineraryOrderError(error));
    }
  }

  async function shiftItems(fromIndex: number, delayMinutes: number) {
    const previous = displayItems;
    const shifted = shiftSubsequentItems(previous, fromIndex, delayMinutes);
    const changes = shifted.flatMap((item, index) => item.time !== previous[index]?.time ? [{ id: item.id, time: item.time }] : []);
    if (!changes.length) return;
    setLocalItems(shifted);
    try {
      await onShiftSubsequent?.(changes);
      Alert.alert('行程已順延', `後續行程已順延 ${delayMinutes} 分鐘。`);
    } catch (error) {
      setLocalItems(previous);
      Alert.alert('時間順延失敗', error instanceof Error ? error.message : '請稍後再試。');
    }
  }

  const moveHandlers = useMemo(
    () => new Map(displayItems.map((item) => [item.id, {
      up: () => { void moveItem(item.id, -1); },
      down: () => { void moveItem(item.id, 1); },
    }])),
    [displayItems],
  );

  if (!displayItems.length) return <EmptyTimeline />;
  return (
    <View style={timelineListStyle}>
      {/* Parent updates are reconciled into the same list that used to render via localItems.map. */}
      {displayItems.map((item, index) => (
        <React.Fragment key={item.id}>
          <View collapsable={false} style={timelineRowStyle}>
            <TimelineCard
              item={item}
              themeMode={themeMode}
              scheduled={scheduleById.get(item.id)}
              nextScheduled={scheduleById.get(segmentsByFromId.get(item.id)?.toId ?? '')}
              weather={weatherById[item.id]}
              vouchers={vouchers}
              onPreviewVoucher={onPreviewVoucher}
              segment={segmentsByFromId.get(item.id)}
              onRouteModeChange={handleRouteModeChange}
              active={focusedItemId === item.id}
              onEdit={onEdit}
              onDelete={onDelete}
              onMoveUp={moveHandlers.get(item.id)?.up}
              onMoveDown={moveHandlers.get(item.id)?.down}
              onUpdateImage={onUpdateImage}
              // The warning belongs to the current stop, so shift it and all
              // following stops (the pure helper intentionally excludes its
              // `fromIndex` item).
              onShiftSubsequent={(delay) => shiftItems(index - 1, delay)}
              canMoveUp={index > 0}
              canMoveDown={index < displayItems.length - 1}
            />
          </View>
          {index < displayItems.length - 1 && onInsertAtPosition
            ? <InsertSpotButton position={index + 1} onPress={onInsertAtPosition} />
            : null}
        </React.Fragment>
      ))}
    </View>
  );
}

const timelineListStyle = {
  width: '100%',
  maxWidth: '100%',
  paddingBottom: 144,
} as const;

const timelineRowStyle = {
  width: '100%',
  maxWidth: '100%',
  overflow: 'visible',
} as const;
