import React from 'react';
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ dispatch: vi.fn(), prevent: vi.fn() }));
vi.mock('react', async (original) => ({ ...await original<typeof import('react')>(), useContext: () => ({ dispatch: mocks.dispatch }) }));
vi.mock('@react-navigation/native', () => ({ NavigationContext: {}, useNavigation: () => ({ dispatch: mocks.dispatch }), usePreventRemove: mocks.prevent }));
import { DraftNavigationGuard } from '../src/components/DraftNavigationGuard';
it('uses the router prevention API and redispatches the exact original action only after consent', () => {
  const requestLeave = vi.fn();
  const protection = { shouldBlockNavigation: true, requestLeave };
  const wrapper = DraftNavigationGuard({ protection: protection as never })!;
  (wrapper.type as React.FunctionComponent<typeof wrapper.props>)(wrapper.props);
  expect(mocks.prevent).toHaveBeenCalledWith(true, expect.any(Function));
  const action = { type: 'GO_BACK' };
  mocks.prevent.mock.calls[0][1]({ data: { action } });
  expect(mocks.dispatch).not.toHaveBeenCalled();
  requestLeave.mock.calls[0][0](); expect(mocks.dispatch).toHaveBeenCalledWith(action);
});
