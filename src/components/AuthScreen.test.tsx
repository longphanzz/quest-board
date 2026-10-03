import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const signIn = vi.fn();
const signUp = vi.fn();
const requestPasswordReset = vi.fn();
const updatePassword = vi.fn();
vi.mock('../cloud/auth', () => ({ signIn, signUp, requestPasswordReset, updatePassword, MIN_PASSWORD: 8 }));

const { AuthScreen } = await import('./AuthScreen');
const { ResetPasswordScreen } = await import('./ResetPasswordScreen');

afterEach(() => vi.clearAllMocks());

const fill = async (email: string, password?: string) => {
  await userEvent.type(screen.getByLabelText('Email'), email);
  if (password !== undefined) await userEvent.type(screen.getByLabelText('Password'), password);
};

describe('AuthScreen', () => {
  it('signs in and shows mapped errors', async () => {
    signIn.mockResolvedValue('Wrong email or password');
    render(<AuthScreen />);
    await fill('a@b.co', 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(signIn).toHaveBeenCalledWith('a@b.co', 'password1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password');
  });

  it('signs up and asks to confirm the email', async () => {
    signUp.mockResolvedValue(null);
    render(<AuthScreen />);
    await userEvent.click(screen.getByRole('tab', { name: 'Sign up' }));
    await fill('a@b.co', 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check your email to confirm your account')).toBeInTheDocument();
  });

  it('requests a reset without revealing whether the account exists', async () => {
    requestPasswordReset.mockResolvedValue(null);
    render(<AuthScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await fill('a@b.co');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('If that email has an account, a reset link is on its way')).toBeInTheDocument();
  });
});

describe('ResetPasswordScreen', () => {
  it('requires both passwords to match', async () => {
    render(<ResetPasswordScreen />);
    await userEvent.type(screen.getByLabelText('New password'), 'password1');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'password2');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('saves a new password', async () => {
    updatePassword.mockResolvedValue(null);
    render(<ResetPasswordScreen />);
    await userEvent.type(screen.getByLabelText('New password'), 'password1');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(updatePassword).toHaveBeenCalledWith('password1');
  });
});
