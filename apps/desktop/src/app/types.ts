import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import type { IconName } from '@bookeeper/ui/base';

export interface NavItem {
  /** i18n key of the label, e.g. `books.nav`. */
  labelKey: string;
  icon: IconName;
  to: string;
  group: 'main' | 'bottom';
  order: number;
  /** Number shown next to the label when above zero (a hook: the sidebar calls it once per item). */
  useBadge?: () => number | null;
  /** i18n key (with plural forms on `count`) of the badge's accessible name. */
  badgeLabelKey?: string;
}

export interface AppModule {
  id: string;
  /** Mounted inside the shell. */
  routes: RouteObject[];
  nav?: NavItem;
  /** Mounted outside the shell (first launch). */
  public?: RouteObject[];
  /** Drawn once inside the shell, next to the routes (e.g. the command palette). */
  overlay?: ComponentType<{ modules: AppModule[] }>;
}
