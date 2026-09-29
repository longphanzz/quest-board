import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Modal } from './Modal';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <button>Behind</button>
      {open && (
        <Modal title="Test" onClose={() => setOpen(false)}>
          <input aria-label="First" />
          <button>Last</button>
        </Modal>
      )}
    </>
  );
}

describe('Modal focus handling', () => {
  it('keeps Tab inside the dialog', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByLabelText('First')).toHaveFocus();
    await userEvent.tab(); // → Last
    await userEvent.tab(); // wraps → Close
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.tab(); // → First
    expect(screen.getByLabelText('First')).toHaveFocus();
    await userEvent.tab({ shift: true }); // back → Close
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('returns focus to the opener when closed', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });
});
