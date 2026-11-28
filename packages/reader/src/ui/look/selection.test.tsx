import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderLocale } from '../../i18n';
import { SelectionToolbar, type SelectionToolbarProps } from './SelectionToolbar';
import { NoteEditor, type NoteEditorProps } from './NoteEditor';

const SIZE = { width: 300, height: 40 };
let restore: () => void;
beforeEach(() => {
  const original = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    const role = this.getAttribute('role');
    const { width, height } = role === 'toolbar' ? SIZE : { width: 0, height: 0 };
    return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON() {} };
  };
  restore = () => {
    HTMLElement.prototype.getBoundingClientRect = original;
  };
});
afterEach(() => restore());

function toolbar(props: Partial<SelectionToolbarProps> = {}) {
  const full: SelectionToolbarProps = {
    layout: 'desktop',
    theme: 'light',
    rect: { x: 400, y: 300, width: 120, height: 20 },
    bounds: { width: 1000, height: 700 },
    current: null,
    onColor: vi.fn(),
    onNote: vi.fn(),
    onCopy: vi.fn(),
    onSearch: vi.fn(),
    onRemove: vi.fn(),
    ...props,
  };
  render(
    <ReaderLocale locale="it">
      <SelectionToolbar {...full} />
    </ReaderLocale>,
  );
  return full;
}

describe('SelectionToolbar', () => {
  it('toolbar_actions_call_back', async () => {
    const user = userEvent.setup();
    const p = toolbar();
    for (const [name, color] of [['Ambra', 'amber'], ['Salvia', 'sage'], ['Terracotta', 'terracotta'], ['Notte', 'night']] as const) {
      await user.click(screen.getByRole('button', { name }));
      expect(p.onColor).toHaveBeenLastCalledWith(color);
    }
    await user.click(screen.getByRole('button', { name: 'Nota' }));
    await user.click(screen.getByRole('button', { name: 'Copia' }));
    await user.click(screen.getByRole('button', { name: 'Cerca sul web' }));
    expect(p.onNote).toHaveBeenCalledTimes(1);
    expect(p.onCopy).toHaveBeenCalledTimes(1);
    expect(p.onSearch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Togli' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ambra' })).not.toHaveAttribute('aria-pressed');
  });

  it('an_existing_highlight_shows_its_color_and_remove', async () => {
    const user = userEvent.setup();
    const p = toolbar({ current: 'sage' });
    expect(screen.getByRole('button', { name: 'Salvia' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Ambra' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Togli' }));
    expect(p.onRemove).toHaveBeenCalledTimes(1);
  });

  it('desktop sits above the selection', () => {
    toolbar();
    const bar = screen.getByRole('toolbar');
    expect(bar).toHaveAttribute('data-side', 'above');
    expect(bar.style.top).toBe('252px'); // 300 - 40 - 8
    expect(bar.style.left).toBe('310px'); // 460 - 150
  });

  it('the_toolbar_flips_below_when_there_is_no_room', () => {
    toolbar({ rect: { x: 400, y: 20, width: 120, height: 20 } });
    const bar = screen.getByRole('toolbar');
    expect(bar).toHaveAttribute('data-side', 'below');
    expect(bar.style.top).toBe('48px'); // 20 + 20 + 8
  });

  it('stays inside the screen', () => {
    toolbar({ rect: { x: 980, y: 300, width: 20, height: 20 } });
    expect(screen.getByRole('toolbar').style.left).toBe('692px'); // 1000 - 300 - 8
  });

  it('the_phone_toolbar_sits_below_the_selection', () => {
    toolbar({ layout: 'phone', bounds: { width: 390, height: 700 } });
    const bar = screen.getByRole('toolbar');
    expect(bar).toHaveAttribute('data-side', 'below');
    expect(bar.style.top).toBe('328px');
  });

  it('the phone toolbar flips above at the bottom of the screen', () => {
    toolbar({ layout: 'phone', bounds: { width: 390, height: 700 }, rect: { x: 100, y: 660, width: 100, height: 20 } });
    expect(screen.getByRole('toolbar')).toHaveAttribute('data-side', 'above');
  });
});

function editor(props: Partial<NoteEditorProps> = {}) {
  const full: NoteEditorProps = {
    open: true,
    layout: 'desktop',
    value: 'prima',
    onSave: vi.fn(),
    onCancel: vi.fn(),
    ...props,
  };
  render(
    <ReaderLocale locale="it">
      <NoteEditor {...full} />
    </ReaderLocale>,
  );
  return full;
}

describe('NoteEditor', () => {
  it('note_editor_saves_with_ctrl_enter_and_cancels_with_esc', async () => {
    const user = userEvent.setup();
    const p = editor();
    const box = screen.getByRole('textbox');
    expect(box).toHaveValue('prima');
    await user.clear(box);
    await user.type(box, 'nuova');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(p.onSave).toHaveBeenCalledWith('nuova');
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(p.onSave).toHaveBeenCalledTimes(2);
    await user.keyboard('{Escape}');
    expect(p.onCancel).toHaveBeenCalledTimes(1);
    expect(p.onSave).toHaveBeenCalledTimes(2);
  });

  it('has Salva and Annulla buttons', async () => {
    const user = userEvent.setup();
    const p = editor({ layout: 'phone' });
    await user.type(screen.getByRole('textbox'), '!');
    await user.click(screen.getByRole('button', { name: 'Salva' }));
    expect(p.onSave).toHaveBeenCalledWith('prima!');
    await user.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(p.onCancel).toHaveBeenCalledTimes(1);
  });
});
