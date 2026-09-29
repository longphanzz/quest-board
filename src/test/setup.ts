import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no canvas; PixelCanvas tolerates a null context.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: () => null,
  configurable: true,
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
