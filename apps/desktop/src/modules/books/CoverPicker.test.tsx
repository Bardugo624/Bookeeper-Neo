import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../app', () => ({ useT: () => (key: string) => key }));
vi.mock('./useFilePreview', () => ({ useFilePreview: () => undefined }));

import { CLOTH_TONES } from '@bookeeper/ui/book';
import { CoverPicker } from './CoverPicker';

const base = { title: 'Dune', candidates: [], plan: { kind: 'keep' } as const, onPlan: vi.fn(), onColor: vi.fn() };
const swatches = () => screen.queryByRole('radiogroup');

describe('CoverPicker color swatches', () => {
  it('are hidden while the stored cover of a book is loading', () => {
    render(<CoverPicker {...base} color="#123456" />);
    expect(swatches()).toBeNull();
  });

  it('are hidden when the book shows a stored cover', () => {
    render(<CoverPicker {...base} color="#123456" storedSrc="blob:x" />);
    expect(swatches()).toBeNull();
  });

  it('appear for a book without a cover', () => {
    render(<CoverPicker {...base} color={CLOTH_TONES[0]!} />);
    expect(swatches()).not.toBeNull();
  });

  it('appear for a new book', () => {
    render(<CoverPicker {...base} color={null} />);
    expect(swatches()).not.toBeNull();
  });

  it('appear once the cover is removed in the form', () => {
    render(<CoverPicker {...base} color="#123456" plan={{ kind: 'remove' }} />);
    expect(swatches()).not.toBeNull();
  });
});
