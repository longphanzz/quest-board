import { useState, type FormEvent } from 'react';
import { runAgent, type ChatMessage } from '../agent/agent';
import { Modal } from './Modal';
import './AgentPanel.css';

// Kept at module level so closing the panel does not wipe the conversation.
let saved: ChatMessage[] = [];

export function AgentPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(saved);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      saved = await runAgent(next);
      setMessages(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
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
          m.role === 'user' || (m.role === 'assistant' && m.content) ? (
            <p key={i} className={`agent-msg ${m.role}`}>{m.content}</p>
          ) : null,
        )}
        {busy && <p className="agent-msg assistant">…</p>}
        {error && <p className="agent-msg error" role="alert">{error}</p>}
      </div>
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
