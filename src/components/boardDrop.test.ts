import { describe, expect, it } from 'vitest';
import type { Column } from '../types';
import { resolveDrop } from './boardDrop';

const cols = (a: string[], b: string[]): Column[] => [
  { id: 'A', name: 'A', questIds: a, isDone: false },
  { id: 'B', name: 'B', questIds: b, isDone: true },
];

describe('resolveDrop', () => {
  it('returns null when a quest is dropped back where it was', () => {
    const original = cols(['x', 'y'], []);
    expect(resolveDrop(original, original, 'x', 'x')).toBeNull();
  });
  it('reorders within a column', () => {
    const original = cols(['x', 'y', 'z'], []);
    expect(resolveDrop(original, original, 'x', 'z')).toEqual({ columnId: 'A', index: 2 });
  });
  it('moves across columns using the previewed position', () => {
    const original = cols(['x', 'y'], ['z']);
    const preview = cols(['y'], ['x', 'z']);
    expect(resolveDrop(original, preview, 'x', 'x')).toEqual({ columnId: 'B', index: 0 });
  });
});
