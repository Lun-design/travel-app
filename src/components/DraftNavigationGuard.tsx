import React, { useContext } from 'react';
import { NavigationContext, useNavigation, usePreventRemove } from '@react-navigation/native';
import type { FormDraftProtection } from '../hooks/useFormDraft';
/** Optional wrapper keeps standalone previews usable without a navigation provider. */
export function DraftNavigationGuard({ protection }: { protection: FormDraftProtection }) {
  const navigation = useContext(NavigationContext);
  return navigation ? <ActiveGuard protection={protection} /> : null;
}
function ActiveGuard({ protection }: { protection: FormDraftProtection }) {
  const navigation = useNavigation();
  usePreventRemove(protection.shouldBlockNavigation, ({ data }) => {
    // Reuse the original action (including React Navigation's visited-route marker).
    protection.requestLeave(() => navigation.dispatch(data.action));
  });
  return null;
}
