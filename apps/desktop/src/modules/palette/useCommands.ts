import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useT } from '../../app';
import { NEW_BOOK_PATH } from '../../app/shortcuts';
import type { AppModule } from '../../app/types';
import { useOverlays } from '../../app/overlays';
import { usePermission } from '../../kit';
import { usePlatform } from '../../platform';
import { useSession } from '../../session';
import { useTheme, type Theme } from '../../theme';
import { collectSections } from '../settings/sections';
import type { PaletteItem } from './model';

const THEMES: Array<{ id: Theme; icon: 'sun' | 'moon' | 'monitor' }> = [
  { id: 'light', icon: 'sun' },
  { id: 'dark', icon: 'moon' },
  { id: 'system', icon: 'monitor' },
];

/** "Go to" entries: every module with a navigation entry, then the sections of the settings. */
function useGoTo(modules: AppModule[]): PaletteItem[] {
  const t = useT();
  const navigate = useNavigate();
  const { role } = usePermission();
  const platform = usePlatform();
  return useMemo(() => {
    const navs = modules
      .flatMap((m) => (m.nav ? [m.nav] : []))
      .sort((a, b) => (a.group === b.group ? a.order - b.order : a.group === 'main' ? -1 : 1));
    const pages = navs.map<PaletteItem>((n) => ({
      id: `go:${n.to}`,
      group: 'go',
      label: t(n.labelKey),
      icon: n.icon,
      run: () => navigate(n.to),
    }));
    const hasSettings = navs.some((n) => n.to === '/settings');
    const sections = hasSettings
      ? collectSections({ role, platform: platform.kind }).map<PaletteItem>((s) => ({
          id: `go:settings:${s.id}`,
          group: 'go',
          label: t('palette.settingsSection', { name: t(s.labelKey) }),
          icon: s.icon,
          keywords: t('palette.settingsKeywords'),
          run: () => navigate(`/settings/${s.id}`),
        }))
      : [];
    return [...pages, ...sections];
  }, [modules, role, platform.kind, t, navigate]);
}

/** Actions; `ask` rewrites the text of the palette into the "where is" question. */
function useActions(modules: AppModule[], ask: () => void): PaletteItem[] {
  const t = useT();
  const navigate = useNavigate();
  const { can } = usePermission();
  const { setTheme } = useTheme();
  const signOut = useSession((s) => s.signOut);
  const openShortcuts = useOverlays((s) => s.openShortcuts);
  const writable = can('write');
  return useMemo(() => {
    const has = (to: string) => modules.some((m) => m.nav?.to === to);
    const list: PaletteItem[] = [];
    if (has('/books')) {
      list.push({ id: 'act:where', group: 'actions', label: t('palette.actions.where'), icon: 'pin', keep: true, run: ask });
    }
    if (writable && has('/books')) {
      list.push({ id: 'act:new-book', group: 'actions', label: t('palette.actions.newBook'), icon: 'plus', run: () => navigate(NEW_BOOK_PATH) });
    }
    if (writable && has('/loans')) {
      list.push({ id: 'act:new-loan', group: 'actions', label: t('palette.actions.newLoan'), icon: 'loans', run: () => navigate('/loans?new=1') });
    }
    for (const th of THEMES) {
      list.push({ id: `act:theme-${th.id}`, group: 'actions', label: t(`palette.actions.theme.${th.id}`), icon: th.icon, run: () => setTheme(th.id) });
    }
    list.push({ id: 'act:shortcuts', group: 'actions', label: t('palette.actions.shortcuts'), icon: 'info', run: openShortcuts });
    list.push({ id: 'act:sign-out', group: 'actions', label: t('palette.actions.signOut'), icon: 'logout', run: () => void signOut() });
    return list;
  }, [modules, writable, t, navigate, setTheme, openShortcuts, signOut, ask]);
}

export function useCommands(modules: AppModule[], ask: () => void): PaletteItem[] {
  const go = useGoTo(modules);
  const actions = useActions(modules, ask);
  return useMemo(() => [...go, ...actions], [go, actions]);
}
