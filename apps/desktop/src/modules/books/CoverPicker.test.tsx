import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../app', () => ({ useT: () => (key: string) => key }));
vi.mock('./useFilePreview', () => ({ useFilePreview: () => undefined }));

import { CLOTH_TONES } from '@bookeeper/ui/book';
import { CoverPicker } from './CoverPicker';

const base = { title: 'Dune', candidates: [], plan: { kind: 'keep' } as const, onPlan: vi.fn(), onColor: vi.fn() };
const swatches = () => screen.queryByRole('radiogroup');

describe('CoverPicker color swatches', () => {
  it('are replaced by a skeleton while the stored cover loads', () => {
    render(<CoverPicker {...base} color="#123456" storedStatus="loading" />);
    expect(swatches()).toBeNull();
  });

  it('are hidden when the book shows a stored cover', () => {
    render(<CoverPicker {...base} color="#123456" storedSrc="blob:x" storedStatus="ready" />);
    expect(swatches()).toBeNull();
  });

  it('appear when the request ended "absent", whatever the stored color', () => {
    render(<CoverPicker {...base} color="#123456" storedStatus="absent" />);
    expect(swatches()).not.toBeNull();
  });

  it('appear with a warning and a Remove button when the request failed', () => {
    render(<CoverPicker {...base} color="#123456" storedStatus="failed" />);
    expect(swatches()).not.toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'books.cover.remove' })).toBeTruthy();
  });

  it('appear for a new book', () => {
    render(<CoverPicker {...base} color={null} />);
    expect(swatches()).not.toBeNull();
  });

  it('appear once the cover is removed in the form', () => {
    render(<CoverPicker {...base} color="#123456" plan={{ kind: 'remove' }} storedStatus="loading" />);
    expect(swatches()).not.toBeNull();
  });
});

describe('CoverPicker column', () => {
  it('puts the controls after the cover, not beside it', () => {
    const { container } = render(<CoverPicker {...base} color={null} />);
    const wrap = container.querySelector('fieldset > div')!;
    const [preview, actions] = Array.from(wrap.children);
    expect(preview!.compareDocumentPosition(actions!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actions!.querySelector('[role="radiogroup"]')).not.toBeNull();
  });

  it('stacks the controls under the cover, full column width, in the stylesheet', () => {
    const css = readFileSync('src/modules/books/BookForm.module.css', 'utf8');
    const block = (name: string) => new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    expect(block('cover')).toMatch(/flex-direction:\s*column/);
    expect(block('cover')).toMatch(/min-width:\s*0/);
    expect(block('coverActions')).toMatch(/align-items:\s*stretch/);
  });
});
