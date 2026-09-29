import type { Frame } from '../types';
import { GRID } from './mascot';

export function setPixel(frame: Frame, index: number, color: string | null): Frame {
  if (frame[index] === color) return frame;
  const next = [...frame];
  next[index] = color;
  return next;
}

/** Bresenham line between two cells, so fast pointer moves leave no gaps. */
export function drawLine(frame: Frame, from: number, to: number, color: string | null): Frame {
  let x0 = from % GRID;
  let y0 = Math.floor(from / GRID);
  const x1 = to % GRID;
  const y1 = Math.floor(to / GRID);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let next = frame;
  for (;;) {
    next = setPixel(next, y0 * GRID + x0, color);
    if (x0 === x1 && y0 === y1) return next;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

export function floodFill(frame: Frame, start: number, color: string | null): Frame {
  const target = frame[start];
  if (target === color) return frame;
  const next = [...frame];
  const stack = [start];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (next[i] !== target) continue;
    next[i] = color;
    const x = i % GRID;
    const y = Math.floor(i / GRID);
    if (x > 0) stack.push(i - 1);
    if (x < GRID - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - GRID);
    if (y < GRID - 1) stack.push(i + GRID);
  }
  return next;
}

export function flipHorizontal(frame: Frame): Frame {
  return frame.map((_, i) => {
    const x = i % GRID;
    const y = Math.floor(i / GRID);
    return frame[y * GRID + (GRID - 1 - x)];
  });
}

const hex = (n: number) => n.toString(16).padStart(2, '0');

export function rgbaToFrame(data: ArrayLike<number>): Frame {
  const frame: Frame = [];
  for (let i = 0; i < GRID * GRID; i++) {
    const o = i * 4;
    frame.push(data[o + 3] < 128 ? null : `#${hex(data[o])}${hex(data[o + 1])}${hex(data[o + 2])}`);
  }
  return frame;
}

export interface History { past: Frame[]; present: Frame; future: Frame[]; }
export const MAX_HISTORY = 100;

export const historyInit = (frame: Frame): History => ({ past: [], present: frame, future: [] });

export function historyPush(h: History, next: Frame): History {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-MAX_HISTORY), present: next, future: [] };
}

export function historyReplace(h: History, next: Frame): History {
  return next === h.present ? h : { ...h, present: next };
}

export function undo(h: History): History {
  if (h.past.length === 0) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
