import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '../../app/i18n';
import { CodeBlock } from './CodeBlock';

const view = (props: Partial<React.ComponentProps<typeof CodeBlock>> = {}) =>
  render(
    <LocaleProvider locale="it">
      <CodeBlock code="ABCD2345" remaining={90} regenerating={false} onRegenerate={() => {}} {...props} />
    </LocaleProvider>,
  );

describe('CodeBlock', () => {
  it('counts down the time left by default', () => {
    view();
    expect(screen.getByText('Scade tra 1:30')).toBeInTheDocument();
  });

  it('shows the given text instead of the countdown', () => {
    view({ remaining: 604799, expiresText: 'Scade il 3 dic 2026' });
    expect(screen.getByText('Scade il 3 dic 2026')).toBeInTheDocument();
    expect(screen.queryByText(/Scade tra/)).toBeNull();
  });

  it('still offers renewal once expired', () => {
    view({ remaining: 0, expiresText: 'Scade il 3 dic 2026' });
    expect(screen.queryByText('Scade il 3 dic 2026')).toBeNull();
    expect(screen.getByRole('button', { name: /Genera/ })).toBeInTheDocument();
  });
});
