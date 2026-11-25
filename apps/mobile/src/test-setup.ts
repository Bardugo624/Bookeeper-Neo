import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  // The stylesheet tests run in the node environment.
  if (typeof document === 'undefined') return;
  cleanup();
  document.documentElement.removeAttribute('data-bottom-sheet');
  document.documentElement.classList.remove('dark');
});
