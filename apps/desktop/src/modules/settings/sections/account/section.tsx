import type { SettingsSection } from '../../types';
import { AccountSection } from './AccountSection';

export const section: SettingsSection = {
  id: 'account',
  labelKey: 'settings.sections.account',
  icon: 'settings',
  order: 20,
  element: <AccountSection />,
};
