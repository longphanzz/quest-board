import { useEffect, useId, useRef, type ReactNode } from 'react';
import './Modal.css';

interface Props { title: string; onClose: () => void; children: ReactNode; wide?: boolean; }

export function Modal({ title, onClose, children, wide }: Props) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not(.modal-close)')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <div ref={ref} className={`modal pixel-box ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header">
          <h2 id={titleId} className="modal-title">{title}</h2>
          <button className="pixel-btn icon modal-close" onClick={() => closeRef.current()} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
