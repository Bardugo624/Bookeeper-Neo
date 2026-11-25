import type { RouteObject } from 'react-router';
import type { IconName } from '@bookeeper/ui/base';

export interface NavItem {
  /** i18n key of the label, e.g. `books.nav`. */
  labelKey: string;
  icon: IconName;
  to: string;
  group: 'main' | 'bottom';
  order: number;
}

export interface AppModule {
  id: string;
  /** Mounted inside the shell. */
  routes: RouteObject[];
  nav?: NavItem;
  /** Mounted outside the shell (first launch). */
  public?: RouteObject[];
}
