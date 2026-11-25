import { expect, it } from 'vitest';
import { Book3D, BookCover, FillBar, ProgressRing, StatCard, clothTone } from '@bookeeper/ui/book';

it('exposes the book entry point', () => {
  for (const x of [clothTone, BookCover, Book3D, ProgressRing, FillBar, StatCard]) expect(typeof x).toBe('function');
});
