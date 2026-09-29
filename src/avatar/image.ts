import type { Frame } from '../types';
import { GRID } from './mascot';
import { rgbaToFrame } from './editor';

/** Scales an image to fit 32x32 (keeping aspect ratio, centered) and converts it to a frame. */
export async function imageFileToFrame(file: File): Promise<Frame> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unreadable image'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = GRID;
    canvas.height = GRID;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const scale = Math.min(GRID / img.width, GRID / img.height);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    ctx.drawImage(img, Math.floor((GRID - w) / 2), Math.floor((GRID - h) / 2), w, h);
    return rgbaToFrame(ctx.getImageData(0, 0, GRID, GRID).data);
  } finally {
    URL.revokeObjectURL(url);
  }
}
