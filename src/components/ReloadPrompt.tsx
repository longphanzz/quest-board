import { useRegisterSW } from 'virtual:pwa-register/react';

export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="reload-prompt pixel-box" role="status">
      <span>✨ A new version is ready!</span>
      <button className="pixel-btn primary" onClick={() => void updateServiceWorker(true)}>Reload</button>
      <button className="pixel-btn ghost" onClick={() => setNeedRefresh(false)}>Later</button>
    </div>
  );
}
