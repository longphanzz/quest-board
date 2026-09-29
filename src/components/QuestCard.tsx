import type { CSSProperties, KeyboardEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Difficulty, Quest } from '../types';
import { useAppStore } from '../store/useAppStore';
import { deadlineInfo } from '../game/deadline';
import { useToday } from '../hooks/useToday';
import { formatShortDate, isoToDateKey } from '../game/formatDate';

const DIFFICULTY_BADGE: Record<Difficulty, string> = { easy: '★☆☆', normal: '★★☆', hard: '★★★', boss: '💀 BOSS' };

export function QuestCard({ quest, onOpen }: { quest: Quest; onOpen?: () => void }) {
  const labels = useAppStore((s) => s.data.labels);
  const today = useToday();
  const info = quest.deadline && !quest.completion ? deadlineInfo(quest.deadline, today) : null;
  const questLabels = labels.filter((l) => quest.labelIds.includes(l.id));
  const classes = ['quest-card', `diff-${quest.difficulty}`, info?.overdue ? 'overdue' : '', quest.completion ? 'done' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <article className={classes} onClick={onOpen}>
      <div className="quest-title">{quest.completion ? '✅ ' : '⚔️ '}{quest.title}</div>
      <div className="quest-meta">
        <span className="quest-stars" aria-label={`Difficulty: ${quest.difficulty}`}>{DIFFICULTY_BADGE[quest.difficulty]}</span>
        {info && (
          <span className={`deadline ${info.overdue ? 'overdue' : ''} ${info.dueToday ? 'today' : ''}`}>
            {info.overdue ? '⚠️ ' : '⏳ '}{formatShortDate(quest.deadline!, today)} · {info.text}
          </span>
        )}
      </div>
      <div className="quest-date">
        {quest.completion
          ? `✅ ${formatShortDate(isoToDateKey(quest.completion.at), today)}`
          : `🗓 ${formatShortDate(isoToDateKey(quest.createdAt), today)}`}
      </div>
      {questLabels.length > 0 && (
        <div className="quest-labels">
          {questLabels.map((l) => (
            <span key={l.id} className="label-chip" style={{ background: l.color }}>{l.name}</span>
          ))}
        </div>
      )}
    </article>
  );
}

interface SortableProps { quest: Quest; columnId: string; onOpen: (questId: string) => void; }

export function SortableQuestCard({ quest, columnId, onOpen }: SortableProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: quest.id,
    data: { type: 'quest', columnId },
  });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    listeners?.onKeyDown?.(e);
    if (e.key === 'Enter' && !isDragging) onOpen(quest.id);
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onKeyDown={onKeyDown} aria-label={`Quest: ${quest.title}`}>
      <QuestCard quest={quest} onOpen={() => onOpen(quest.id)} />
    </div>
  );
}
