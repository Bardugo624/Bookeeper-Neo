import type { SettingsSection } from '../../types';
import { AboutSection } from './AboutSection';

export const section: SettingsSection = {
  id: 'about',
  labelKey: 'settings.sections.about',
  icon: 'info',
  order: 90,
  element: <AboutSection />,
};
