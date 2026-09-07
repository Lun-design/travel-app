import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { reorderItineraryItems, sortItineraryItemsByStartTime, type ItineraryItem } from '@/lib/itinerary';
import { buildDaySchedule } from '@/lib/schedule';
import { updateItineraryItemsOrder } from '@/lib/itinerary-api';
import { EmptyTimeline, NativeGripHandle, orderPayload, segmentsForItems, TimelineCard, useWeatherByItem, type ItineraryTimelineProps } from './ItineraryTimeline.shared';

export function ItineraryTimeline({ items, themeMode = 'system', onEdit, onDelete, onReorder, scheduleContext, vouchers, onPreviewVoucher, focusedItemId }: ItineraryTimelineProps) {
  const [localItems, setLocalItems] = useState(() => sortItineraryItemsByStartTime(items));
  const segments = useMemo(() => segmentsForItems(localItems), [localItems]);
  const scheduled = useMemo(() => scheduleContext ? buildDaySchedule(localItems, scheduleContext) : [], [localItems, scheduleContext]);
  const scheduleById = useMemo(() => new Map(scheduled.map((entry) => [entry.item.id, entry])), [scheduled]);
  const weatherById = useWeatherByItem(localItems, scheduleContext);
  useEffect(() => setLocalItems(sortItineraryItemsByStartTime(items)), [items]);

  async function finishDrag(ordered: ItineraryItem[]) {
    const positioned = ordered.map((item, position) => ({ ...item, position }));
    setLocalItems(positioned);
    try {
      await (onReorder ? onReorder(orderPayload(positioned)) : updateItineraryItemsOrder(orderPayload(positioned)));
    } catch (error) {
      setLocalItems(items);
      Alert.alert('排序更新失敗', error instanceof Error ? error.message : '請稍後再試。');
    }
  }

  async function moveItem(itemId: string, direction: -1 | 1) {
    const sourceIndex = localItems.findIndex((item) => item.id === itemId);
    const destinationIndex = sourceIndex + direction;
    if (sourceIndex < 0 || destinationIndex < 0 || destinationIndex >= localItems.length) return;
    const ordered = reorderItineraryItems(localItems, sourceIndex, destinationIndex);
    if (ordered === localItems) return;
    setLocalItems(ordered);
    try {
      await (onReorder ? onReorder(orderPayload(ordered)) : updateItineraryItemsOrder(orderPayload(ordered)));
    } catch (error) {
      setLocalItems(items);
      Alert.alert('排序更新失敗', error instanceof Error ? error.message : '請稍後再試。');
    }
  }

  if (!localItems.length) return <EmptyTimeline />;
  return <DraggableFlatList
    data={localItems}
    keyExtractor={(item) => item.id}
    scrollEnabled={false}
    activationDistance={8}
    onDragEnd={({ data }) => void finishDrag(data)}
    renderItem={({ item, drag, isActive }: RenderItemParams<ItineraryItem>) => <View>
      <TimelineCard item={item} themeMode={themeMode} scheduled={scheduleById.get(item.id)} weather={weatherById[item.id]} vouchers={vouchers} onPreviewVoucher={onPreviewVoucher} segment={segments.find((segment) => segment.fromId === item.id)} grip={<NativeGripHandle label={`長按拖曳 ${item.location_name} 重新排序`} onLongPress={drag} />} active={isActive || focusedItemId === item.id} onEdit={onEdit} onDelete={onDelete} onMoveUp={() => { void moveItem(item.id, -1); }} onMoveDown={() => { void moveItem(item.id, 1); }} canMoveUp={localItems.findIndex((entry) => entry.id === item.id) > 0} canMoveDown={localItems.findIndex((entry) => entry.id === item.id) < localItems.length - 1} />
    </View>}
  />;
}
