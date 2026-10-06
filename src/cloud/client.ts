import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

const env = () => ({
  url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined,
});

export function getSupabaseEnv(): { url: string; key: string } {
  const { url, key } = env();
  return { url: url ?? '', key: key ?? '' };
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = env();
  return Boolean(url && key);
}

/** Created lazily so tests and unconfigured builds never touch the network. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const { url, key } = env();
  if (!url || !key) throw new Error('Supabase is not configured');
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
