import { supabase } from './supabase';
export const signIn = (email: string, password: string) => supabase.auth.signInWithPassword({ email, password });
export const signUp = (email: string, password: string) => supabase.auth.signUp({ email, password });
export const resendConfirmation = (email: string) => supabase.auth.resend({ type: 'signup', email });
