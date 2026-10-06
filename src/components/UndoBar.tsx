import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

export const UNDO_MS = 5000;

/** "Cleared N quests — Undo" bar; disappears after five seconds. */
export function UndoBar() {
  const cleared = useAppStore((s) => s.lastCleared);
  const undoClear = useAppStore((s) => s.undoClear);
  const dismissUndo = useAppStore((s) => s.dismissUndo);

  useEffect(() => {
    if (!cleared) return;
    const timer = setTimeout(dismissUndo, UNDO_MS);
    return () => clearTimeout(timer);
  }, [cleared, dismissUndo]);

  if (!cleared) return null;
  const n = cleared.length;
  return (
    <div className="undo-bar pixel-box" role="status">
      <span>Cleared {n} quest{n === 1 ? '' : 's'}</span>
      <button className="pixel-btn primary" onClick={undoClear}>Undo</button>
    </div>
  );
}
