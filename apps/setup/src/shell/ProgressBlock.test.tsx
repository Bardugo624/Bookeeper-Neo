import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBlock } from './ProgressBlock';
import { renderSetup } from './testing';

describe('ProgressBlock', () => {
  it('shows title and percentage, and speaks value and step', () => {
    renderSetup(<ProgressBlock titleKey="setup.progress.install" event={{ step: 'copy', fraction: 0.58, done: false }} />);
    expect(screen.getByRole('heading', { name: 'Sto installando Bookeeper' })).toBeInTheDocument();
    expect(screen.getByText('58%')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Sto installando Bookeeper' });
    expect(bar).toHaveAttribute('aria-valuenow', '58');
    expect(bar).toHaveAttribute('aria-valuetext', 'Copio i file, 58%');
  });

  it('keeps the bar green however far it goes', () => {
    renderSetup(<ProgressBlock titleKey="setup.progress.install" event={{ step: 'finish', fraction: 0.97, done: false }} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-tone', 'ok');
  });

  it('announces the new step in a polite region, not every tick', () => {
    const { rerender } = renderSetup(
      <ProgressBlock titleKey="setup.progress.install" event={{ step: 'copy', fraction: 0.4, done: false }} />,
    );
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Copio i file');
    expect(region).not.toHaveTextContent('%');
    act(() => {
      rerender(<ProgressBlock titleKey="setup.progress.install" event={{ step: 'icons', fraction: 0.8, done: false }} />);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Creo le icone');
  });

  it('starts at the first install step with no event', () => {
    renderSetup(<ProgressBlock titleKey="setup.progress.install" event={null} />);
    expect(screen.getByRole('status')).toHaveTextContent("Preparo l'installazione");
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('starts at the step it is given, such as the first uninstall step', () => {
    renderSetup(<ProgressBlock titleKey="setup.progress.uninstall" initialStep="removeApp" event={null} />);
    expect(screen.getByRole('status')).toHaveTextContent("Tolgo l'app");
    expect(screen.getByRole('progressbar', { name: 'Sto disinstallando Bookeeper' })).toHaveAttribute(
      'aria-valuetext',
      "Tolgo l'app, 0%",
    );
  });

  it('moves focus to the title', () => {
    renderSetup(<ProgressBlock titleKey="setup.progress.install" event={null} />);
    expect(screen.getByRole('heading')).toHaveFocus();
  });
});
