import { describe, expect, it } from 'vitest';
import { GRID, emptyFrame } from './mascot';
import { MAX_HISTORY, drawLine, floodFill, flipHorizontal, historyInit, historyPush, historyReplace, redo, rgbaToFrame, setPixel, undo } from './editor';

describe('pixel operations', () => {
  it('sets a pixel and returns the same frame when nothing changes', () => {
    const f = emptyFrame();
    const g = setPixel(f, 5, '#ff0000');
    expect(g[5]).toBe('#ff0000');
    expect(f[5]).toBeNull();
    expect(setPixel(g, 5, '#ff0000')).toBe(g);
  });

  it('flood fills an empty frame completely', () => {
    expect(floodFill(emptyFrame(), 0, '#000000').every((c) => c === '#000000')).toBe(true);
  });

  it('stops flood fill at a wall', () => {
    let f = emptyFrame();
    for (let y = 0; y < GRID; y++) f = setPixel(f, y * GRID + 10, '#111111'); // vertical wall at x=10
    const filled = floodFill(f, 0, '#ff0000');
    expect(filled[5]).toBe('#ff0000');
    expect(filled[20]).toBeNull();
    expect(filled[10]).toBe('#111111');
    expect(floodFill(filled, 0, '#ff0000')).toBe(filled);
  });

  it('flips horizontally', () => {
    const f = setPixel(emptyFrame(), 0, '#abcdef');
    expect(flipHorizontal(f)[GRID - 1]).toBe('#abcdef');
  });

  it('converts RGBA data, treating low alpha as transparent', () => {
    const data = new Uint8ClampedArray(GRID * GRID * 4);
    data.set([255, 128, 0, 255], 0);
    data.set([10, 10, 10, 50], 4);
    const f = rgbaToFrame(data);
    expect(f[0]).toBe('#ff8000');
    expect(f[1]).toBeNull();
  });
});

describe('history', () => {
  it('undoes and redoes', () => {
    const a = emptyFrame();
    const b = setPixel(a, 1, '#000000');
    let h = historyPush(historyInit(a), b);
    h = undo(h);
    expect(h.present).toBe(a);
    h = redo(h);
    expect(h.present).toBe(b);
  });
  it('ignores pushes that change nothing and replaces during strokes', () => {
    const a = emptyFrame();
    const h = historyInit(a);
    expect(historyPush(h, a)).toBe(h);
    const c = setPixel(a, 2, '#000000');
    expect(historyReplace(h, c)).toEqual({ past: [], present: c, future: [] });
  });
  it('caps the undo stack', () => {
    let h = historyInit(emptyFrame());
    for (let i = 0; i < MAX_HISTORY + 20; i++) h = historyPush(h, setPixel(h.present, i, '#000000'));
    expect(h.past).toHaveLength(MAX_HISTORY);
  });
});

describe('drawLine', () => {
  it('fills every cell between two points so fast strokes have no gaps', () => {
    const f = drawLine(emptyFrame(), 0, 3 * GRID + 3, '#000000'); // (0,0) → (3,3)
    expect([0, GRID + 1, 2 * GRID + 2, 3 * GRID + 3].every((i) => f[i] === '#000000')).toBe(true);
    expect(f.filter((c) => c !== null)).toHaveLength(4);
  });
  it('draws a horizontal line', () => {
    const f = drawLine(emptyFrame(), 5 * GRID + 2, 5 * GRID + 9, '#ff0000');
    expect(f.filter((c) => c !== null)).toHaveLength(8);
  });
});
