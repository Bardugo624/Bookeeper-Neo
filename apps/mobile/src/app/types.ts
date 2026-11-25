import type { RouteObject } from 'react-router';
import type { IconName } from '@bookeeper/ui/base';

export interface TabItem {
  /** i18n key of the label, e.g. `msearch.tab`. */
  labelKey: string;
  icon: IconName;
  to: string;
  order: number;
  /** Other path prefixes that keep this tab active (e.g. a detail page it owns). */
  also?: string[];
}

export interface MobileModule {
  id: string;
  /** Mounted inside the tab shell. */
  routes: RouteObject[];
  tab?: TabItem;
  /** Mounted outside the shell (pairing). */
  public?: RouteObject[];
}
