/**
 * Lightweight circuit breaker for Places requests.
 *
 * A Supabase/Auth session can expire while the recommendation modal is open.
 * Once an auth-related response is observed, stop issuing more Places calls
 * until the application explicitly clears the breaker after re-authentication.
 */
let placesAuthBlocked = false;
let sessionChecker: (() => Promise<boolean>) | null = null;

export function isPlacesAuthBlocked(): boolean {
  return placesAuthBlocked;
}

export function markPlacesAuthInvalid(): void {
  placesAuthBlocked = true;
}

export function clearPlacesAuthBlock(): void {
  placesAuthBlocked = false;
}

export function setPlacesSessionChecker(checker: (() => Promise<boolean>) | null): void {
  sessionChecker = checker;
}

export async function canIssuePlacesRequest(): Promise<boolean> {
  if (placesAuthBlocked) return false;
  if (!sessionChecker) return true;
  try {
    if (await sessionChecker()) return true;
  } catch {
    // Treat an unreadable session as expired.
  }
  placesAuthBlocked = true;
  return false;
}

export function isPlacesAuthErrorStatus(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}
