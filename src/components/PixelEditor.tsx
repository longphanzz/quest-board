import { useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from 'react';
import type { Frame, Mood } from '../types';
import { MOODS } from '../types';
import { useAppStore } from '../store/useAppStore';
import { useEffectsStore } from '../store/useEffectsStore';
import { GRID, PALETTE, emptyFrame } from '../avatar/mascot';
import { MASCOT } from '../avatar/mood';
import {
  drawLine, floodFill, flipHorizontal, historyInit, historyPush, historyReplace, redo, setPixel, undo, type History,
} from '../avatar/editor';
import { imageFileToFrame } from '../avatar/image';
import { Modal } from './Modal';
import { PixelCanvas } from './PixelCanvas';
import './PixelEditor.css';

const TABS: { id: Mood; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'happy', label: 'Happy' },
  { id: 'levelUp', label: 'Level Up' },
  { id: 'sad', label: 'Sad' },
];
type Tool = 'pen' | 'eraser' | 'fill' | 'picker';
const TOOLS: { id: Tool; label: string }[] = [
  { id: 'pen', label: '✏️ Pen' },
  { id: 'eraser', label: '🧽 Eraser' },
  { id: 'fill', label: '🪣 Fill' },
  { id: 'picker', label: '💧 Picker' },
];

export function PixelEditor({ onClose }: { onClose: () => void }) {
  const saved = useAppStore((s) => s.data.avatar.frames);
  const saveAvatar = useAppStore((s) => s.saveAvatar);
  const resetAvatar = useAppStore((s) => s.resetAvatar);

  const [tab, setTab] = useState<Mood>('normal');
  const [initial] = useState<Record<Mood, Frame>>(() => ({
    normal: saved.normal ?? emptyFrame(),
    happy: saved.happy ?? emptyFrame(),
    levelUp: saved.levelUp ?? emptyFrame(),
    sad: saved.sad ?? emptyFrame(),
  }));
  const [histories, setHistories] = useState<Record<Mood, History>>(() => ({
    normal: historyInit(initial.normal),
    happy: historyInit(initial.happy),
    levelUp: historyInit(initial.levelUp),
    sad: historyInit(initial.sad),
  }));
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [trace, setTrace] = useState<Frame | null>(null);
  const [uploadMode, setUploadMode] = useState<'trace' | 'apply'>('trace');
  const lastCell = useRef<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const present = histories[tab].present;
  const update = (fn: (h: History) => History) => setHistories((hs) => ({ ...hs, [tab]: fn(hs[tab]) }));
  const paintColor = tool === 'eraser' ? null : color;

  const cellAt = (e: PointerEvent<HTMLDivElement>): number | null => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * GRID);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * GRID);
    return x < 0 || y < 0 || x >= GRID || y >= GRID ? null : y * GRID + x;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const i = cellAt(e);
    if (i === null) return;
    if (tool === 'picker') {
      const picked = present[i];
      if (picked) {
        setColor(picked);
        setTool('pen');
      }
      return;
    }
    if (tool === 'fill') {
      update((h) => historyPush(h, floodFill(h.present, i, color)));
      return;
    }
    lastCell.current = i;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    update((h) => {
      // Every stroke gets its own undo step, even if its first cell was already this color.
      const next = setPixel(h.present, i, paintColor);
      return historyPush(h, next === h.present ? [...next] : next);
    });
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const from = lastCell.current;
    if (from === null) return;
    const i = cellAt(e);
    if (i === null || i === from) return;
    lastCell.current = i;
    update((h) => historyReplace(h, drawLine(h.present, from, i, paintColor)));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key.toLowerCase() === 'z') {
      e.preventDefault();
      update(e.shiftKey ? redo : undo);
    } else if (e.key.toLowerCase() === 'y') {
      e.preventDefault();
      update(redo);
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const frame = await imageFileToFrame(file);
      if (uploadMode === 'trace') setTrace(frame);
      else update((h) => historyPush(h, frame));
    } catch {
      useEffectsStore.getState().toast('Could not read that image.', 'error');
    }
  };

  const save = () => {
    saveAvatar({
      normal: histories.normal.present,
      happy: histories.happy.present,
      levelUp: histories.levelUp.present,
      sad: histories.sad.present,
    });
    onClose();
  };

  const dirty = MOODS.some((m) => histories[m].present !== initial[m]);
  const requestClose = () => {
    if (dirty && !window.confirm('Discard your unsaved drawing?')) return;
    onClose();
  };

  const reset = () => {
    if (!window.confirm('Reset your avatar to the default mascot? Your drawings will be lost.')) return;
    resetAvatar();
    onClose();
  };

  return (
    <Modal title="Avatar Workshop" onClose={requestClose} wide>
      <div className="editor" onKeyDown={onKeyDown}>
        <div className="editor-main">
          <div className="editor-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className="pixel-btn" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div
            ref={gridRef}
            className="editor-grid"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (lastCell.current = null)}
            onPointerCancel={() => (lastCell.current = null)}
          >
            {trace && <PixelCanvas frame={trace} className="trace-layer" />}
            <PixelCanvas frame={present} className="draw-layer" label={`${tab} frame`} />
          </div>
        </div>

        <div className="editor-side">
          <div className="row">
            {TOOLS.map((t) => (
              <button key={t.id} className="pixel-btn" aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="palette">
            {PALETTE.map((c) => (
              <button key={c} className="swatch" style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} />
            ))}
            <input type="color" aria-label="Custom color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
          <div className="row">
            <button className="pixel-btn" onClick={() => update(undo)}>Undo</button>
            <button className="pixel-btn" onClick={() => update(redo)}>Redo</button>
            <button className="pixel-btn" onClick={() => update((h) => historyPush(h, flipHorizontal(h.present)))}>Flip</button>
            <button className="pixel-btn" onClick={() => update((h) => historyPush(h, emptyFrame()))}>Clear</button>
          </div>
          <div className="row">
            <button className="pixel-btn" disabled={tab === 'normal'} onClick={() => update((h) => historyPush(h, [...histories.normal.present]))}>
              Copy from Normal
            </button>
            <button className="pixel-btn" onClick={() => update((h) => historyPush(h, [...MASCOT[tab]]))}>Start from mascot</button>
          </div>
          <fieldset>
            <legend>Image</legend>
            <div className="row">
              <label><input type="radio" name="upload-mode" checked={uploadMode === 'trace'} onChange={() => setUploadMode('trace')} /> Trace</label>
              <label><input type="radio" name="upload-mode" checked={uploadMode === 'apply'} onChange={() => setUploadMode('apply')} /> Apply</label>
            </div>
            <div className="row">
              <button className="pixel-btn" onClick={() => fileRef.current?.click()}>📷 Upload</button>
              {trace && <button className="pixel-btn ghost" onClick={() => setTrace(null)}>Hide trace</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          </fieldset>
          <div className="editor-preview">
            {TABS.map((t) => (
              <PixelCanvas key={t.id} frame={histories[t.id].present} size={40} label={`${t.label} preview`} />
            ))}
          </div>
          <div className="modal-actions">
            <button className="pixel-btn danger" onClick={reset}>Reset to default</button>
            <span className="spacer" />
            <button className="pixel-btn ghost" onClick={requestClose}>Cancel</button>
            <button className="pixel-btn primary" onClick={save}>Save</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
