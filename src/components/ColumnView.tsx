import { useRef, useState, type CSSProperties } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Column, Quest } from '../types';
import { useAppStore } from '../store/useAppStore';
import { SortableQuestCard } from './QuestCard';
import { QuickAdd } from './QuickAdd';
import { ColumnMenu } from './ColumnMenu';

interface Props {
  column: Column;
  quests: Record<string, Quest>;
  onOpenQuest: (questId: string) => void;
}

function ColumnNameInput({ column, onDone }: { column: Column; onDone: () => void }) {
  const renameColumn = useAppStore((s) => s.renameColumn);
  const [value, setValue] = useState(column.name);
  const finished = useRef(false);
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (save && value.trim() !== column.name) renameColumn(column.id, value);
    onDone();
  };
  return (
    <input
      className="field-input column-name-input"
      aria-label="Column name"
      autoFocus
      maxLength={30}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
    />
  );
}

export function ColumnView({ column, quests, onOpenQuest }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: 'column' },
  });
  const [editing, setEditing] = useState(false);
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`column pixel-box ${column.isDone ? 'is-done' : ''}`}
      aria-label={`${column.name} column`}
    >
      <header className="column-header">
        <button className="drag-handle" {...attributes} {...listeners} aria-label={`Move column ${column.name}`}>⠿</button>
        {editing ? (
          <ColumnNameInput column={column} onDone={() => setEditing(false)} />
        ) : (
          <h2 className="column-title" onDoubleClick={() => setEditing(true)}>
            {column.name}
            {column.isDone && <span className="done-flag" title="Quests finished here earn XP"> ★</span>}
          </h2>
        )}
        <span className="column-count">{column.questIds.length}</span>
        <ColumnMenu column={column} onRename={() => setEditing(true)} />
      </header>
      <SortableContext items={column.questIds} strategy={verticalListSortingStrategy}>
        <div className="quest-list">
          {column.questIds.map((id) =>
            quests[id] ? <SortableQuestCard key={id} quest={quests[id]} columnId={column.id} onOpen={onOpenQuest} /> : null,
          )}
        </div>
      </SortableContext>
      <QuickAdd columnId={column.id} />
    </section>
  );
}
