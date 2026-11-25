import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../app/i18n';
import { FilePicker } from './FilePicker';

const file = new File(['x'], 'libri.csv', { type: 'text/csv' });
const view = (props: Partial<React.ComponentProps<typeof FilePicker>> = {}) =>
  render(
    <LocaleProvider locale="it">
      <FilePicker label="Scegli un file" inputLabel="File dei libri" accept=".csv" onPick={() => {}} {...props} />
    </LocaleProvider>,
  );

describe('FilePicker', () => {
  it('shows a translated button and "no file chosen"', () => {
    view();
    expect(screen.getByText('Scegli un file')).toBeInTheDocument();
    expect(screen.getByText('Nessun file scelto')).toBeInTheDocument();
    expect(screen.queryByText(/Choose File/i)).toBeNull();
  });

  it('has a labelled native input that keyboard users reach', () => {
    view();
    const input = screen.getByLabelText('File dei libri');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', '.csv');
    expect(input).not.toHaveAttribute('tabindex', '-1');
  });

  it('hands over the picked file and shows its name', async () => {
    const onPick = vi.fn();
    const { rerender } = view({ onPick });
    await userEvent.upload(screen.getByLabelText('File dei libri'), file);
    expect(onPick).toHaveBeenCalledWith(file);
    rerender(
      <LocaleProvider locale="it">
        <FilePicker label="Scegli un file" fileName="libri.csv" onPick={onPick} />
      </LocaleProvider>,
    );
    expect(screen.getByText('libri.csv')).toBeInTheDocument();
  });

  it('takes a dropped file only when asked to', () => {
    const onPick = vi.fn();
    const { container, unmount } = view({ onPick });
    fireEvent.drop(container.firstElementChild!.firstElementChild!, { dataTransfer: { files: [file] } });
    expect(onPick).not.toHaveBeenCalled();
    unmount();
    const second = view({ onPick, droppable: true });
    fireEvent.drop(second.container.firstElementChild!.firstElementChild!, { dataTransfer: { files: [file] } });
    expect(onPick).toHaveBeenCalledWith(file);
  });
});
