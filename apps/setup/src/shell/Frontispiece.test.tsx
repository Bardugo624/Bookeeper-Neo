import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from './i18n';
import { Frontispiece } from './Frontispiece';
import { renderSetup } from './testing';


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

  it('shows only the author when the quote has no work', () => {
    const { container } = renderSetup(<Frontispiece quote={{ id: 'stephane-mallarme-1' }} compact={false} />);
    const caption = container.querySelector('figure > figcaption')!;
    expect(caption).toHaveTextContent('Stéphane Mallarmé');
    expect(caption.querySelector('cite')).toBeNull();
  });

  it('sets a verse quote one block per line', () => {
    const { container } = renderSetup(<Frontispiece quote={{ id: 'dante-alighieri-2' }} compact={false} />, { locale: 'it' });
    const lines = container.querySelectorAll('blockquote > span');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('draws nothing for a quote without a text in the language', () => {
    const { container } = renderSetup(<Frontispiece quote={{ id: 'nonexistent' }} compact={false} />);
    expect(container).toBeEmptyDOMElement();
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
