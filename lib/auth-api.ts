import { supabase } from './supabase';

export function authErrorDetails(error: unknown) {
  const value = error as { message?: string; status?: number; code?: string } | null;
  return { message: value?.message ?? String(error), status: value?.status, code: value?.code };
}

function logAuthError(operation: string, error: unknown) {
  console.error(`[Supabase Auth] ${operation} failed`, authErrorDetails(error));
}

export async function signIn(email: string, password: string) {
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error) logAuthError('signIn', result.error);
  return result;
}

export async function signUp(email: string, password: string) {
  const result = await supabase.auth.signUp({ email, password });
  if (result.error) logAuthError('signUp', result.error);
  return result;
}

export async function resendConfirmation(email: string) {
  const result = await supabase.auth.resend({ type: 'signup', email });
  if (result.error) logAuthError('resendConfirmation', result.error);
  return result;
}
