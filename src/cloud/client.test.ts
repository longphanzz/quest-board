import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('getSupabase', () => {
  it('throws a clear error when env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    const { getSupabase, isSupabaseConfigured } = await import('./client');
    expect(isSupabaseConfigured()).toBe(false);
    expect(() => getSupabase()).toThrow('Supabase is not configured');
  });

  it('returns one shared client when configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    const { getSupabase } = await import('./client');
    expect(getSupabase()).toBe(getSupabase());
  });
});
