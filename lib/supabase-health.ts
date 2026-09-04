export const SUPABASE_HEALTHCHECK_PATH = '/auth/v1/settings';

export function buildSupabaseHealthcheckUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${SUPABASE_HEALTHCHECK_PATH}`;
}
