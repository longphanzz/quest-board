import { useState, type FormEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import { playSfx } from '../audio/sfx';

export function QuickAdd({ columnId }: { columnId: string }) {
  const addQuest = useAppStore((s) => s.addQuest);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');

  const close = () => {
    setOpen(false);
    setTitle('');
  };

  if (!open) {
    return (
      <button className="pixel-btn ghost quick-add-open" onClick={() => setOpen(true)}>
        + New Quest
      </button>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (addQuest(columnId, { title })) {
      playSfx('create');
      setTitle('');
    }
  };

  return (
    <form className="quick-add" onSubmit={submit}>
      <input
        className="field-input"
        autoFocus
        aria-label="New quest title"
        placeholder="Quest name…"
        maxLength={120}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && close()}
      />
      <div className="quick-add-actions">
        <button type="submit" className="pixel-btn primary">Add</button>
        <button type="button" className="pixel-btn ghost" onClick={close}>Cancel</button>
      </div>
    </form>
  );
}
