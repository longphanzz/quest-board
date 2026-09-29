import { describe, expect, it } from 'vitest';
import type { AvatarFrames, Frame } from '../types';
import { resolveFrame, selectMood } from './mood';
import { createMascotFrames, emptyFrame } from './mascot';

const mascot = createMascotFrames();
const drawn = (): Frame => { const f = emptyFrame(); f[0] = '#ffffff'; return f; };
const none: AvatarFrames = { normal: null, happy: null, levelUp: null, sad: null };

describe('selectMood', () => {
  const base = { now: 1000, transient: null, streakBroken: false, overdueCount: 0 };
  it('is normal by default', () => expect(selectMood(base)).toBe('normal'));
  it('uses an active transient mood first', () => {
    expect(selectMood({ ...base, transient: { mood: 'levelUp', until: 2000 }, overdueCount: 3 })).toBe('levelUp');
  });
  it('ignores an expired transient mood', () => {
    expect(selectMood({ ...base, transient: { mood: 'happy', until: 500 } })).toBe('normal');
  });
  it('is sad with overdue quests or a broken streak', () => {
    expect(selectMood({ ...base, overdueCount: 1 })).toBe('sad');
    expect(selectMood({ ...base, streakBroken: true })).toBe('sad');
  });
});

describe('resolveFrame', () => {
  it('uses the mascot when no custom normal frame exists', () => {
    expect(resolveFrame(none, 'happy', mascot)).toEqual({ frame: mascot.happy, animation: 'bounce' });
  });
  it('uses the custom frame for the mood when drawn', () => {
    const sad = drawn();
    const frames = { ...none, normal: drawn(), sad };
    expect(resolveFrame(frames, 'sad', mascot)).toEqual({ frame: sad, animation: null });
  });
  it('falls back to the custom normal frame plus an animation', () => {
    const normal = drawn();
    const frames = { ...none, normal };
    expect(resolveFrame(frames, 'levelUp', mascot)).toEqual({ frame: normal, animation: 'jump' });
    expect(resolveFrame(frames, 'sad', mascot)).toEqual({ frame: normal, animation: 'shake' });
  });
});
