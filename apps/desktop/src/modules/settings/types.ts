import type { ReactNode } from 'react';
import type { IconName } from '@bookeeper/ui/base';
import type { Platform } from '../../platform';
import type { Role } from '../../kit';

export interface SectionContext {
  role: Role | null;
  platform: Platform['kind'];
}

/** A page of the settings; each `sections/<id>/section.tsx` exports one as `section`. */
export interface SettingsSection {
  id: string;
  /** i18n key of the label in the section list. */
  labelKey: string;
  icon: IconName;
  order: number;
  element: ReactNode;
  visible?: (ctx: SectionContext) => boolean;
}
