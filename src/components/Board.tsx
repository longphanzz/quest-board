import { useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Column } from '../types';
import { useAppStore } from '../store/useAppStore';
import { playSfx } from '../audio/sfx';
import { ColumnView } from './ColumnView';
import { QuestCard } from './QuestCard';
import { QuestModal } from './QuestModal';
import { resolveDrop } from './boardDrop';
import './Board.css';

type DragKind = 'quest' | 'column';
const kindOf = (data: unknown): DragKind | undefined => (data as { type?: DragKind } | undefined)?.type;

function findColumnId(columns: Column[], id: UniqueIdentifier): string | null {
  const key = String(id);
  return columns.find((c) => c.id === key)?.id ?? columns.find((c) => c.questIds.includes(key))?.id ?? null;
}

export function Board() {
  const columns = useAppStore((s) => s.data.columns);
  const quests = useAppStore((s) => s.data.quests);
  const moveQuest = useAppStore((s) => s.moveQuest);
  const moveColumn = useAppStore((s) => s.moveColumn);
  const addColumn = useAppStore((s) => s.addColumn);

  // While a quest is dragged we preview cross-column moves locally; the store (and XP) only changes on drop.
  const [preview, setPreview] = useState<Column[] | null>(null);
  const [active, setActive] = useState<{ id: string; kind: DragKind } | null>(null);
  const [openQuestId, setOpenQuestId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );
  const shown = preview ?? columns;

  const onDragStart = ({ active: a }: DragStartEvent) => {
    const kind = kindOf(a.data.current);
    if (!kind) return;
    setActive({ id: String(a.id), kind });
    if (kind === 'quest') setPreview(columns.map((c) => ({ ...c, questIds: [...c.questIds] })));
  };

  const onDragOver = ({ active: a, over }: DragOverEvent) => {
    if (!over || kindOf(a.data.current) !== 'quest') return;
    setPreview((prev) => {
      if (!prev) return prev;
      const from = findColumnId(prev, a.id);
      const to = findColumnId(prev, over.id);
      if (!from || !to || from === to) return prev;
      const id = String(a.id);
      return prev.map((c) => {
        if (c.id === from) return { ...c, questIds: c.questIds.filter((q) => q !== id) };
        if (c.id !== to) return c;
        const ids = [...c.questIds];
        const overIndex = ids.indexOf(String(over.id));
        ids.splice(overIndex >= 0 ? overIndex : ids.length, 0, id);
        return { ...c, questIds: ids };
      });
    });
  };

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    const kind = kindOf(a.data.current);
    const snapshot = preview;
    setActive(null);
    setPreview(null);
    if (!over) return;

    if (kind === 'column') {
      const from = columns.findIndex((c) => c.id === String(a.id));
      const to = columns.findIndex((c) => c.id === findColumnId(columns, over.id));
      if (from >= 0 && to >= 0 && from !== to) moveColumn(from, to);
      return;
    }
    if (kind !== 'quest' || !snapshot) return;
    const id = String(a.id);
    const target = resolveDrop(columns, snapshot, id, String(over.id));
    if (!target) return; // dropped back in place: nothing to save, no sound
    moveQuest(id, target.columnId, target.index);
    playSfx('drop');
  };

  const onDragCancel = () => {
    setActive(null);
    setPreview(null);
  };

  const activeQuest = active?.kind === 'quest' ? quests[active.id] : undefined;
  const activeColumn = active?.kind === 'column' ? columns.find((c) => c.id === active.id) : undefined;

  return (
    <>
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <main className="board" aria-label="Quest board">
        <SortableContext items={shown.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
          {shown.map((column) => (
            <ColumnView key={column.id} column={column} quests={quests} onOpenQuest={setOpenQuestId} />
          ))}
        </SortableContext>
        <button className="pixel-btn ghost add-column" onClick={() => addColumn('New Column')}>+ Column</button>
      </main>
      <DragOverlay>
        {activeQuest ? (
          <div className="drag-overlay"><QuestCard quest={activeQuest} /></div>
        ) : activeColumn ? (
          <div className="column-ghost pixel-box">{activeColumn.name}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
      {openQuestId && <QuestModal questId={openQuestId} onClose={() => setOpenQuestId(null)} />}
    </>
  );
}
