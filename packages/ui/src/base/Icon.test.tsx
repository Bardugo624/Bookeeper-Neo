import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Icon, ICON_NAMES, type IconName } from './Icon';

const REQUIRED: IconName[] = ['book','library','loans','heart','chart','phone','settings','search','plus','filter',
  'grid','list','chevron-left','chevron-right','chevron-down','close','minimize','maximize','restore','check',
  'pencil','trash','pin','wifi','server','monitor','link','grip','more','alert','info','logout','sun','moon','users','user','bell'];

it('covers every required name', () => {
  for (const name of REQUIRED) expect(ICON_NAMES).toContain(name);
});

it.each(ICON_NAMES)('renders %s as a hidden svg', (name) => {
  const { container } = render(<Icon name={name} size={20} />);
  const svg = container.querySelector('svg');
  expect(svg).not.toBeNull();
  expect(svg).toHaveAttribute('aria-hidden', 'true');
  expect(svg).toHaveAttribute('width', '20');
});
