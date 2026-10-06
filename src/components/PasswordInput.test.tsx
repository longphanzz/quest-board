import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PasswordInput } from './PasswordInput';

function Harness() {
  const [value, setValue] = useState('');
  return <PasswordInput label="Password" value={value} onChange={setValue} autoComplete="current-password" />;
}

describe('PasswordInput', () => {
  it('hides the password by default and reveals it on demand', async () => {
    render(<Harness />);
    const input = screen.getByLabelText('Password');
    await userEvent.type(input, 'secret123');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('does not submit the surrounding form when toggled', async () => {
    let submitted = false;
    render(<form onSubmit={(e) => { e.preventDefault(); submitted = true; }}><Harness /></form>);
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(submitted).toBe(false);
  });
});
