import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { reorderItineraryItems, sortItineraryItemsByPosition } from '@/lib/itinerary';
import { shiftSubsequentItems } from '@/lib/time-buffer';
import { buildDaySchedule } from '@/lib/schedule';
import { describeItineraryOrderError, updateItineraryItemsOrder } from '@/lib/itinerary-api';
import {
  displayRouteSegments,
  EmptyTimeline,
  InsertSpotButton,
  orderPayload,
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
  const [routeModes, setRouteModes] = useState<Record<string, TravelMode>>({});
  const routeEstimates = useRouteSegments(localItems, routeModes, { tripId, day: localItems[0]?.day_number });
  const segments = useMemo(
    () => displayRouteSegments(localItems, routeModes, routeEstimates),
    [localItems, routeEstimates, routeModes],
  );
  const segmentsByFromId = useMemo(
    () => new Map(segments.map((segment) => [segment.fromId, segment])),
    [segments],
  );
  const scheduled = useMemo(
    () => scheduleContext ? buildDaySchedule(localItems, scheduleContext) : [],
    [localItems, scheduleContext],
  );
  const scheduleById = useMemo(
    () => new Map(scheduled.map((entry) => [entry.item.id, entry])),
    [scheduled],
  );
  const weatherById = useWeatherByItem(localItems, scheduleContext, tripId);
  const handleRouteModeChange = useCallback((fromId: string, mode: TravelMode) => {
    setRouteModes((current) => ({ ...current, [fromId]: mode }));
  }, []);

  useEffect(() => {
    setLocalItems(sortItineraryItemsByPosition(items));
  }, [items]);

  async function moveItem(itemId: string, direction: -1 | 1) {
    const sourceIndex = localItems.findIndex((item) => item.id === itemId);
    const destinationIndex = sourceIndex + direction;
    if (sourceIndex < 0 || destinationIndex < 0 || destinationIndex >= localItems.length) return;
    const previous = localItems;
    const ordered = reorderItineraryItems(localItems, sourceIndex, destinationIndex);
    if (ordered === localItems) return;
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
    const previous = localItems;
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
    () => new Map(localItems.map((item) => [item.id, {
      up: () => { void moveItem(item.id, -1); },
      down: () => { void moveItem(item.id, 1); },
    }])),
    [localItems],
  );

  if (!localItems.length) return <EmptyTimeline />;
  return (
    <div style={timelineListStyle}>
      {localItems.map((item, index) => (
        <React.Fragment key={item.id}>
          <div id={`itinerary-item-${item.id}`}>
            <TimelineCard
              item={item}
              themeMode={themeMode}
              scheduled={scheduleById.get(item.id)}
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
              canMoveDown={index < localItems.length - 1}
            />
          </div>
          {index < localItems.length - 1 && onInsertAtPosition
            ? <InsertSpotButton position={index + 1} onPress={onInsertAtPosition} />
            : null}
        </React.Fragment>
      ))}
    </div>
  );
}

const timelineListStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  paddingBottom: 144,
};
