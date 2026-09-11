import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { reorderItineraryItems, sortItineraryItemsByStartTime, type ItineraryItem } from '@/lib/itinerary';
import { buildDaySchedule } from '@/lib/schedule';
import { updateItineraryItemsOrder } from '@/lib/itinerary-api';
import { displayRouteSegments, EmptyTimeline, orderPayload, TimelineCard, useRouteSegments, useWeatherByItem, type ItineraryTimelineProps } from './ItineraryTimeline.shared';
import { EDITORIAL_COLORS } from '@/lib/theme';
import type { TravelMode } from '@/lib/routes';
import { createDragCloneStyle, createDragContainerStyle, createDragPreviewStyle, reconcileDraggedItems } from '@/lib/drag-drop';

export function ItineraryTimeline({ items, themeMode = 'system', onEdit, onDelete, onReorder, scheduleContext, vouchers, onPreviewVoucher, focusedItemId }: ItineraryTimelineProps) {
  const [localItems, setLocalItems] = useState(() => sortItineraryItemsByStartTime(items));
  const [routeModes, setRouteModes] = useState<Record<string, TravelMode>>({});
  const routeEstimates = useRouteSegments(localItems, routeModes);
  const segments = useMemo(() => displayRouteSegments(localItems, routeModes, routeEstimates), [localItems, routeEstimates, routeModes]);
  const segmentsByFromId = useMemo(() => new Map(segments.map((segment) => [segment.fromId, segment])), [segments]);
  const scheduled = useMemo(() => scheduleContext ? buildDaySchedule(localItems, scheduleContext) : [], [localItems, scheduleContext]);
  const scheduleById = useMemo(() => new Map(scheduled.map((entry) => [entry.item.id, entry])), [scheduled]);
  const weatherById = useWeatherByItem(localItems, scheduleContext);
  const moveItemRef = useRef<(itemId: string, direction: -1 | 1) => void>(() => undefined);
  const handleRouteModeChange = useCallback((fromId: string, mode: TravelMode) => {
    setRouteModes((current) => ({ ...current, [fromId]: mode }));
  }, []);
  const moveHandlers = useMemo(() => new Map(localItems.map((item) => [item.id, {
    up: () => { moveItemRef.current(item.id, -1); },
    down: () => { moveItemRef.current(item.id, 1); },
  }])), [localItems]);
  moveItemRef.current = (itemId, direction) => { void moveItem(itemId, direction); };
  useEffect(() => {
    setLocalItems((current) => reconcileDraggedItems(current, items, sortItineraryItemsByStartTime));
  }, [items]);

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
  return <DragDropContext onDragEnd={(result) => void finishDrag(result)}>
    <Droppable droppableId="itinerary-timeline" renderClone={(dragProvided, _snapshot, rubric) => {
      const item = localItems[rubric.source.index];
      if (!item) return null;
      return <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} {...dragProvided.dragHandleProps} style={createDragCloneStyle(dragProvided.draggableProps.style ?? {})}>
        <span style={dragCloneTimeStyle}>{item.time ?? item.start_time ?? '—'}</span>
        <strong style={dragCloneNameStyle}>{item.location_name}</strong>
      </div>;
    }}>
      {(dropProvided) => <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} style={dropZoneStyle}>
        {localItems.map((item, index) => <Draggable key={item.id} draggableId={item.id} index={index}>
          {(dragProvided, snapshot) => <div id={`itinerary-item-${item.id}`} ref={dragProvided.innerRef} {...dragProvided.draggableProps} style={createDragPreviewStyle({ ...(dragProvided.draggableProps.style ?? {}), opacity: snapshot.isDragging ? 0 : 1 }, snapshot.isDragging)}>
            <TimelineCard item={item} themeMode={themeMode} scheduled={scheduleById.get(item.id)} weather={weatherById[item.id]} vouchers={vouchers} onPreviewVoucher={onPreviewVoucher} segment={segmentsByFromId.get(item.id)} onRouteModeChange={handleRouteModeChange} grip={<div {...dragProvided.dragHandleProps} role="button" aria-label={`拖曳 ${item.location_name} 重新排序`} style={{ ...webGripStyle, cursor: snapshot.isDragging ? 'grabbing' : 'grab' }}>⠿</div>} active={snapshot.isDragging || focusedItemId === item.id} onEdit={onEdit} onDelete={onDelete} onMoveUp={moveHandlers.get(item.id)?.up} onMoveDown={moveHandlers.get(item.id)?.down} canMoveUp={index > 0} canMoveDown={index < localItems.length - 1} />
          </div>}
        </Draggable>)}
        {dropProvided.placeholder as React.ReactNode}
      </div>}
    </Droppable>
  </DragDropContext>;
}

const dropZoneStyle: React.CSSProperties = { ...createDragContainerStyle(), minHeight: 1 };
const webGripStyle: React.CSSProperties = { width: 32, minHeight: 76, display: 'grid', placeItems: 'center', flexShrink: 0, borderRadius: 8, background: EDITORIAL_COLORS.sand, color: EDITORIAL_COLORS.taupe, fontSize: 25, fontWeight: 900, userSelect: 'none', touchAction: 'none' };
const dragCloneTimeStyle: React.CSSProperties = { color: EDITORIAL_COLORS.terracotta, fontSize: 14, fontWeight: 800, marginBottom: 8 };
const dragCloneNameStyle: React.CSSProperties = { color: EDITORIAL_COLORS.charcoal, fontSize: 18, lineHeight: 1.3 };
