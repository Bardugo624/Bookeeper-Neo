import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFormState, type FormErrors } from './useFormState';

interface V {
  title: string;
  author: string;
}
const initial: V = { title: '', author: '' };
const validate = (v: V): FormErrors<V> => ({
  ...(v.title ? {} : { title: 'req' }),
  ...(v.author ? {} : { author: 'req' }),
});

describe('useFormState', () => {
  it('reports errors per field and does not call the handler', async () => {
    const { result } = renderHook(() => useFormState(initial, validate));
    const handler = vi.fn();
    await act(() => result.current.submit(handler)());
    expect(result.current.errors).toEqual({ title: 'req', author: 'req' });
    expect(result.current.touched.title).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    act(() => result.current.setValue('title', 'Dune'));
    expect(result.current.errors.title).toBeUndefined();
    expect(result.current.errors.author).toBe('req');
  });

  it('focuses the first field with an error', async () => {
    function Form() {
      const f = useFormState(initial, validate);
      return (
        <form onSubmit={f.submit(() => undefined)}>
          <input name="title" aria-label="titolo" value={f.values.title} onChange={(e) => f.setValue('title', e.target.value)} />
          <input name="author" aria-label="autore" value={f.values.author} onChange={(e) => f.setValue('author', e.target.value)} />
          <button type="submit">ok</button>
        </form>
      );
    }
    render(<Form />);
    await act(async () => screen.getByRole('button').click());
    expect(screen.getByLabelText('titolo')).toHaveFocus();
  });

  it('ignores a second submit while the first runs', async () => {
    const { result } = renderHook(() => useFormState({ title: 'x', author: 'y' }, validate));
    let release!: () => void;
    const handler = vi.fn(() => new Promise<void>((r) => (release = r)));
    const submit = result.current.submit(handler);
    let first!: Promise<void>;
    act(() => {
      first = submit();
      void submit();
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.current.submitting).toBe(true);
    await act(async () => {
      release();
      await first;
    });
    expect(result.current.submitting).toBe(false);
  });

  it('keeps the error thrown by the handler and resets', async () => {
    const { result } = renderHook(() => useFormState({ title: 'x', author: 'y' }, validate));
    await act(() => result.current.submit(() => Promise.reject(new Error('boom')))());
    expect(result.current.submitError).toBeInstanceOf(Error);
    act(() => result.current.setValue('title', 'z'));
    act(() => result.current.reset());
    expect(result.current.values).toEqual({ title: 'x', author: 'y' });
    expect(result.current.submitError).toBeNull();
  });
});
