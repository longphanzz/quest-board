import { describe, expect, it } from 'vitest';
import { GRID, createMascotFrames } from './mascot';

describe('createMascotFrames', () => {
  const frames = createMascotFrames();

  it('produces four 32x32 frames that differ from each other', () => {
    for (const frame of Object.values(frames)) expect(frame).toHaveLength(GRID * GRID);
    const serialized = new Set(Object.values(frames).map((f) => JSON.stringify(f)));
    expect(serialized.size).toBe(4);
  });

  it('draws a solid, left-right symmetric body for the normal mood', () => {
    const normal = frames.normal;
    expect(normal.filter((c) => c !== null).length).toBeGreaterThan(300);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) expect(normal[y * GRID + x]).toBe(normal[y * GRID + (GRID - 1 - x)]);
    }
  });
});
