import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { pingSupabase, supabase } from '@/lib/supabase';
import { authStatus } from '@/lib/auth';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter(); const pathname = usePathname(); const [status, setStatus] = useState<'loading' | 'signedOut' | 'unverified' | 'authenticated'>('loading');
  useEffect(() => { let active = true; pingSupabase().then((result) => console.info('[Supabase] ping result', result)); supabase.auth.getSession().then(({ data }) => { if (active) setStatus(authStatus(data.session?.user ?? null)); }); const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => { if (active) setStatus(authStatus(session?.user ?? null)); }); return () => { active = false; sub.subscription.unsubscribe(); }; }, []);
  useEffect(() => { if (status === 'loading') return; if (status === 'signedOut' && pathname !== '/login') router.replace('/login'); if (status === 'authenticated' && pathname === '/login') router.replace('/'); if (status === 'unverified' && pathname !== '/login') router.replace('/login'); }, [status, pathname]);
  if (status === 'loading') return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  return <>{children}</>;
}
