import { createContext, useContext } from 'react';

// Scoped to the mounted trip page: no stale cross-trip ID in local storage.
export const ActiveTripContext = createContext<string | null>(null);
export const useActiveTripId = () => useContext(ActiveTripContext);
