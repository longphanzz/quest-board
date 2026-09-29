import { useEffect, useRef } from 'react';
import type { Frame } from '../types';
import { GRID } from '../avatar/mascot';

interface Props { frame: Frame; size?: number; className?: string; label?: string; }

export function PixelCanvas({ frame, size, className, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, GRID, GRID);
    frame.forEach((color, i) => {
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(i % GRID, Math.floor(i / GRID), 1, 1);
    });
  }, [frame]);
  return (
    <canvas
      ref={ref}
      width={GRID}
      height={GRID}
      className={`pixelated ${className ?? ''}`}
      style={size ? { width: size, height: size } : undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
