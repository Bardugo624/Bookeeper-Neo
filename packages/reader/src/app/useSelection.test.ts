import { renderHook, act } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useSelection } from './useSelection';

it('a_selection_quote_is_trimmed', () => {
  const handlers: Record<string, (m: unknown) => void> = {};
  const engine = {
    on: (type: string, fn: (m: unknown) => void) => {
      handlers[type] = fn;
      return () => undefined;
    },
    clearSelection: vi.fn(),
  };
  const { result } = renderHook(() =>
    useSelection(
      engine as never,
      {} as never,
      {} as never,
      () => 'x',
      [],
      () => ({ percent: 0, chapter: null }),
      null,
      () => undefined,
      () => undefined,
      () => undefined,
    ),
  );
  act(() => handlers.selection!({ cfi: 'c', text: '  capitolo … ombr \n', rect: { x: 0, y: 0, width: 1, height: 1 } }));
  expect(result.current.selection?.text).toBe('capitolo … ombr');
});
