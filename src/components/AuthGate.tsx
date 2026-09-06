import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import {
  isSupabaseConfigured,
  onSupabaseAuthRecovery,
  pingSupabase,
  supabase,
  SUPABASE_CONFIGURATION_MESSAGE,
} from '@/lib/supabase';
import { authRedirectTarget, authStatus, friendlyAuthError, isInvalidSessionError, type AuthStatus } from '@/lib/auth';
import { PuppyMascot } from './PuppyMascot';
import { clearOfflineCache } from '@/lib/offline-cache';

type GateStatus = 'loading' | AuthStatus;

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<GateStatus>('loading');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const redirectTarget = status === 'loading' ? null : authRedirectTarget(status, pathname);

  useEffect(() => {
    let active = true;

    if (!isSupabaseConfigured) {
      setRecoveryMessage(SUPABASE_CONFIGURATION_MESSAGE);
      setStatus('signedOut');
      return () => {
        active = false;
      };
    }

    async function clearInvalidLocalSession(error: unknown) {
      console.error('[AuthGate] invalid session cleared', error);
      await clearOfflineCache();
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (signOutError) {
        console.error('[AuthGate] local sign out failed', signOutError);
      }
      if (active) {
        setRecoveryMessage(friendlyAuthError(error));
        setStatus('signedOut');
      }
    }

    async function restoreSession() {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError && isInvalidSessionError(sessionError)) return clearInvalidLocalSession(sessionError);
        const session = sessionData.session;
        if (!session) {
          if (active) setStatus('signedOut');
          return;
        }

        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError && isInvalidSessionError(userError)) return clearInvalidLocalSession(userError);
        if (userError) console.error('[AuthGate] session validation failed', userError);
        if (active) setStatus(authStatus(userData.user ?? session.user));
      } catch (error) {
        if (isInvalidSessionError(error)) return clearInvalidLocalSession(error);
        console.error('[AuthGate] session restore failed', error);
        if (active) setStatus('signedOut');
      }
    }

    const unregisterRecovery = onSupabaseAuthRecovery((error) => {
      if (!active) return;
      setRecoveryMessage(friendlyAuthError(error));
      setStatus('signedOut');
    });

    void pingSupabase().then((result) => console.info('[Supabase] ping result', result));
    void restoreSession();
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setStatus(authStatus(session?.user ?? null));
    });
    return () => {
      active = false;
      unregisterRecovery();
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (redirectTarget) router.replace(redirectTarget);
  }, [redirectTarget, router]);

  if (status === 'loading' || redirectTarget) return <View style={styles.center}><PuppyMascot puppy="-5" size={72} accessibilityLabel="載入中" /><Text style={styles.loadingText}>正在準備你的旅程…</Text></View>;
  return <>
    {recoveryMessage && pathname === '/login' ? <View style={styles.notice}><Text style={styles.noticeText}>{recoveryMessage}</Text></View> : null}
    {children}
  </>;
}

const styles = {
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  loadingText: { color: '#64748b', marginTop: 10 },
  notice: { backgroundColor: '#fff7ed', borderBottomWidth: 1, borderBottomColor: '#fed7aa', paddingVertical: 9, paddingHorizontal: 16 },
  noticeText: { color: '#9a3412', textAlign: 'center' as const, fontWeight: '700' as const },
};
