import { useState, type FormEvent } from 'react';
import type { Difficulty } from '../types';
import { useAppStore } from '../store/useAppStore';
import { LABEL_COLORS } from '../store/defaults';
import { Modal } from './Modal';
import { formatDateTime } from '../game/formatDate';

const DIFFICULTIES: { value: Difficulty; label: string; badge: string }[] = [
  { value: 'easy', label: 'Easy', badge: '★' },
  { value: 'normal', label: 'Normal', badge: '★★' },
  { value: 'hard', label: 'Hard', badge: '★★★' },
  { value: 'boss', label: 'Boss', badge: '💀' },
];

export function QuestModal({ questId, onClose }: { questId: string; onClose: () => void }) {
  const quest = useAppStore((s) => s.data.quests[questId]);
  const labels = useAppStore((s) => s.data.labels);
  const updateQuest = useAppStore((s) => s.updateQuest);
  const deleteQuest = useAppStore((s) => s.deleteQuest);
  const addLabel = useAppStore((s) => s.addLabel);
  const deleteLabel = useAppStore((s) => s.deleteLabel);

  const [title, setTitle] = useState(quest?.title ?? '');
  const [description, setDescription] = useState(quest?.description ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty>(quest?.difficulty ?? 'normal');
  const [deadline, setDeadline] = useState(quest?.deadline ?? '');
  const [labelIds, setLabelIds] = useState<string[]>(quest?.labelIds ?? []);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState<string>(LABEL_COLORS[0]);

  if (!quest) return null;

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (updateQuest(questId, { title, description, difficulty, deadline: deadline || null, labelIds })) onClose();
  };
  const remove = () => {
    if (!window.confirm(`Delete "${quest.title}"?`)) return;
    deleteQuest(questId);
    onClose();
  };
  const toggleLabel = (id: string) =>
    setLabelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const createLabel = () => {
    const id = addLabel(newLabel, newColor);
    if (!id) return;
    setLabelIds((ids) => [...ids, id]);
    setNewLabel('');
  };
  const removeLabel = (id: string, name: string) => {
    if (!window.confirm(`Delete the label "${name}" from every quest?`)) return;
    deleteLabel(id);
    setLabelIds((ids) => ids.filter((x) => x !== id));
  };

  return (
    <Modal title={quest.completion ? 'Quest Log' : 'Edit Quest'} onClose={onClose}>
      <form className="quest-form" onSubmit={save}>
        <label>
          Title
          <input className="field-input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Description
          <textarea className="field-input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <fieldset>
          <legend>Difficulty</legend>
          <div className="difficulty-picker">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.value}
                type="button"
                className={`pixel-btn diff-${d.value}`}
                aria-pressed={difficulty === d.value}
                onClick={() => setDifficulty(d.value)}
              >
                {d.badge} {d.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="row">
          <label className="row">
            Deadline
            <input className="field-input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
          {deadline && (
            <button type="button" className="pixel-btn ghost" onClick={() => setDeadline('')}>No deadline</button>
          )}
        </div>
        <fieldset>
          <legend>Labels</legend>
          <div className="label-picker">
            {labels.map((l) => (
              <span key={l.id} className="label-toggle">
                <button
                  type="button"
                  className="pixel-btn"
                  style={{ borderLeft: `10px solid ${l.color}` }}
                  aria-pressed={labelIds.includes(l.id)}
                  onClick={() => toggleLabel(l.id)}
                >
                  {l.name}
                </button>
                <button type="button" className="pixel-btn ghost" aria-label={`Delete label ${l.name}`} onClick={() => removeLabel(l.id, l.name)}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              className="field-input"
              style={{ width: 160 }}
              aria-label="New label name"
              placeholder="New label"
              maxLength={20}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <div className="swatches">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="swatch"
                  style={{ background: c }}
                  aria-label={`Label color ${c}`}
                  aria-pressed={newColor === c}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </div>
            <button type="button" className="pixel-btn" onClick={createLabel}>Add label</button>
          </div>
        </fieldset>
        <p className="settings-note">Created: {formatDateTime(quest.createdAt)}</p>
        {quest.completion && (
          <p className="completion-note">
            ✅ Completed: {formatDateTime(quest.completion.at)} · +{quest.completion.xp} XP
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="pixel-btn danger" onClick={remove}>Delete</button>
          <span className="spacer" />
          <button type="button" className="pixel-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="pixel-btn primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}
