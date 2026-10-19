import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
import { MODELS, runAgent, type ChatMessage, type ModelId } from '../agent/agent';
import { useAppStore } from '../store/useAppStore';
import { useEffectsStore } from '../store/useEffectsStore';
import type { AppData } from '../types';
import { Modal } from './Modal';
import './AgentPanel.css';

interface UndoPoint { before: AppData; after: AppData }
interface Ask { question: string; answer: (ok: boolean) => void }

// Kept at module level so closing the panel does not wipe the conversation or the undo point.
let saved: ChatMessage[] = [];
let savedUndo: UndoPoint | null = null;

const MODEL_KEY = 'quest-coach-model';
function loadModel(): ModelId {
  try {
    const v = localStorage.getItem(MODEL_KEY);
    return MODELS.some((m) => m.id === v) ? (v as ModelId) : 'gpt';
  } catch {
    return 'gpt';
  }
}

/** Renders the model's **bold** and *italic* markdown; everything else stays plain text. */
export function renderInline(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong>
    : part.startsWith('*') && part.endsWith('*') && part.length > 2 ? <em key={i}>{part.slice(1, -1)}</em>
    : <Fragment key={i}>{part}</Fragment>,
  );
}

export function AgentPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(saved);
  const [undo, setUndo] = useState<UndoPoint | null>(savedUndo);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [model, setModel] = useState<ModelId>(loadModel);
  const askRef = useRef<Ask | null>(null);
  const data = useAppStore((s) => s.data);
  // Only offer undo while the board is exactly as the agent left it, so it never wipes the user's own edits.
  const canUndo = undo !== null && undo.after === data;

  const confirm = (question: string) =>
    new Promise<boolean>((resolve) => {
      const next: Ask = { question, answer: (ok) => { askRef.current = null; setAsk(null); resolve(ok); } };
      askRef.current = next;
      setAsk(next);
    });
  // Closing the panel mid-question counts as "no", so the agent loop never hangs.
  useEffect(() => () => askRef.current?.answer(false), []);

  const keepUndo = (point: UndoPoint | null) => {
    savedUndo = point;
    setUndo(point);
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);
    const before = useAppStore.getState().data;
    try {
      saved = await runAgent(next, confirm, model);
      setMessages(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      const after = useAppStore.getState().data;
      if (after !== before) keepUndo({ before, after });
      setBusy(false);
    }
  };

  const pickModel = (id: ModelId) => {
    setModel(id);
    try { localStorage.setItem(MODEL_KEY, id); } catch { /* private mode: choice lasts this session only */ }
  };

  const onUndo = () => {
    if (!canUndo) return;
    useAppStore.getState().replaceData(undo.before);
    keepUndo(null);
    useEffectsStore.getState().toast('Undid the coach\'s changes.');
  };

  return (
    <Modal title="Quest Coach" onClose={onClose}>
      <div className="agent-log" aria-live="polite">
        {messages.length === 0 && (
          <p className="settings-note">
            Ask me to add, edit or move quests, or tell me a goal ("I want a six-pack") and I'll suggest quests.
          </p>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <p key={i} className="agent-msg user">{m.content}</p>
          ) : m.role === 'assistant' && m.content ? (
            <p key={i} className="agent-msg assistant">{renderInline(m.content)}</p>
          ) : null,
        )}
        {ask && (
          <div className="agent-confirm" role="group" aria-label="Coach needs your approval">
            <p>{ask.question}</p>
            <button className="pixel-btn primary" onClick={() => ask.answer(true)}>Yes, complete it</button>
            <button className="pixel-btn" onClick={() => ask.answer(false)}>No</button>
          </div>
        )}
        {busy && !ask && <p className="agent-msg assistant">…</p>}
        {error && <p className="agent-msg error" role="alert">{error}</p>}
        {canUndo && !busy && (
          <button className="pixel-btn agent-undo" onClick={onUndo}>↩ Undo coach changes</button>
        )}
      </div>
      <label className="agent-model">
        Model{' '}
        <select className="field-input" value={model} disabled={busy} onChange={(e) => pickModel(e.target.value as ModelId)}>
          {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
      <form className="agent-form" onSubmit={send}>
        <input
          className="field-input"
          aria-label="Message"
          value={input}
          maxLength={1000}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          disabled={busy}
        />
        <button className="pixel-btn primary" disabled={busy || !input.trim()}>Send</button>
      </form>
    </Modal>
  );
}
