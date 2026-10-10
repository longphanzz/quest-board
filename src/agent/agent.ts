import { getSupabase } from '../cloud/client';
import { useAppStore } from '../store/useAppStore';
import { toDateKey } from '../game/dates';
import type { Difficulty } from '../types';
import type { QuestPatch } from '../store/board';

// OpenAI chat-completions message shapes (only the parts we use).
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

const MAX_STEPS = 8;
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard', 'boss'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const difficulty = (v: unknown) => (DIFFICULTIES.includes(v as Difficulty) ? (v as Difficulty) : undefined);
const deadline = (v: unknown) => (v === null ? null : typeof v === 'string' && DATE_RE.test(v) ? v : undefined);
const labelIds = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined);

function boardSnapshot() {
  const { columns, quests, labels } = useAppStore.getState().data;
  return {
    today: toDateKey(new Date()),
    labels,
    columns: columns.map((c) => ({
      id: c.id,
      name: c.name,
      isDone: c.isDone,
      quests: c.questIds.map((id) => {
        const q = quests[id];
        return {
          id: q.id, title: q.title, description: q.description, difficulty: q.difficulty,
          deadline: q.deadline, labelIds: q.labelIds, createdAt: q.createdAt, completedAt: q.completion?.at ?? null,
        };
      }),
    })),
  };
}

/** Runs one tool the model asked for. Model output is untrusted, so every argument is checked. */
export function runTool(name: string, args: Args): unknown {
  const store = useAppStore.getState();
  const quests = store.data.quests;
  switch (name) {
    case 'list_board':
      return boardSnapshot();
    case 'add_quest': {
      const title = str(args.title);
      const columnId = str(args.columnId);
      if (!title || !columnId) return { error: 'columnId and title are required' };
      const id = store.addQuest(columnId, {
        title, description: str(args.description), difficulty: difficulty(args.difficulty),
        deadline: deadline(args.deadline), labelIds: labelIds(args.labelIds),
      });
      return id ? { ok: true, questId: id } : { error: 'Could not create quest (bad columnId?)' };
    }
    case 'edit_quest': {
      const questId = str(args.questId);
      if (!questId || !quests[questId]) return { error: 'Unknown questId' };
      const patch: QuestPatch = {};
      if (str(args.title) !== undefined) patch.title = str(args.title);
      if (str(args.description) !== undefined) patch.description = str(args.description);
      if (difficulty(args.difficulty)) patch.difficulty = difficulty(args.difficulty);
      if (deadline(args.deadline) !== undefined) patch.deadline = deadline(args.deadline);
      if (labelIds(args.labelIds)) patch.labelIds = labelIds(args.labelIds);
      return store.updateQuest(questId, patch) ? { ok: true } : { error: 'Edit rejected' };
    }
    case 'move_quest': {
      const questId = str(args.questId);
      const column = store.data.columns.find((c) => c.id === str(args.toColumnId));
      if (!questId || !quests[questId]) return { error: 'Unknown questId' };
      if (!column) return { error: 'Unknown toColumnId' };
      store.moveQuest(questId, column.id, column.questIds.filter((id) => id !== questId).length);
      return { ok: true };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

const compact = (messages: ChatMessage[]) =>
  messages.filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.tool_calls?.length));

function parseArgs(raw: string): Args {
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Args) : {};
  } catch {
    return {};
  }
}

/**
 * The agent loop: ask the model, run any tools it calls, send the results back, repeat until it answers in text.
 * Returns the conversation without tool traffic: board snapshots are big and stale by the next turn anyway.
 */
export async function runAgent(history: ChatMessage[]): Promise<ChatMessage[]> {
  const messages = [...history];
  for (let step = 0; step < MAX_STEPS; step++) {
    const { data, error } = await getSupabase().functions.invoke<{ message: ChatMessage }>('agent', { body: { messages } });
    if (error || !data?.message) throw new Error('The assistant is unavailable right now.');
    const reply = data.message as Extract<ChatMessage, { role: 'assistant' }>;
    messages.push(reply);
    if (!reply.tool_calls?.length) return compact(messages);
    for (const call of reply.tool_calls) {
      const result = runTool(call.function.name, parseArgs(call.function.arguments));
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  messages.push({ role: 'assistant', content: 'I stopped after too many steps. Please try a smaller request.' });
  return compact(messages);
}
