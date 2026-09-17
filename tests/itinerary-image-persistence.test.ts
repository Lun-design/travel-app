import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '../lib/supabase';
import { updateItineraryItemImage } from '../lib/itinerary-api';

beforeEach(() => {
  vi.clearAllMocks();
});

it('persists a manually replaced preview URL to the itinerary item', async () => {
  const query = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'item-1', preview_url: 'https://cdn.example/new.jpg' }, error: null }),
  };
  vi.mocked(supabase.from).mockReturnValue(query as never);

  await updateItineraryItemImage('item-1', 'https://cdn.example/new.jpg');

  expect(supabase.from).toHaveBeenCalledWith('itinerary_items');
  expect(query.update).toHaveBeenCalledWith({ preview_url: 'https://cdn.example/new.jpg' });
  expect(query.eq).toHaveBeenCalledWith('id', 'item-1');
});

