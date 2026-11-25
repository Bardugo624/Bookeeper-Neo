import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './polyfills';
import { Tooltip, TooltipProvider } from './Tooltip';

it('appears on keyboard focus and describes the trigger', async () => {
  const user = userEvent.setup();
  render(
    <Tooltip content={<><strong>Dune</strong><span>Herbert · 412</span></>}>
      <button>Spine</button>
    </Tooltip>,
  );
  await user.tab();
  const button = screen.getByRole('button', { name: 'Spine' });
  expect(button).toHaveFocus();
  const tip = screen.getByRole('tooltip');
  expect(tip).toHaveTextContent('Dune');
  expect(button).toHaveAccessibleDescription(/Dune/);
});

describe('delay', () => {
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    vi.useFakeTimers();
    // Radix opens a tooltip on a mouse pointermove over the trigger.
    return { hover: async (el: HTMLElement) => { fireEvent.pointerMove(el, { pointerType: 'mouse' }); } };
  };

  it('shows the second tooltip at once inside a TooltipProvider', async () => {
    const user = setup();
    render(
      <TooltipProvider>
        <Tooltip content="Uno"><button>A</button></Tooltip>
        <Tooltip content="Due"><button>B</button></Tooltip>
      </TooltipProvider>,
    );
    await user.hover(screen.getByRole('button', { name: 'A' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Uno');
    await user.hover(screen.getByRole('button', { name: 'B' }));
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(screen.getAllByRole('tooltip').map((t) => t.textContent).join()).toContain('Due');
  });

  it('works without a provider', async () => {
    const user = setup();
    render(<Tooltip content="Solo"><button>S</button></Tooltip>);
    await user.hover(screen.getByRole('button', { name: 'S' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Solo');
  });
});
