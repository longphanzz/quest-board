import { useRef } from 'react';
import type { Column } from '../types';
import { useAppStore } from '../store/useAppStore';

export function ColumnMenu({ column, onRename }: { column: Column; onRename: () => void }) {
  const setDoneColumn = useAppStore((s) => s.setDoneColumn);
  const deleteColumn = useAppStore((s) => s.deleteColumn);
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute('open');

  const remove = () => {
    close();
    const count = column.questIds.length;
    if (count > 0 && !window.confirm(`Delete "${column.name}"? Its ${count} quest(s) will move to another column.`)) return;
    deleteColumn(column.id);
  };

  return (
    <details className="column-menu" ref={ref}>
      <summary className="pixel-btn icon" aria-label={`${column.name} options`}>⋮</summary>
      <div className="menu-items pixel-box">
        <button className="pixel-btn ghost" onClick={() => { close(); onRename(); }}>Rename</button>
        {!column.isDone && (
          <button className="pixel-btn ghost" onClick={() => { close(); setDoneColumn(column.id); }}>Make Done column</button>
        )}
        <button
          className="pixel-btn danger"
          disabled={column.isDone}
          title={column.isDone ? 'Pick another Done column first' : undefined}
          onClick={remove}
        >
          Delete
        </button>
      </div>
    </details>
  );
}
