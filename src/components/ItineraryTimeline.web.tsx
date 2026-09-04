import React, { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { reorderItineraryItems, type ItineraryItem } from '@/lib/itinerary';
import { buildDaySchedule } from '@/lib/schedule';
import { updateItineraryItemsOrder } from '@/lib/itinerary-api';
import { EmptyTimeline, orderPayload, segmentsForItems, TimelineCard, useWeatherByItem, type ItineraryTimelineProps } from './ItineraryTimeline.shared';

export function ItineraryTimeline({ items, onEdit, onDelete, onReorder, scheduleContext, vouchers, onPreviewVoucher, focusedItemId }: ItineraryTimelineProps) {
  const [localItems, setLocalItems] = useState(items);
  const segments = useMemo(() => segmentsForItems(localItems), [localItems]);
  const scheduled = useMemo(() => scheduleContext ? buildDaySchedule(localItems, scheduleContext) : [], [localItems, scheduleContext]);
  const scheduleById = useMemo(() => new Map(scheduled.map((entry) => [entry.item.id, entry])), [scheduled]);
  const weatherById = useWeatherByItem(localItems, scheduleContext);
  useEffect(() => setLocalItems(items), [items]);

  async function finishDrag(result: DropResult) {
    if (!result.destination) return;
    const ordered = reorderItineraryItems(localItems, result.source.index, result.destination.index);
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
  return <DragDropContext onDragEnd={(result) => void finishDrag(result)}>
    <Droppable droppableId="itinerary-timeline">
      {(dropProvided) => <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} style={dropZoneStyle}>
        {localItems.map((item, index) => <Draggable key={item.id} draggableId={item.id} index={index}>
          {(dragProvided, snapshot) => <div id={`itinerary-item-${item.id}`} ref={dragProvided.innerRef} {...dragProvided.draggableProps} style={{ ...dragProvided.draggableProps.style, zIndex: snapshot.isDragging ? 10 : undefined }}>
            <TimelineCard item={item} scheduled={scheduleById.get(item.id)} weather={weatherById[item.id]} vouchers={vouchers} onPreviewVoucher={onPreviewVoucher} segment={segments.find((segment) => segment.fromId === item.id)} grip={<div {...dragProvided.dragHandleProps} role="button" aria-label={`拖曳 ${item.location_name} 重新排序`} style={{ ...webGripStyle, cursor: snapshot.isDragging ? 'grabbing' : 'grab' }}>⠿</div>} active={snapshot.isDragging || focusedItemId === item.id} onEdit={onEdit} onDelete={onDelete} />
          </div>}
        </Draggable>)}
        {dropProvided.placeholder as React.ReactNode}
      </div>}
    </Droppable>
  </DragDropContext>;
}

const dropZoneStyle: React.CSSProperties = { width: '100%', minHeight: 1 };
const webGripStyle: React.CSSProperties = { width: 32, minHeight: 76, display: 'grid', placeItems: 'center', flexShrink: 0, borderRadius: 10, background: '#e2e8f0', color: '#64748b', fontSize: 25, fontWeight: 900, userSelect: 'none', touchAction: 'none' };
