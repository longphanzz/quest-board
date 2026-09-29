import type { Column } from '../types';

/**
 * Where a dragged quest lands. `snapshot` is the drag preview (already moved across columns);
 * returns null when the quest ends up exactly where it started.
 */
export function resolveDrop(
  original: Column[],
  snapshot: Column[],
  questId: string,
  overId: string,
): { columnId: string; index: number } | null {
  const column = snapshot.find((c) => c.questIds.includes(questId));
  if (!column) return null;
  const overIndex = column.questIds.indexOf(overId);
  const index = overIndex >= 0 ? overIndex : column.questIds.indexOf(questId);
  const from = original.find((c) => c.questIds.includes(questId));
  if (from?.id === column.id && from.questIds.indexOf(questId) === index) return null;
  return { columnId: column.id, index };
}
