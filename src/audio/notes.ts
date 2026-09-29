const NOTE_INDEX: Record<string, number> = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
};

export function noteToFreq(note: string): number {
  const match = /^([A-G]#?)(\d)$/.exec(note);
  if (!match) throw new Error(`Bad note name: ${note}`);
  const midi = (Number(match[2]) + 1) * 12 + NOTE_INDEX[match[1]];
  return 440 * 2 ** ((midi - 69) / 12);
}
