import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetLocalePreferenceForTest } from '../../app/i18n';
import type { AppModule } from '../../app/types';
import { SettingsPage } from './SettingsPage';
import { collectSections } from './sections';
import type { SettingsSection } from './types';
import { renderSettings } from './testkit';

const ctx = { role: 'owner', platform: 'browser' } as const;

beforeEach(() => {
  localStorage.clear();
  resetLocalePreferenceForTest();
});

function fake(id: string, order: number, extra: Partial<SettingsSection> = {}) {
  return { section: { id, labelKey: `fake.${id}`, icon: 'info', order, element: <p>contenuto {id}</p>, ...extra } as SettingsSection };
}

describe('collectSections', () => {
  it('orders by `order` and drops hidden ones', () => {
    const files = { a: fake('late', 90), b: fake('early', 5), c: fake('hidden', 1, { visible: () => false }), d: {} };
    expect(collectSections(ctx, files).map((s) => s.id)).toEqual(['early', 'late']);
  });

  it('passes role and platform to `visible`', () => {
    const files = { a: fake('owner-only', 1, { visible: (c) => c.role === 'owner' && c.platform === 'tauri' }) };
    expect(collectSections({ role: 'owner', platform: 'tauri' }, files)).toHaveLength(1);
    expect(collectSections({ role: 'member', platform: 'tauri' }, files)).toHaveLength(0);
    expect(collectSections({ role: 'owner', platform: 'browser' }, files)).toHaveLength(0);
  });

  it('finds the real sections in the right order', () => {
    expect(collectSections(ctx).map((s) => s.id)).toEqual(expect.arrayContaining(['appearance', 'account', 'library', 'about']));
    const ids = collectSections(ctx).map((s) => s.id);
    expect(ids.indexOf('appearance')).toBeLessThan(ids.indexOf('account'));
    expect(ids.indexOf('account')).toBeLessThan(ids.indexOf('library'));
    expect(ids.indexOf('library')).toBeLessThan(ids.indexOf('about'));
  });
});

describe('settings page', () => {
  it('lists the sections in order and marks the one in the address', async () => {
    renderSettings({}, '/settings/library');
    const nav = await screen.findByRole('navigation', { name: 'Sezioni delle impostazioni' });
    const links = within(nav).getAllByRole('link');
    expect(links.slice(0, 3).map((l) => l.textContent)).toEqual(['Aspetto', 'Account', 'Libreria']);
    expect(links.at(-1)).toHaveTextContent('Informazioni');
    expect(within(nav).getByRole('link', { name: 'Libreria' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Account' })).not.toHaveAttribute('aria-current');
  });

  it('/settings goes to the first section', async () => {
    const { router } = renderSettings({}, '/settings');
    expect(await screen.findByRole('heading', { level: 2, name: 'Tema' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/settings/appearance');
  });

  it('an unknown section goes to the first one', async () => {
    const { router } = renderSettings({}, '/settings/nope');
    await screen.findByRole('heading', { level: 2, name: 'Tema' });
    expect(router.state.location.pathname).toBe('/settings/appearance');
  });

  it('a click on a section changes the address and the content', async () => {
    const { router } = renderSettings({}, '/settings/appearance');
    await userEvent.click(await screen.findByRole('link', { name: 'Informazioni' }));
    expect(router.state.location.pathname).toBe('/settings/about');
    expect(await screen.findByRole('heading', { level: 2, name: 'Versioni' })).toBeInTheDocument();
  });

  it('hides a section whose `visible` says no, even by address', async () => {
    const sections = () => [fake('one', 1).section, fake('two', 2).section];
    const mod: AppModule = {
      id: 'settings',
      routes: [
        { path: '/settings', element: <SettingsPage sections={sections} /> },
        { path: '/settings/:sectionId', element: <SettingsPage sections={sections} /> },
      ],
    };
    const { router } = renderSettings({}, '/settings/hidden', { modules: [mod] });
    expect(await screen.findByText('contenuto one')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /hidden/ })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/settings/one');
  });
});
