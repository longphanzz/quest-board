import { useId, useState } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  minLength?: number;
}

/** A password field with a Show/Hide toggle, so a typo can be checked before submitting. */
export function PasswordInput({ label, value, onChange, autoComplete, minLength }: Props) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? 'Hide password' : 'Show password';
  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <span className="password-row">
        <input id={id} type={visible ? 'text' : 'password'} required autoComplete={autoComplete} minLength={minLength}
          value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="pixel-btn icon" aria-label={toggleLabel} aria-pressed={visible}
          title={toggleLabel} onClick={() => setVisible((v) => !v)}>
          {visible ? '🙈' : '👁'}
        </button>
      </span>
    </div>
  );
}
