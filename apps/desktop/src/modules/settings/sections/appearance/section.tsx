import type { SettingsSection } from '../../types';
import { AppearanceSection } from './AppearanceSection';

export const section: SettingsSection = {
  id: 'appearance',
  labelKey: 'settings.sections.appearance',
  icon: 'sun',
  order: 10,
  element: <AppearanceSection />,
};
