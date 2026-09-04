import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import type { ItineraryItem } from '@/lib/itinerary';
import { buildDaySchedule } from '@/lib/schedule';
import { updateItineraryItemsOrder } from '@/lib/itinerary-api';
import { EmptyTimeline, NativeGripHandle, orderPayload, segmentsForItems, TimelineCard, useWeatherByItem, type ItineraryTimelineProps } from './ItineraryTimeline.shared';

export function ItineraryTimeline({ items, onEdit, onDelete, onReorder, scheduleContext, vouchers, onPreviewVoucher, focusedItemId }: ItineraryTimelineProps) {
  const [localItems, setLocalItems] = useState(items);
  const segments = useMemo(() => segmentsForItems(localItems), [localItems]);
  const scheduled = useMemo(() => scheduleContext ? buildDaySchedule(localItems, scheduleContext) : [], [localItems, scheduleContext]);
  const scheduleById = useMemo(() => new Map(scheduled.map((entry) => [entry.item.id, entry])), [scheduled]);
  const weatherById = useWeatherByItem(localItems, scheduleContext);
  useEffect(() => setLocalItems(items), [items]);

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

  if (!localItems.length) return <EmptyTimeline />;
  return <DraggableFlatList
    data={localItems}
    keyExtractor={(item) => item.id}
    scrollEnabled={false}
    activationDistance={8}
    onDragEnd={({ data }) => void finishDrag(data)}
    renderItem={({ item, drag, isActive }: RenderItemParams<ItineraryItem>) => <View>
      <TimelineCard item={item} scheduled={scheduleById.get(item.id)} weather={weatherById[item.id]} vouchers={vouchers} onPreviewVoucher={onPreviewVoucher} segment={segments.find((segment) => segment.fromId === item.id)} grip={<NativeGripHandle label={`長按拖曳 ${item.location_name} 重新排序`} onLongPress={drag} />} active={isActive || focusedItemId === item.id} onEdit={onEdit} onDelete={onDelete} />
    </View>}
  />;
}
