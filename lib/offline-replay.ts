import { deleteItineraryItem, saveItineraryItem, updateItineraryItemsOrder } from './itinerary-api';
import { createPackingItem, deletePackingItem, importPackingTemplate, updatePackingItem } from './packing-api';
import { deleteExpense, saveExpense } from './expenses-api';
import { createTrip, updateTrip } from './trips';
import { createOfflineSyncService } from './offline-sync';
import type { OfflineMutation } from './offline-store';

function withoutLocalId<T extends Record<string, unknown>>(payload: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = payload;
  return rest;
}

async function executeMutation(mutation: OfflineMutation): Promise<void> {
  const options = { offlineScope: mutation.scope, replaying: true } as const;
  if (mutation.entity === 'itinerary') {
    if (mutation.operation === 'create') return void await saveItineraryItem(withoutLocalId(mutation.payload as Record<string, unknown>) as any, options);
    if (mutation.operation === 'update') return void await saveItineraryItem(mutation.payload as any, options);
    if (mutation.operation === 'delete') return void await deleteItineraryItem(mutation.resourceId, options);
    return void await updateItineraryItemsOrder(mutation.payload as { id: string; position: number }[], options);
  }
  if (mutation.entity === 'packing') {
    if (mutation.operation === 'create' && mutation.resourceId.startsWith('template:')) {
      const value = mutation.payload as { tripId: string; template: any };
      return void await importPackingTemplate(value.tripId, value.template, options);
    }
    if (mutation.operation === 'create') return void await createPackingItem(mutation.payload as any, options);
    if (mutation.operation === 'update') return void await updatePackingItem(mutation.resourceId, mutation.payload as any, options);
    return void await deletePackingItem(mutation.resourceId, options);
  }
  if (mutation.entity === 'expense') {
    if (mutation.operation === 'create' || mutation.operation === 'update') {
      const value = mutation.payload as { expense: any; splits: any[] };
      return void await saveExpense(value.expense, value.splits, options);
    }
    return void await deleteExpense(mutation.resourceId, options);
  }
  if (mutation.operation === 'create') return void await createTrip(mutation.payload as any, options);
  await updateTrip(mutation.resourceId, mutation.payload as any, options);
}

export const offlineSyncService = createOfflineSyncService({ execute: executeMutation });
