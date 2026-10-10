import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { INITIAL_SYNC, useAppStore } from '../store/useAppStore';
import { createDefaultData } from '../store/defaults';
import type { ChatMessage } from '../agent/agent';

const { runAgent } = vi.hoisted(() => ({ runAgent: vi.fn() }));
vi.mock('../agent/agent', () => ({ runAgent }));

import { AgentPanel } from './AgentPanel';

const app = () => useAppStore.getState();
const titles = () => Object.values(app().data.quests).map((q) => q.title);

beforeEach(() => {
  useAppStore.setState({ data: createDefaultData(), ownerId: null, sync: { ...INITIAL_SYNC }, lastCleared: null });
  runAgent.mockReset();
});

async function ask(text: string) {
  await userEvent.type(screen.getByLabelText('Message'), text);
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
}

describe('AgentPanel', () => {
  it('renders bold markdown and undoes the coach changes', async () => {
    runAgent.mockImplementation(async (history: ChatMessage[]) => {
      app().addQuest(app().data.columns[0].id, { title: 'Plank' });
      return [...history, { role: 'assistant', content: 'Added **Plank** for you' }];
    });
    render(<AgentPanel onClose={() => {}} />);
    await ask('add plank');

    expect(await screen.findByText('Plank', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).toBeNull();
    expect(titles()).toContain('Plank');

    await userEvent.click(screen.getByRole('button', { name: /Undo coach changes/ }));
    expect(titles()).not.toContain('Plank');
    expect(screen.queryByRole('button', { name: /Undo coach changes/ })).toBeNull();
  });

  it('hides undo once the user edits the board, so their edits are never wiped', async () => {
    runAgent.mockImplementation(async (history: ChatMessage[]) => {
      app().addQuest(app().data.columns[0].id, { title: 'Run' });
      return [...history, { role: 'assistant', content: 'Done' }];
    });
    render(<AgentPanel onClose={() => {}} />);
    await ask('add run');
    expect(await screen.findByRole('button', { name: /Undo coach changes/ })).toBeInTheDocument();

    app().addQuest(app().data.columns[0].id, { title: 'My own quest' });
    expect(await screen.findByText('Done')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Undo coach changes/ })).toBeNull();
  });
});
