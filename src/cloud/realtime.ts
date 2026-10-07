import { getSupabase } from './client';

/**
 * Calls `onRevision` whenever the user's board revision changes on the server (another device saved).
 * RLS limits the stream to the signed-in user's own row. Returns an unsubscribe function.
 */
export function subscribeToRevisions(userId: string, onRevision: (revision: number) => void): () => void {
  const supabase = getSupabase();
  const channel = supabase
    .channel(`board-revisions:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${userId}` },
      (payload: { new: Record<string, unknown> }) => {
        const revision = payload.new?.revision;
        if (typeof revision === 'number') onRevision(revision);
      },
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}
