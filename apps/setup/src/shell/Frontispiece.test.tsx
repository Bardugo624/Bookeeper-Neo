import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from './i18n';
import { Frontispiece, quoteSize } from './Frontispiece';
import { innerQuotes, resolveQuote } from './quotes';
import { renderSetup } from './testing';


describe('quoteSize', () => {
  it('goes by length: 33 up to 90, 26 up to 140, 22 beyond', () => {
    expect(quoteSize(51, false)).toBe(33);
    expect(quoteSize(90, false)).toBe(33);
    expect(quoteSize(91, false)).toBe(26);
    expect(quoteSize(140, false)).toBe(26);
    expect(quoteSize(141, false)).toBe(22);
    expect(quoteSize(200, false)).toBe(22);
  });

  it('is 22 when compact', () => {
    expect(quoteSize(10, true)).toBe(22);
  });
});

describe('Frontispiece', () => {
  it('sets a short quote at 33px and a long one at 22px', () => {
    const { container, unmount } = renderSetup(<Frontispiece quote={{ id: 'edmondo-de-amicis-2' }} compact={false} />);
    expect(container.querySelector('blockquote')).toHaveStyle({ fontSize: '33px' });
    unmount();
    const long = renderSetup(<Frontispiece quote={{ id: 'edmondo-de-amicis-1' }} compact={false} />, { locale: 'en' });
    expect(long.container.querySelector('blockquote')).toHaveStyle({ fontSize: '22px' });
  });

  it('counts the characters in the language on show', () => {
    // Collodi: 135 characters in Italian (26px), 152 in English (22px).
    const it = renderSetup(<Frontispiece quote={{ id: 'carlo-collodi-1' }} compact={false} />, { locale: 'it' });
    expect(it.container.querySelector('blockquote')).toHaveStyle({ fontSize: '26px' });
    it.unmount();
    const en = renderSetup(<Frontispiece quote={{ id: 'carlo-collodi-1' }} compact={false} />, { locale: 'en' });
    expect(en.container.querySelector('blockquote')).toHaveStyle({ fontSize: '22px' });
  });

  it('is 22px when compact', () => {
    const { container } = renderSetup(<Frontispiece quote={{ id: 'edmondo-de-amicis-2' }} compact />);
    expect(container.querySelector('blockquote')).toHaveStyle({ fontSize: '22px' });
  });

  it('puts the work in an italic cite and the author in the caption', () => {
    const { container } = renderSetup(<Frontispiece quote={{ id: 'edmondo-de-amicis-2' }} compact={false} />);
    const caption = container.querySelector('figure > figcaption')!;
    expect(caption).toHaveTextContent('Edmondo De Amicis');
    expect(caption.querySelector('cite')).toHaveTextContent('Cuore');
  });

  it('wraps the text in guillemets, decorative for screen readers', () => {
    const { container } = renderSetup(<Frontispiece quote={{ id: 'edmondo-de-amicis-2' }} compact={false} />);
    const marks = container.querySelectorAll('blockquote [aria-hidden="true"]');
    expect([...marks].map((m) => m.textContent)).toEqual(['«', '»']);
  });

  it('is not a live region', () => {
    const { container } = renderSetup(<Frontispiece quote={{ id: 'edmondo-de-amicis-2' }} compact={false} />);
    expect(container.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
  });
});

describe('inner quotes', () => {
  it('turns low guillemets inside a quote into high quotes', () => {
    expect(innerQuotes('Dice: «Sto rileggendo» ancora')).toBe('Dice: “Sto rileggendo” ancora');
  });

  it('cuts the work at the first parenthesis', () => {
    const shown = resolveQuote({ id: 'dante-alighieri-2' }, 'it');
    expect(shown?.work).not.toContain('(');
  });
});

describe('Frontispiece FLIP', () => {
  const rects = [
    { left: 72, top: 120, width: 600, height: 140 },
    { left: 72, top: 50, width: 600, height: 80 },
  ];

  function measure(index: number) {
    const r = rects[index]!;
    return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => r } as DOMRect;
  }

  it('plays the difference with translate and scale when going compact', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('no-preference') }));
    let current = 0;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => measure(current));
    const quote = { id: 'edmondo-de-amicis-2' };
    const { rerender, container } = render(
      <LocaleProvider locale="it">
        <Frontispiece quote={quote} compact={false} />
      </LocaleProvider>,
    );
    current = 1;
    rerender(
      <LocaleProvider locale="it">
        <Frontispiece quote={quote} compact />
      </LocaleProvider>,
    );
    const frame = container.firstElementChild as HTMLElement;
    // The inverted start (70px lower, 33/22 larger) was set, then released to animate.
    expect(frame.style.transform).toBe('');
    expect(frame.style.transition).toContain('transform');
    spy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('is immediate when the motion preference cannot be read', () => {
    vi.stubGlobal('matchMedia', undefined);
    let current = 0;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => measure(current));
    const quote = { id: 'edmondo-de-amicis-2' };
    const { rerender, container } = render(
      <LocaleProvider locale="it">
        <Frontispiece quote={quote} compact={false} />
      </LocaleProvider>,
    );
    current = 1;
    rerender(
      <LocaleProvider locale="it">
        <Frontispiece quote={quote} compact />
      </LocaleProvider>,
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.transition).toBe('');
    spy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('is immediate with reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes(': reduce') }));
    let current = 0;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => measure(current));
    const quote = { id: 'edmondo-de-amicis-2' };
    const { rerender, container } = render(
      <LocaleProvider locale="it">
        <Frontispiece quote={quote} compact={false} />
      </LocaleProvider>,
    );
    current = 1;
    rerender(
      <LocaleProvider locale="it">
        <Frontispiece quote={quote} compact />
      </LocaleProvider>,
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.transition).toBe('');
    spy.mockRestore();
    vi.unstubAllGlobals();
  });
});
