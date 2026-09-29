import type { Frame, Mood } from '../types';

export const GRID = 32;

/** "Sweetie 16" palette plus a cheek pink. */
export const PALETTE = [
  '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
  '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57', '#ff9eb0',
];

const C = {
  outline: '#1a1c2c',
  body: '#f4f4f4',
  shade: '#c2d3df',
  cheek: '#ff9eb0',
  eye: '#1a1c2c',
  mouth: '#b13e53',
  star: '#ffcd75',
  tear: '#41a6f6',
};

export const emptyFrame = (): Frame => Array<string | null>(GRID * GRID).fill(null);

const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

// Original chibi blob: round body, two round ears, two little feet. Symmetric around x = 15.5.
const inBody = (x: number, y: number) =>
  inEllipse(x, y, 15.5, 18, 11, 10) ||
  inEllipse(x, y, 9, 9, 3, 3) ||
  inEllipse(x, y, 22, 9, 3, 3) ||
  inEllipse(x, y, 11, 27.5, 3, 2) ||
  inEllipse(x, y, 20, 27.5, 3, 2);

function baseFrame(): Frame {
  const frame = emptyFrame();
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!inBody(x, y)) continue;
      const edge = !inBody(x - 1, y) || !inBody(x + 1, y) || !inBody(x, y - 1) || !inBody(x, y + 1);
      const rim = ((x - 15.5) / 11) ** 2 + ((y - 18) / 10) ** 2;
      frame[y * GRID + x] = edge ? C.outline : rim > 0.6 && y > 20 ? C.shade : C.body;
    }
  }
  return frame;
}

type Pixel = [number, number];

function paint(frame: Frame, pixels: Pixel[], color: string): void {
  for (const [x, y] of pixels) frame[y * GRID + x] = color;
}

const DOT_EYES: Pixel[] = [[11, 16], [12, 16], [11, 17], [12, 17], [19, 16], [20, 16], [19, 17], [20, 17]];
const HAPPY_EYES: Pixel[] = [[10, 17], [11, 16], [12, 16], [13, 17], [18, 17], [19, 16], [20, 16], [21, 17]];
const SAD_EYES: Pixel[] = [[11, 17], [12, 17], [11, 18], [12, 18], [19, 17], [20, 17], [19, 18], [20, 18]];
const CHEEKS: Pixel[] = [[8, 19], [9, 19], [22, 19], [23, 19]];
const SMILE: Pixel[] = [[14, 20], [15, 21], [16, 21], [17, 20]];
const FROWN: Pixel[] = [[14, 22], [15, 21], [16, 21], [17, 22]];
const OPEN_MOUTH_EDGE: Pixel[] = [[14, 20], [15, 20], [16, 20], [17, 20], [14, 21], [17, 21], [15, 22], [16, 22]];
const OPEN_MOUTH_FILL: Pixel[] = [[15, 21], [16, 21]];
const STARS: Pixel[] = [
  [3, 4], [2, 5], [3, 5], [4, 5], [3, 6],
  [28, 3], [27, 4], [28, 4], [29, 4], [28, 5],
  [28, 14], [2, 15],
];
const TEAR: Pixel[] = [[12, 19], [12, 20]];

function face(mood: Mood): Frame {
  const frame = baseFrame();
  paint(frame, CHEEKS, C.cheek);
  if (mood === 'normal') {
    paint(frame, DOT_EYES, C.eye);
    paint(frame, SMILE, C.outline);
  } else if (mood === 'happy' || mood === 'levelUp') {
    paint(frame, HAPPY_EYES, C.eye);
    paint(frame, OPEN_MOUTH_EDGE, C.outline);
    paint(frame, OPEN_MOUTH_FILL, C.mouth);
    if (mood === 'levelUp') paint(frame, STARS, C.star);
  } else {
    paint(frame, SAD_EYES, C.eye);
    paint(frame, FROWN, C.outline);
    paint(frame, TEAR, C.tear);
  }
  return frame;
}

export function createMascotFrames(): Record<Mood, Frame> {
  return { normal: face('normal'), happy: face('happy'), levelUp: face('levelUp'), sad: face('sad') };
}
